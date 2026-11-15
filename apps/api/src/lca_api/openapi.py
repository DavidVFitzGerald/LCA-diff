"""Reproducible public schema export without database or identity credentials."""

import argparse
import json
from pathlib import Path

from pydantic import SecretStr

from lca_api.app import create_app
from lca_api.config import ApiSettings


def schema_bytes() -> bytes:
    settings = ApiSettings(
        environment="test",
        database_url=SecretStr("postgresql+psycopg://lca_api:unused@localhost/lca"),
        firebase_project_id="demo-lca",
        token_secret=SecretStr("schema-export-only-not-a-runtime-secret"),
    )
    return (
        json.dumps(create_app(settings).openapi(), sort_keys=True, indent=2, ensure_ascii=False)
        + "\n"
    ).encode()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("apps/api/openapi.json"))
    args = parser.parse_args()
    content = schema_bytes()
    if args.check:
        if not args.output.exists() or args.output.read_bytes() != content:
            raise SystemExit("OpenAPI drift: regenerate with lca-openapi")
    else:
        args.output.write_bytes(content)


if __name__ == "__main__":
    main()
