"""Environment-first settings; dotenv is opt-in and local-only."""

from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LCA_", extra="ignore", env_file=None)
    environment: Literal["local", "test", "production"] = "local"
    database_url: SecretStr
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"


def load_settings(*, environment: str, dotenv_path: Path | None = None) -> Settings:
    if dotenv_path is not None:
        if environment not in ("local", "test"):
            raise ValueError("dotenv is only supported for local/test entry points")
        load_dotenv(dotenv_path, override=False)
    return Settings(environment=environment)  # type: ignore[arg-type, call-arg]
