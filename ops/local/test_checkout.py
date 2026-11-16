"""Verify an autocrlf=true Git checkout preserves seed bytes and shell entry points.

Run inside the workspace after committing changes; no host Git configuration is changed.
"""

import os
import subprocess
import tempfile
from pathlib import Path


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(
        ["git", "-c", f"safe.directory={root}", "-C", str(root), *args], stderr=subprocess.PIPE
    )


def main() -> None:
    source = Path(__file__).resolve().parents[2]
    with tempfile.TemporaryDirectory(prefix="lca-checkout-") as temporary:
        checkout = Path(temporary) / "checkout"
        subprocess.run(
            [
                "git",
                "-c",
                f"safe.directory={source}",
                "-c",
                "core.autocrlf=true",
                "clone",
                "--no-local",
                str(source),
                str(checkout),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            env=os.environ | {"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull},
        )
        seed = git(checkout, "ls-files", "-z", "data_pipeline/seed").split(b"\0")
        count = 0
        for name in filter(None, seed):
            path = name.decode()
            assert (checkout / path).read_bytes() == git(source, "show", f"HEAD:{path}"), path
            count += 1
        shells = git(checkout, "ls-files", "-z", "*.sh", "dev").split(b"\0")
        for name in filter(None, shells):
            path = name.decode()
            assert b"\r\n" not in (checkout / path).read_bytes(), path
        print(f"PASS autocrlf=true: {count} seed files byte-identical; shell entry points use LF")


if __name__ == "__main__":
    main()
