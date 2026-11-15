"""Stable safe errors without validation input or provider payloads."""

from typing import Literal

from lca_shared.contracts import Boundary

ErrorCode = Literal[
    "AUTH_REQUIRED",
    "EMAIL_NOT_VERIFIED",
    "RELEASE_UNAVAILABLE",
    "UNKNOWN_PROCESS",
    "INVALID_FILTER",
    "STALE_SNAPSHOT",
    "REQUEST_WINDOW_TOO_LARGE",
    "TEMPORARILY_UNAVAILABLE",
]


class ApiError(Exception):
    def __init__(self, code: ErrorCode, status: int, *, retryable: bool = False) -> None:
        self.code, self.status, self.retryable = code, status, retryable
        super().__init__(code)


class ErrorDetail(Boundary):
    code: ErrorCode
    message: str
    request_id: str
    retryable: bool


class ErrorResponse(Boundary):
    error: ErrorDetail
