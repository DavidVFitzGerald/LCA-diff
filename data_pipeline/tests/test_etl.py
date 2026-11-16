"""Minimal behavior suite for scientific extraction, exact ETL and failed audits."""

import csv
import importlib.util
import json
import os
import subprocess
import zipfile
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from fixtures import fixture
from lca_etl.intake import safe_extract, sha256
from lca_etl.models import Rule
from lca_etl.pipeline import execute
from lca_etl.workbook import rows
from lca_etl.xml import classify, parse_xml
from lca_shared.db import schema as db
from sqlalchemy import create_engine, func, select, text


@pytest.mark.unit
def test_secure_source_and_exact_workbook(tmp_path: Path) -> None:
    manifest = fixture(tmp_path)
    parsed = parse_xml((tmp_path / "xml" / "1.xml").read_bytes(), max_bytes=100_000)
    assert parsed["error"] is None
    exchanges = parsed["processes"][0]["exchanges"]
    assert classify(exchanges[-1]) == "Technosphere"
    assert exchanges[1]["mean_value"] == "1.000000000000000000000000000000000000001"
    unsafe = parse_xml(
        b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><ecoSpold>&e;</ecoSpold>',
        max_bytes=1000,
    )
    assert unsafe["error"] == "XML_PARSE_OR_UNSAFE"
    deep = b"<ecoSpold>" + b"<x>" * 200 + b"</x>" * 200 + b"</ecoSpold>"
    assert parse_xml(deep, max_bytes=10_000)["error"] == "XML_STRUCTURE_BUDGET"
    scores = list(rows(tmp_path / "scores.xlsx", "BAFU_2026 v1"))
    assert scores[2][1]["F"]["value"] == "-1.000000000000000000000000000000001e-40"
    archive = tmp_path / "unsafe.zip"
    with zipfile.ZipFile(archive, "w") as zipped:
        zipped.writestr("a/./b", "first")
        zipped.writestr("a/b", "second")
    with pytest.raises(ValueError, match="Unsafe"):
        safe_extract(archive, tmp_path / "expanded", manifest)
    with pytest.raises(ValueError, match="positive"):
        Rule.model_validate(
            {
                "id": str(UUID(int=1)),
                "rule_type": "score_basis",
                "release_version": "x",
                "source_quantity": "1",
                "source_unit": "m",
                "target_quantity": "1",
                "target_unit": "km",
                "factor": "0",
                "author": "fixture",
                "evidence": "test",
                "version": "1",
            }
        )


def run_fixture(tmp_path: Path, *, invalid: bool, spark: bool) -> tuple[dict, object]:
    manifest = fixture(tmp_path, invalid=invalid)
    result = execute(manifest, use_spark=spark)
    if result["status"] == "rejected" and not invalid:
        failure = Path(result["directory"]) / "failure.json"
        pytest.fail(
            f"Synthetic import rejected: {failure.read_text() if failure.exists() else result['counts']}"
        )
    return result, manifest


@pytest.mark.etl
@pytest.mark.integration
def test_golden_spark_postgres_and_failed_audit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A stale image-level worker path must not override the active uv interpreter.
    # This executes real Spark workers and fails before the #101 fix.
    monkeypatch.setenv("PYSPARK_PYTHON", "/does-not-exist/lca-test-worker-python")
    result, manifest = run_fixture(tmp_path / "golden", invalid=False, spark=True)
    assert result["status"] == "ready"
    revision = UUID(result["revision_id"])
    database = create_engine(os.environ["LCA_DATABASE_URL"])
    with database.connect() as connection:
        processes = {
            row["source_process_number"]: row
            for row in connection.execute(
                select(db.process).where(db.process.c.revision_id == revision)
            ).mappings()
        }
        assert set(processes) == {"1", "2", "3", "5", "6", "7"}
        alpha = processes["1"]["id"]
        zero = (
            connection.execute(
                select(db.process_flows).where(
                    db.process_flows.c.process_id == alpha, db.process_flows.c.amount == 0
                )
            )
            .mappings()
            .one()
        )
        assert (
            connection.scalar(
                select(func.count())
                .select_from(db.flow_provenance)
                .where(db.flow_provenance.c.process_flow_id == zero["id"])
            )
            == 2
        )
        assert (
            connection.scalar(
                select(func.count(func.distinct(db.process_flows.c.flow_id))).where(
                    db.process_flows.c.process_id == alpha,
                    db.process_flows.c.flow_type == "Ecosphere Output",
                )
            )
            == 2
        )
        beta_score = (
            connection.execute(
                select(db.lcia_score).where(
                    db.lcia_score.c.process_id == processes["2"]["id"],
                    db.lcia_score.c.source_column == 5,
                )
            )
            .mappings()
            .one()
        )
        assert beta_score["amount"] == Decimal(2000) and beta_score["conversion_factor"] == 1000
        assert (
            connection.scalar(
                select(func.count())
                .select_from(db.lcia_score)
                .where(
                    db.lcia_score.c.process_id == processes["3"]["id"],
                    db.lcia_score.c.status == "unresolved_basis",
                )
            )
            == 47
        )
        assert (
            connection.scalar(
                select(func.count())
                .select_from(db.lcia_score)
                .where(
                    db.lcia_score.c.process_id == processes["5"]["id"],
                    db.lcia_score.c.status == "missing",
                )
            )
            == 47
        )
        assert set(
            connection.scalars(
                select(db.stg_bafu_reference_resolution.c.status).where(
                    db.stg_bafu_reference_resolution.c.revision_id == revision
                )
            )
        ) >= {"manual", "fallback", "resolved"}
        assert (
            connection.scalar(
                text("SELECT has_table_privilege(current_user, 'release_publication', 'INSERT')")
            )
            is False
        )
    observer = create_engine(os.environ["LCA_TEST_DATABASE_URL"])
    with observer.connect() as connection:
        assert connection.scalar(select(func.count()).select_from(db.release_publication)) == 0
    observer.dispose()
    report = Path(result["directory"]) / "reports" / "lcia_workbook_issues.csv"
    with report.open(newline="") as stream:
        audit = list(csv.DictReader(stream))
    assert {int(row["excel_row_number"]) for row in audit} == set(range(3, 11))
    assert all(
        sum(key.startswith("original_") and not key.startswith("original_cell_") for key in row)
        == 51
        for row in audit
    )
    assert audit[0]["original_A_Product"] == 'Alpha, "quoted"\nline - CH'
    assert (
        "SCORE_BASIS_CONVERTED" in audit[1]["issue_codes"]
        and audit[1]["resolution_status"] == "resolved"
    )
    artifact_dir = Path(result["directory"]) / "artifact"
    assert "LCIA_ROW_MAPPING_APPLIED" in audit[-1]["issue_codes"]
    assert (
        audit[-1]["resolution_status"] == "resolved"
        and "Invented explicit verified row alias" in audit[-1]["rule_evidence"]
    )
    artifact = json.loads((artifact_dir / "manifest.json").read_bytes())
    assert not artifact["representative"]
    assert all(
        sha256(artifact_dir / item["path"]) == item["sha256"]
        for item in artifact["tables"] + artifact["objects"]
    )
    exported = [
        json.loads(line)
        for line in (artifact_dir / "tables" / "flow_provenance.jsonl").read_text().splitlines()
    ]
    assert all(row["stg_bafu_exchange_id"] is None for row in exported)
    assert execute(manifest)["reused"] is True
    # Recover a missing finalized artifact after an interrupted artifact-write
    # step without rerunning or altering the already verified scientific data.
    (artifact_dir / "manifest.json").unlink()
    assert execute(manifest)["reused"] is True
    assert (artifact_dir / "manifest.json").is_file()
    table_path = artifact_dir / "tables" / "process.jsonl"
    original = table_path.read_bytes()
    table_path.write_bytes(original + b"\n")
    with pytest.raises(ValueError, match="payload"):
        execute(manifest)
    table_path.write_bytes(original)
    failed, _ = run_fixture(tmp_path / "failed", invalid=True, spark=True)
    assert failed["status"] == "rejected" and failed["counts"]["unresolved_critical"] >= 2
    with (Path(failed["directory"]) / "reports" / "lcia_workbook_issues.csv").open(
        newline=""
    ) as stream:
        assert len(list(csv.DictReader(stream))) == len(audit)
    assert not (Path(failed["directory"]) / "artifact" / "manifest.json").exists()
    database.dispose()


@pytest.mark.airflow
def test_manual_dag_uses_real_pipeline() -> None:
    path = Path(__file__).parents[1] / "dags" / "bafu_import.py"
    spec = importlib.util.spec_from_file_location("lca_bafu_test_dag", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    dag = module.bafu_import_dag
    assert dag.schedule is None and dag.max_active_runs == 1
    assert set(dag.task_ids) == {"freeze_sources", "build_candidate", "verify_reports_artifact"}
    shared = Path.cwd() / "private" / "airflow-tests" / str(uuid4())
    fixture(shared)
    command = subprocess.run(
        [
            "lca-import",
            "run",
            "--manifest",
            str(shared / "manifest.json"),
            "--wait",
            "--timeout",
            "180",
        ],
        capture_output=True,
        text=True,
        timeout=200,
    )
    assert command.returncode == 0, command.stdout + command.stderr
    result = json.loads(command.stdout.strip().splitlines()[-1])
    assert result["state"] == "success"
    candidate = json.loads((Path(result["directory"]) / "result.json").read_bytes())
    assert candidate["status"] == "ready"
    assert candidate["counts"]["process"] == 6
