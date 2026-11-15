"""Resolve future API/ETL selections with official Airflow constraints, without installation.

This produces no second repository lockfile or fake application members. Actual
runtime member manifests/uv.lock will be extended in B2/B3.
"""

import hashlib
import pathlib
import subprocess
import tempfile
import tomllib

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONSTRAINTS = ROOT / "constraints/airflow-3.4.0-python3.14.txt"


def main() -> None:
    expected = CONSTRAINTS.with_suffix(".sha256").read_text().split()[0]
    assert hashlib.sha256(CONSTRAINTS.read_bytes()).hexdigest() == expected
    official = [
        line.strip()
        for line in CONSTRAINTS.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]
    project = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert project["tool"]["uv"]["constraint-dependencies"] == official
    shared = [
        "pydantic==2.14.2",
        "pydantic-settings==2.16.2",
        "SQLAlchemy==2.0.55",
        "psycopg[binary]==3.3.6",
        "loguru==0.8.0",
        "python-dotenv==1.2.4",
    ]
    selections = {
        "lean-api": [*shared, "fastapi==0.162.0", "firebase-admin==7.7.0", "uvicorn==0.54.0"],
        "combined-api-etl": [
            *shared,
            "fastapi==0.162.0",
            "apache-airflow==3.4.0",
            "firebase-admin==7.7.0",
            "uvicorn==0.54.0",
            "pyspark==4.3.0",
        ],
    }
    with tempfile.TemporaryDirectory(prefix="lca-dependency-proof-") as directory:
        for name, dependencies in selections.items():
            source = pathlib.Path(directory) / f"{name}.in"
            output = source.with_suffix(".txt")
            source.write_text("\n".join(dependencies) + "\n")
            subprocess.run(
                [
                    "uv",
                    "pip",
                    "compile",
                    str(source),
                    "--constraint",
                    str(CONSTRAINTS),
                    "--python-version",
                    "3.14",
                    "--output-file",
                    str(output),
                    "--quiet",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            resolved = output.read_text()
            if name == "lean-api":
                assert "apache-airflow==" not in resolved and "pyspark==" not in resolved
            print(f"PASS {name}: constrained resolver succeeded; constraints sha256={expected}")


if __name__ == "__main__":
    main()
