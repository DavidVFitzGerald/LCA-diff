"""Bounded CI service readiness; no schema or source mutations."""

import os
import time

import httpx
import psycopg

deadline = time.monotonic() + 30
while True:
    try:
        with psycopg.connect(os.environ["LCA_BOOTSTRAP_DATABASE_URL"], connect_timeout=2):
            pass
        response = httpx.get(
            f"http://{os.environ['LCA_AUTH_TEST_HOST']}/", trust_env=False, timeout=2
        )
        break
    except psycopg.Error, httpx.TransportError:
        if time.monotonic() >= deadline:
            raise SystemExit("Disposable API test services did not become ready") from None
        time.sleep(0.5)
print("Disposable PostgreSQL and Auth Emulator are ready")
