import json
from uuid import uuid4

import pytest
from lca_shared.db import schema as s
from sqlalchemy import event, update

pytestmark = pytest.mark.api


def body(catalog, ids=None):
    return {
        "revision_snapshot": catalog["snapshot"],
        "process_ids": list(map(str, ids or catalog["pids"][:3])),
    }


def test_search_selection_pages_and_input_safety(authenticated, catalog):
    client = authenticated
    request = {
        "revision_snapshot": catalog["snapshot"],
        "fields": {"process_name": "TRICITY 0", "geography": "ch"},
        "limit": 17,
    }
    response = client.post("/api/v1/processes/search", json=request)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total_count"] == 124
    assert data["items"][0]["matching_descendant_count"] == 124
    assert (
        client.post(
            "/api/v1/processes/search",
            json=request | {"fields": {}, "branch_path": ["Energy", "Power"]},
        ).json()["total_count"]
        == 205
    )
    assert (
        client.post(
            "/api/v1/processes/search", json=request | {"fields": {}, "branch_path": ["Other"]}
        ).json()["total_count"]
        == 0
    )
    seen = []
    selection = request | {"fields": {}, "scope": "all_matching"}
    while True:
        response = client.post("/api/v1/processes/resolve-selection", json=selection)
        assert response.status_code == 200, response.text
        page = response.json()
        seen.extend(page["items"])
        if not page["next_cursor"]:
            break
        selection["cursor"] = page["next_cursor"]
    assert len(seen) == 205 and len(set(seen)) == 205
    changed = selection | {"fields": {"process_name": "different"}}
    assert client.post("/api/v1/processes/resolve-selection", json=changed).status_code == 422
    assert (
        client.post(
            "/api/v1/processes/search", json=request | {"fields": {"process_name": "%"}}
        ).json()["total_count"]
        == 0
    )
    bad = client.post(
        "/api/v1/processes/search",
        json=request | {"fields": {"unexpected": "private-original-provider-value"}},
    )
    assert bad.status_code == 422 and "private-original-provider-value" not in bad.text
    assert (
        client.post("/api/v1/processes/headers", json=body(catalog, catalog["pids"])).status_code
        == 422
    )


def test_flow_windows_exact_summary_warnings_and_differences(authenticated, catalog):
    client = authenticated
    request = body(catalog) | {"limit": 1}
    rows = client.post("/api/v1/comparison/flows/rows", json=request)
    assert rows.status_code == 200, rows.text
    data = rows.json()
    assert data["total_count"] == 2
    first = data["items"][0]
    assert first["summary"] == {
        "minimum": "-2",
        "maximum": "3",
        "present_count": 3,
        "selected_count": 3,
    }
    window = body(catalog) | {
        "row_keys": [first["row_key"]],
        "comparison_token": data["comparison_token"],
    }
    cells = client.post("/api/v1/comparison/flows/cells", json=window)
    assert cells.status_code == 200, cells.text
    values = cells.json()["cells"]
    assert values[0]["amount"] == "0" and values[0]["present"]
    assert len(values[0]["warnings"]) == 1 and not values[1]["warnings"]
    second = client.post(
        "/api/v1/comparison/flows/rows", json=request | {"cursor": data["next_cursor"]}
    ).json()
    window["row_keys"] = [second["items"][0]["row_key"]]
    cells = client.post("/api/v1/comparison/flows/cells", json=window).json()["cells"]
    assert cells[0]["amount"] == "0.123456789012345678901234567890123456789"
    assert cells[1]["present"] is False and cells[1]["amount"] is None
    reorder = client.post(
        "/api/v1/comparison/flows/rows", json=body(catalog, list(reversed(catalog["pids"][:3])))
    ).json()
    assert reorder["comparison_token"] == data["comparison_token"]
    differences = client.post(
        "/api/v1/comparison/flows/rows", json=body(catalog) | {"differences_only": True}
    ).json()
    assert differences["total_count"] == 2
    assert (
        client.post(
            "/api/v1/comparison/flows/cells",
            json=window | {"row_keys": [f"{uuid4()}|Ecosphere Output"]},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/v1/comparison/flows/cells",
            json=window | {"comparison_token": window["comparison_token"] + "x"},
        ).status_code
        == 422
    )


def test_scores_snapshots_and_query_budget(authenticated, catalog):
    client = authenticated
    request = body(catalog) | {
        "indicator_ids": list(map(str, (catalog["indicator"], catalog["missing_indicator"])))
    }
    tree = client.get(
        "/api/v1/indicators/tree", params={"revision_snapshot": json.dumps(catalog["snapshot"])}
    )
    assert tree.status_code == 200, tree.text
    assert tree.json()["default_indicator_ids"] == [str(catalog["indicator"])]
    rows = client.post("/api/v1/comparison/scores/rows", json=request)
    assert rows.status_code == 200, rows.text
    assert rows.json()["total_count"] == 2
    cells = client.post(
        "/api/v1/comparison/scores/cells",
        json=body(catalog)
        | {
            "indicator_ids": [str(catalog["indicator"])],
            "comparison_token": rows.json()["comparison_token"],
        },
    )
    assert cells.status_code == 200, cells.text
    assert [r["status"] for r in cells.json()["cells"]] == ["valid", "missing", "unresolved_basis"]
    assert cells.json()["cells"][0]["amount"] == "0"
    assert (
        client.post(
            "/api/v1/comparison/scores/rows", json=request | {"differences_only": True}
        ).json()["total_count"]
        == 1
    )
    assert (
        client.post(
            "/api/v1/processes/headers",
            json=body(catalog)
            | {
                "revision_snapshot": [
                    {
                        "release_id": str(catalog["release"]),
                        "revision_id": str(catalog["candidate"]),
                    }
                ]
            },
        ).status_code
        == 409
    )
    with catalog["engine"].begin() as c:
        c.execute(
            update(s.release_publication)
            .where(s.release_publication.c.database_release_id == catalog["release"])
            .values(active_revision_id=catalog["later"])
        )
    assert client.get("/api/v1/releases").json()["items"][0]["revision_id"] == str(catalog["later"])
    assert client.post("/api/v1/processes/headers", json=body(catalog)).status_code == 200
    # One window uses a constant number of SQL queries, not one query per cell.
    queries = []
    engine = client.app.state.engine.sync_engine

    def observe(*args):
        queries.append(1)

    event.listen(engine, "before_cursor_execute", observe)
    try:
        response = client.post("/api/v1/comparison/flows/rows", json=body(catalog))
        assert response.status_code == 200
        token = response.json()["comparison_token"]
        keys = [r["row_key"] for r in response.json()["items"]]
        queries.clear()
        response = client.post(
            "/api/v1/comparison/flows/cells",
            json=body(catalog) | {"row_keys": keys, "comparison_token": token},
        )
        assert response.status_code == 200, response.text
        assert len(queries) <= 9
    finally:
        event.remove(engine, "before_cursor_execute", observe)


def test_health_auth_and_request_budgets(client, config, catalog):
    from fastapi.testclient import TestClient
    from lca_api.app import create_app

    assert client.get("/api/v1/health").status_code == 200
    assert client.get("/api/v1/releases").status_code == 401
    with TestClient(
        create_app(
            config.model_copy(
                update={
                    "request_bytes": 1024,
                    "requests_per_minute": 2,
                    "cors_origins": ["https://frontend.example"],
                }
            )
        )
    ) as small:
        response = small.post(
            "/api/v1/processes/search",
            content="x" * 1025,
            headers={"Origin": "https://frontend.example"},
        )
        assert response.headers["access-control-allow-origin"] == "https://frontend.example"
        assert (
            response.status_code == 422
            and response.json()["error"]["code"] == "REQUEST_WINDOW_TOO_LARGE"
        )
        assert small.get("/api/v1/health").status_code == 200
        assert small.get("/api/v1/health").status_code == 429
