"""Bounded wait for the private local Airflow DAG registration, with safe output."""

import json
import subprocess
import time


def main() -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        result = subprocess.run(
            ["airflow", "dags", "list", "--output", "json"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode == 0:
            try:
                records = json.loads(result.stdout.strip().splitlines()[-1])
            except ValueError, IndexError:
                records = []
            if any(row.get("dag_id") == "lca_bafu_import" for row in records):
                print("PASS: private manual BAFU DAG registered")
                return
        time.sleep(1)
    raise RuntimeError("Private Airflow DAG was not registered before the test deadline")


if __name__ == "__main__":
    main()
