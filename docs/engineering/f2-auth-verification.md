# F2 simulated authentication verification (#12)

Scope: deterministic local auth service and raw mock-data guards. Presentation,
forms and the expanded application session controller remain #11/#13/#14; full
browser authentication acceptance remains #15. No product/specification deviation
or new ADR is introduced.

## Reproduce

Host lifecycle commands from this checkout:

```sh
COMPOSE_PROJECT_NAME=lca-diff-f2-auth FRONTEND_PORT=5176 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f2-auth FRONTEND_PORT=5176 ./dev check
```

Run checks inside the verified rootless workspace:

```sh
docker compose -p lca-diff-f2-auth exec -T workspace bash -lc 'npm --prefix apps/frontend ci --no-audit --no-fund'
docker compose -p lca-diff-f2-auth exec -T workspace bash -lc 'npm --prefix apps/frontend run format:check && npm --prefix apps/frontend run lint && npm --prefix apps/frontend run typecheck && npm --prefix apps/frontend run test:unit && npm --prefix apps/frontend run build && npm --prefix apps/frontend run test:e2e'
```

## Engineering evidence

- Environment check: PASS, namespace UID/GID 0 maps to unprivileged parent 1000,
  dropped capabilities/no-new-privileges, eight preflight regressions and frozen
  Python workspace validation. Node 24.22.3, npm 11.19.1, Playwright 1.65.1.
- Frozen npm installation: PASS, 230 packages. Dependency manifests/lock unchanged.
- Format, lint, TypeScript, unit suite and production build: PASS. Exact delivered
  SHA and final test count are recorded in the issue engineering handoff.
- Existing foundation Playwright smoke: PASS in Chromium and Firefox (two cases).
  This confirms no protected-data calls or runtime/network errors on anonymous
  startup; it does not claim the future account-form browser scenarios exist.
- Auth unit tests exercise async observer ordering/unsubscribe, safe restore and
  corrupt markers, registration/duplicates, verification resend/explicit refresh,
  reset success/failure, account switching, logout, expiry/revocation/refresh
  failure, deterministic errors, cancellation and obsolete-operation rejection.
- Composed-service tests verify anonymous/unverified denial, verified synthetic
  identity, and stale protected-read rejection. Existing provider tests retain
  query cancellation and UID-isolation coverage; #14 expands those transitions.
- Storage checks prove only safe synthetic session metadata is persisted; signout
  removes its versioned marker and leaves account workspace keys untouched.

See `apps/frontend/src/services/README.md` for fixed demo credentials and exact
verification/reset steps. The active mock session restores after reload; signing
out then reloading resets newly registered fixture metadata. There is no durable
account database, password retention, token issuance or email delivery.

Independent QA, hosted CI and maintainer review/merge remain separate gates.
Mock tests establish no real Firebase/API authentication, authorization or data
security. Real adapter/token lifecycle evidence remains Phase 2 B2/I1.
