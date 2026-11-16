"""Run in the workspace container: project collisions must never invoke Docker."""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def main() -> None:
    source = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="lca-project-guard-") as temporary:
        root = Path(temporary)
        shutil.copyfile(source / "dev", root / "dev")
        (root / ".devcontainer").mkdir()
        (root / ".devcontainer/check-docker.sh").write_text("exit 0\n")
        docker = root / "docker"
        docker.write_text('#!/bin/sh\nprintf called >> "$LCA_TEST_MARKER"\n')
        docker.chmod(0o755)
        marker = root / "marker"
        env = {
            key: value
            for key, value in os.environ.items()
            if key
            not in {
                "LCA_DEV_CONTAINER",
                "COMPOSE_PROJECT_NAME",
                "LCA_APP_PROJECT",
            }
        }
        env.update(PATH=f"{root}:{env['PATH']}", LCA_TEST_MARKER=str(marker))
        cases = [
            ({"LCA_APP_PROJECT": "lca-diff-dev"}, "", True),
            ({"COMPOSE_PROJECT_NAME": "lca-x", "LCA_APP_PROJECT": "lca-x"}, "", True),
            ({"LCA_APP_PROJECT": "lca-env"}, 'COMPOSE_PROJECT_NAME="lca-env"\n', True),
            ({"LCA_APP_PROJECT": "lca-env"}, "COMPOSE_PROJECT_NAME=lca-env   # local\n", True),
            (
                {"COMPOSE_PROJECT_NAME": "lca-other", "LCA_APP_PROJECT": "lca-env"},
                "COMPOSE_PROJECT_NAME=lca-env\n",
                False,
            ),
            ({}, "", False),
        ]
        commands = (
            "app-up",
            "app-down",
            "app-reset",
            "app-status",
            "app-logs",
            "app-smoke",
            "app-e2e",
            "app-import",
        )
        for overrides, dotenv, reject in cases:
            (root / ".env").write_text(dotenv)
            for command in commands if reject else ("app-status",):
                marker.unlink(missing_ok=True)
                result = subprocess.run(
                    ["bash", str(root / "dev"), command],
                    env=env | overrides,
                    capture_output=True,
                    text=True,
                )
                assert (result.returncode == 2) is reject, (command, result.stderr)
                assert marker.exists() is not reject, (command, "Docker invocation")
        print(
            "PASS project collisions (default, environment, quoted/commented .env), environment precedence and distinct projects"
        )


if __name__ == "__main__":
    main()
