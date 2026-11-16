"""Local app-stack helpers: Auth Emulator demo account and the live smoke check.

Both commands run inside the app stack's tools container (`./dev app-up` runs
`demo-user` on every start; `./dev app-smoke` runs `smoke`). They talk only to
the stack's private Compose network, use the Python standard library and never
print ID tokens or passwords. The demo credentials are local-only emulator values.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
from uuid import uuid4

OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class SmokeFailure(RuntimeError):
    pass


def request(
    method: str,
    url: str,
    *,
    body: Any = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], Any]:
    data = None if body is None else json.dumps(body).encode()
    prepared = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        prepared.add_header("Content-Type", "application/json")
    try:
        with OPENER.open(prepared, timeout=15) as response:
            status, raw, received = response.status, response.read(), response.headers
    except urllib.error.HTTPError as error:
        status, raw, received = error.code, error.read(), error.headers
    lowered = {key.lower(): value for key, value in received.items()}
    try:
        payload = json.loads(raw) if raw else None
    except ValueError:
        payload = None
    return status, lowered, payload


class Emulator:
    def __init__(self, host: str) -> None:
        self.base = f"http://{host}/identitytoolkit.googleapis.com/v1/"

    def call(self, endpoint: str, body: dict[str, Any], *, owner: bool = False) -> Any:
        headers = {"Authorization": "Bearer owner"} if owner else {}
        status, _, payload = request(
            "POST", self.base + endpoint + "?key=local-emulator", body=body, headers=headers
        )
        if status != 200:
            message = (payload or {}).get("error", {}).get("message", "UNKNOWN")
            raise SmokeFailure(f"emulator {endpoint} returned {status} {message}")
        return payload

    def sign_in(self, email: str, password: str) -> dict[str, Any]:
        result: dict[str, Any] = self.call(
            "accounts:signInWithPassword",
            {"email": email, "password": password, "returnSecureToken": True},
        )
        return result

    def sign_up(self, email: str, password: str) -> dict[str, Any] | None:
        try:
            result: dict[str, Any] = self.call(
                "accounts:signUp", {"email": email, "password": password, "returnSecureToken": True}
            )
        except SmokeFailure as error:
            if "EMAIL_EXISTS" in str(error):
                return None
            raise
        return result


def demo_user(emulator: Emulator, email: str, password: str) -> dict[str, Any]:
    """Create the verified demo account, or repair it if it already exists."""
    created = emulator.sign_up(email, password)
    account = created if created is not None else emulator.sign_in(email, password)
    emulator.call(
        "accounts:update", {"localId": account["localId"], "emailVerified": True}, owner=True
    )
    token = emulator.sign_in(email, password)["idToken"]
    users = emulator.call("accounts:lookup", {"idToken": token}).get("users", [])
    if len(users) != 1 or users[0].get("emailVerified") is not True:
        raise SmokeFailure("demo account is not verified")
    return {"demo_account": email, "created": created is not None, "email_verified": True}


def expect(condition: bool, name: str, detail: str = "") -> None:
    if not condition:
        raise SmokeFailure(f"{name} failed {detail}".strip())
    print(f"ok  {name}", flush=True)


def smoke(
    api: str,
    emulator: Emulator,
    email: str,
    password: str,
    allowed_origin: str,
    artifact: Path,
    high_precision: str,
) -> None:
    manifest = json.loads(artifact.read_bytes())
    snapshot = [{"release_id": manifest["release_id"], "revision_id": manifest["revision_id"]}]
    status, _, body = request("GET", api + "/api/v1/health")
    expect(status == 200 and body == {"status": "ok"}, "health 200")
    status, _, body = request("GET", api + "/api/v1/ready")
    expect(status == 200 and body == {"status": "ok"}, "ready 200")

    status, _, body = request("GET", api + "/api/v1/releases")
    code = (body or {}).get("error", {}).get("code")
    expect(status == 401 and code == "AUTH_REQUIRED", "no token -> 401 AUTH_REQUIRED", f"{status}")

    token = emulator.sign_in(email, password)["idToken"]
    authorization = {"Authorization": "Bearer " + token}
    status, _, body = request("GET", api + "/api/v1/releases", headers=authorization)
    items = (body or {}).get("items", [])
    seeded = [
        item
        for item in items
        if {"release_id": item["release_id"], "revision_id": item["revision_id"]} in snapshot
    ]
    expect(
        status == 200 and len(seeded) == 1 and snapshot[0] in body["revision_snapshot"],
        "demo token -> seeded published release and active revision",
        f"{status}",
    )
    print(
        f"    release {snapshot[0]['release_id']} revision {snapshot[0]['revision_id']}"
        f" version {seeded[0]['version']}",
        flush=True,
    )

    selection = {"revision_snapshot": snapshot, "fields": {}, "scope": "all_matching", "limit": 200}
    status, _, page = request(
        "POST", api + "/api/v1/processes/resolve-selection", body=selection, headers=authorization
    )
    ids = (page or {}).get("items", [])
    base = {"revision_snapshot": snapshot, "process_ids": ids}
    status, _, rows = request(
        "POST",
        api + "/api/v1/comparison/flows/rows",
        body=base | {"limit": 200},
        headers=authorization,
    )
    window = base | {
        "row_keys": [row["row_key"] for row in (rows or {}).get("items", [])],
        "comparison_token": (rows or {}).get("comparison_token", ""),
    }
    status, _, cells = request(
        "POST", api + "/api/v1/comparison/flows/cells", body=window, headers=authorization
    )
    amounts = {cell["amount"] for cell in (cells or {}).get("cells", []) if cell["present"]}
    expect(
        status == 200 and high_precision in amounts,
        "exact high-precision decimal string through flow cells",
        f"{status}",
    )

    unverified = emulator.sign_up(f"unverified-{uuid4()}@example.invalid", "local-unverified-only")
    if unverified is None:
        raise SmokeFailure("could not create the unverified smoke user")
    status, _, body = request(
        "GET",
        api + "/api/v1/releases",
        headers={"Authorization": "Bearer " + unverified["idToken"]},
    )
    code = (body or {}).get("error", {}).get("code")
    expect(
        status == 403 and code == "EMAIL_NOT_VERIFIED",
        "unverified user -> 403 EMAIL_NOT_VERIFIED",
        f"{status}",
    )

    preflight = {"Access-Control-Request-Method": "GET"}
    _, headers, _ = request(
        "OPTIONS",
        api + "/api/v1/releases",
        headers=preflight | {"Origin": "http://untrusted.example.invalid"},
    )
    expect(
        "access-control-allow-origin" not in headers,
        "non-allowlisted origin preflight has no CORS allow header",
    )
    for origin in (allowed_origin, allowed_origin.replace("127.0.0.1", "localhost")):
        _, headers, _ = request(
            "OPTIONS", api + "/api/v1/releases", headers=preflight | {"Origin": origin}
        )
        expect(
            headers.get("access-control-allow-origin") == origin,
            f"local frontend origin {origin} preflight is allowed",
        )


def main() -> None:
    parser = argparse.ArgumentParser(prog="local_stack.py")
    parser.add_argument("command", choices=("demo-user", "smoke"))
    args = parser.parse_args()
    emulator = Emulator(os.environ["LCA_AUTH_EMULATOR_HOST"])
    email, password = os.environ["LCA_DEMO_EMAIL"], os.environ["LCA_DEMO_PASSWORD"]
    try:
        if args.command == "demo-user":
            print(json.dumps(demo_user(emulator, email, password), sort_keys=True), flush=True)
        else:
            from lca_etl.seed import HIGH_PRECISION_FLOW

            smoke(
                os.environ["LCA_SMOKE_API_URL"].rstrip("/"),
                emulator,
                email,
                password,
                os.environ["LCA_SMOKE_ALLOWED_ORIGIN"],
                Path(os.environ["LCA_SEED_ARTIFACT"]),
                HIGH_PRECISION_FLOW,
            )
            print("smoke passed", flush=True)
    except SmokeFailure as error:
        print(f"FAILED {error}", file=sys.stderr, flush=True)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
