# Local MVP verification (L3 #30)

Engineering branch: `feat/l3-differences`, based on `main` at `baff738`.
The final reviewed SHA and the independent QA verdict are recorded on
[#30](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/issues/30) and its PR.
No PRD/spec deviation or ADR: the toggles implement specification §6.7 as
revised by ADR 0006 (in memory, not persisted).

## Implemented behavior

- `app/differences.ts` holds one in-memory switch per tab above both tab
  panels. Each switch starts off and survives tab switches. With fewer than two
  selected processes both are disabled and reset to off, during render, so no
  commit shows a stale on state. An account change remounts the workspace and
  starts them off again. Persistence remains post-MVP (#31).
- Each tab's header shows a labelled "Show differences only" checkbox with a
  description of the exact rule. It stays enabled through loading and errors.
- `useFlowGrid`/`useScoreGrid` add `differences_only: true` to the row-page
  request only when the switch is on with two or more processes. Off omits the
  flag, so its query key and comparison token are exactly the pre-L3 full
  session. Keys keep the canonical sorted process set, revision snapshot,
  sorted indicators (Scores), tab and flag. Reordering reuses both sessions.
  Membership, indicator and revision changes produce new keys.
- Cell reads use the token of the shown session. The API rejects cells of rows
  outside a difference session (`INVALID_FILTER`), so rows and cells cannot mix
  across sessions or snapshots. The existing snapshot/token mismatch guards
  (#20, #64) apply unchanged.
- A failed difference page shows the existing "could not be loaded" alert with
  Retry and no rows from that session. Turning the switch off cancels an
  in-flight difference read (TanStack abort) and restores the cached full rows
  without a new request. An empty difference set says so explicitly.
- The mock implements only the minimal exact predicates, matching
  `apps/api/src/lca_api/queries.py`: exact decimal comparison (`-0` equals `0`),
  absent differs from any present amount, valid differs from N/A, different
  N/A states differ, and uniform N/A of one state is equal. Exhaustive mock
  instrumentation stays post-MVP (#29).

## Seed coverage note (AC3)

The committed synthetic seed has no flow row with equal present amounts in two
processes, and its loader refuses to add or replace revisions (`check_state`),
so extending it would force `./dev app-reset --yes` on existing volumes. On the
seed, Flows therefore hides nothing. The real-stack test checks that, plus
absent vs present zero, uniform missing GWP 100 hidden in Scores and valid vs
N/A kept. The Flows hide case is covered by the B2 PostgreSQL API test
(`apps/api/tests/test_api.py`) and the mock predicate and UI tests. The
representative BAFU processes compared below had no equal flow rows either.

## Engineering checks

All tools ran inside the guarded rootless workspace
(`docker exec -w /workspaces/LCA-diff-AI-dev-project/apps/frontend lca-diff-dev-workspace-1 bash -lc '<command>'`)
or through `./dev`. Host commands only orchestrated Docker, Git and GitHub.

| Command | Observed result |
| --- | --- |
| `./dev check` (host) | Rootless identity, frozen tooling and preflight pass |
| `npm run format:check && npm run lint && npm run typecheck && npm run contracts:check && npm run build` | Pass |
| `npm run test:unit` | 472 tests / 37 files pass |
| `npm run test:e2e` (mock, Chromium + Firefox) | 72/72 pass at the toggle commit and again at the #107 fix commit (3.6 min) |

New unit coverage: exact mock predicates for flows and scores
(`services/mock/comparison.test.ts`), the composed App toggle journeys for
AC1/AC2/AC4 and the empty difference set (`flows-composition.test.tsx`), and
#107 regressions (`scores-grid.test.tsx`, `flows-composition.test.tsx`). The
#107 grid regression fails without the fix.

### Real stack

Isolated projects, so that no existing stack or volume was touched:

```sh
export LCA_APP_PROJECT=lca-diff-l3-app LCA_APP_FRONTEND_PORT=5280 LCA_APP_API_PORT=8280 LCA_APP_AUTH_PORT=9280
./dev app-up            # healthy in ~31 s, all one-shot tasks exit 0
./dev app-smoke         # 9/9 checks pass
./dev app-e2e           # Chromium
./dev app-e2e node_modules/.bin/playwright test --config playwright.real.config.ts --browser firefox
```

The real suite now has seven journeys, including two new L3 ones. The first is
the differences toggles per tab. The second is a §9.3 UAT journey: name +
geography search, filtered-category bulk selection, the reference-unit warning,
indicator workbook order and header × removal. Results on a seed-only stack:
7/7 Chromium and 7/7 Firefox, both at the toggle commit (`lca-diff-l3-app`) and
at the #107 fix commit (fresh `lca-diff-l3s-app`, ports 5281/8281/9281).

**Persistence:** `./dev app-down` then `./dev app-up` left the publication
pointer (release, active revision and activation timestamp) byte-identical,
compared with `psql` before and after. Smoke and the real suite passed again
afterwards.

The real suite assumes the seed-only stack that `app-up` and CI provide. After
the opt-in import, two releases are listed. Three journeys then fail on
environment assumptions only: a duplicate "IPCC 2021" method locator, and
doubled search-request counts in the 401/403 lock checks. Run the suite against
a seed-only project.

## Opt-in representative BAFU import (AC6)

Run once, as documented in the README, with the private inputs at their
default ignored path. Identifiers, hashes, counts and provider content stay in
the ignored `private/` directory.

```sh
export COMPOSE_PROJECT_NAME=lca-diff-l3-bafu FRONTEND_PORT=5296 AIRFLOW_PORT=8096
export LCA_PRIVATE_INPUT_DIR=$PWD/data/private/bafu-2026-v1/incoming
./dev etl-up
./dev etl-run uv sync --frozen --all-packages
./dev etl-run env LCA_DATABASE_URL=postgresql+psycopg://lca_migrator:local-migration-only@postgres/lca uv run --frozen alembic upgrade head
./dev etl-run uv run --frozen --package lca-etl lca-import run-local --manifest data_pipeline/examples/bafu-private-representative.json
# -> exit 0, candidate_status "ready", representative true
export LCA_APP_PROJECT=lca-diff-l3-app LCA_APP_FRONTEND_PORT=5280 LCA_APP_API_PORT=8280 LCA_APP_AUTH_PORT=9280
./dev app-import promote --target /app/ops/target.json --artifact /private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid> --dry-run
./dev app-import promote --target /app/ops/target.json --artifact /private/imports/<frozen-hash>/artifact/manifest.json --operation-id <promotion-uuid>
./dev app-import publish --target /app/ops/target.json --release <release-uuid> --revision <revision-uuid> --expected-active none --operation-id <publication-uuid>
```

Promotion verified, then publication activated the representative revision,
with no previous active revision. A directed Chromium check (an uncommitted
script run through `./dev app-e2e node -e ...`, printing only booleans) found:

- `BAFU:2026 v1 2026 v1` is listed next to the synthetic release;
- representative processes can be selected and compared in Flows;
- the Flows switch reads differences and off restores the full rows;
- Scores shows the GWP 100 row, after the #107 fix.

The selected representative processes came from different categories and had
no equal flow rows, so nothing was hidden there either. This is a
representative artifact (`sample_process_limit`), not a full release.

**Defect found and fixed: [#107](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/issues/107).**
With two published releases, the default indicator selection held both
releases' GWP 100. Every Scores read then failed with `422 INVALID_FILTER`,
because the API correctly scopes indicators to the revision snapshot. Scores
now requests only indicators of the selected processes' releases, and explains
when none applies. No API or contract change.

## §9.3 UAT journeys (except restoration)

Executed as directed browser automation on the real local stack, not as human
interactive testing.

| Journey | Evidence |
| --- | --- |
| New verified user; Swiss electricity by name + geography; filtered category selects only matching descendants | Real: registration/verification journey; UAT journey (3 CH electricity processes; open-ground DE excluded) |
| Shared/unique flows; positive, negative, zero, absent; toggle differences; reorder | Real: seed journey (precision, zero, absence, keyboard reorder) and differences journey |
| Different reference units warn; numbers unchanged | Real: UAT journey (packed cement 25 kg vs 1 kWh) |
| More LCIA indicators in workbook order; toggle score differences | Real: UAT journey (GWP 100 then GWP 20) and differences journey (uniform missing hidden, N/A kept) |
| 100+ processes: scroll, sticky identity, tab switch, removal | Mock e2e 220 × 2,000+ (`flows-grid`, `scores-grid`, `column-operations`); the seed has fewer than 100 processes; laptop benchmarks are post-MVP (PM2) |
| `./dev app-up`; demo and newly registered login; restart persists data | Above; QA repeats from a clean clone |
| Test import with duplicates, missing references, multi-output, missing LCIA rows, unit mismatch; reports, gating, atomic publish | B3/B4 automated suites in hosted CI (unchanged by L3) and the representative import above |

## Remaining gaps (post-MVP or follow-up)

- Two published releases show each method twice in the indicator tree without a
  release label (seen after the opt-in import):
  [#108](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/issues/108). Cross-release
  mapping is §10.3.
- Browser workspace persistence (#31), stale-ID reconciliation (#32), the
  state/accessibility audit (#33), the mock acceptance gate (#34) and
  exhaustive mock predicates (#29).
- Hosted deployment (PM1), full-corpus validation, LCIA audit sign-off,
  licensing confirmation and laptop/Cloud SQL benchmarks (PM2).
