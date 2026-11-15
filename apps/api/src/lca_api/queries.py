"""Batched queries against DB-enforced published-only projections."""

from collections import defaultdict
from typing import Any, cast
from uuid import UUID

from lca_shared.contracts import FlowType, RevisionRef
from lca_shared.db import schema as s
from sqlalchemy import case, func, or_, select, tuple_
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy.sql import Select

from lca_api import dtos as d
from lca_api.auth import Entitlements
from lca_api.errors import ApiError
from lca_api.tokens import Tokens, fingerprint

TYPE_ORDER = {"Reference": 0, "Technosphere": 1, "Ecosphere Input": 2, "Ecosphere Output": 3}


def snapshot_key(request: d.Snapshot) -> list[dict[str, str]]:
    return sorted(
        (r.model_dump(mode="json") for r in request.revision_snapshot),
        key=lambda r: r["release_id"],
    )


def selection_key(request: d.RowsRequest, tab: str) -> dict[str, Any]:
    return {
        "snapshot": snapshot_key(request),
        "process_ids": sorted(map(str, request.process_ids)),
        "indicator_ids": sorted(map(str, request.indicator_ids))
        if isinstance(request, d.ScoreRowsRequest)
        else [],
        "tab": tab,
        "differences_only": request.differences_only,
    }


class Queries:
    def __init__(
        self, connection: AsyncConnection, tokens: Tokens, request_id: str, identity: d.Identity
    ) -> None:
        self.db, self.tokens, self.request_id, self.identity = (
            connection,
            tokens,
            request_id,
            identity,
        )
        self.releases: dict[UUID, UUID] = {}

    async def rows(self, statement: Select[Any]) -> list[dict[str, Any]]:
        result = await self.db.execute(statement)
        return [dict(row) for row in result.mappings()]

    async def snapshot(self, request: d.Snapshot) -> None:
        if not request.revision_snapshot:
            return
        available = await self.rows(
            select(s.database_release.c.id, s.database_release.c.database_code)
        )
        release_ids = {
            row["id"]
            for row in available
            if Entitlements().allows(self.identity, row["database_code"])
        }
        if any(ref.release_id not in release_ids for ref in request.revision_snapshot):
            raise ApiError("RELEASE_UNAVAILABLE", 404)
        revision_ids = [r.revision_id for r in request.revision_snapshot]
        found = await self.rows(
            select(
                s.release_revision.c.id,
                s.release_revision.c.database_release_id,
                s.database_release.c.database_code,
            )
            .join(
                s.database_release,
                s.database_release.c.id == s.release_revision.c.database_release_id,
            )
            .where(s.release_revision.c.id.in_(revision_ids))
        )
        self.releases = {
            r["id"]: r["database_release_id"]
            for r in found
            if Entitlements().allows(self.identity, r["database_code"])
        }
        if any(self.releases.get(r.revision_id) != r.release_id for r in request.revision_snapshot):
            raise ApiError("STALE_SNAPSHOT", 409)

    async def selection(self, request: d.Selection) -> None:
        await self.snapshot(request)
        found = await self.rows(
            select(s.process.c.id).where(
                s.process.c.id.in_(request.process_ids), s.process.c.revision_id.in_(self.releases)
            )
        )
        if {r["id"] for r in found} != set(request.process_ids):
            raise ApiError("UNKNOWN_PROCESS", 404)

    def envelope(self, request: d.Snapshot) -> dict[str, Any]:
        return {"revision_snapshot": request.revision_snapshot, "request_id": self.request_id}

    async def release_list(self) -> d.Page[d.Release]:
        rows = await self.rows(
            select(
                s.database_release.c.id,
                s.database_release.c.database_code,
                s.database_release.c.release_version,
                s.database_release.c.display_name,
                s.release_revision.c.id.label("revision_id"),
                s.release_revision.c.published_at,
            )
            .select_from(
                s.release_publication.join(
                    s.database_release,
                    s.database_release.c.id == s.release_publication.c.database_release_id,
                ).join(
                    s.release_revision,
                    s.release_revision.c.id == s.release_publication.c.active_revision_id,
                )
            )
            .order_by(s.database_release.c.database_code, s.database_release.c.release_version)
        )
        items = [
            d.Release(
                release_id=r["id"],
                revision_id=r["revision_id"],
                database_code=r["database_code"],
                version=r["release_version"],
                display_name=r["display_name"],
                published_at=r["published_at"].isoformat() if r["published_at"] else None,
            )
            for r in rows
            if Entitlements().allows(self.identity, r["database_code"])
        ]
        return d.Page[d.Release](
            items=items,
            next_cursor=None,
            total_count=len(items),
            request_id=self.request_id,
            revision_snapshot=[
                RevisionRef(release_id=i.release_id, revision_id=i.revision_id) for i in items
            ],
        )

    def cursor(self, request: d.PageRequest, key: dict[str, Any]) -> list[Any] | None:
        if request.cursor is None:
            return None
        decoded = self.tokens.read(request.cursor, "cursor")
        if decoded.get("query") != fingerprint(key) or not isinstance(decoded.get("last"), list):
            raise ApiError("INVALID_FILTER", 422)
        return cast(list[Any], decoded["last"])

    def next_cursor(self, key: dict[str, Any], last: list[Any]) -> str:
        return self.tokens.sign("cursor", {"query": fingerprint(key), "last": last})

    def search_base(self, request: d.SearchRequest) -> Select[Any]:
        query = select(s.process).where(s.process.c.revision_id.in_(self.releases))
        field_map = {"process_name": "name", "reference_flow_name": "reference_name"}
        for field, value in request.fields.model_dump().items():
            for token in value.lower().split():
                query = query.where(
                    func.lower(s.process.c[field_map.get(field, field)]).contains(
                        token, autoescape=True
                    )
                )
        for index, segment in enumerate(request.branch_path or []):
            query = query.where(s.process.c.category_path[index].astext == segment)
        return query

    async def search(self, request: d.SearchRequest, *, resolve: bool = False) -> d.Page[Any]:
        await self.snapshot(request)
        base = self.search_base(request)
        normal_fields = {
            k: sorted(v.lower().split()) for k, v in request.fields.model_dump().items()
        }
        key = {
            "op": "resolve" if resolve else "search",
            "snapshot": snapshot_key(request),
            "fields": normal_fields,
            "branch": request.branch_path or [],
        }
        order = [
            func.lower(s.process.c.name).collate("C"),
            func.lower(s.process.c.geography).collate("C"),
            s.process.c.id,
        ]
        base = base.add_columns(order[0].label("_name_sort"), order[1].label("_geography_sort"))
        counts = await self.rows(
            select(s.process.c.revision_id, s.process.c.category_path, func.count().label("count"))
            .where(*base._where_criteria)
            .group_by(s.process.c.revision_id, s.process.c.category_path)
        )
        total = sum(r["count"] for r in counts)
        last = self.cursor(request, key)
        if last is not None:
            try:
                base = base.where(tuple_(*order) > (str(last[0]), str(last[1]), UUID(last[2])))
            except IndexError, ValueError, TypeError:
                raise ApiError("INVALID_FILTER", 422) from None
        page = await self.rows(base.order_by(*order).limit(request.limit + 1))
        more, page = len(page) > request.limit, page[: request.limit]
        cursor = (
            self.next_cursor(
                key, [page[-1]["_name_sort"], page[-1]["_geography_sort"], str(page[-1]["id"])]
            )
            if more
            else None
        )
        if resolve:
            items: list[Any] = [str(r["id"]) for r in page]
        else:
            branch_counts: dict[tuple[UUID, tuple[str, ...]], int] = defaultdict(int)
            for row in counts:
                for depth in range(len(row["category_path"]) + 1):
                    branch_counts[(row["revision_id"], tuple(row["category_path"][:depth]))] += row[
                        "count"
                    ]
            nodes: dict[tuple[UUID, tuple[str, ...]], d.SearchNode] = {}
            items = []
            releases = {
                r["id"]: r["display_name"]
                for r in await self.rows(
                    select(s.database_release.c.id, s.database_release.c.display_name)
                )
            }
            for row in page:
                revision, path = row["revision_id"], row["category_path"]
                release = self.releases[revision]
                for depth in range(len(path) + 1):
                    partial = tuple(path[:depth])
                    node_key = revision, partial
                    if node_key not in nodes:
                        node = d.SearchNode(
                            kind="branch",
                            id=f"{release}:branch:{fingerprint(list(partial))}",
                            release_id=release,
                            label=partial[-1] if partial else releases[release],
                            path=list(partial),
                            matching_descendant_count=branch_counts[node_key],
                        )
                        nodes[node_key] = node
                        if depth:
                            nodes[revision, tuple(path[: depth - 1])].children.append(node)
                        else:
                            items.append(node)
                nodes[revision, tuple(path)].children.append(
                    d.SearchNode(
                        kind="process",
                        id=str(row["id"]),
                        release_id=release,
                        label=row["name"],
                        geography=row["geography"],
                        path=path,
                    )
                )
        return d.Page[Any](
            **self.envelope(request), items=items, total_count=total, next_cursor=cursor
        )

    async def warnings(
        self,
        ids: list[UUID],
        *,
        flow_keys: list[tuple[UUID, FlowType]] | None = None,
        indicator_ids: list[UUID] | None = None,
    ) -> list[dict[str, Any]]:
        w = s.process_warning
        scope = (
            tuple_(w.c.flow_id, w.c.flow_type).in_(flow_keys)
            if flow_keys is not None
            else w.c.indicator_id.in_(indicator_ids)
            if indicator_ids is not None
            else (w.c.flow_id.is_(None) & w.c.indicator_id.is_(None))
        )
        rows = await self.rows(
            select(
                w.c.process_id, w.c.flow_id, w.c.flow_type, w.c.indicator_id, w.c.code, w.c.message
            )
            .where(w.c.process_id.in_(ids), scope)
            .limit(10001)
        )
        if len(rows) > 10000:
            raise ApiError("REQUEST_WINDOW_TOO_LARGE", 422)
        return rows

    async def headers(self, request: d.HeadersRequest) -> d.Page[d.Header]:
        if len(request.process_ids) > 200:
            raise ApiError("REQUEST_WINDOW_TOO_LARGE", 422)
        await self.selection(request)
        found = await self.rows(select(s.process).where(s.process.c.id.in_(request.process_ids)))
        by_id = {r["id"]: r for r in found}
        warnings = await self.warnings(request.process_ids)
        items = []
        for pid in request.process_ids:
            row = by_id[pid]
            items.append(
                d.Header(
                    id=pid,
                    release_id=self.releases[row["revision_id"]],
                    revision_id=row["revision_id"],
                    name=row["name"],
                    geography=row["geography"],
                    category=row["category"],
                    subcategory=row["subcategory"],
                    category_path=row["category_path"],
                    reference_flow_name=row["reference_name"],
                    reference_amount=row["reference_amount"],
                    reference_unit=row["reference_unit"],
                    warnings=[
                        d.Warning(code=w["code"], message=w["message"])
                        for w in warnings
                        if w["process_id"] == pid
                        and w["flow_id"] is None
                        and w["indicator_id"] is None
                    ],
                )
            )
        return d.Page[d.Header](
            **self.envelope(request), items=items, next_cursor=None, total_count=len(items)
        )

    def indicator_base(self) -> Select[Any]:
        i, m = s.impact_indicator, s.impact_method
        return (
            select(
                i.c.id,
                i.c.revision_id,
                i.c.method_id,
                i.c.category,
                i.c.name,
                i.c.unit,
                i.c.display_order.label("source_order"),
                m.c.name.label("method_name"),
                m.c.version.label("method_version"),
                m.c.display_order.label("method_order"),
            )
            .join(m, m.c.id == i.c.method_id)
            .where(i.c.revision_id.in_(self.releases))
        )

    def indicator(self, row: dict[str, Any], summary: dict[str, Any] | None = None) -> d.Indicator:
        return d.Indicator(
            id=row["id"],
            release_id=self.releases[row["revision_id"]],
            method_id=row["method_id"],
            category=row["category"],
            name=row["name"],
            unit=row["unit"],
            source_order=row["source_order"],
            method_name=row["method_name"],
            method_version=row["method_version"],
            summary=d.NumericSummary(**summary) if summary is not None else None,
        )

    async def indicator_tree(self, request: d.Snapshot) -> d.IndicatorTree:
        await self.snapshot(request)
        rows = await self.rows(
            self.indicator_base().order_by(
                s.impact_method.c.display_order,
                s.impact_indicator.c.display_order,
                s.impact_indicator.c.id,
            )
        )
        methods: dict[UUID, d.IndicatorMethod] = {}
        categories: dict[tuple[UUID, str], d.IndicatorCategory] = {}
        defaults = []
        for row in rows:
            mid = row["method_id"]
            if mid not in methods:
                methods[mid] = d.IndicatorMethod(
                    id=mid,
                    release_id=self.releases[row["revision_id"]],
                    name=row["method_name"],
                    version=row["method_version"],
                    source_order=row["method_order"],
                    indicators=[],
                    categories=[],
                )
            indicator = self.indicator(row)
            if row["category"]:
                key = mid, row["category"]
                if key not in categories:
                    categories[key] = d.IndicatorCategory(
                        id=f"{mid}:{row['category']}",
                        name=row["category"],
                        source_order=row["source_order"],
                        indicators=[],
                    )
                    methods[mid].categories.append(categories[key])
                categories[key].indicators.append(indicator)
            else:
                methods[mid].indicators.append(indicator)
            if row["method_name"] == "IPCC 2021" and row["name"] == "GWP 100":
                defaults.append(row["id"])
        return d.IndicatorTree(
            **self.envelope(request), methods=list(methods.values()), default_indicator_ids=defaults
        )

    def flow_base(self, request: d.RowsRequest) -> Select[Any]:
        pf, f = s.process_flows, s.flow
        order = case(TYPE_ORDER, value=pf.c.flow_type, else_=4).label("type_order")
        query = (
            select(
                f.c.id.label("flow_id"),
                pf.c.flow_type,
                f.c.name,
                f.c.location,
                f.c.process_name,
                f.c.category,
                f.c.subcategory,
                f.c.unit,
                order,
                func.min(pf.c.amount).label("minimum"),
                func.max(pf.c.amount).label("maximum"),
                func.count().label("present_count"),
            )
            .select_from(pf.join(f, f.c.id == pf.c.flow_id))
            .where(pf.c.process_id.in_(request.process_ids))
            .group_by(
                f.c.id,
                pf.c.flow_type,
                f.c.name,
                f.c.location,
                f.c.process_name,
                f.c.category,
                f.c.subcategory,
                f.c.unit,
            )
        )
        if request.differences_only and len(request.process_ids) >= 2:
            query = query.having(
                or_(
                    func.count() < len(request.process_ids),
                    func.min(pf.c.amount) != func.max(pf.c.amount),
                )
            )
        return query

    async def flow_rows(self, request: d.RowsRequest) -> d.ComparisonPage[d.FlowRow]:
        await self.selection(request)
        key = selection_key(request, "flows")
        sub = self.flow_base(request).subquery()
        order = [
            sub.c.type_order,
            func.lower(sub.c.category).collate("C"),
            func.lower(sub.c.subcategory).collate("C"),
            func.lower(sub.c.name).collate("C"),
            sub.c.flow_id,
        ]
        query = select(
            sub,
            order[1].label("_category_sort"),
            order[2].label("_subcategory_sort"),
            order[3].label("_name_sort"),
        )
        total = await self.db.scalar(select(func.count()).select_from(sub))
        last = self.cursor(request, key)
        if last is not None:
            try:
                query = query.where(
                    tuple_(*order)
                    > (int(last[0]), str(last[1]), str(last[2]), str(last[3]), UUID(last[4]))
                )
            except ValueError, TypeError, IndexError:
                raise ApiError("INVALID_FILTER", 422) from None
        page = await self.rows(query.order_by(*order).limit(request.limit + 1))
        more = len(page) > request.limit
        page = page[: request.limit]

        def sort_key(row: dict[str, Any]) -> list[Any]:
            return [
                row["type_order"],
                row["_category_sort"],
                row["_subcategory_sort"],
                row["_name_sort"],
                str(row["flow_id"]),
            ]

        items = [
            d.FlowRow(
                row_key=f"{r['flow_id']}|{r['flow_type']}",
                flow_id=r["flow_id"],
                flow_type=r["flow_type"],
                name=r["name"],
                location=r["location"] or None,
                process_name=r["process_name"],
                category=r["category"],
                subcategory=r["subcategory"],
                unit=r["unit"],
                sort_key=list(map(str, sort_key(r))),
                summary=d.NumericSummary(
                    minimum=r["minimum"],
                    maximum=r["maximum"],
                    present_count=r["present_count"],
                    selected_count=len(request.process_ids),
                ),
            )
            for r in page
        ]
        return d.ComparisonPage[d.FlowRow](
            **self.envelope(request),
            items=items,
            total_count=total or 0,
            next_cursor=self.next_cursor(key, sort_key(page[-1])) if more else None,
            comparison_token=self.tokens.sign("comparison", key),
        )

    async def score_rows(self, request: d.ScoreRowsRequest) -> d.ComparisonPage[d.Indicator]:
        await self.selection(request)
        key = selection_key(request, "scores")
        base = self.indicator_base().where(s.impact_indicator.c.id.in_(request.indicator_ids))
        indicators = await self.rows(
            base.order_by(
                s.impact_method.c.display_order,
                s.impact_indicator.c.display_order,
                s.impact_indicator.c.id,
            )
        )
        if {r["id"] for r in indicators} != set(request.indicator_ids):
            raise ApiError("INVALID_FILTER", 422)
        score = s.lcia_score
        differences = request.differences_only and len(request.process_ids) >= 2
        columns = [
            score.c.indicator_id,
            func.min(score.c.amount).label("minimum"),
            func.max(score.c.amount).label("maximum"),
            func.count(score.c.amount).label("valid_count"),
        ]
        if differences:
            columns.extend(
                [
                    func.count().label("record_count"),
                    func.array_agg(func.distinct(score.c.status)).label("statuses"),
                ]
            )
        stats = await self.rows(
            select(*columns)
            .where(
                score.c.process_id.in_(request.process_ids),
                score.c.indicator_id.in_(request.indicator_ids),
            )
            .group_by(score.c.indicator_id)
        )
        by_id = {r["indicator_id"]: r for r in stats}
        rows = []
        for indicator in indicators:
            stat = by_id.get(
                indicator["id"],
                {
                    "minimum": None,
                    "maximum": None,
                    "valid_count": 0,
                    "record_count": 0,
                    "statuses": [],
                },
            )
            if differences:
                statuses = set(stat["statuses"])
                if stat["record_count"] < len(request.process_ids):
                    statuses.add("missing")
                if len(statuses) <= 1 and stat["minimum"] == stat["maximum"]:
                    continue
            rows.append(
                self.indicator(
                    indicator,
                    {
                        "minimum": stat["minimum"],
                        "maximum": stat["maximum"],
                        "present_count": stat["valid_count"],
                        "selected_count": len(request.process_ids),
                    },
                )
            )
        total = len(rows)
        last = self.cursor(request, key)
        # Indicator identity locates the source-order boundary; selection/snapshot binds this cursor.
        if last is not None:
            positions = [
                index
                for index, row in enumerate(rows)
                if str(row.id) == (last[0] if last else None)
            ]
            if not positions:
                raise ApiError("INVALID_FILTER", 422)
            rows = rows[positions[0] + 1 :]
        more = len(rows) > request.limit
        rows = rows[: request.limit]
        return d.ComparisonPage[d.Indicator](
            **self.envelope(request),
            items=rows,
            total_count=total,
            next_cursor=self.next_cursor(key, [str(rows[-1].id)]) if more else None,
            comparison_token=self.tokens.sign("comparison", key),
        )

    def comparison(self, request: d.Selection, token: str, tab: str) -> d.RowsRequest:
        value = self.tokens.read(token, "comparison")
        if (
            value.get("snapshot") != snapshot_key(request)
            or value.get("tab") != tab
            or not set(map(str, request.process_ids)) <= set(value.get("process_ids", []))
        ):
            raise ApiError("INVALID_FILTER", 422)
        arguments = {
            "revision_snapshot": value["snapshot"],
            "process_ids": value["process_ids"],
            "differences_only": value["differences_only"],
            "limit": 200,
        }
        return (
            d.ScoreRowsRequest(**arguments, indicator_ids=value["indicator_ids"])
            if tab == "scores"
            else d.RowsRequest(**arguments)
        )

    @staticmethod
    def window(process_count: int, row_count: int) -> None:
        if process_count > 200 or row_count > 200 or process_count * row_count > 10000:
            raise ApiError("REQUEST_WINDOW_TOO_LARGE", 422)

    async def flow_cells(self, request: d.FlowCellsRequest) -> d.Cells[d.FlowCell]:
        self.window(len(request.process_ids), len(request.row_keys))
        full = self.comparison(request, request.comparison_token, "flows")
        await self.selection(full)
        keys = []
        for key in request.row_keys:
            try:
                fid_text, kind_text = key.split("|", 1)
                keys.append((UUID(fid_text), FlowType(kind_text)))
            except ValueError, TypeError:
                raise ApiError("INVALID_FILTER", 422) from None
        sub = self.flow_base(full).subquery()
        eligible = await self.rows(
            select(sub.c.flow_id, sub.c.flow_type).where(
                tuple_(sub.c.flow_id, sub.c.flow_type).in_(keys)
            )
        )
        if len(set(keys)) != len(keys) or len(eligible) != len(keys):
            raise ApiError("INVALID_FILTER", 422)
        pf = s.process_flows
        rows = await self.rows(
            select(pf.c.process_id, pf.c.flow_id, pf.c.flow_type, pf.c.amount).where(
                pf.c.process_id.in_(request.process_ids),
                tuple_(pf.c.flow_id, pf.c.flow_type).in_(keys),
            )
        )
        values = {(r["process_id"], r["flow_id"], r["flow_type"]): r["amount"] for r in rows}
        warnings = await self.warnings(request.process_ids, flow_keys=keys)
        cells = []
        for pid in request.process_ids:
            for key, (fid, kind) in zip(request.row_keys, keys, strict=True):
                value = values.get((pid, fid, kind))
                cells.append(
                    d.FlowCell(
                        process_id=pid,
                        row_key=key,
                        present=value is not None,
                        amount=value,
                        warnings=[
                            d.Warning(code=w["code"], message=w["message"])
                            for w in warnings
                            if (w["process_id"], w["flow_id"], w["flow_type"]) == (pid, fid, kind)
                        ],
                    )
                )
        return d.Cells[d.FlowCell](
            **self.envelope(request), cells=cells, comparison_token=request.comparison_token
        )

    async def score_cells(self, request: d.ScoreCellsRequest) -> d.Cells[d.ScoreCell]:
        self.window(len(request.process_ids), len(request.indicator_ids))
        full = self.comparison(request, request.comparison_token, "scores")
        assert isinstance(full, d.ScoreRowsRequest)
        await self.selection(full)
        if len(set(request.indicator_ids)) != len(request.indicator_ids) or not set(
            request.indicator_ids
        ) <= set(full.indicator_ids):
            raise ApiError("INVALID_FILTER", 422)
        # Filter membership is checked against the same full comparison, independent of visible columns.
        page = await self.score_rows(full)
        eligible = {i.id for i in page.items}
        while page.next_cursor:
            full = full.model_copy(update={"cursor": page.next_cursor})
            page = await self.score_rows(full)
            eligible.update(i.id for i in page.items)
        if not set(request.indicator_ids) <= eligible:
            raise ApiError("INVALID_FILTER", 422)
        score = s.lcia_score
        rows = await self.rows(
            select(score.c.process_id, score.c.indicator_id, score.c.amount, score.c.status).where(
                score.c.process_id.in_(request.process_ids),
                score.c.indicator_id.in_(request.indicator_ids),
            )
        )
        values = {(r["process_id"], r["indicator_id"]): r for r in rows}
        warnings = await self.warnings(request.process_ids, indicator_ids=request.indicator_ids)
        cells = []
        for pid in request.process_ids:
            for iid in request.indicator_ids:
                value = values.get((pid, iid), {"status": "missing", "amount": None})
                cells.append(
                    d.ScoreCell(
                        process_id=pid,
                        indicator_id=iid,
                        status=value["status"],
                        amount=value["amount"],
                        warnings=[
                            d.Warning(code=w["code"], message=w["message"])
                            for w in warnings
                            if w["process_id"] == pid and w["indicator_id"] == iid
                        ],
                    )
                )
        return d.Cells[d.ScoreCell](
            **self.envelope(request), cells=cells, comparison_token=request.comparison_token
        )
