# F1 verification and handoff

Status: 14 November 2026. Issues #5–#9 are merged. This
[#10](https://github.com/DavidVFitzGerald/LCA-diff/issues/10) change supplies the
browser/CI gate; F1 completion requires independent QA, actual hosted CI and
approved merge. The final branch/SHA, QA verdict and hosted run URL belong in its delivery
handoff; local checks are not evidence of a hosted run or merge.

## Reproducible tooling

- Node `24.22.3`, npm `11.19.1`, React `19.3.1`, TypeScript `6.0.3`, Vite `8.3.8`.
- TanStack Query `5.107.1`, Vitest `5.1.0`, Playwright `1.65.1` (exact npm pins).
- Chromium and Chromium Headless Shell `159.0.8154.6`, Playwright revision `1255`.
- Firefox `159.0`, Playwright revision `1572`; FFmpeg revision `1013`.
- Node/uv base image digests remain pinned in `.devcontainer/Dockerfile`;
  browser OS packages use Debian Bookworm snapshot `20261112T000000Z`.

The development image copies only the frontend manifests plus the browser install
script into its build context, performs a frozen `npm ci`, and uses that locked
Playwright CLI to install matching browser revisions and OS dependencies. Browser
binaries remain at `/ms-playwright` inside the image. CI uses the same installer,
snapshot and npm lock in the existing digest-pinned Node container. No host npm,
browser or OS package installation is required. Rebuild after changing the lock.

## Exact local commands

On the Docker host, the supported wrapper verifies the daemon is rootless:

```sh
./dev build
./dev up
./dev check
./dev shell
```

Inside that container:

```sh
npm --prefix apps/frontend ci
npm --prefix apps/frontend run format:check
npm --prefix apps/frontend run lint
npm --prefix apps/frontend run typecheck
npm --prefix apps/frontend run test:unit
npm --prefix apps/frontend run build
npm --prefix apps/frontend run test:e2e -- --project=chromium
npm --prefix apps/frontend run test:e2e -- --project=firefox
```

`npm --prefix apps/frontend run test:e2e` runs both named projects. `make test-e2e`
provides the same guarded container command. The Playwright web server builds an
explicit mock bundle and serves it temporarily at container-local port 4173;
`reuseExistingServer: false` avoids accidentally testing another process. Headless
tests are noninteractive and fail on focused tests. Failure screenshots/traces are
ignored locally and retained by the pinned CI artifact action for seven days.

For this isolated task worktree, equivalent host orchestration uses
`COMPOSE_PROJECT_NAME=lca-f1-playwright FRONTEND_PORT=5174 ./dev <command>` and
`docker compose -p lca-f1-playwright exec -T workspace <container command>`.

Local engineering results on the isolated rootless workspace:

| Check | Result |
| --- | --- |
| Image build / rootless runtime check | PASS; matching browser installation succeeded; UID mapping, capabilities/no-new-privileges and eight preflight regressions passed |
| Frozen `npm ci` | PASS; 230 packages installed |
| Format, lint, typecheck and build | PASS |
| Vitest | PASS; 104 tests across six files |
| Chromium smoke | PASS; one test, 5.0 seconds |
| Firefox smoke | PASS; one test, 7.2 seconds |
| Default project discovery | Two tests listed, one in each named project |
| Broken marker negative probe | Expected nonzero exit 1; browser assertion reported actual demo marker versus intentionally broken expected text; source restored and both browser projects passed again |
| Installer shell syntax / Git whitespace | PASS |

The failed-probe diagnostics also exercised artifact handling: generated
`test-results/` and `playwright-report/` are excluded from both ESLint and
Prettier. Hosted PR/dispatch execution and independent QA are pending at this
engineering handoff and must identify the delivered SHA in #10; no hosted run is
claimed by these local results.

## Coverage delivered in F1

| Layer | Verified behavior / ownership |
| --- | --- |
| Contracts/fixtures (#6) | Decimal-string round trips, zero/absence/N/A distinctions, stable flow IDs across revisions, revision-bound processes, distinct compartments, nested paths, indicator defaults/source order and immutable synthetic fixtures |
| Discovery (#7) | AND-tokenized fields, paged ancestry/full matching counts, all-match selection beyond transport pages, exact branch scope, deterministic cursors/errors/latency/cancellation and snapshot-safe headers |
| Comparison (#8) | Presence-only ordered row unions, source-ordered indicators, exact cells/warnings, bounded Cartesian windows, revision/token consistency and sparse 320-process/1,324-row synthetic workload |
| Composition (#9) | Explicit validated mock mode, typed injection/query integration, abort forwarding, UID/revision/request cache keys, protected data guards and account-transition cleanup; negative UI import/transport lint checks |
| Browser foundation (#10) | Both Chromium/Firefox load and reload the built technical target, observe the mounted service/auth status, see local demo mode and no protected process/score content, and make no API/fetch/XHR/external requests; runtime/console errors fail the test |

The browser network assertion complements in-memory service spies in unit tests;
network silence alone cannot prove a mock adapter was never invoked. The default
auth placeholder resolves to unauthenticated, so this browser slice deliberately
does not log in or render synthetic comparison data.

## CI and remaining gates

Every PR, main push and manual `workflow_dispatch` runs the Frontend `quality`
job: frozen install, format, lint, type, unit, build, matching container browser
installation and Playwright in both projects. PR/main runs select `@smoke`;
manual dispatch runs all available browser tests. Failed commands fail that job;
no backend/integration placeholder checks
are represented as passing. The manual full frontend suite currently equals the
available foundation smoke plus unit/contract tests. Future suites extend this
path rather than implying absent journeys have already passed.

The first hosted run at `78645cf`
([43590019891](https://github.com/DavidVFitzGerald/LCA-diff/actions/runs/43590019891))
passed Chromium but failed Firefox startup: GitHub injected `/github/home`, owned
by UID 1001, while the pinned job container runs as UID 0. Both browser steps now
set `HOME=/root`, the container user's owned system home. This configures Firefox's
normal home checks without changing ownership, capabilities or sandbox settings.
The corrected SHA requires fresh hosted PR/dispatch evidence in the #10 handoff;
the failed earlier run is not a passing browser result.

F2 owns product shell/login and simulated account lifecycle; #15 adds product auth
browser smoke. F3–F5 add selector/grid/score journeys and full mock acceptance;
#29/#30 implement exact on-demand differences and canonical difference caching.
`differences_only: true` remains explicitly unsupported until that work. I1 owns
real auth/HTTP adapters, generated OpenAPI DTOs, parity and real integration.
Backend/ETL, proprietary full-data validation, publication/deployment, licensing
and branch-protection enforcement retain their separate gates. No real security,
ingestion, production or full MVP completion claim follows from F1 mock tests.

Implementation follows Playwright's official
[Docker installation](https://playwright.dev/docs/docker),
[browser projects](https://playwright.dev/docs/test-projects) and
[web server](https://playwright.dev/docs/test-webserver) guidance.
