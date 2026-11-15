"""Manual, retry-safe BAFU candidate DAG. XCom contains identities, never raw rows."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from airflow.sdk import dag, get_current_context, task


@dag(
    dag_id="lca_bafu_import",
    schedule=None,
    start_date=datetime(2026, 1, 1, tzinfo=UTC),
    catchup=False,
    is_paused_upon_creation=False,
    max_active_runs=1,
    default_args={"retries": 1, "retry_delay": timedelta(seconds=2)},
    tags=["local", "private", "BAFU"],
)
def bafu_import() -> None:
    @task
    def freeze_sources() -> dict[str, str]:
        from lca_etl.intake import load_manifest, prepare

        context = get_current_context()
        dag_run = context["dag_run"]
        assert dag_run is not None
        configuration = dag_run.conf or {}
        path = Path(configuration["manifest_path"])
        prepared = prepare(load_manifest(path))
        return {"manifest_path": str(path), "manifest_sha256": prepared["manifest_sha256"]}

    @task
    def build_candidate(frozen: dict[str, str]) -> dict[str, Any]:
        from lca_etl.intake import load_manifest, prepare
        from lca_etl.pipeline import execute

        manifest = load_manifest(Path(frozen["manifest_path"]))
        if prepare(manifest)["manifest_sha256"] != frozen["manifest_sha256"]:
            raise ValueError("Inputs/rules changed after DAG freeze")
        result = execute(manifest)
        return {key: result[key] for key in ("revision_id", "run_id", "status", "directory")}

    @task
    def verify_reports_artifact(result: dict[str, Any]) -> None:
        import hashlib

        if result["status"] != "ready":
            raise RuntimeError("Candidate rejected; all private audit reports remain available")
        directory = Path(result["directory"])
        artifact = directory / "artifact" / "manifest.json"
        expected = (artifact.parent / "manifest.sha256").read_text().split()[0]
        if hashlib.sha256(artifact.read_bytes()).hexdigest() != expected:
            raise ValueError("Candidate artifact failed checksum verification")
        if not (directory / "reports" / "lcia_workbook_issues.csv").is_file():
            raise ValueError("Required workbook audit is missing")

    # Airflow resolves these XCom proxy arguments to the declared dictionaries
    # at task runtime; its decorator typing does not model that substitution.
    verify_reports_artifact(build_candidate(freeze_sources()))  # type: ignore[arg-type]


bafu_import_dag = bafu_import()
