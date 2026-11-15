"""Explicit environment configuration, with production emulator refusal."""

import os
from typing import Self

from lca_shared.config import Settings
from pydantic import Field, SecretStr, model_validator
from sqlalchemy.engine import make_url


class ApiSettings(Settings):
    firebase_project_id: str = Field(min_length=1)
    token_secret: SecretStr = Field(min_length=32)
    auth_emulator_host: str | None = None
    cors_origins: list[str] = []
    request_bytes: int = Field(default=2_000_000, ge=1024, le=16_000_000)
    response_bytes: int = Field(default=4_000_000, ge=1024, le=32_000_000)
    statement_timeout_ms: int = Field(default=10_000, ge=100, le=30_000)
    requests_per_minute: int = Field(default=240, ge=1, le=10000)

    @model_validator(mode="after")
    def secure_configuration(self) -> Self:
        if make_url(self.database_url.get_secret_value()).username != "lca_api":
            raise ValueError("API requires the least-privileged lca_api database role")
        ambient = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")
        if self.environment == "production" and (self.auth_emulator_host or ambient):
            raise ValueError("Production refuses Firebase emulator configuration")
        if ambient and ambient != self.auth_emulator_host:
            raise ValueError("Firebase emulator must be explicitly configured")
        if self.auth_emulator_host:
            if self.environment not in ("local", "test") or "://" in self.auth_emulator_host:
                raise ValueError("Emulator host requires explicit local/test host:port")
            if not self.firebase_project_id.startswith("demo-"):
                raise ValueError("Emulator requires a demo- project")
        if "*" in self.cors_origins:
            raise ValueError("CORS origins must be explicit")
        return self
