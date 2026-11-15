# F4 verification: large Flows comparisons and the F4 gate (#26)

Status: engineering evidence on branch `feat/f4-flows-gate`, based on `main`
at `0a8bc4b` (#20–#25, #64 and #69 merged). Every local check below ran at
`4f8e8c8`, the commit that adds this issue's tests. The later commits
(`794e48f` and the one that records the hosted results) change
documentation only. The hosted runs used `794e48f`, whose code is identical
to `4f8e8c8`. The #26 handoff records the delivered SHA and the independent
QA verdict.

**Gate result: not passed.** The full browser suite fails. All the failures
predate this branch, and each is filed as a Bug:

- #75: a Firefox content-process crash in the column-operations journey.
- #77: an extra Firefox sidebar tab stop breaks the F2 keyboard gate.
- #79: in hosted CI, the identity block's "Location" label overflows with
  the CI fonts, which fails four Flows layout cases in both browsers.

F4 is complete only after these are resolved, the full suite passes in both
projects locally and in hosted CI, QA passes, and the coordinator merges the
PR.

This is mock evidence only. It does not prove real authentication,
authorization, API performance, adapter parity or data security. The
remaining gates are B2, I1, R2 and #34. This PR changes no product code,
specification or contract, and has no ADR. It changes no dependencies and no
test limits.

## Environment and commands

- **Container.** Rootless workspace, Compose project `lca-diff-f4-gate`
  (`FRONTEND_PORT=5193`). Image `node:24-bookworm@sha256:9d26…7496` with the
  uv layer, Debian 12.
- **Toolchain.** Node 24.22.3, npm 11.19.1, `@playwright/test` 1.65.1,
  Chromium 159.0.8154.6 and Firefox 159.0 (the Playwright builds), Vitest 5.1.0.
- **Host.** 8 cores and 14 GB, shared with about 20 other running containers
  from other Compose projects. The load average was 4–5 during the unit runs.
  All timings are observations under this load, not thresholds.

```sh
COMPOSE_PROJECT_NAME=lca-diff-f4-gate FRONTEND_PORT=5193 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f4-gate FRONTEND_PORT=5193 ./dev check
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck && npm run build'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && for i in 1 2 3; do npx vitest run --reporter=verbose || exit 1; done'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npx vitest run --reporter=verbose src/services/mock/flows-grid-hold.test.tsx'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --grep @smoke'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --reporter=list'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --project=firefox e2e/column-operations.spec.ts e2e/f4-gate.spec.ts --reporter=list'
COMPOSE_PROJECT_NAME=lca-diff-f4-gate ./dev down
```

## Results (AC7)

| Check                                                                     | Result                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./dev check`; frozen `npm ci` (236 packages, lockfile unchanged)         | PASS                                                                                                                                                                                                                                                                                          |
| format:check, lint, typecheck, build                                      | PASS                                                                                                                                                                                                                                                                                          |
| Unit tests: three consecutive full runs (`vitest run --reporter=verbose`) | PASS, 405 tests in 32 files each time (92.6 s, 102.2 s, 103.7 s). No 1 s `waitFor` timeout. No #51 flake                                                                                                                                                                                      |
| test:e2e `@smoke`                                                         | PASS, 14 cases (7 each in Chromium and Firefox), including the new F4 gate                                                                                                                                                                                                                    |
| test:e2e full, Chromium                                                   | PASS, 30 of 30                                                                                                                                                                                                                                                                                |
| test:e2e full, Firefox                                                    | **FAIL**, 28 of 30. `column-operations.spec.ts:120` crashes the page (#75). `f2-gate.spec.ts:48` fails at `toBeFocused` on Sign out (#77). Both fail deterministically (3/3 and 5/5 repeats).                                                                                                 |
| Firefox, column operations and F4 gate run explicitly                     | **FAIL**, 3 of 4. The two large cases and `f4-gate` pass; `column-operations.spec.ts:120` crashes (#75)                                                                                                                                                                                       |
| Hosted CI `quality`, PR #78 (`pull_request`: unit, build, `@smoke`)       | PASS ([run 43734187625](https://github.com/DavidVFitzGerald/LCA-diff/actions/runs/43734187625), 3 min, at `794e48f`)                                                                                                                                                                          |
| Hosted CI full suite (`workflow_dispatch`)                                | **FAIL**, 50 of 60 ([run 43734192952](https://github.com/DavidVFitzGerald/LCA-diff/actions/runs/43734192952), at `794e48f`). Firefox: #75 and #77 as above. Both projects: `flows-composition.spec.ts:332` and `:354` at both sizes (8 cases), "Location" label 58 px in a 50 px column (#79) |

### Browser failures

- **#75, the column-operations default journey.** The Firefox content
  process exits on signal 11 (`DEBUG=pw:browser`), and Playwright reports
  `Page crashed`. Probes reproduce it with a role-locator chain evaluated
  inside the Flows tabpanel after the three-process comparison loads:
  `getByRole("tabpanel", { name: "Flows" }).getByRole("list", { name: "Process columns" }).getByRole("group").evaluateAll(…)`.
  The same reads through CSS locators do not crash. The root cause has not
  been established. It may be a defect of the patched Firefox build rather
  than of the application.
  - The new F4 gate uses CSS-scoped header locators for this reason.
  - The existing spec is unchanged, still fails, and is recorded as FAIL.
- **#77, the F2 keyboard gate.** At 1280 × 720 with an empty selection, the
  process sidebar overflows: `scrollHeight` is 635 px against
  `clientHeight` 605 px. Firefox makes the scroll container a tab stop
  between Sign out and Collapse processes.
  - The F3 record shows this spec passing in Firefox, so the regression came
    in after F3.
  - Playwright has not changed since #10.
- **#79, the Flows layout in hosted CI.** The `expectReadable` check fails on
  "Location": `scrollWidth` 58 px against `clientWidth` 50 px, in both
  browsers and at both sizes.
  - These cases pass in the local workspace container. The font stack
    (`Inter, ui-sans-serif, system-ui, sans-serif`) is not bundled, so the
    two environments resolve different fallback fonts.
  - The last hosted full-suite runs (#20's branch) predate the #24 identity
    block, so this is the first hosted full run of these cases.
  - `@smoke` does not include them.

## Acceptance criteria evidence (#26)

### AC1: small-fixture journey

The default catalog has 3 processes and 8 rows, so the grid has nothing to
scroll. Scrolling and sidebar resizing are therefore exercised in the large
and 50-process scenarios, which use the same grid and services.

| Step                                              | Browser evidence                                                                                                                                        | Chromium | Firefox                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| Selection; signed, zero, absent and warning cells | `f4-gate.spec.ts`; `flows-composition.spec.ts:119`                                                                                                      | PASS     | PASS                                           |
| Vertical and horizontal scroll                    | `flows-grid.spec.ts:83` (large: `scrollLeft` 6,000 and `scrollTop` 40,000); `flows-composition.spec.ts:354` (50 processes, grid scrolls, headers fixed) | PASS     | PASS                                           |
| Sidebar collapse and resize                       | `flows-grid.spec.ts:242` (collapse widens the grid; the 1100 px viewport keeps the 120 px minimum; alignment holds)                                     | PASS     | PASS                                           |
| Pointer reorder                                   | `column-operations.spec.ts:120` (default); `:272` (large, edge auto-scroll)                                                                             | PASS     | `:120` **FAIL** (#75); `:272` PASS             |
| Keyboard reorder                                  | `f4-gate.spec.ts`; `column-operations.spec.ts:120`; `:313` (large, off-screen end)                                                                      | PASS     | f4-gate and `:313` PASS; `:120` **FAIL** (#75) |
| Header × removal                                  | `f4-gate.spec.ts`; `column-operations.spec.ts:120`                                                                                                      | PASS     | f4-gate PASS; `:120` **FAIL** (#75)            |
| Selected-list removal                             | `flows-composition.spec.ts:119` (N → 0, then 0 → 1); `selection.spec.ts`                                                                                | PASS     | PASS                                           |

Status: in the local container, PASS in Chromium and FAIL in Firefox until
#75 is fixed, because the only default-scenario pointer-drag case crashes
there. In hosted CI, `flows-composition.spec.ts:354` (the scrolling case)
also fails in both projects (#79).

### AC2: the F4 `@smoke` gate

`e2e/f4-gate.spec.ts` runs in the default scenario in mock mode and checks
the following.

- Sign-in, then selection of Alpha, Gamma and Beta.
- Exact labels:
  - Signed: Alpha's recovered material shows `-80`, and its name is
    `-80.000000000000000000000001, negative` plus its aggregation warning.
  - Present zero: water shows `0`, named `0, zero`.
  - Absent: Beta's upper-atmosphere emission is blank, has no bar, and reads
    "No flow".
- Warnings: the unresolved-reference warning is on Beta's cell only, and the
  comparability warning reads "different reference amounts and units".
- Keyboard reorder: Space, End, Space moves Alpha last and keeps focus.
  Values follow their process.
- Header ×: Gamma is removed from the headers, the Selected list and the
  tree. 6 rows remain, and none names Gamma.
- Header order matches the Selected-list order after each change.
- No page errors, console errors, fetch/XHR, off-origin or `/api/` requests.

Result: PASS in both projects (1.4 s and 2.2 s), under `--grep @smoke` and
in the full run.

### AC3: header × drops orphaned rows

`flows-composition.test.tsx` › "drops rows whose last contributor is removed
with its header × and keeps the others' values (#26 AC3)".

- It removes Gamma with "Remove column Synthetic road service Gamma — CH".
- The suite waits for exactly 6 loaded rows and asserts the exact row list:
  Gamma's reference row and the Alpha-service input, which only Gamma
  contributed, are gone.
- Alpha's and Beta's cell labels on the 6 shared rows are unchanged.
- Columns are `[Alpha, Beta]` (`aria-colcount` 3), and the × is gone.

If orphaned rows were kept, the 6-row wait and the exact row list would fail.
Result: PASS (0.3 s).

### AC4: large-scale evidence

The workload is 220 processes × 2,225 rows (2,000 generated rows, 220
references and 5 fixture rows).

| Item                                 | Test and measured values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bounded mounted DOM                  | **Browser, 1440 × 900, both projects, identical:** at the top, 17 rows, 187 cells and 11 headers; deep (`scrollLeft` 6,000, `scrollTop` 40,000), 22 rows, 418 cells and 16 headers, against 221 columns × 2,225 rows. `flows-grid.spec.ts:83` asserts ≤ 40 rows, < 800 cells and < 30 headers. **jsdom 1400 × 600:** 18 rows, 216 cells and 12 mounted columns. `flows-grid.test.tsx` › "mounts only the viewport window…" asserts ≤ 26 rows, ≤ 442 cells and ≤ 17 columns                                                     |
| Bounded window reads                 | **First mount:** row pages `[100]`, 1 summary read (100 rows × 220 processes) and 1 cell tile (50 × 20 = 1,000 cells). Asserted by "mounts only the viewport window…". **Deep jump to row 1,500 at 20 ms latency:** 16 row pages of 100, 3 summary reads and 6 cell reads after the first window; asserted as ≤ 17, ≤ 4 and ≤ 8 by "deep scrolling pages rows in bounded steps…"                                                                                                                                               |
| Cancellation                         | The same deep-jump test: 7 cell-read signals, 2 aborted (the windows left behind). It asserts that at least one is aborted. `comparison-queries.test.ts` › "aborts every batch of a cancelled cell window together"                                                                                                                                                                                                                                                                                                            |
| Offscreen-extrema geometry           | `flow-summaries.test.ts` › "summarizes every selected process, independent of the column window" (250 processes, extremes outside every column window, identical summaries). `flows-grid.test.tsx` › "sizes mixed-sign rows from summaries…" (heights from whole-row summaries; adjacent rows start exactly where the previous ends). `flows-grid.spec.ts:83`: after the deep jump, `scrollTop` and the first row index are unchanged 1 s later (no height jumps)                                                              |
| Sticky header and identity alignment | **Browser, both projects:** maximum header-to-cell x and width difference 0.00 px over 66 visible cells at the top and 54 deep. The identity column x is +0.00 px from the grid's left at both positions. Strip `scrollLeft` equals grid `scrollLeft` (6,000). The header strip's y is unchanged (251.2 px in Chromium, 251.3 px in Firefox). The committed tolerance is ≤ 1 px (`expectAligned` in `flows-grid.spec.ts` and `column-operations.spec.ts`). jsdom: "keeps the header strip horizontally aligned with the cells" |
| No selection cap                     | Browser: "Selected processes (220)" with `aria-colcount` 221 (220 process columns plus the identity column). jsdom: `aria-colcount` = 220 + 1 after selecting all 220. `comparison-queries.test.ts` › "splits any cell window into bounded batches without capping the selection"; `comparison.test.ts` › 320 processes                                                                                                                                                                                                        |

How the values were obtained:

- **Browser counts.** An uncommitted probe in the large scenario, run twice
  in each project. It counted `[role=row]`, `[role=gridcell]` and
  `.process-header`, and compared `getBoundingClientRect()` for every fully
  visible value cell against its header, at the top and after the deep jump.
- **jsdom counts.** An uncommitted copy of the two `flows-grid.test.tsx`
  tests that logged the spied calls.

Neither probe changes a committed test or limit.

### AC5: hold measurement (O11)

`flows-grid-hold.test.tsx` uses `render(100)` (100 ms per mock read).

**Setup.**

- It selects all 220 processes and settles at row 150, deep in the
  reference rows.
- It removes the processes of all 12 flows in view. Those are reference
  flows, and the 12 anchors are among them.

**Asserted.**

- During the hold only the previous comparison is shown: the sampled
  `aria-rowcount` is `{2225}`, and the top flow is the previous anchor.
- No summary or cell read happens while busy.
- The new comparison's row pages 0–22 are read exactly once each, in order:
  **23 pages**, all successful. Since no anchor exists in the new
  comparison, **the hold reads every page** (2,213 rows / 100).
- After settling, `scrollTop` is unchanged (±1 px) and the same row index is
  at the top.

**Elapsed** (`performance.now()` from the deselection to the grid no longer
being busy; recorded, not asserted):

| Run                   | Hold elapsed | Whole test  |
| --------------------- | ------------ | ----------- |
| File alone (two runs) | 6.3–6.4 s    | 10.2–10.3 s |
| Full parallel run 1   | 14.8 s       | 16.8 s      |
| Full parallel run 2   | 14.8 s       | 22.4 s      |
| Full parallel run 3   | 9.4 s        | 23.0 s      |

- Mock latency alone accounts for 2.3 s (23 × 100 ms). The rest is jsdom
  rendering and mock computation for 208 processes per page.
- This scenario differs from #69's earlier estimate of about 18 pages and
  2.5 s: here 220 processes are selected, 12 are removed, and the new
  comparison has 2,213 rows.

Hold behaviour is unchanged. **Open follow-up:** the maintainer decides
whether to bound the hold (O11). Real-API cost belongs to I1/R2.

### AC6: budgets and headroom

These are the tests with a limit of 20 s or more. Limits without a per-test
value come from the `describe` block.

| Test                                                                        | Limit | Run 1  | Run 2  | Run 3  | Max %    |
| --------------------------------------------------------------------------- | ----- | ------ | ------ | ------ | -------- |
| `selection.test.tsx` › bounds mounted list items for 300 selections         | 30 s  | 20.9 s | 26.0 s | 26.8 s | **89 %** |
| `flows-grid.test.tsx` › deep scrolling pages rows in bounded steps…         | 20 s  | 13.4 s | 16.4 s | 16.7 s | **84 %** |
| `flows-grid.test.tsx` › mounts only the viewport window…                    | 20 s  | 5.5 s  | 5.6 s  | 6.3 s  | 32 %     |
| `flows-grid.test.tsx` › sizes mixed-sign rows…                              | 20 s  | 5.9 s  | 8.5 s  | 7.7 s  | 43 %     |
| `flows-grid.test.tsx` › names rows by all seven identifying fields…         | 20 s  | 4.2 s  | 4.9 s  | 5.8 s  | 29 %     |
| `flows-grid.test.tsx` › keeps one tab stop…                                 | 20 s  | 2.7 s  | 3.4 s  | 3.5 s  | 18 %     |
| `flows-grid.test.tsx` › keeps focus on a loading cell…                      | 30 s  | 8.9 s  | 9.2 s  | 8.7 s  | 31 %     |
| `flows-grid.test.tsx` › D1, D2 removed or added while deep                  | 40 s  | 9.4 s  | 10.1 s | 10.4 s | 26 %     |
| `flows-grid.test.tsx` › D2, D3 adds processes above the view                | 40 s  | 8.6 s  | 9.2 s  | 9.1 s  | 23 %     |
| `flows-grid.test.tsx` › D3 single removal                                   | 40 s  | 10.7 s | 10.8 s | 10.6 s | 27 %     |
| `flows-grid.test.tsx` › D4 scroll during update                             | 40 s  | 15.7 s | 16.1 s | 17.6 s | 44 %     |
| `flows-grid.test.tsx` › reorders columns without re-reading rows (D1)       | 20 s  | 2.5 s  | 2.6 s  | 2.0 s  | 13 %     |
| `flows-grid.test.tsx` › header strip aligned                                | 20 s  | 1.7 s  | 1.8 s  | 1.6 s  | 9 %      |
| `flows-grid-columns.test.tsx` › reorders by keyboard and pointer…           | 20 s  | 7.4 s  | 8.2 s  | 8.5 s  | 43 %     |
| `flows-grid-columns.test.tsx` › moves a column to an off-screen end         | 20 s  | 4.2 s  | 4.8 s  | 5.3 s  | 27 %     |
| `flows-grid-columns.test.tsx` › tab stop to the next column on removal      | 40 s  | 14.9 s | 22.0 s | 21.0 s | 55 %     |
| `flows-grid-columns.test.tsx` › top flow kept on × while deep               | 40 s  | 11.9 s | 14.4 s | 13.8 s | 36 %     |
| `flows-grid-columns.test.tsx` › reads nothing while paused (O2)             | 40 s  | 11.2 s | 13.5 s | 11.9 s | 34 %     |
| `flows-grid-columns.test.tsx` › unfetched flows unknown (O1)                | 40 s  | 6.0 s  | 6.4 s  | 6.7 s  | 17 %     |
| `flows-grid-anchoring.test.tsx` › O9 focus on removal of the focused column | 40 s  | 19.5 s | 22.3 s | 24.2 s | 61 %     |
| `flows-grid-anchoring.test.tsx` › O8 later recorded flow                    | 40 s  | 3.5 s  | 6.3 s  | 7.7 s  | 19 %     |
| `flows-grid-anchoring.test.tsx` › O8 every recorded flow removed            | 40 s  | 9.4 s  | 14.6 s | 14.0 s | 37 %     |
| `flows-grid-anchoring.test.tsx` › #69 error during the hold, Retry          | 40 s  | 10.5 s | 11.5 s | 10.2 s | 29 %     |
| `flows-grid-anchoring.test.tsx` › #69 fails again after Retry               | 40 s  | 9.6 s  | 10.8 s | 11.3 s | 28 %     |
| `flows-grid-anchoring.test.tsx` › #69 selection change during the error     | 40 s  | 7.9 s  | 8.8 s  | 9.2 s  | 23 %     |
| `flows-grid-anchoring.test.tsx` › #69 first-page error (O12)                | 40 s  | 4.3 s  | 4.6 s  | 4.6 s  | 12 %     |
| `flows-grid-anchoring.test.tsx` › #69 error outside a hold                  | 40 s  | 8.7 s  | 8.9 s  | 8.7 s  | 22 %     |
| `flows-grid-hold.test.tsx` › hold reads every row page (new)                | 40 s  | 16.8 s | 22.4 s | 23.0 s | 58 %     |
| `composition.test.tsx` › serves the large synthetic workload…               | 20 s  | 5.8 s  | 7.0 s  | 6.4 s  | 35 %     |

The large e2e tests use Playwright's 30 s default limit:

| Test                                                    | Limit | Chromium | Firefox   |
| ------------------------------------------------------- | ----- | -------- | --------- |
| `flows-grid.spec.ts:83` 220 × 2,000+ window             | 30 s  | 12.0 s   | 16.5 s    |
| `flows-grid.spec.ts:242` sidebar collapse and resize    | 30 s  | 7.3 s    | 6.8 s     |
| `column-operations.spec.ts:272` edge auto-scroll drag   | 30 s  | 10.3 s   | 12.3 s    |
| `column-operations.spec.ts:313` off-screen keyboard end | 30 s  | 3.7 s    | 4.4 s     |
| `flows-composition.spec.ts:354` 50 processes (× 2)      | 60 s  | 7.3 s    | 9.5–9.7 s |

**Above 75 %.** Two tests: the 300-selection test (89 %, previously 17.6 s
at #69 and 21.2 s at #25) and the deep-scroll test (84 %). Follow-up #76 is
linked.

A control full run without the new hold file measured 25.4 s (85 %) and
15.2 s (76 %). So the pressure exists without #26's added workload, on this
shared host.

No 1 s `waitFor` timeout occurred in the three runs. No limit was raised.

### AC8: coverage and honesty

See the two coverage tables below. The failing Firefox checks are shown as
FAIL above and are not counted as passing.

### AC9: handoff

- Mock mode only: no proof of real authentication, authorization, API
  performance or data security.
- Remaining gates: B2, I1, R2 and #34.
- Open follow-ups: the O11 bounding decision, #75, #77, #79 and #76.
- F4 is marked complete only by the coordinator, after QA and approved
  merge.

## F4 roadmap gate coverage

| Gate item                          | Evidence                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden sorting                     | `comparison.test.ts` › represented identities sorted by identifying fields; case-insensitive sort (#24). `flows-composition.test.tsx` AC2 (service order, no re-sort). `flows-composition.spec.ts:119` (Upper after lower)                                                                                       |
| Signs                              | `geometry.test.ts` (golden −80/+20 row; mixed, positive-only and negative-only rows); `SignedValueCell.test.tsx` (sign without colour). `f4-gate.spec.ts` (`-80…, negative`)                                                                                                                                     |
| Zero and absence                   | `SignedValueCell.test.tsx` (present zero and −0 as 0; absent blank); `flows-composition.test.tsx` AC4; `comparison.test.ts` (exact zero vs absence vs N/A); `f4-gate.spec.ts`                                                                                                                                    |
| Exact labels                       | `flows-composition.test.tsx` AC4 (full lexemes in the tooltip and name); `SignedValueCell.test.tsx` (adaptive labels, full tooltip); `flows-composition.spec.ts:119`; `f4-gate.spec.ts`                                                                                                                          |
| Geometry                           | `geometry.test.ts` (H × (P + N) / M, sub-pixel bars, exact-magnitude M, labels); `flows-grid.test.tsx` (row heights from summaries, stripes); `flow-summaries.test.ts` (offscreen extrema); warning geometry identical (`flows-composition.spec.ts:119`)                                                         |
| Warnings                           | `comparison-headers.test.tsx` (amount OR unit mismatch, values unchanged); `flows-composition.test.tsx` AC5 and AC6; `SignedValueCell.test.tsx` cell warnings; `process-headers.spec.ts`; `f4-gate.spec.ts`                                                                                                      |
| Hundreds of columns, bounded cells | AC4 (220 columns × 2,225 rows: 17–22 rows, 187–418 cells and 11–16 headers mounted); `comparison-headers.test.tsx` (300 columns windowed)                                                                                                                                                                        |
| Windowed reads                     | AC4 (100-row pages, one 100-row summary window, ≤ 1,000-cell tiles, aborted windows left behind); `comparison-queries.test.ts` (#64 cursors, tokens, batches)                                                                                                                                                    |
| Sticky alignment                   | AC4 (0.00 px measured in both browsers; ≤ 1 px committed tolerance)                                                                                                                                                                                                                                              |
| Responsive controls                | `flows-grid.spec.ts:242` (sidebar collapse, the 1100 px viewport at the 120 px minimum, keyboard to far cells); `flows-composition.spec.ts:332/354` (1440 × 900 and 1280 × 800, page fixed); `foundation.spec.ts` (narrow viewport). Firefox keyboard order: **FAIL** (#77). Hosted CI label fit: **FAIL** (#79) |
| Recorded environment and workload  | This document (environment, workload, observation method); no SLA                                                                                                                                                                                                                                                |

## Issue coverage (#20–#25, #64, #69)

| Issue                                                   | Evidence                                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #20 snapshot-consistent windows and whole-row summaries | `comparison.test.ts` (snapshots, tokens, bounded windows); `flow-summaries.test.ts`; `comparison-queries.test.ts`                                                                  |
| #21 shared headers and comparability                    | `comparison-headers.test.tsx` › shared process headers; `model.test.ts`; `process-headers.spec.ts`; the f4-gate comparability warning                                              |
| #22 signed-bar geometry and tooltips                    | `geometry.test.ts`; `SignedValueCell.test.tsx`                                                                                                                                     |
| #23 virtualization and sticky alignment                 | `flows-grid.test.tsx`; `grid-model.test.ts`; `flows-grid.spec.ts`; AC4                                                                                                             |
| #24 Flows composition, missingness and cell warnings    | `flows-composition.test.tsx`; `flows-composition.spec.ts`; f4-gate                                                                                                                 |
| #25 column drag, keyboard reorder and removal           | `comparison-headers.test.tsx` › column operations; `flows-grid-columns.test.tsx`; `column-operations.spec.ts` (Chromium PASS; Firefox `:120` **FAIL**, #75); f4-gate; AC3 (#25 O3) |
| #64 row-page tokens and multi-release order             | `comparison-queries.test.ts` › rejects later pages with another token; accepts both releases in any order                                                                          |
| #69 Retry after a row-page error during the hold        | `flows-grid-anchoring.test.tsx` › row-page errors and the hold; `flows-grid-columns.test.tsx` › header × through the error and hold path; AC5                                      |

## Known gaps and follow-ups

- #75: Firefox crash in `column-operations.spec.ts:120`. This blocks the
  gate.
- #77: Firefox sidebar tab stop fails `f2-gate.spec.ts:48`. This blocks the
  gate.
- #79: the identity label overflows with the hosted CI fonts and fails
  `flows-composition.spec.ts:332/354` in both browsers. This blocks the gate.
- #76: budget headroom for the 300-selection and deep-scroll tests.
- O11: the maintainer decides whether to bound the hold. O13: no change.
- #51 (AuthDialog flake; not seen in these runs) and #52 (tree ARIA
  positions) remain open.
- The default catalog does not overflow the grid, so browser scrolling is
  shown on the large and 50-process catalogs.
- Release browser matrix, Safari and release-candidate runs: #34. Real
  API, performance and adapter parity: I1/R2. Server-side selection: B2.
