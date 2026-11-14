# F2 shell verification — issue #11

Status: engineering implementation prepared on `feat/f2-locked-shell`, based on
merged PR #44 (`9612943`). Independent QA, hosted CI and maintainer review/merge
remain required; no F2 milestone PASS is claimed here.

## Delivered behavior

The app opens directly at `/`. Initial auth resolution shows a non-sensitive
loading shell without a login flash. Anonymous, unverified and failed auth states
show a named native modal over an explicitly inert, dimmed shell. The browser's
modal top layer contains focus and blocks background interaction. Escape and
backdrop interaction cannot dismiss required login. Verified auth exposes header,
account/logout/settings controls, keyboard Flows/Scores tabs and collapsible
process/indicator frames. Flows is the default; indicators appear with Scores.
Observed verification focuses the comparison workspace. A viewport below 960 CSS
pixels shows a larger-screen-required explanation; resizing restores the shell.
The breakpoint is an implementation choice, not a browser/device entitlement.

This shell makes no protected data calls, including in its verified framing.
The login dialog explains that account actions are unavailable in this preview.
#12 provides deterministic mock authentication, #13 connects working account
forms, #14 completes session/cache lifecycle handling and #15 consolidates F2
browser journeys. Discovery/grid/indicator contents belong to F3–F5.

## Reproducible commands and results

Host orchestration from the isolated worktree `/tmp/lca-diff-f2-shell`:

```sh
COMPOSE_PROJECT_NAME=lca-diff-f2-shell FRONTEND_PORT=5175 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f2-shell FRONTEND_PORT=5175 ./dev check
```

Rootless daemon/UID mapping, dropped capabilities, no-new-privileges, frozen uv
lock and all eight preflight regressions passed. Node `24.22.3`, npm `11.19.1`,
Vitest `5.1.0`, Playwright `1.65.1`; browser pins remain unchanged from F1.

Run each command below inside that container, using `./dev shell` or
`docker compose -p lca-diff-f2-shell exec -T workspace bash -lc '<command>'`:

```sh
npm --prefix apps/frontend ci
npm --prefix apps/frontend run format:check
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run typecheck
npm --prefix apps/frontend run test:unit
npm --prefix apps/frontend run build
npm --prefix apps/frontend run test:e2e
```

Frozen install, format, lint, typecheck and build passed. Unit tests passed:
110 tests in six files. Seven shell component cases cover anonymous/resolving,
unverified/error, observed verified auth/focus restoration, verified account and
tab/sidebar interactions, signout, narrow viewport and the explicit demo marker.
All data-service methods are spies and remain uncalled in each injected shell
state. Existing composition boundary/cache tests continue passing. jsdom supplies
only a minimal dialog-method shim; it does not establish browser focus containment.

Chromium and Firefox each passed two browser scenarios (four total). They exercise
load/reload, named modal, native initial/Tab/Shift+Tab focus, Escape refusal,
backdrop refusal, inert shell, demo marker, absent protected content and no
fetch/XHR/API/external requests or console/runtime errors. Narrow viewport and
resize recovery are verified in both browsers. These checks run in required
`@smoke` CI as well as the full available suite.

## Practical review and limitations

Open `/` at desktop size: focus starts on “About this demo”; keyboard navigation
and Escape keep required login in place. At 390×844, only the desktop requirement
and demo marker appear; expand to desktop width to see the modal again.
Verified framing is exercised with injected typed services in component tests;
production browser account transitions await #12/#13/#15. No test-only login
bypass or global auth override is exposed in the product bundle. Safari was not
available in this environment. No live Firebase, API, mail, data security or
backend authorization is validated by this local simulation.

The issue/PR handoff identifies the delivered SHA, hosted checks and independent
QA verdict. Leave #11 open until those gates and maintainer merge are complete.
