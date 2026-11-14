"""Safe event logging: caller supplies a code and allowlisted operational context."""

import sys
from typing import Any, TextIO

from loguru import logger

CONTEXT_KEYS = frozenset(
    {"run_id", "revision_id", "source_object_id", "process_source_id", "issue_code", "request_id"}
)


def configure_logging(sink: TextIO = sys.stderr, *, level: str = "INFO") -> None:
    logger.remove()
    logger.add(sink, serialize=True, level=level, backtrace=False, diagnose=False)


def event(code: str, **context: Any) -> None:
    """Never accept free-form payloads, credentials or original rows in an event."""
    if not code or any(char not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_" for char in code):
        raise ValueError("Log events require a machine-readable event code")
    safe = {key: str(value) for key, value in context.items() if key in CONTEXT_KEYS}
    logger.bind(**safe).info(code)
