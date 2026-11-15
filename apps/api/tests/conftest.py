"""Small invented dataset and real local Firebase Auth Emulator identities."""

import os
import subprocess
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from lca_api.app import create_app
from lca_api.config import ApiSettings
from lca_shared.db import schema as s
from pydantic import SecretStr
from sqlalchemy import create_engine, insert, update


@pytest.fixture(scope="module")
def catalog():
    url = os.environ["LCA_TEST_DATABASE_URL"]
    engine = create_engine(url)
    if (
        engine.url.host not in ("postgres", "localhost", "127.0.0.1")
        or engine.url.database != "lca"
    ):
        raise RuntimeError("API integration requires disposable local lca database")
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA IF EXISTS api CASCADE")
        connection.exec_driver_sql("DROP SCHEMA public CASCADE")
        connection.exec_driver_sql("CREATE SCHEMA public")
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=os.environ | {"LCA_DATABASE_URL": url}
    )
    release, revision, candidate, later = (uuid4() for _ in range(4))
    pids = [UUID(int=1000 + i) for i in range(205)]
    flows = [UUID(int=2000 + i) for i in range(3)]
    method, indicator, missing_indicator = (uuid4() for _ in range(3))
    with engine.begin() as c:
        c.execute(
            insert(s.database_release).values(
                id=release,
                database_code="BAFU",
                release_version="synthetic-api",
                display_name="Synthetic",
                license_policy="test-only",
            )
        )
        for no, rev in enumerate((revision, candidate, later), 1):
            c.execute(
                insert(s.release_revision).values(
                    id=rev,
                    database_release_id=release,
                    revision_no=no,
                    status="ready",
                    mapping_rule_version="test",
                    manifest_sha256="a" * 64,
                )
            )
        for index, pid in enumerate(pids):
            c.execute(
                insert(s.process).values(
                    id=pid,
                    revision_id=revision,
                    source_process_number=str(index),
                    name=("İ " if index in (190, 191) else "") + f"Electricity {index:03}",
                    geography="CH",
                    category="Energy",
                    subcategory="Power",
                    category_path=["Energy", "Power"],
                    reference_name="Electricity",
                    reference_amount=Decimal("1"),
                    reference_unit="kWh",
                    quality_flag="valid",
                )
            )
        for index, fid in enumerate(flows):
            c.execute(
                insert(s.flow).values(
                    id=fid,
                    canonical_identity_key=str(fid),
                    identity_key_version=1,
                    name=f"Flow {index}",
                    unit="kg",
                    category="air",
                    subcategory="urban",
                    compartment="air",
                    location="",
                    release_scope=str(release),
                    mapping_status="verified",
                    process_name=None,
                )
            )
        for index, amount in enumerate(("0", "-2", "3")):
            c.execute(
                insert(s.process_flows).values(
                    id=uuid4(),
                    revision_id=revision,
                    process_id=pids[index],
                    flow_id=flows[0],
                    flow_type="Ecosphere Output",
                    amount=Decimal(amount),
                )
            )
        c.execute(
            insert(s.process_flows).values(
                id=uuid4(),
                revision_id=revision,
                process_id=pids[0],
                flow_id=flows[1],
                flow_type="Ecosphere Output",
                amount=Decimal("0.123456789012345678901234567890123456789"),
            )
        )
        c.execute(
            insert(s.impact_method).values(
                id=method,
                revision_id=revision,
                provider="BAFU",
                name="IPCC 2021",
                version="2021",
                display_order=0,
            )
        )
        for order, iid in enumerate((indicator, missing_indicator)):
            c.execute(
                insert(s.impact_indicator).values(
                    id=iid,
                    revision_id=revision,
                    method_id=method,
                    name="GWP 100" if order == 0 else "Unavailable",
                    category=None,
                    original_header="Synthetic [kg]",
                    unit="kg",
                    display_order=order,
                )
            )
        for pid, status, amount in (
            (pids[0], "valid", Decimal("0")),
            (pids[1], "missing", None),
            (pids[2], "unresolved_basis", None),
        ):
            c.execute(
                insert(s.lcia_score).values(
                    revision_id=revision,
                    process_id=pid,
                    indicator_id=indicator,
                    status=status,
                    amount=amount,
                )
            )
        c.execute(
            insert(s.process_warning).values(
                id=uuid4(),
                revision_id=revision,
                process_id=pids[0],
                flow_id=flows[0],
                flow_type="Ecosphere Output",
                code="SYNTHETIC_WARNING",
                message="Synthetic affected cell",
            )
        )
        for rev in (revision, later):
            c.execute(
                update(s.release_revision)
                .where(s.release_revision.c.id == rev)
                .values(status="published", published_at=datetime.now(UTC))
            )
        c.execute(
            insert(s.release_publication).values(
                database_release_id=release, active_revision_id=revision
            )
        )
    yield {
        "engine": engine,
        "release": release,
        "revision": revision,
        "candidate": candidate,
        "later": later,
        "pids": pids,
        "flows": flows,
        "indicator": indicator,
        "missing_indicator": missing_indicator,
        "snapshot": [{"release_id": str(release), "revision_id": str(revision)}],
    }
    engine.dispose()


@pytest.fixture(scope="module")
def config():
    return ApiSettings(
        environment="test",
        database_url=SecretStr(os.environ["LCA_API_TEST_DATABASE_URL"]),
        firebase_project_id="demo-lca",
        token_secret=SecretStr("synthetic-token-signing-secret-for-tests"),
        auth_emulator_host=os.environ["LCA_AUTH_TEST_HOST"],
    )


def account(host: str, *, verified: bool = True):
    email = f"synthetic-{uuid4()}@example.invalid"
    with httpx.Client(base_url=f"http://{host}", trust_env=False, timeout=10) as client:
        response = client.post(
            "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic",
            json={"email": email, "password": "synthetic-password-123!", "returnSecureToken": True},
        )
        response.raise_for_status()
        user = response.json()
        if verified:
            response = client.post(
                "/identitytoolkit.googleapis.com/v1/accounts:update?key=synthetic",
                headers={"Authorization": "Bearer owner"},
                json={"localId": user["localId"], "emailVerified": True},
            )
            response.raise_for_status()
        response = client.post(
            "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=synthetic",
            json={"email": email, "password": "synthetic-password-123!", "returnSecureToken": True},
        )
        response.raise_for_status()
        user = response.json()
    return user


@pytest.fixture(scope="module")
def user(config):
    return account(config.auth_emulator_host)


@pytest.fixture(scope="module")
def client(config, catalog):
    with TestClient(create_app(config)) as client:
        yield client


@pytest.fixture
def authenticated(client, user):
    client.headers["Authorization"] = "Bearer " + user["idToken"]
    yield client
    client.headers.pop("Authorization", None)
