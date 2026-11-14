# F2 gate verification — simulated authentication and accessible shell (#15)

Status: engineering evidence prepared on branch `test/f2-gate-evidence`, based on
merged `main` at `93872b3` (#11–#14 merged after independent QA and hosted CI).
The delivered SHA, independent QA verdict and hosted CI runs are recorded in the
#15 issue handoff and QA comment. **The F2 milestone is not complete** until #15
passes QA, hosted CI and maintainer merge. This is mock evidence only: it does
not prove real identity, token lifecycle, backend authorization or data
security. No product/specification deviation or ADR is introduced.

Per-issue records (unchanged): [shell #11](f2-shell-verification.md),
[mock auth #12](f2-auth-verification.md),
[account forms #13](f2-auth-forms-verification.md),
[session lifecycle #14](f2-session-verification.md).

## Environment and versions

Rootless workspace, Compose project `lca-diff-f2-gate`. Node `v24.22.3`, npm
`11.19.1`, Vitest `5.1.0`, Playwright `1.65.1`, Chromium `159.0.8154.6`,
Firefox `159.0`. Safari/WebKit: **UNAVAILABLE** — not installed in the pinned
image nor configured in `playwright.config.ts`. The specification requires
Safari only "as practicable"; this is recorded for the Phase 1/R2 browser
recheck and is neither PASS nor an F2 blocker.

## Commands

Host lifecycle:

```sh
COMPOSE_PROJECT_NAME=lca-diff-f2-gate FRONTEND_PORT=5184 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f2-gate FRONTEND_PORT=5184 ./dev check
```

Inside the container (`./dev shell` or
`docker compose -p lca-diff-f2-gate exec -T workspace bash -lc '<command>'`):

```sh
npm --prefix apps/frontend ci --no-audit --no-fund
cd apps/frontend
npm run format:check && npm run lint && npm run typecheck
npm run test:unit
npm run build
npm run test:e2e -- --grep @smoke   # PR smoke subset (CI on every PR)
npm run test:e2e                    # complete available browser suite
# Browser versions:
npx playwright --version
node -e "const pw=require('@playwright/test');(async()=>{for(const t of [pw.chromium,pw.firefox]){const b=await t.launch();console.log(t.name(),b.version());await b.close();}})()"
```

Hosted complete suite on request: `gh workflow run frontend.yml --ref <branch>`
(its `workflow_dispatch` job runs the full `test:e2e` instead of the smoke).

## Results

| Check | Result |
| --- | --- |
| `./dev check` (rootless identity, capabilities, 8 preflight regressions, frozen uv lock) | PASS |
| Frozen `npm ci` | PASS, 230 packages, lockfile unchanged |
| format:check, lint, typecheck, build | PASS |
| test:unit | PASS, 168 tests in 9 files |
| test:e2e `@smoke` | PASS, 10 cases (5 × Chromium/Firefox) |
| test:e2e full | PASS, 26 cases (13 × Chromium/Firefox) |
| Safari/WebKit | UNAVAILABLE |
| Hosted PR `quality` / full dispatch run | Recorded in the #15 handoff (NOT RUN until then) |

Every browser case asserts no fetch/XHR, `/api/` or external requests and no
console/runtime errors. All browser journeys use the composed mock adapter
(`VITE_SERVICE_MODE=mock`); component cases use test-only injected composition.
No auth bypass, scenario hook or window global ships in the product bundle.

## Acceptance criteria evidence

Browser: Chromium and Firefox unless stated. `[smoke]` marks PR smoke cases.

### AC1 — zero-data shell, named focus-trapped dialog, keyboard forms, verified access, no modal flash — PASS

| Evidence | Layer |
| --- | --- |
| `foundation.spec.ts` › required-login shell stays locked without protected data [smoke]: named `aria-modal` dialog, inert shell, Tab/Shift+Tab containment, Escape/backdrop refusal, demo marker, no protected text/requests, reload | Browser |
| `auth.spec.ts` › keyboard sign-in recovers from invalid credentials and resists dismissal [smoke] | Browser |
| `auth.spec.ts` › registration rejects duplicates and unlocks only after simulated verification; password reset reports unknown accounts and returns to sign-in | Browser |
| `session.spec.ts` › a returning verified session restores without a login-modal flash [smoke] (init-script observer, two reloads) | Browser |
| `App.test.tsx` › opens the named required-login dialog only after anonymous auth resolves; keeps the resolving shell free of a login flash and protected data | Component |
| `session.test.tsx` › shows only the loading shell while a valid session restores…; makes zero protected requests while resolving, anonymous or unverified | Component |
| `AuthDialog.test.tsx` (13 cases): validation, pending/duplicate prevention, abort on flow/account change, observed-state-only unlock | Component |

### AC2 — logout, refresh failure/revocation, unverified denial, delayed/account-switch isolation — PASS (mixed layers)

| Evidence | Layer |
| --- | --- |
| `auth.spec.ts` › unverified accounts stay locked and can switch to another account [smoke] | Browser |
| `session.spec.ts` › unverified sessions restore locked and anonymous reloads open the modal; signout and account switching keep the account-scoped workspace key | Browser |
| `f2-gate.spec.ts` › a session invalidated before reload returns to the locked modal › removed / malformed / non-synthetic marker (workspace key preserved, marker cleared) | Browser |
| `f2-gate.spec.ts` › verified shell … signout (shell locked, account email gone) | Browser |
| `session.test.tsx` › logout / expiry / revocation / failed refresh / verification loss clears rendered data, aborts pending reads and empties the cache | Component |
| `session.test.tsx` › a protected AUTH_REQUIRED / EMAIL_NOT_VERIFIED response locks the session…; locks before a slow signout answers and keeps a failed signout locked | Component |
| `session.test.tsx` › never shows A's cached or pending content after switching to B; rejects A's pending response after logout and relogin as the same UID; ignores late failures from A so they cannot expire account B | Component |

**Accepted component-only evidence:** live expiry, revocation, failed refresh,
protected 401/403 locking and delayed-response account switching are triggered
only by mock scenario drivers or deferred reads, which deliberately exist only
inside services/tests. Exposing them to the browser would ship an auth bypass,
so these are proven against a visible protected sentinel in component tests.
The product also has no protected data UI until F3–F5. **Browser-level
evidence for these transitions is deferred to I1** (Firebase Auth Emulator),
not marked PASS here.

### AC3 — desktop shell controls and narrow view — PASS (Safari UNAVAILABLE)

| Evidence | Layer |
| --- | --- |
| `f2-gate.spec.ts` › verified shell tabs, sidebars, settings and signout work from the keyboard: Flows default, Arrow/Home/End tab roving with `aria-selected`/`tabindex`, Scores-only indicator sidebar, collapse/expand `aria-expanded` with Enter/Space, Settings region, keyboard signout; visible 3px focus ring on each control | Browser |
| `foundation.spec.ts` › narrow viewport explains the desktop requirement and recovers on resize [smoke] | Browser |
| `App.test.tsx` › renders verified account controls, keyboard tabs, collapsible sidebars and signout; uses a meaningful narrow-screen message… | Component |

### AC4 — PR smoke and manual full suite — PASS

PR CI (`.github/workflows/frontend.yml`) runs `test:e2e -- --grep @smoke` in both
browser projects: locked shell, narrow viewport, keyboard login, restore without
modal flash and unverified-denial auth guard. The full suite runs locally with
`npm run test:e2e` and on request with `gh workflow run frontend.yml --ref <branch>`.

### AC5 — recorded evidence — PASS for this record

This document records environment, versions, commands, case results and
unavailable/deferred items. Reviewed SHA and hosted run URLs are in the issue.

## Remaining real-auth checks (B2/I1)

- Firebase email/password registration, verification links, reset delivery,
  token refresh/expiry/revocation and Admin SDK `email_verified` enforcement
  against the Auth Emulator; browser-level expiry/revocation/401/403 journeys.
- Map real 401/403 responses to `AUTH_REQUIRED`/`EMAIL_NOT_VERIFIED`.
- Follow-ups from #13/#14 QA: (a) reconcile the reset unknown-account error with
  Firebase email-enumeration protection; (b) define signout-failure UX for
  unverified sessions when the adapter emits no new state; (c) avoid lock/unlock
  cycling when a real adapter re-emits the same verified state against a
  persistent server 401/403.
- Safari practicability recheck at R2.
