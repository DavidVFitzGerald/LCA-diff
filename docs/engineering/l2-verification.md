# L2 real adapters and local integration (#97)

Engineering branch: `feat/l2-real-adapter`, based on `0fe3ff3`; core increment
`fec23ae`. Final tested application source is `b27cc2b`; subsequent changes
record documentation evidence only. The final reviewed SHA and independent QA
verdict are recorded on #97 and PR #105.
The PR remains open for maintainer review/merge. No PRD/spec semantic change or
ADR is needed: row-page summaries implement the issue's decided derivation.

## Implemented behavior

The app stack builds real mode, with generated OpenAPI types, strict response
shape/error validation, decimal/missingness invariants and Firebase SDK auth.
Browser requests stay on the frontend origin through runtime proxy targets.
Protected 401/403 errors latch the shell locked for the rejected UID; a failed
forced token refresh maps to authentication loss. Verification reload and token
refresh complete together before publishing a verified state to the UI.
Unverified signout failure retains the verification panel and its error message.

The API image and scientific/data/publication implementation are unchanged.
The frontend remains unprivileged; all stack services drop capabilities and
enable no-new-privileges. Browser tests print no tokens and omit network traces.

## Pins and reproducibility

- Firebase `13.1.0`, published 2026-10-21, selected from npm registry release
  timestamps inside the container. The next stable `13.2.0`, published
  2026-11-02 at 18:16 UTC, was less than 14 days old at implementation time
  (2026-11-16 at 12:33 UTC). Node 24 and the pinned emulator are exercised by the
  real browser suite.
- `openapi-typescript` `7.13.0`, exact pin. Its peer metadata advertises TS5;
  the npm override uses the repository's existing exact TypeScript `6.0.3`.
  Generation, byte-identical repeated output, deliberate generated/schema drift,
  typecheck and builds passed. The types-only generator does not introduce a
  runtime API client.
- Frontend/e2e images use the existing digest-pinned Node 24 image, frozen npm
  lock and shared dated Debian/browser installer. No host runtime was installed.
- Local API rate allowance: 6,000 requests/minute, because multiple browser
  windows/grids share the proxy address. Existing window/byte budgets remain.

## Engineering checks

All development tools ran inside the guarded rootless workspace. Host commands
only orchestrated Docker/Git/GitHub. Workspace checks used
`docker compose exec -T workspace bash -lc '<command>'`.

| Command (inside workspace unless stated) | Observed result |
| --- | --- |
| `./dev check` (host) | Rootless identity, frozen tooling and preflight checks pass |
| `cd apps/frontend && npm run contracts:generate` twice; `npm run contracts:check` | Deterministic output; clean check passes; deliberate generated and OpenAPI drift rejected |
| `make backend-openapi-check` | Pass |
| `cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npm run contracts:check && npm run build && npm run test:unit` | Independent final source `b27cc2b`: all pass, 464 tests/37 files, including 48 adapter-contract cases |
| `cd apps/frontend && npm run test:e2e` | Independent final source `b27cc2b`: 72/72 Chromium and Firefox, 3.7 minutes, including all smoke cases. Two engineering runs overlapping heavy checks hit Firefox timeouts (71/72); the isolated far-cell repeat passed 3/3. No test timeout was relaxed. Mock extrema now use an exact single-pass calculation |
| `MYPYPATH=data_pipeline/src uv run --frozen mypy ops/local` | Pass, two changed ops sources |
| `uv run --frozen ruff check ops/local`; `uv run --frozen ruff format --check ops/local` | Pass |
| `uv run --frozen python ops/local/test_project_guard.py` | Pass: all app commands reject default/environment/quoted and commented dotenv collisions before Docker; environment precedence and distinct names accepted |

The workspace lacks the full Airflow toolchain, so an attempted unscoped MyPy run
reported five Airflow decorator/stub errors. No gate was weakened; the narrow ops
check passes with workspace imports, and hosted backend/ETL CI uses all packages.
One early focused Vitest command was invoked from the repository root and missed
the frontend jsdom config; the corrected frontend-directory run passed.

Isolated app commands used these environment variables consistently:

```sh
export LCA_APP_PROJECT=lca-diff-l2-app
export LCA_APP_FRONTEND_PORT=5260 LCA_APP_API_PORT=8260 LCA_APP_AUTH_PORT=9260
./dev app-up
./dev app-smoke
./dev app-e2e
```

The stack is healthy, all one-shot tasks exit zero, and API smoke passes nine
checks: health, readiness, anonymous denial, verified seed access, precision,
unverified denial, untrusted-origin denial and both allowed loopback spellings.
Both required collision invocations exit 2 without container changes.

Real-stack Chromium: 5/5 pass. Coverage: no dataset requests before verified
identity; demo login; search/bulk selection/reorder; full 34-digit flow precision,
zero/absence; GWP100 valid/missing/unresolved scores; registration/OOB verification;
session restoration without a modal flash; disabling the account clears protected
data; persistent 401 and 403 lock without cycling; browser-persistence signout
failure for an unverified real emulator user retains the F2 error UX; logout.
The browser-persistence failure is injected only by Playwright, with no product
test hook. The emulator/backend remain real.

The emulator journey exposed verification-state/token ordering; a subsequent
run verified the fix. All five hosted jobs passed at `b27cc2b`, including the
new `real-stack` job (Frontend run `43873429839`), so it stays in the per-PR tier.

## Independent clean-clone verification

QA used `/tmp/lca-l2-qa-37874df`, advanced to final source
`b27cc2babe7fe67c4622546a50fda24a66c87271`, with workspace project
`lca-diff-l2-qa` (5271) and app project `lca-diff-l2-qa-app` (5270/8270/9270).
The independent rootless environment/frozen install, generation twice and both
negative drift checks, backend OpenAPI drift, ops Ruff/MyPy and project guard
regressions pass. Final format/lint/type/contracts/build, unit 464/37, full mock
72/72 and real browser 5/5 (18.9 seconds) pass. Post-restart API smoke passes 9/9;
publication ID and activation timestamp are byte-identical across down/up.

QA-directed Chromium actions and screenshot inspection confirm both loopback
spellings, Flows precision/zero/absence, Scores valid and both N/A states, no
mock guidance, and the documented frontend-origin emulator verification link.
These visual checks ran at `37874df`; final source differs only in mock extrema
and their tests, and the real suite was rerun at `b27cc2b`. Separate stopped-API
and stopped-Auth checks show explicit unavailable errors and no mock fallback;
the services were restored and smoke passed afterward. This is directed browser
automation with visual inspection, not a claim of human interactive testing.

The final issue verdict records all AC1–AC11 evidence and the docs-only final
commit review. Hosted checks are required on the final PR head as well.

Engineering down/up preserved the publication revision AND activation timestamp
byte-for-byte, then API smoke passed again. Reset without `--yes` correctly
refused. Automatic approval review rejected the proposed destructive reset of
the engineering test volumes; they were preserved. The destructive reset branch
is unchanged from merged L1 and is verified by source comparison, without
claiming a new volume-deletion test.

L3 #30 retains differences toggles and opt-in private BAFU acceptance. Emulator
accounts are disposable and per-origin session persistence is documented. No
licensed data, deployment or post-MVP workspace persistence is introduced.
