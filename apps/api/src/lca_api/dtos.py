"""Provisional wire DTOs following specification §7; generate TypeScript in I1."""

from typing import Annotated, Literal, Self, TypeVar
from uuid import UUID

from lca_shared.contracts import Amount, Boundary, FlowType, FlowValue, RevisionRef, ScoreValue
from pydantic import Field, model_validator

ShortText = Annotated[str, Field(max_length=256)]
T = TypeVar("T")


class Snapshot(Boundary):
    revision_snapshot: list[RevisionRef]

    @model_validator(mode="after")
    def unique_releases(self) -> Self:
        if len({r.release_id for r in self.revision_snapshot}) != len(self.revision_snapshot):
            raise ValueError("One revision per release is required")
        return self


class PageRequest(Boundary):
    limit: int = Field(default=100, ge=1, le=200)
    cursor: str | None = Field(default=None, max_length=4096)


class SearchFields(Boundary):
    process_name: ShortText = ""
    geography: ShortText = ""
    category: ShortText = ""
    subcategory: ShortText = ""
    reference_flow_name: ShortText = ""


class SearchRequest(Snapshot, PageRequest):
    fields: SearchFields = Field(default_factory=SearchFields)
    branch_path: list[ShortText] | None = Field(default=None, max_length=32)


class ResolveRequest(SearchRequest):
    scope: Literal["all_matching", "branch"]

    @model_validator(mode="after")
    def branch_scope(self) -> Self:
        if self.scope == "branch" and self.branch_path is None:
            raise ValueError("Branch scope requires a path")
        return self


class Selection(Snapshot):
    process_ids: list[UUID]

    @model_validator(mode="after")
    def unique_processes(self) -> Self:
        if len(set(self.process_ids)) != len(self.process_ids):
            raise ValueError("Duplicate process IDs")
        return self


class HeadersRequest(Selection):
    pass


class RowsRequest(Selection, PageRequest):
    differences_only: bool = False


class ScoreRowsRequest(RowsRequest):
    indicator_ids: list[UUID]


class FlowCellsRequest(Selection):
    row_keys: list[ShortText]
    comparison_token: str


class ScoreCellsRequest(Selection):
    indicator_ids: list[UUID]
    comparison_token: str


class Warning(Boundary):
    code: str
    message: str


class Identity(Boundary):
    uid: str
    email: str
    email_verified: Literal[True] = True
    access: dict[str, bool] = Field(default_factory=lambda: {"published_catalog": True})


class Release(RevisionRef):
    database_code: str
    version: str
    display_name: str
    published_at: str | None


class Header(RevisionRef):
    id: UUID
    name: str
    geography: str
    category: str
    subcategory: str
    category_path: list[str]
    reference_flow_name: str
    reference_amount: Amount
    reference_unit: str
    warnings: list[Warning]


class SearchNode(Boundary):
    kind: Literal["branch", "process"]
    id: str
    release_id: UUID
    label: str
    path: list[str]
    geography: str | None = None
    matching_descendant_count: int | None = None
    children: list[SearchNode] = Field(default_factory=list)


class NumericSummary(Boundary):
    minimum: Amount | None
    maximum: Amount | None
    present_count: int
    selected_count: int


class FlowRow(Boundary):
    row_key: str
    flow_id: UUID
    flow_type: FlowType
    name: str
    location: str | None
    process_name: str | None
    category: str
    subcategory: str
    unit: str
    sort_key: list[str]
    summary: NumericSummary


class Indicator(Boundary):
    id: UUID
    release_id: UUID
    method_id: UUID
    method_name: str
    method_version: str
    category: str | None
    name: str
    unit: str
    source_order: int
    summary: NumericSummary | None = None


class IndicatorCategory(Boundary):
    id: str
    name: str
    source_order: int
    indicators: list[Indicator]


class IndicatorMethod(Boundary):
    id: UUID
    release_id: UUID
    name: str
    version: str
    source_order: int
    indicators: list[Indicator]
    categories: list[IndicatorCategory]


class Envelope(Snapshot):
    request_id: str


class Page[T](Envelope):
    items: list[T]
    next_cursor: str | None
    total_count: int


class ComparisonPage[T](Page[T]):
    comparison_token: str


class FlowCell(FlowValue):
    process_id: UUID
    row_key: str
    warnings: list[Warning]


class ScoreCell(ScoreValue):
    process_id: UUID
    indicator_id: UUID
    warnings: list[Warning]


class Cells[T](Envelope):
    cells: list[T]
    comparison_token: str


class IndicatorTree(Envelope):
    methods: list[IndicatorMethod]
    default_indicator_ids: list[UUID]


class Health(Boundary):
    status: Literal["ok"] = "ok"
