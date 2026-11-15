"""Explicit maintainer targets; credentials are resolved from environment only."""

import os
from typing import Literal, Self
from urllib.parse import urlparse

from lca_shared.contracts import Boundary
from pydantic import Field, model_validator
from sqlalchemy.engine import make_url


class OperationError(ValueError):
    """Safe machine code; never includes SQL, credentials or provider payloads."""


class Target(Boundary):
    name: str = Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")
    environment: Literal["local", "test", "production"]
    archive_uri: str
    import_url_env: str = Field(
        default="LCA_TARGET_IMPORT_DATABASE_URL", pattern=r"^[A-Z][A-Z0-9_]*$"
    )
    publish_url_env: str = Field(
        default="LCA_TARGET_PUBLISH_DATABASE_URL", pattern=r"^[A-Z][A-Z0-9_]*$"
    )

    @model_validator(mode="after")
    def archive_policy(self) -> Self:
        uri = urlparse(self.archive_uri)
        if uri.scheme not in ("file", "gs") or uri.query or uri.fragment:
            raise ValueError("Target archive requires a file or private gs URI")
        if uri.scheme == "file" and (uri.netloc or not uri.path.startswith("/")):
            raise ValueError("Local archive requires an absolute local file URI")
        if uri.scheme == "gs" and not uri.netloc:
            raise ValueError("GCS archive requires a bucket")
        if self.environment == "production" and uri.scheme != "gs":
            raise ValueError("Production source archives require private GCS")
        return self

    def database_url(self, action: str) -> str:
        value = os.environ.get(self.import_url_env if action == "promote" else self.publish_url_env)
        if not value:
            raise OperationError("TARGET_CREDENTIALS_MISSING")
        try:
            url = make_url(value)
        except Exception:
            raise OperationError("TARGET_DATABASE_INVALID") from None
        if url.get_backend_name() != "postgresql":
            raise OperationError("TARGET_DATABASE_INVALID")
        if self.environment == "production":
            proxy = url.host in ("127.0.0.1", "localhost") or str(
                url.query.get("host", "")
            ).startswith("/cloudsql/")
            if not proxy and url.query.get("sslmode") not in ("verify-full", "verify-ca"):
                raise OperationError("TARGET_REQUIRES_TLS_OR_AUTH_PROXY")
        return value
