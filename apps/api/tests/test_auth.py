import base64
import json
import time

import httpx
import pytest
from conftest import account
from fastapi.testclient import TestClient
from lca_api.app import create_app

pytestmark = pytest.mark.auth


def mutate(token, **claims):
    header, payload, signature = token.split(".")
    value = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))) | claims
    return (
        header
        + "."
        + base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
        + "."
        + signature
    )


def test_real_emulator_verified_unverified_expired_revoked_and_wrong_project(config):
    user = account(config.auth_emulator_host)
    unverified = account(config.auth_emulator_host, verified=False)
    with TestClient(create_app(config)) as client:

        def status(token):
            return client.get("/api/v1/me", headers={"Authorization": "Bearer " + token})

        response = status(user["idToken"])
        assert response.status_code == 200, response.text
        assert (
            response.json()["uid"] == user["localId"] and response.json()["email_verified"] is True
        )
        assert status(unverified["idToken"]).status_code == 403
        assert status(mutate(user["idToken"], exp=int(time.time()) - 100)).status_code == 401
        assert status(mutate(user["idToken"], aud="wrong-project")).status_code == 401
        with httpx.Client(
            base_url=f"http://{config.auth_emulator_host}", trust_env=False
        ) as emulator:
            result = emulator.post(
                "/identitytoolkit.googleapis.com/v1/accounts:update?key=synthetic",
                headers={"Authorization": "Bearer owner"},
                json={"localId": user["localId"], "validSince": str(int(time.time()) + 1)},
            )
            result.raise_for_status()
        assert status(user["idToken"]).status_code == 401
