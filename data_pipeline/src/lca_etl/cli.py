"""Maintainer-only local import controls; promotion/publication belong to B4."""

import argparse
import json
import subprocess
import time
from pathlib import Path
from typing import Any
from uuid import UUID

from lca_shared.db import schema as db
from sqlalchemy import select

from lca_etl.intake import load_manifest, prepare
from lca_etl.pipeline import engine, execute

DAG_ID = "lca_bafu_import"


def airflow_run(manifest_path: Path, *, wait: bool, timeout: int) -> dict[str, Any]:
    manifest = load_manifest(manifest_path)
    frozen = prepare(manifest)
    run_id = "lca__" + frozen["manifest_sha256"]
    # Local maintainer command runs in the ETL image with isolated Airflow
    # metadata credentials. Arguments are structured, never a shell string.
    configuration = json.dumps({"manifest_path": str(manifest_path.resolve())})
    triggered = subprocess.run(
        [
            "airflow",
            "dags",
            "trigger",
            "--run-id",
            run_id,
            "--conf",
            configuration,
            "--output",
            "json",
            DAG_ID,
        ],
        capture_output=True,
        text=True,
    )
    if triggered.returncode != 0:
        # A repeated deterministic run ID may already exist. Verify it through
        # the same CLI rather than silently generating another revision/run.
        state = subprocess.run(
            ["airflow", "dags", "state", DAG_ID, run_id], capture_output=True, text=True
        )
        if state.returncode != 0:
            raise RuntimeError("Airflow trigger failed; inspect private Airflow diagnostics")
    deadline = time.monotonic() + timeout
    if wait:
        while time.monotonic() < deadline:
            state = subprocess.run(
                ["airflow", "dags", "state", DAG_ID, run_id], capture_output=True, text=True
            )
            value = (
                state.stdout.strip().splitlines()[-1].split(",", 1)[0].strip()
                if state.stdout.strip()
                else ""
            )
            if value in ("success", "failed"):
                return {
                    "dag_id": DAG_ID,
                    "dag_run_id": run_id,
                    "state": value,
                    "directory": frozen["directory"],
                }
            time.sleep(1)
        raise TimeoutError("Airflow run remains active; inspect private run reports")
    return {
        "dag_id": DAG_ID,
        "dag_run_id": run_id,
        "state": "submitted",
        "directory": frozen["directory"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="lca-import")
    subcommands = parser.add_subparsers(dest="command", required=True)
    for name in ("prepare", "run", "run-local"):
        command = subcommands.add_parser(name)
        command.add_argument("--manifest", required=True, type=Path)
        if name == "run":
            command.add_argument("--wait", action="store_true")
            command.add_argument("--timeout", type=int, default=600)
    report = subcommands.add_parser("report")
    report.add_argument("--run-id", required=True, type=UUID)
    args = parser.parse_args()
    try:
        if args.command == "prepare":
            result = prepare(load_manifest(args.manifest))
            result = {
                key: result[key] for key in ("manifest_sha256", "directory", "representative")
            }
        elif args.command == "run":
            result = airflow_run(args.manifest, wait=args.wait, timeout=args.timeout)
        elif args.command == "run-local":
            result = execute(load_manifest(args.manifest))
        else:
            database = engine()
            with database.connect() as connection:
                row = (
                    connection.execute(
                        select(db.import_run).where(db.import_run.c.id == args.run_id)
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    raise ValueError("Unknown import run")
                result = {
                    "run_id": str(row["id"]),
                    "revision_id": str(row["revision_id"]),
                    "status": row["status"],
                    "counts": row["counts"],
                    "report_uri": row["report_uri"],
                }
            database.dispose()
    except Exception as error:
        # Keep provider rows, input exception strings and credentials out of logs.
        print(
            json.dumps(
                {"ok": False, "code": "IMPORT_COMMAND_FAILED", "error_type": type(error).__name__}
            )
        )
        raise SystemExit(1) from None
    print(json.dumps(result, sort_keys=True, default=str))
    if result.get("status") == "rejected" or result.get("state") == "failed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
