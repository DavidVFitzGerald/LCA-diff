"""Run in the workspace container: validate host guards with a disposable fake Docker."""

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
        docker.write_text(
            '#!/bin/sh\nprintf called >> "$LCA_TEST_MARKER"\n'
            'printf "%s|%s|%s\\n" "$LCA_APP_FRONTEND_PORT" "$LCA_APP_API_PORT" '
            '"$LCA_APP_AUTH_PORT" > "$LCA_TEST_PORTS"\n'
        )
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
                "LCA_APP_FRONTEND_PORT",
                "LCA_APP_API_PORT",
                "LCA_APP_AUTH_PORT",
            }
        }
        port_record = root / "ports"
        env.update(
            PATH=f"{root}:{env['PATH']}",
            LCA_TEST_MARKER=str(marker),
            LCA_TEST_PORTS=str(port_record),
        )
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
            "app-config",
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
        (root / ".env").write_text("")
        port_names = ("LCA_APP_FRONTEND_PORT", "LCA_APP_API_PORT", "LCA_APP_AUTH_PORT")
        invalid_ports = ("abc", "", "0", "0000", "65536", "70000", "-1", "1.5", " 8011", "9" * 100)
        for variable in port_names:
            for value in invalid_ports:
                for command in commands:
                    marker.unlink(missing_ok=True)
                    result = subprocess.run(
                        ["bash", str(root / "dev"), command],
                        env=env | {variable: value},
                        capture_output=True,
                        text=True,
                    )
                    assert result.returncode == 2, (variable, value, command, result.stderr)
                    assert variable in result.stderr and "1 to 65535" in result.stderr
                    assert not marker.exists(), (command, "Docker invocation before port rejection")
            for value, canonical in (
                ("1", "1"),
                ("65535", "65535"),
                ("8011", "8011"),
                ("0008011", "8011"),
                ("0" * 100 + "65535", "65535"),
            ):
                marker.unlink(missing_ok=True)
                result = subprocess.run(
                    ["bash", str(root / "dev"), "app-config"],
                    env=env | {variable: value},
                    capture_output=True,
                    text=True,
                )
                assert result.returncode == 0 and marker.exists(), (variable, value, result.stderr)
                assert (
                    port_record.read_text().strip().split("|")[port_names.index(variable)]
                    == canonical
                )
            for value in invalid_ports:
                for command in ("shell", "up", "config", "help"):
                    marker.unlink(missing_ok=True)
                    result = subprocess.run(
                        ["bash", str(root / "dev"), command],
                        env=env | {variable: value},
                        capture_output=True,
                        text=True,
                    )
                    assert result.returncode == 0, (variable, value, command, result.stderr)
                    assert marker.exists() == (command != "help")
                    if command == "config":
                        assert marker.read_text() == "called", (
                            "config must render only the workspace"
                        )
        for variable in port_names:
            for literal in ('"0008011"', "'8011'", "8011  # local", "65536", "abc", "${PORT}"):
                (root / ".env").write_text(f"{variable}={literal}\n")
                marker.unlink(missing_ok=True)
                result = subprocess.run(
                    ["bash", str(root / "dev"), "app-config"],
                    env=env,
                    capture_output=True,
                    text=True,
                )
                reject = literal in ("65536", "abc", "${PORT}")
                assert (result.returncode == 2) is reject, (literal, result.stderr)
                assert marker.exists() is not reject
                if not reject:
                    assert (
                        port_record.read_text().strip().split("|")[port_names.index(variable)]
                        == "8011"
                    )
                override = subprocess.run(
                    ["bash", str(root / "dev"), "app-config"],
                    env=env | {variable: "8022"},
                    capture_output=True,
                    text=True,
                )
                assert override.returncode == 0, override.stderr
                assert (
                    port_record.read_text().strip().split("|")[port_names.index(variable)] == "8022"
                )
        print(
            "PASS literal .env ports (quoted/commented), invalid .env refusal and environment precedence"
        )
        print(
            "PASS app-only port validation: all three ports, every app command, range endpoints, leading zeros and oversized integers; workspace commands unaffected"
        )
        print(
            "PASS project collisions (default, environment, quoted/commented .env), environment precedence and distinct projects"
        )


if __name__ == "__main__":
    main()
