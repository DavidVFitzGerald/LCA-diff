"""Stateless authenticated cursors and comparison selections."""

import base64
import hashlib
import hmac
import json
from typing import Any

from lca_api.errors import ApiError


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


class Tokens:
    def __init__(self, secret: str) -> None:
        self.secret = secret.encode()

    def sign(self, kind: str, value: dict[str, Any]) -> str:
        body = canonical({"v": 1, "kind": kind, **value})
        signature = hmac.digest(self.secret, body, "sha256")
        return base64.urlsafe_b64encode(signature + body).decode().rstrip("=")

    def read(self, token: str, kind: str) -> dict[str, Any]:
        try:
            raw = base64.b64decode(token + "=" * (-len(token) % 4), altchars=b"-_", validate=True)
            signature, body = raw[:32], raw[32:]
            if not hmac.compare_digest(signature, hmac.digest(self.secret, body, "sha256")):
                raise ValueError("signature")
            value = json.loads(body)
            if not isinstance(value, dict) or value.get("v") != 1 or value.get("kind") != kind:
                raise ValueError("kind")
            return value
        except ValueError, TypeError, UnicodeError:
            raise ApiError("INVALID_FILTER", 422) from None
