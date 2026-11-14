import os
import subprocess
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from lca_shared.db import schema as s
from sqlalchemy import Connection, Engine, create_engine, insert, select, text, update
from sqlalchemy.exc import DBAPIError

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    url = os.environ.get("LCA_TEST_DATABASE_URL")
    if not url:
        pytest.fail("Integration checks require the disposable LCA_TEST_DATABASE_URL")
    engine = create_engine(url)
    # Guard against destructive checks being pointed at an unrecognized database.
    if (
        engine.url.host not in ("postgres", "localhost", "127.0.0.1")
        or engine.url.database != "lca"
    ):
        raise RuntimeError("Integration tests require the explicitly disposable local lca database")
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP SCHEMA IF EXISTS api CASCADE")
        connection.exec_driver_sql("DROP SCHEMA public CASCADE")
        connection.exec_driver_sql("CREATE SCHEMA public")
    subprocess.run(
        ["alembic", "upgrade", "head"], check=True, env=os.environ | {"LCA_DATABASE_URL": url}
    )
    yield engine
    engine.dispose()


@pytest.fixture
def connection(engine: Engine) -> Iterator[Connection]:
    with engine.connect() as connection:
        transaction = connection.begin()
        yield connection
        transaction.rollback()


def revision(
    connection: Connection, release_id: object | None = None, number: int = 1
) -> tuple[object, object]:
    release = release_id or uuid4()
    if release_id is None:
        connection.execute(
            insert(s.database_release).values(
                id=release,
                database_code="BAFU",
                release_version=str(release),
                display_name="Synthetic",
                license_policy="test-only",
            )
        )
    rev = uuid4()
    connection.execute(
        insert(s.release_revision).values(
            id=rev,
            database_release_id=release,
            revision_no=number,
            status="staging",
            mapping_rule_version="test1",
            manifest_sha256="a" * 64,
        )
    )
    return release, rev


def source(connection: Connection, rev: object) -> object:
    source_id = uuid4()
    connection.execute(
        insert(s.source_object).values(
            id=source_id,
            revision_id=rev,
            relative_path=str(source_id),
            sha256="b" * 64,
            byte_size=12,
            kind="process_xml",
            storage_uri="private://synthetic",
        )
    )
    return source_id


def process(connection: Connection, rev: object) -> object:
    pid = uuid4()
    connection.execute(
        insert(s.process).values(
            id=pid,
            revision_id=rev,
            source_process_number=str(pid),
            name="Synthetic",
            geography="CH",
            category="A",
            subcategory="B",
            category_path=["A", "B"],
            reference_name="Synthetic product",
            reference_amount=Decimal("1"),
            reference_unit="kg",
            quality_flag="valid",
        )
    )
    return pid


def rejected(connection: Connection, statement: object) -> None:
    with pytest.raises(DBAPIError), connection.begin_nested():
        connection.execute(statement)


def test_revision_and_staging_integrity(connection: Connection) -> None:
    release, rev = revision(connection)
    _, other = revision(connection)
    source_id = source(connection, rev)
    rejected(
        connection,
        insert(s.stg_bafu_process).values(
            revision_id=other, source_object_id=source_id, dataset_number="42", extraction_ordinal=0
        ),
    )
    # Malformed duplicate dataset numbers and exchange numbers are retained.
    for ordinal in range(2):
        sid = uuid4()
        connection.execute(
            insert(s.stg_bafu_process).values(
                id=sid,
                revision_id=rev,
                source_object_id=source_id,
                dataset_number="42",
                extraction_ordinal=ordinal,
            )
        )
        for exchange in range(2):
            connection.execute(
                insert(s.stg_bafu_exchange).values(
                    revision_id=rev,
                    stg_bafu_process_id=sid,
                    exchange_ordinal=exchange,
                    number="99",
                    mean_value="invalid raw value",
                    original={"comment": "source-preserved"},
                )
            )
    assert connection.scalar(select(s.stg_bafu_exchange.c.id).limit(1))
    connection.execute(
        update(s.release_revision)
        .where(s.release_revision.c.id == other)
        .values(status="published", published_at=datetime.now(UTC))
    )
    rejected(
        connection,
        insert(s.release_publication).values(database_release_id=release, active_revision_id=other),
    )
    rejected(
        connection,
        insert(s.release_publication).values(database_release_id=release, active_revision_id=rev),
    )


def test_precision_scores_and_self_contained_provenance(connection: Connection) -> None:
    _, rev = revision(connection)
    pid = process(connection, rev)
    source_id = source(connection, rev)
    fid, pfid, method, indicator = (uuid4() for _ in range(4))
    amount = Decimal("123456789012345678901234567890.123456789012345678901234567890")
    connection.execute(
        insert(s.flow).values(
            id=fid,
            canonical_identity_key=str(fid),
            identity_key_version=1,
            name="Synthetic",
            unit="kg",
            category="air",
            subcategory="urban",
            compartment="air/urban",
            location="",
            release_scope="synthetic",
            mapping_status="verified",
        )
    )
    connection.execute(
        insert(s.process_flows).values(
            id=pfid,
            revision_id=rev,
            process_id=pid,
            flow_id=fid,
            flow_type="Ecosphere Output",
            amount=amount,
        )
    )
    connection.execute(
        insert(s.flow_provenance).values(
            revision_id=rev,
            process_flow_id=pfid,
            source_object_id=source_id,
            source_path="synthetic.xml",
            source_process_number="42",
            exchange_ordinal=0,
            original_amount=str(amount),
            original_unit="kg",
            normalized_input_amount=amount,
            applied_rule_ids=[],
        )
    )
    assert (
        connection.scalar(select(s.process_flows.c.amount).where(s.process_flows.c.id == pfid))
        == amount
    )
    connection.execute(
        insert(s.impact_method).values(
            id=method,
            revision_id=rev,
            provider="synthetic",
            name="IPCC",
            version="2021",
            display_order=0,
        )
    )
    connection.execute(
        insert(s.impact_indicator).values(
            id=indicator,
            revision_id=rev,
            method_id=method,
            name="GWP100",
            original_header="GWP [kg]",
            unit="kg",
            display_order=0,
        )
    )
    rejected(
        connection,
        insert(s.lcia_score).values(
            revision_id=rev, process_id=pid, indicator_id=indicator, status="missing", amount=0
        ),
    )
    connection.execute(
        insert(s.lcia_score).values(
            revision_id=rev, process_id=pid, indicator_id=indicator, status="valid", amount=0
        )
    )
    assert (
        connection.scalar(select(s.lcia_score.c.amount).where(s.lcia_score.c.process_id == pid))
        == 0
    )
    rejected(
        connection,
        update(s.process_flows).where(s.process_flows.c.id == pfid).values(amount=Decimal("NaN")),
    )
    connection.execute(
        update(s.release_revision)
        .where(s.release_revision.c.id == rev)
        .values(status="published", published_at=datetime.now(UTC))
    )
    rejected(
        connection,
        update(s.flow).where(s.flow.c.id == fid).values(name="changed historical description"),
    )
    rejected(connection, s.flow.delete().where(s.flow.c.id == fid))


def test_published_data_are_immutable_even_when_inactive(connection: Connection) -> None:
    release, rev = revision(connection)
    pid = process(connection, rev)
    source_id = source(connection, rev)
    _, other_rev = revision(connection)
    other_pid = process(connection, other_rev)
    run_id, rule_id = uuid4(), uuid4()
    connection.execute(
        insert(s.import_run).values(
            id=run_id,
            revision_id=rev,
            status="completed",
            parser_version="test",
            transformer_version="test",
        )
    )
    connection.execute(
        insert(s.resolution_rule).values(
            id=rule_id,
            database_release_id=release,
            rule_type="test",
            input_key={},
            resolution={},
            author="synthetic",
            evidence="unapproved source evidence",
            approved=False,
            effective_version="test",
            checksum="c" * 64,
        )
    )
    connection.execute(
        insert(s.validation_issue).values(
            revision_id=rev,
            import_run_id=run_id,
            stage="test",
            severity="WARNING",
            code="TEST",
            message="synthetic",
            resolution_state="unresolved",
            resolution_rule_id=rule_id,
        )
    )
    connection.execute(
        update(s.release_revision)
        .where(s.release_revision.c.id == rev)
        .values(status="published", published_at=datetime.now(UTC))
    )
    connection.execute(
        insert(s.release_publication).values(database_release_id=release, active_revision_id=rev)
    )
    for statement in (
        update(s.process).where(s.process.c.id == pid).values(name="changed"),
        update(s.resolution_rule)
        .where(s.resolution_rule.c.id == rule_id)
        .values(evidence="changed history"),
        update(s.process).where(s.process.c.id == pid).values(revision_id=other_rev),
        update(s.process).where(s.process.c.id == other_pid).values(revision_id=rev),
        s.process.delete().where(s.process.c.id == pid),
        update(s.source_object)
        .where(s.source_object.c.id == source_id)
        .values(storage_uri="changed"),
        update(s.release_revision).where(s.release_revision.c.id == rev).values(published_at=None),
        update(s.database_release)
        .where(s.database_release.c.id == release)
        .values(release_version="changed"),
        insert(s.process).values(
            revision_id=rev,
            source_process_number="new",
            name="new",
            geography="CH",
            category="",
            subcategory="",
            reference_name="new",
            reference_amount=1,
            reference_unit="kg",
            quality_flag="valid",
        ),
    ):
        rejected(connection, statement)
    connection.execute(
        update(s.release_revision).where(s.release_revision.c.id == rev).values(status="superseded")
    )
    rejected(connection, update(s.process).where(s.process.c.id == pid).values(name="still frozen"))


def test_publication_serializes_against_candidate_writes(engine: Engine) -> None:
    with engine.begin() as connection:
        _, rev = revision(connection)
        pid = process(connection, rev)
    with engine.connect() as writer, engine.connect() as publisher:
        writer_transaction = writer.begin()
        writer.execute(update(s.process).where(s.process.c.id == pid).values(name="before freeze"))
        publisher.exec_driver_sql("SET LOCAL lock_timeout = '100ms'")
        with pytest.raises(DBAPIError):
            publisher.execute(
                update(s.release_revision)
                .where(s.release_revision.c.id == rev)
                .values(status="published", published_at=datetime.now(UTC))
            )
        publisher.rollback()
        writer_transaction.commit()
        publisher.execute(
            update(s.release_revision)
            .where(s.release_revision.c.id == rev)
            .values(status="published", published_at=datetime.now(UTC))
        )
        publisher.commit()
        rejected(writer, update(s.process).where(s.process.c.id == pid).values(name="after freeze"))
        writer.rollback()
    # Shared release metadata must serialize too; checking existing frozen children
    # without locking the parent permits a metadata transaction to commit later.
    with engine.begin() as connection:
        release, rev = revision(connection)
    with engine.connect() as metadata_writer, engine.connect() as publisher:
        metadata_writer.execute(
            update(s.database_release)
            .where(s.database_release.c.id == release)
            .values(display_name="before publication")
        )
        publisher.exec_driver_sql("SET LOCAL lock_timeout = '100ms'")
        with pytest.raises(DBAPIError):
            publisher.execute(
                update(s.release_revision)
                .where(s.release_revision.c.id == rev)
                .values(status="published", published_at=datetime.now(UTC))
            )
        publisher.rollback()
        metadata_writer.commit()
        publisher.execute(
            update(s.release_revision)
            .where(s.release_revision.c.id == rev)
            .values(status="published", published_at=datetime.now(UTC))
        )
        publisher.commit()
        rejected(
            metadata_writer,
            update(s.database_release)
            .where(s.database_release.c.id == release)
            .values(display_name="after publication"),
        )
        metadata_writer.rollback()


def test_api_and_import_roles(engine: Engine) -> None:
    # Commit synthetic fixture so separate least-privilege connections can observe it.
    with engine.begin() as connection:
        _, published = revision(connection)
        public_pid = process(connection, published)
        _, private = revision(connection)
        private_pid = process(connection, private)
        connection.execute(
            update(s.release_revision)
            .where(s.release_revision.c.id == published)
            .values(status="published", published_at=datetime.now(UTC))
        )
    api = create_engine(engine.url.set(username="lca_api", password="local-read-only"))
    with api.connect() as connection:
        ids = set(connection.scalars(text("SELECT id FROM api.process")))
        assert public_pid in ids and private_pid not in ids
        for sql in (
            "SELECT * FROM public.process",
            "SELECT * FROM public.stg_bafu_process",
            "UPDATE api.process SET name='bad'",
        ):
            with pytest.raises(DBAPIError):
                connection.exec_driver_sql(sql)
            connection.rollback()
    api.dispose()
    importer = create_engine(engine.url.set(username="lca_import", password="local-import-only"))
    with importer.begin() as connection:
        rejected(
            connection,
            update(s.release_revision)
            .where(s.release_revision.c.id == private)
            .values(status="published"),
        )
        rejected(
            connection,
            update(s.release_revision)
            .where(s.release_revision.c.id == private)
            .values(status="published", published_at=datetime.now(UTC)),
        )
        rejected(
            connection,
            insert(s.release_revision).values(
                database_release_id=uuid4(),
                revision_no=1,
                status="published",
                published_at=datetime.now(UTC),
                mapping_rule_version="test",
                manifest_sha256="a" * 64,
            ),
        )
        rejected(connection, text("DELETE FROM release_publication"))
        connection.exec_driver_sql(
            "CREATE TEMP TABLE release_revision (id uuid, published_at timestamptz)"
        )
        connection.exec_driver_sql("SET LOCAL search_path = pg_temp, public")
        rejected(
            connection,
            update(s.process)
            .where(s.process.c.id == public_pid)
            .values(name="temporary-shadow attack"),
        )
    importer.dispose()
    publisher = create_engine(
        engine.url.set(username="lca_publisher", password="local-publisher-only")
    )
    with publisher.begin() as connection:
        connection.execute(
            update(s.release_revision)
            .where(s.release_revision.c.id == private)
            .values(status="published", published_at=datetime.now(UTC))
        )
        rejected(
            connection,
            update(s.process)
            .where(s.process.c.id == private_pid)
            .values(name="publisher cannot edit catalog"),
        )
    publisher.dispose()
