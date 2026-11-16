"""Committed synthetic local seed (#96): determinism, idempotent B4 load and exact reads."""

import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from lca_api.app import create_app
from lca_api.auth import FirebaseVerifier
from lca_api.config import ApiSettings
from lca_api.dtos import Identity
from lca_etl.artifact import verify_artifact
from lca_etl.intake import sha256
from lca_etl.publication_models import Target
from lca_etl.seed import (
    HIGH_PRECISION_FLOW,
    HIGH_PRECISION_SCORE,
    RELEASE_VERSION,
    TINY_FLOW,
    TINY_SCORE,
    SeedState,
    SeedStateError,
    check_sources,
    check_state,
    load,
)
from lca_shared.db import schema as db
from sqlalchemy import create_engine, func, insert, select

SEED = Path(__file__).resolve().parents[1] / "seed"
ARTIFACT = SEED / "artifact" / "manifest.json"
PAYLOAD = json.loads(ARTIFACT.read_bytes())
RELEASE, REVISION = UUID(PAYLOAD["release_id"]), UUID(PAYLOAD["revision_id"])


@pytest.mark.unit
def test_committed_sources_regenerate_byte_for_byte(tmp_path: Path) -> None:
    assert check_sources(SEED, tmp_path) == []


@pytest.mark.unit
def test_committed_artifact_is_ready_and_bound_to_committed_sources() -> None:
    payload = verify_artifact(ARTIFACT)
    assert payload["release"]["release_version"] == RELEASE_VERSION
    assert payload["representative"] is False
    assert payload["readiness"] == payload["readiness"] | {"status": "ready"}
    sources = [item for item in payload["objects"] if item["kind"] == "source"]
    bound = {
        item["source_relative_path"]: item["sha256"]
        for item in sources
        if item["source_relative_path"] != "manifest/frozen_manifest.json"
    }
    committed = {f"xml/{path.name}": sha256(path) for path in (SEED / "sources/xml").glob("*.xml")}
    committed[f"scores/{(SEED / 'sources/scores.xlsx').name}"] = sha256(
        SEED / "sources/scores.xlsx"
    )
    assert bound == committed


@pytest.mark.unit
def test_state_guard_refuses_every_state_the_seed_did_not_create() -> None:
    other = uuid4()
    check_state(SeedState((), None), REVISION)
    check_state(SeedState((REVISION,), None), REVISION)
    check_state(SeedState((REVISION,), REVISION), REVISION)
    for state, code in (
        (SeedState((REVISION, other), REVISION), "SEED_UNEXPECTED_REVISION"),
        (SeedState((other,), None), "SEED_UNEXPECTED_REVISION"),
        (SeedState((REVISION,), other), "SEED_UNEXPECTED_ACTIVE_REVISION"),
    ):
        with pytest.raises(SeedStateError, match=code):
            check_state(state, REVISION)


def reset(url: str) -> None:
    database = create_engine(url)
    if database.url.host != "postgres-target" or database.url.database != "lca":
        raise RuntimeError("Seed tests require the disposable publication target database")
    with database.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA IF EXISTS api CASCADE")
        connection.exec_driver_sql("DROP SCHEMA public CASCADE")
        connection.exec_driver_sql("CREATE SCHEMA public")
    database.dispose()
    subprocess.run(
        ["uv", "run", "--frozen", "alembic", "upgrade", "head"],
        check=True,
        env=os.environ | {"LCA_DATABASE_URL": url},
    )


def observer():
    return create_engine(os.environ["LCA_TARGET_MIGRATION_DATABASE_URL"])


def operations() -> list[tuple[str, str, str]]:
    database = observer()
    with database.connect() as connection:
        rows = connection.execute(
            select(
                db.publication_operation.c.action,
                db.publication_operation.c.session_user_name,
                db.publication_operation.c.database_role,
            ).order_by(db.publication_operation.c.created_at)
        ).all()
    database.dispose()
    return [tuple(row) for row in rows]


def pointer_and_revisions() -> tuple[UUID | None, list[UUID]]:
    database = observer()
    with database.connect() as connection:
        active = connection.scalar(
            select(db.release_publication.c.active_revision_id).where(
                db.release_publication.c.database_release_id == RELEASE
            )
        )
        revisions = list(
            connection.scalars(
                select(db.release_revision.c.id).where(
                    db.release_revision.c.database_release_id == RELEASE
                )
            )
        )
    database.dispose()
    return active, revisions


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    reset(os.environ["LCA_TARGET_MIGRATION_DATABASE_URL"])
    root = tmp_path_factory.mktemp("seed")
    target = root / "target.json"
    target.write_text(
        Target(
            name="local-app", environment="local", archive_uri=(root / "archive").as_uri()
        ).model_dump_json()
    )
    return load(ARTIFACT, target), target


@pytest.mark.publication
def test_seed_promotes_publishes_once_and_reruns_as_a_no_op(seeded) -> None:
    first, target = seeded
    assert first == {
        "release_id": str(RELEASE),
        "revision_id": str(REVISION),
        "promote_reused": False,
        "publish_reused": False,
        "seeded": True,
    }
    expected = [
        ("promote", "lca_import", "lca_import"),
        ("publish", "lca_publisher", "lca_publisher"),
    ]
    assert operations() == expected
    # Rerun against the already-seeded database through the container entry point.
    rerun = subprocess.run(
        [sys.executable, "-m", "lca_etl.seed", "load", "--artifact", str(ARTIFACT)]
        + ["--target", str(target)],
        check=True,
        capture_output=True,
        text=True,
    )
    second = json.loads(rerun.stdout.strip().splitlines()[-1])
    assert second == first | {"promote_reused": True, "publish_reused": True, "seeded": False}
    assert operations() == expected
    assert pointer_and_revisions() == (REVISION, [REVISION])


@pytest.fixture(scope="module")
def client(seeded):
    async def verified(self, token):
        return Identity(uid="synthetic-seed", email="seed@example.invalid")

    patch = pytest.MonkeyPatch()
    patch.setattr(FirebaseVerifier, "verify", verified)
    url = observer().url.set(username="lca_api", password="local-read-only")
    settings = ApiSettings(
        environment="test",
        database_url=url.render_as_string(hide_password=False),
        firebase_project_id="demo-seed",
        token_secret="synthetic-signing-key-for-seed-tests",
    )
    with TestClient(create_app(settings)) as test_client:
        test_client.headers["Authorization"] = "Bearer synthetic"
        yield test_client
    patch.undo()


def post(client: TestClient, path: str, body: dict) -> dict:
    response = client.post(path, json=body)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.publication
def test_published_seed_variety_and_exact_values_through_the_api(client) -> None:
    releases = client.get("/api/v1/releases").json()
    snapshot = [{"release_id": str(RELEASE), "revision_id": str(REVISION)}]
    assert releases["revision_snapshot"] == snapshot
    assert [item["version"] for item in releases["items"]] == [RELEASE_VERSION]
    selection = {"revision_snapshot": snapshot, "fields": {}, "scope": "all_matching"}
    selection["limit"] = 200
    ids = post(client, "/api/v1/processes/resolve-selection", selection)["items"]
    assert len(ids) >= 20
    base = {"revision_snapshot": snapshot, "process_ids": ids}
    headers = post(client, "/api/v1/processes/headers", base)["items"]
    assert len({header["category_path"][0] for header in headers}) >= 2
    assert max(len(header["category_path"]) for header in headers) >= 3
    assert len({header["reference_unit"] for header in headers}) >= 2
    assert len({Decimal(header["reference_amount"]) for header in headers}) >= 2
    by_name = {header["name"]: header["id"] for header in headers}

    rows = post(client, "/api/v1/comparison/flows/rows", base | {"limit": 200})
    keys = [row["row_key"] for row in rows["items"]]
    window = base | {"row_keys": keys, "comparison_token": rows["comparison_token"]}
    cells = post(client, "/api/v1/comparison/flows/cells", window)["cells"]
    signs: dict[str, set[str]] = {}
    for cell in cells:
        if not cell["present"]:
            assert cell["amount"] is None
            kind = "absent"
        else:
            value = Decimal(cell["amount"])
            kind = "zero" if value == 0 else "positive" if value > 0 else "negative"
        signs.setdefault(cell["row_key"], set()).add(kind)
    assert any(kinds >= {"positive", "negative", "zero", "absent"} for kinds in signs.values())
    amounts = {cell["amount"] for cell in cells if cell["present"]}
    # Exact decimal strings survive staging, promotion, NUMERIC storage and JSON.
    assert HIGH_PRECISION_FLOW in amounts
    assert {amount for amount in amounts if Decimal(amount) == Decimal(TINY_FLOW)} == {
        str(Decimal(TINY_FLOW))
    }

    tree = client.get("/api/v1/indicators/tree", params={"revision_snapshot": json.dumps(snapshot)})
    assert tree.status_code == 200, tree.text
    default = tree.json()["default_indicator_ids"]
    assert len(default) == 1
    indicators = [
        indicator["id"]
        for method in tree.json()["methods"]
        for indicator in method["indicators"]
        + [item for category in method["categories"] for item in category["indicators"]]
    ]
    score_rows = post(
        client,
        "/api/v1/comparison/scores/rows",
        base | {"indicator_ids": indicators, "limit": 200},
    )
    scores = post(
        client,
        "/api/v1/comparison/scores/cells",
        base
        | {
            "indicator_ids": indicators,
            "comparison_token": score_rows["comparison_token"],
        },
    )["cells"]
    gwp = {cell["process_id"]: cell for cell in scores if cell["indicator_id"] == default[0]}
    statuses = {cell["status"] for cell in gwp.values()}
    assert {"valid", "missing", "unresolved_basis"} <= statuses
    assert all((cell["status"] == "valid") == (cell["amount"] is not None) for cell in scores)
    assert gwp[by_name["aluminium, primary, ingot"]]["amount"] == HIGH_PRECISION_SCORE
    assert gwp[by_name["transport, freight, rail"]] == gwp[by_name["transport, freight, rail"]] | {
        "status": "missing",
        "amount": None,
    }
    valid = [cell for cell in scores if cell["status"] == "valid"]
    assert any(cell["amount"] == "0" for cell in valid)
    assert any(Decimal(cell["amount"]) == Decimal(TINY_SCORE) for cell in valid)


@pytest.mark.publication
def test_unexpected_revision_fails_loudly_without_publishing(seeded, client) -> None:
    _first, target = seeded
    database = observer()
    with database.begin() as connection:
        connection.execute(
            insert(db.release_revision).values(
                id=uuid4(),
                database_release_id=RELEASE,
                revision_no=99,
                status="rejected",
                mapping_rule_version="synthetic",
                manifest_sha256="0" * 64,
                created_at=datetime.now(UTC),
            )
        )
        before = connection.scalar(select(func.count()).select_from(db.publication_operation))
    database.dispose()
    with pytest.raises(SeedStateError, match="SEED_UNEXPECTED_REVISION"):
        load(ARTIFACT, target)
    assert pointer_and_revisions()[0] == REVISION
    assert len(operations()) == before
