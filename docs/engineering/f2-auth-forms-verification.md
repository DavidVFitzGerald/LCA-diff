# F2 account forms verification (#13)

Scope: in-modal login, self-registration, verification guidance/resend and
password reset against the merged `AuthService` boundary and simulated mock
adapter. Session restoration/revocation and account-isolated caches remain #14;
consolidated F2 acceptance remains #15. No product/specification deviation or
new ADR is introduced.

## Delivered behavior

- `src/auth/AuthDialog.tsx` replaces the placeholder shell dialog. It keeps the
  native required modal (`showModal`, `aria-modal`, inert shell, Escape and
  backdrop refusal) and re-opens itself if a browser force-closes it after
  repeated close requests. Initial focus is the Email field.
- Sign in, Create an account and Reset your password are views of one modal;
  switching moves focus to the new view's first field and keeps the typed email.
  Passwords are cleared after failures and never carried, persisted or logged.
- Authenticated but unverified users see Verify your email with Resend, “I've
  verified my email” (refresh) and Use a different account (sign out). The
  shell stays inert. Only the observed verified auth state removes the modal; a
  successful action result alone never unlocks it.
- Each view runs at most one action. Pending actions mark controls
  `aria-disabled`, the form `aria-busy`, inputs read-only and announce progress
  in a polite live region; repeated clicks/Enter are ignored. Changing flow,
  account or unlocking unmounts the view, aborting its request and ignoring any
  late response. The modal stays mounted through action-driven `resolving`.
- Validation errors are rendered beside fields with `aria-invalid` and
  `aria-describedby`; service errors use `role="alert"` and are also referenced
  by the Email field, which receives focus. Messages map safe error codes
  (invalid credentials, duplicate registration, unknown reset address,
  temporary/unexpected failure with its request reference) and controls remain
  usable for retry.
- Mock-mode guidance (fixed demo password and synthetic accounts) is supplied by
  the composition root through an optional `demo` runtime field, so UI code
  never imports mock modules. Injected/non-mock runtimes show no credentials.

## Reproduce

```sh
COMPOSE_PROJECT_NAME=lca-diff-f2-forms FRONTEND_PORT=5177 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f2-forms FRONTEND_PORT=5177 ./dev check
docker compose -p lca-diff-f2-forms exec -T workspace bash -lc 'npm --prefix apps/frontend ci --no-audit --no-fund'
docker compose -p lca-diff-f2-forms exec -T workspace bash -lc 'cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:e2e'
```

## Engineering evidence

- Environment check: PASS (rootless identity, restricted capabilities, eight
  preflight regressions, frozen uv lock). Frozen npm install: 230 packages;
  manifests and lockfile unchanged.
- Format, lint, typecheck and build: PASS. Unit: 153 tests in eight files,
  including 13 `AuthDialog` cases using the composed mock adapter for journeys
  and injected deferred auth for pending, duplicate, abort, thrown-failure and
  account-change cases. All data-service methods are spies and remain uncalled
  before observed verification.
- Playwright: 12 cases PASS across Chromium and Firefox — the existing
  foundation smoke plus keyboard sign-in with validation/invalid-credential
  recovery and repeated Escape (`@smoke`), registration duplicate/verification
  pending/resend/refresh, unverified lock and account switch, and reset
  unknown/known/return to sign-in. Every case asserts no fetch/XHR/API/external
  requests and no console/runtime errors.

## Limitations

The mock adapter resolves with zero latency in the browser, so pending states
are verified with injected deferred services in component tests rather than in
Playwright. Safari was not available. No live Firebase, email delivery, token
lifecycle, backend authorization or data security is validated by this local
simulation; real adapter evidence remains Phase 2 (B2/I1).
