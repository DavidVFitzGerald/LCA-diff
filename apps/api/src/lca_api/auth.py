"""Firebase Admin verification with explicit emulator isolation."""

import os
import time
from typing import Any

import firebase_admin
from anyio import to_thread
from firebase_admin import auth, credentials
from google.auth.credentials import AnonymousCredentials

from lca_api.config import ApiSettings
from lca_api.dtos import Identity
from lca_api.errors import ApiError


class EmulatorCredential(credentials.Base):  # type: ignore[misc]
    def get_credential(self) -> AnonymousCredentials:
        return AnonymousCredentials()  # type: ignore[no-untyped-call]


class FirebaseVerifier:
    def __init__(self, settings: ApiSettings) -> None:
        if settings.auth_emulator_host:
            os.environ["FIREBASE_AUTH_EMULATOR_HOST"] = settings.auth_emulator_host
        self.app = firebase_admin.initialize_app(
            EmulatorCredential() if settings.auth_emulator_host else None,
            {"projectId": settings.firebase_project_id, "httpTimeout": 10},
            name=f"lca-{id(self)}",
        )

    async def verify(self, token: str) -> Identity:
        try:
            decoded: dict[str, Any] = await to_thread.run_sync(
                lambda: auth.verify_id_token(token, app=self.app, check_revoked=True)
            )
        except (
            auth.InvalidIdTokenError,
            auth.RevokedIdTokenError,
            auth.UserDisabledError,
            auth.UserNotFoundError,
            ValueError,
        ):
            raise ApiError("AUTH_REQUIRED", 401) from None
        except Exception:
            raise ApiError("TEMPORARILY_UNAVAILABLE", 503, retryable=True) from None
        # The Admin SDK deliberately skips timestamp verification for unsigned
        # emulator tokens. Apply the same finite lifetime rule in every mode.
        now = time.time()
        expiry, issued = decoded.get("exp"), decoded.get("iat")
        if type(expiry) is not int or type(issued) is not int or expiry <= now or issued > now:
            raise ApiError("AUTH_REQUIRED", 401)
        if decoded.get("email_verified") is not True:
            raise ApiError("EMAIL_NOT_VERIFIED", 403)
        uid, email = decoded.get("uid"), decoded.get("email")
        if not isinstance(uid, str) or not uid or not isinstance(email, str):
            raise ApiError("AUTH_REQUIRED", 401)
        return Identity(uid=uid, email=email)

    def close(self) -> None:
        firebase_admin.delete_app(self.app)


class Entitlements:
    """MVP access policy insertion point; all verified accounts share BAFU."""

    def allows(self, identity: Identity, database_code: str) -> bool:
        return identity.email_verified is True and database_code == "BAFU"
