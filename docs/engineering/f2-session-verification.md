# F2 session lifecycle verification (#14)

Scope: application session controller, protected query/service gating and
cache reset under `apps/frontend/src/app/`. Persisted workspace restore is F5;
real token refresh/revocation/Admin verification is Phase 2 (B2/I1); F2
consolidated acceptance is #15. No product/specification deviation or new ADR.

## Delivered behavior

`createSessionStore` (in `service-context.ts`) remains the single controller
consumed by `useAuthState`, queries and guards. It mirrors observed auth state
and can additionally **lock locally** until the adapter next reports a state.
Every loss or change of verified identity advances the session epoch, calls
`QueryClient.clear()` (aborting in-flight queries and removing cached data) and
invalidates pending direct reads.

- **Restore:** resolving shows only the non-sensitive loading shell; the modal
  is shown only after anonymous/unverified/error state is confirmed.
- **Zero protected reads** while resolving, anonymous, unverified, errored or
  locked: queries stay disabled and direct calls return typed denials.
- **Protected 401/403:** a guarded read returning `AUTH_REQUIRED` or
  `EMAIL_NOT_VERIFIED` within the current epoch locks the session to an error
  state (modal: "Your session could not be confirmed"), clearing caches and
  pending work. A failure from an earlier epoch is ignored, so a late response
  from account A cannot expire account B. A newer adapter state supersedes the
  lock.
- **Signout:** `guardAuthService` locks before calling the adapter, so neither a
  slow nor failed signout leaves prior content visible. A failed signout of a
  verified user stays locked with the error explanation. App's former
  signing-out/inline failure UI is removed accordingly.
- **Stale responses:** successes, typed failures and thrown failures delivered
  after an epoch change (A→B, logout, same-UID relogin) become
  `AUTH_REQUIRED: Authentication context changed`; a caller's own `AbortError`
  for a current read still propagates.
- **Workspace storage:** nothing in the session lifecycle deletes storage; a
  seeded UID-scoped workspace key survives signout and account switching. Only
  the mock adapter's own session marker is removed on signout.

## Reproduce

```sh
COMPOSE_PROJECT_NAME=lca-diff-f2-forms FRONTEND_PORT=5177 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f2-forms FRONTEND_PORT=5177 ./dev check
docker compose -p lca-diff-f2-forms exec -T workspace bash -lc 'npm --prefix apps/frontend ci --no-audit --no-fund'
docker compose -p lca-diff-f2-forms exec -T workspace bash -lc 'cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:e2e'
```

## Engineering evidence

- Environment check PASS; frozen npm install 230 packages, lock unchanged.
- Format, lint, typecheck, build PASS. Unit: 168 tests in nine files, including
  15 in `src/app/session.test.tsx`. These use a test-only injected composition
  with an observer driven by the test, controllable deferred reads and a
  visible protected sentinel rendered from guarded query data. They cover
  restore without dialog mount (MutationObserver), zero calls across states,
  logout/expiry/revocation/failed refresh/verification loss (sentinel removed,
  pending signal aborted, cache empty, late answer ignored), protected
  `AUTH_REQUIRED`/`EMAIL_NOT_VERIFIED` locking and recovery, slow/failed
  signout, A→B cache/pending isolation, same-UID relogin, late failures not
  expiring B, own-abort passthrough and workspace-key preservation through the
  composed mock adapter.
- Mutation check: disabling the 401/403 invalidation, the pre-signout lock, or
  stale-rejection conversion makes four of these tests fail.
- Playwright: 18 cases PASS across Chromium and Firefox, adding restore without
  a dialog ever rendering across two reloads (`@smoke`, init-script observer),
  unverified restore staying locked then anonymous reload, and signout/account
  switch preserving a seeded workspace key with the session marker removed.
  All cases assert no fetch/XHR/API/external requests or console errors.

## Limitations

The product has no protected data UI until F3–F5, so browser tests observe
account/shell state; protected-sentinel removal is proven in component tests.
The mock adapter has zero latency in the browser. Safari was not available.
These local guards do not establish real token, backend authorization or data
security; Phase 2 must map real 401/403 responses to the same typed codes.
