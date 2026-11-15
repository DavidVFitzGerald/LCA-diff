"""Small real-database publication lifecycle/fault suite; invented sources only."""

import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from fixtures import fixture
from lca_api.app import create_app
from lca_api.auth import FirebaseVerifier
from lca_api.config import ApiSettings
from lca_api.dtos import Identity
from lca_etl.intake import sha256, write_json
from lca_etl.object_store import ObjectStore
from lca_etl.pipeline import execute
from lca_etl.publication import activate, promote
from lca_etl.publication_models import OperationError, Target
from lca_shared.db import schema as db
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import DBAPIError

pytestmark = pytest.mark.publication


def migrate(url):
    database = create_engine(url)
    if database.url.host not in ("postgres", "postgres-target") or database.url.database != "lca":
        raise RuntimeError("Tests require isolated disposable Compose databases")
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


@pytest.fixture(scope="module")
def candidates(tmp_path_factory):
    migrate(os.environ["LCA_TEST_DATABASE_URL"])
    root = tmp_path_factory.mktemp("publication")
    result, version = [], None
    for index in range(3):
        directory = root / str(index)
        manifest = fixture(directory)
        if version is None:
            version = manifest.release.release_version
        else:
            for rules in (manifest.validation_rules, manifest.score_basis_rules):
                body = json.loads(rules.read_bytes())
                for rule in body["rules"]:
                    rule["release_version"] = version
                rules.write_text(json.dumps(body))
            manifest = manifest.model_copy(
                update={"release": manifest.release.model_copy(update={"release_version": version})}
            )
            xml = directory / "xml" / "1.xml"
            xml.write_text(xml.read_text().replace('meanValue="-2"', f'meanValue="-{index + 2}"'))
        run = execute(manifest, use_spark=index == 0)
        assert run["status"] == "ready"
        path = Path(run["directory"]) / "artifact" / "manifest.json"
        result.append((path, json.loads(path.read_bytes())))
    return result


@pytest.fixture
def target(tmp_path):
    migrate(os.environ["LCA_TARGET_MIGRATION_DATABASE_URL"])
    return Target(
        name="synthetic", environment="test", archive_uri=(tmp_path / "archives").as_uri()
    )


def observer():
    return create_engine(os.environ["LCA_TARGET_MIGRATION_DATABASE_URL"])


def call_cli(target, directory, arguments):
    config = directory / "target.json"
    config.write_text(target.model_dump_json())
    process = subprocess.run(
        [sys.executable, "-m", "lca_etl.cli", *arguments, "--target", str(config)],
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(process.stdout)


def test_lifecycle_api_snapshots_and_concurrency(candidates, target, tmp_path, monkeypatch):
    first, second, third = candidates
    release = UUID(first[1]["release_id"])
    revisions = [UUID(item[1]["revision_id"]) for item in candidates]
    for path, payload in candidates:
        assert UUID(payload["release_id"]) == release
        assert call_cli(
            target,
            tmp_path,
            ["promote", "--artifact", str(path), "--operation-id", str(uuid4()), "--dry-run"],
        )["dry_run"]
    assert not Path(target.archive_uri.removeprefix("file://")).exists()
    operation = uuid4()
    assert (
        call_cli(
            target,
            tmp_path,
            ["promote", "--artifact", str(first[0]), "--operation-id", str(operation)],
        )["active_revision_id"]
        is None
    )
    assert promote(first[0], target, operation)["reused"]

    async def verified(self, token):
        return Identity(uid="synthetic-verified", email="synthetic@example.invalid")

    monkeypatch.setattr(FirebaseVerifier, "verify", verified)
    url = observer().url.set(username="lca_api", password="local-read-only")
    app = create_app(
        ApiSettings(
            environment="test",
            database_url=url.render_as_string(hide_password=False),
            firebase_project_id="demo-publication",
            token_secret="synthetic-signing-key-for-publication",
        )
    )
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer synthetic"}
        assert client.get("/api/v1/releases").status_code == 401
        assert client.get("/api/v1/releases", headers=headers).json()["items"] == []
        call_cli(
            target,
            tmp_path,
            [
                "publish",
                "--release",
                str(release),
                "--revision",
                str(revisions[0]),
                "--expected-active",
                "none",
                "--operation-id",
                str(uuid4()),
            ],
        )
        snapshot = client.get("/api/v1/releases", headers=headers).json()["revision_snapshot"]
        assert snapshot == [{"release_id": str(release), "revision_id": str(revisions[0])}]
        database = observer()
        with database.connect() as connection:
            pid = connection.scalar(
                select(db.process.c.id).where(
                    db.process.c.revision_id == revisions[0],
                    db.process.c.source_process_number == "1",
                )
            )
            assert connection.scalar(select(func.count()).select_from(db.stg_bafu_exchange)) == 0
            assert connection.scalar(select(db.source_object.c.storage_uri).limit(1)).startswith(
                target.archive_uri
            )
        body = {"revision_snapshot": snapshot, "process_ids": [str(pid)], "limit": 200}
        rows = client.post("/api/v1/comparison/flows/rows", headers=headers, json=body).json()
        old = rows["items"]
        assert old
        window = body | {
            "row_keys": [row["row_key"] for row in old],
            "comparison_token": rows["comparison_token"],
        }
        # The row request has a page limit; cell windows use explicit row keys.
        window.pop("limit")
        cells = client.post("/api/v1/comparison/flows/cells", headers=headers, json=window)
        assert cells.status_code == 200, cells.text
        old_cells = cells.json()["cells"]
        assert any(cell["amount"] == "-2" for cell in old_cells)
        for path, _payload in (second, third):
            promote(path, target, uuid4())
        assert (
            client.get("/api/v1/releases", headers=headers).json()["revision_snapshot"] == snapshot
        )
        barrier = Barrier(2)

        def contender(revision):
            barrier.wait()
            try:
                return activate(
                    target, "publish", revision, uuid4(), expected=revisions[0], release_id=release
                )
            except OperationError as error:
                return str(error)

        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(contender, revisions[1:]))
        assert sum(isinstance(value, dict) for value in outcomes) == 1
        assert "STALE_PUBLICATION_POINTER" in outcomes
        current = UUID(next(value for value in outcomes if isinstance(value, dict))["revision_id"])
        assert client.get("/api/v1/releases", headers=headers).json()["revision_snapshot"][0][
            "revision_id"
        ] == str(current)
        assert (
            client.post("/api/v1/comparison/flows/rows", headers=headers, json=body).json()["items"]
            == old
        )
        assert (
            client.post("/api/v1/comparison/flows/cells", headers=headers, json=window).json()[
                "cells"
            ]
            == old_cells
        )
        with database.connect() as connection:
            new_pid = connection.scalar(
                select(db.process.c.id).where(
                    db.process.c.revision_id == current,
                    db.process.c.source_process_number == "1",
                )
            )
        new_body = {
            "revision_snapshot": [{"release_id": str(release), "revision_id": str(current)}],
            "process_ids": [str(new_pid)],
        }
        new_rows = client.post(
            "/api/v1/comparison/flows/rows", headers=headers, json=new_body
        ).json()
        new_cells = client.post(
            "/api/v1/comparison/flows/cells",
            headers=headers,
            json=new_body
            | {
                "row_keys": [row["row_key"] for row in new_rows["items"]],
                "comparison_token": new_rows["comparison_token"],
            },
        )
        assert new_cells.status_code == 200, new_cells.text
        assert any(
            cell["amount"] == str(-revisions.index(current) - 2)
            for cell in new_cells.json()["cells"]
        )
        rollback_id = uuid4()
        call_cli(
            target,
            tmp_path,
            [
                "rollback",
                "--release",
                str(release),
                "--revision",
                str(revisions[0]),
                "--expected-active",
                str(current),
                "--operation-id",
                str(rollback_id),
            ],
        )
        assert activate(target, "rollback", revisions[0], rollback_id, expected=current)["reused"]
        with pytest.raises(OperationError, match="RELEASE_MISMATCH"):
            activate(
                target, "rollback", revisions[0], rollback_id, expected=current, release_id=uuid4()
            )
        assert (
            client.get("/api/v1/releases", headers=headers).json()["revision_snapshot"] == snapshot
        )
        with pytest.raises(OperationError, match="RELEASE_MISMATCH"):
            activate(
                target, "rollback", current, uuid4(), expected=revisions[0], release_id=uuid4()
            )
        with database.connect() as connection:
            audits = connection.execute(select(db.publication_operation)).mappings().all()
            assert {row["action"] for row in audits} == {"promote", "publish", "rollback"}
            assert all(
                row["database_role"]
                == ("lca_import" if row["action"] == "promote" else "lca_publisher")
                for row in audits
            )
        publisher = create_engine(os.environ["LCA_TARGET_PUBLISH_DATABASE_URL"])
        with publisher.connect() as connection:
            with pytest.raises(DBAPIError):
                connection.execute(text("DELETE FROM public.publication_operation"))
            connection.rollback()
            with pytest.raises(DBAPIError):
                connection.execute(
                    db.process.update().where(db.process.c.id == pid).values(name="tampered")
                )
        publisher.dispose()
        database.dispose()


def test_denials_interrupted_transfer_and_corrupt_artifact(
    candidates, target, tmp_path, monkeypatch
):
    path, payload = candidates[0]
    revision = UUID(payload["revision_id"])
    invalid = target.model_copy(update={"import_url_env": "LCA_UNAUTHORIZED_DATABASE_URL"})
    url = observer().url.set(username="lca_api", password="local-read-only")
    monkeypatch.setenv("LCA_UNAUTHORIZED_DATABASE_URL", url.render_as_string(hide_password=False))
    with pytest.raises(OperationError, match="OPERATOR_DENIED"):
        promote(path, invalid, uuid4())
    with pytest.raises(OperationError, match="REVISION_UNKNOWN"):
        activate(target, "publish", revision, uuid4(), expected=None)
    copy = tmp_path / "corrupt"
    shutil.copytree(path.parent, copy)
    (copy / "tables" / "process_flows.jsonl").unlink()
    with pytest.raises(ValueError):
        promote(copy / "manifest.json", target, uuid4())
    original_put, calls = ObjectStore.put, 0

    def interrupted(self, *args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("synthetic interruption")
        return original_put(self, *args)

    operation = uuid4()
    monkeypatch.setattr(ObjectStore, "put", interrupted)
    with pytest.raises(OSError):
        promote(path, target, operation)
    database = observer()
    with database.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(db.process)) == 0
        assert connection.scalar(select(func.count()).select_from(db.release_publication)) == 0
    monkeypatch.setattr(ObjectStore, "put", original_put)
    promote(path, target, operation)
    with pytest.raises(OperationError, match="ROLLBACK_REQUIRES_PUBLISHED_REVISION"):
        activate(target, "rollback", revision, uuid4(), expected=None)
    tampered = tmp_path / "semantic"
    shutil.copytree(path.parent, tampered)
    table = tampered / "tables" / "process_flows.jsonl"
    records = [json.loads(line) for line in table.read_text().splitlines()]
    records[0]["amount"] = "999"
    table.write_text("".join(json.dumps(row) + "\n" for row in records))
    manifest = json.loads((tampered / "manifest.json").read_bytes())
    descriptor = next(item for item in manifest["tables"] if item["name"] == "process_flows")
    descriptor.update(sha256=sha256(table), byte_size=table.stat().st_size)
    write_json(tampered / "manifest.json", manifest)
    (tampered / "manifest.sha256").write_text(
        sha256(tampered / "manifest.json") + "  manifest.json\n"
    )
    with pytest.raises(OperationError):
        promote(tampered / "manifest.json", target, uuid4())
    with database.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(db.release_publication)) == 0
    database.dispose()


def test_gcs_preconditions_and_production_gate(tmp_path, monkeypatch):
    from google.api_core.exceptions import PreconditionFailed
    from google.cloud import storage
    from lca_etl.publication import require_approval

    contents = {}

    class Blob:
        def __init__(self, name):
            self.name = name

        def upload_from_filename(self, path, **kwargs):
            assert kwargs["if_generation_match"] == 0
            if self.name in contents:
                raise PreconditionFailed("synthetic existing object")
            contents[self.name] = Path(path).read_bytes()

        def download_to_file(self, stream, **kwargs):
            stream.write(contents[self.name])

    bucket = SimpleNamespace(
        blob=Blob, iam_configuration=SimpleNamespace(public_access_prevention="enforced")
    )
    monkeypatch.setattr(storage, "Client", lambda: SimpleNamespace(get_bucket=lambda name: bucket))
    store = ObjectStore("gs://synthetic-private/prefix", require_private=True)
    source = tmp_path / "invented"
    source.write_bytes(b"synthetic")
    store.put(source, "object", sha256(source), source.stat().st_size)
    store.put(source, "object", sha256(source), source.stat().st_size)
    contents["prefix/object"] = b"bad"
    with pytest.raises(OperationError, match="CHECKSUM"):
        store.put(source, "object", sha256(source), source.stat().st_size)
    production = Target(
        name="production", environment="production", archive_uri="gs://synthetic-private/prefix"
    )
    with pytest.raises(OperationError, match="APPROVAL_REQUIRED"):
        require_approval(
            production, "publish", uuid4(), uuid4(), "a" * 64, None, None, {"representative": False}
        )
    with pytest.raises(OperationError, match="REPRESENTATIVE"):
        require_approval(
            production, "promote", uuid4(), uuid4(), "a" * 64, None, None, {"representative": True}
        )
