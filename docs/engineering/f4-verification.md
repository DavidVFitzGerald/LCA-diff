# F4 verification: large Flows comparisons and the F4 gate (#26)

Status: engineering evidence on branch `feat/f4-flows-gate`.

- **Checks SHA.** Every check in the current results ran at `0265639`. That
  commit merges `main` at `cc67a45`, which includes the #75, #77 and #79
  fixes, and aligns `f4-gate.spec.ts` with #75.
- **Docs-only commit.** The commit that adds this revision of the document
  changes documentation only.
- **Earlier round.** The first round ran at `4f8e8c8`, which is based on
  `main` at `0a8bc4b`. It is kept below as history.

The #26 handoff records the delivered SHA and the independent QA verdict.

**Gate result: engineering checks pass.** At `0265639`, every check passes:

- the static checks and the build;
- three full unit runs;
- `@smoke`;
- the full suite in both projects, locally and in a hosted `workflow_dispatch`
  run.

The three blockers from the first round are resolved on `main`:

- #75: PR #84, a test workaround for a Playwright Firefox defect.
- #77: PR #83, the sidebar layout.
- #79: PR #80, bundled Inter.

Two follow-ups remain open: #76, test-budget headroom (two tests are still
above 75 % of their limit), and #85, reverting the #75 workaround. F4 is
complete only after QA passes and the coordinator merges this PR.

This is mock evidence only. It does not prove real authentication,
authorization, API performance, adapter parity or data security. The
remaining gates are B2, I1, R2 and #34. This PR changes no product code,
specification or contract, and has no ADR. It changes no dependencies and no
test limits; the merge from `main` brings in the fixes listed above.

## Environment and commands

- **Container.** Rootless workspace, Compose project `lca-diff-f4-gate`
  (`FRONTEND_PORT=5193`). Image `node:24-bookworm@sha256:9d26…7496` with the
  uv layer, Debian 12.
- **Toolchain.** Node 24.22.3, npm 11.19.1, `@playwright/test` 1.65.1,
  Chromium 159.0.8154.6 and Firefox 159.0 (the Playwright builds), Vitest 5.1.0.
  Inter is bundled since #79.
- **Host.** 8 cores and 14 GB, shared with other Compose projects. The load
  average was 1.9–4.7 during the unit runs. All timings are observations
  under this load, not thresholds.

```sh
COMPOSE_PROJECT_NAME=lca-diff-f4-gate FRONTEND_PORT=5193 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f4-gate FRONTEND_PORT=5193 ./dev check
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck && npm run build'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && for i in 1 2 3; do npx vitest run --reporter=verbose || exit 1; done'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npx vitest run --reporter=verbose src/services/mock/flows-grid-hold.test.tsx'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --grep @smoke --reporter=list'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --reporter=list'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --project=firefox e2e/column-operations.spec.ts e2e/f4-gate.spec.ts --reporter=list'
COMPOSE_PROJECT_NAME=lca-diff-f4-gate ./dev down
```

## Results (AC7), at `0265639`

| Check                                                              | Result                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./dev check`; frozen `npm ci` (236 packages, lockfile unchanged)  | PASS                                                                                                                                                              |
| format:check, lint, typecheck, build                               | PASS                                                                                                                                                              |
| Unit tests, three consecutive full runs                            | PASS, 405 tests in 32 files each time (88.5 s, 98.6 s, 98.1 s). No 1 s `waitFor` timeout and no #51 flake. Two tests are above 75 % of their limit (#76; see AC6) |
| test:e2e `@smoke`                                                  | PASS, 14 cases (7 per project), including the F4 gate                                                                                                             |
| test:e2e full                                                      | PASS, 66 of 66 (33 per project). This includes #77's sidebar and #79's font checks                                                                                |
| Firefox, column operations and F4 gate run explicitly              | PASS, 4 of 4                                                                                                                                                      |
| Hosted `quality` on PR #78 (`pull_request`: unit, build, `@smoke`) | PASS ([run 43756598407](https://github.com/DavidVFitzGerald/LCA-diff/actions/runs/43756598407)). The backend workflows on the PR also pass                        |
| Hosted full suite (`workflow_dispatch`)                            | PASS: unit 405/405 and e2e 66/66 ([run 43756599203](https://github.com/DavidVFitzGerald/LCA-diff/actions/runs/43756599203))                                       |

### Remaining shortcut (#75, #85)

Playwright 1.65.1's Firefox build (`firefox-1572`) crashes the content
process on a named role query on the Flows tabpanel. The upstream issue is
microsoft/playwright#43967. The crash is still present on the pinned
version.

- `f4-gate.spec.ts` and `column-operations.spec.ts` therefore locate the
  panel by `#panel-flows` instead of by role and name.
- Both still assert that the panel has the `tabpanel` role and the accessible
  name "Flows".
- Inside the panel, the headers are found by role: the "Process columns" list
  and the named `group`s.
- The CSS-scoped header locators from the first round are gone.
- #85 tracks reverting this once Playwright is fixed.

### History: first round at `4f8e8c8` (FAIL)

| Check                                                                                                                      | Result then                                                                                                                                                         | Resolution                  |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Local full e2e, Firefox                                                                                                    | **FAIL**, 28 of 30. `column-operations.spec.ts` (default journey) crashed with signal 11. `f2-gate.spec.ts:48` lost focus to the sidebar                            | #75: PR #84. #77: PR #83    |
| Hosted full suite ([run 43734192952](https://github.com/DavidVFitzGerald/LCA-diff/actions/runs/43734192952), at `794e48f`) | **FAIL**, 50 of 60. The failures above, plus `flows-composition.spec.ts` layout cases in both projects ("Location" label 58 px in a 50 px column with the CI fonts) | #79: PR #80 (bundled Inter) |
| Everything else                                                                                                            | PASS: static checks, three unit runs, `@smoke` 14/14, hosted `quality`                                                                                              | —                           |

The first round's measurements are superseded by the ones below, which were
re-measured with bundled Inter.

## Acceptance criteria evidence (#26)

### AC1: small-fixture journey

The default catalog has 3 processes and 8 rows, so the grid has nothing to
scroll. Scrolling and sidebar resizing are exercised in the large and
50-process scenarios, which use the same grid and services.

| Step                                              | Browser evidence                                                                                                                                                     | Chromium | Firefox |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| Selection; signed, zero, absent and warning cells | `f4-gate.spec.ts`; `flows-composition.spec.ts:119`                                                                                                                   | PASS     | PASS    |
| Vertical and horizontal scroll                    | `flows-grid.spec.ts:83` (large: `scrollLeft` 6,000, `scrollTop` 40,000); `flows-composition.spec.ts:358` (50 processes; the grid scrolls and the headers stay fixed) | PASS     | PASS    |
| Sidebar collapse and resize                       | `flows-grid.spec.ts:242` (collapse widens the grid; at 1100 px the columns keep the 120 px minimum; alignment holds); `f2-gate.spec.ts:259/270` (#77 sidebar height) | PASS     | PASS    |
| Pointer reorder                                   | `column-operations.spec.ts:134` (default scenario); `:296` (large scenario, edge auto-scroll)                                                                        | PASS     | PASS    |
| Keyboard reorder                                  | `f4-gate.spec.ts`; `column-operations.spec.ts:134`; `:337` (large scenario, off-screen end)                                                                          | PASS     | PASS    |
| Header × removal                                  | `f4-gate.spec.ts`; `column-operations.spec.ts:134`                                                                                                                   | PASS     | PASS    |
| Selected-list removal                             | `flows-composition.spec.ts:119` (N → 0, then 0 → 1); `selection.spec.ts`                                                                                             | PASS     | PASS    |

Status: PASS in both projects, locally and in the hosted full run, at
`0265639`. In the first round, Firefox failed `column-operations` (#75) and
the hosted run failed the layout cases (#79).

### AC2: the F4 `@smoke` gate

`e2e/f4-gate.spec.ts` runs in the default scenario in mock mode and covers
the following.

- Sign-in, then selection of Alpha, Gamma and Beta.
- The Flows panel, found by `#panel-flows`, has the role `tabpanel` and the
  name "Flows" (#75).
- Exact labels:
  - Signed: Alpha's recovered material shows `-80`. Its accessible name is
    `-80.000000000000000000000001, negative`, plus its aggregation warning.
  - Present zero: water shows `0`, named `0, zero`.
  - Absent: Beta's upper-atmosphere emission is blank, has no bar, and reads
    "No flow".
- Warnings: the unresolved-reference warning appears on Beta's cell only, and
  the comparability warning reads "different reference amounts and units".
- Keyboard reorder: Space, End, Space moves Alpha to last place, and focus
  stays on it. Values follow their process.
- Header ×: Gamma is removed from the headers, the Selected list and the
  tree. 6 rows remain, and none of them names Gamma.
- Order: headers (named `group`s in the "Process columns" list) match the
  Selected list after each change.
- No page errors, console errors, fetch/XHR requests, off-origin requests or
  `/api/` requests.

Result: PASS in both projects (1.5 s in Chromium, 2.3 s in Firefox). It
passes under `--grep @smoke`, in the full run, in a `--repeat-each=3` run,
and in hosted CI.

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

| Item                                 | Test and measured values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded mounted DOM                  | **Browser, 1440 × 900, both projects, identical:** at the top, 17 rows, 187 cells and 11 headers; deep (`scrollLeft` 6,000, `scrollTop` 40,000), 22 rows, 418 cells and 16 headers, against 221 columns × 2,225 rows. `flows-grid.spec.ts:83` asserts ≤ 40 rows, < 800 cells and < 30 headers. **jsdom 1400 × 600:** 18 rows, 216 cells and 12 mounted columns. `flows-grid.test.tsx` › "mounts only the viewport window…" asserts ≤ 26 rows, ≤ 442 cells and ≤ 17 columns                                                                                                                |
| Bounded window reads                 | **First mount:** row pages `[100]`, 1 summary read (100 rows × 220 processes) and 1 cell tile (50 × 20 = 1,000 cells). Asserted by "mounts only the viewport window…". **Deep jump to row 1,500 at 20 ms latency:** 16 row pages of 100, 3 summary reads and 6 cell reads after the first window; asserted as ≤ 17, ≤ 4 and ≤ 8 by "deep scrolling pages rows in bounded steps…"                                                                                                                                                                                                          |
| Cancellation                         | The same deep-jump test: 7 cell-read signals, 2 aborted (the windows left behind). It asserts that at least one is aborted. `comparison-queries.test.ts` › "aborts every batch of a cancelled cell window together"                                                                                                                                                                                                                                                                                                                                                                       |
| Offscreen-extrema geometry           | `flow-summaries.test.ts` › "summarizes every selected process, independent of the column window" (250 processes, extremes outside every column window, identical summaries). `flows-grid.test.tsx` › "sizes mixed-sign rows from summaries…" (heights from whole-row summaries; adjacent rows start exactly where the previous ends). `flows-grid.spec.ts:83`: after the deep jump, `scrollTop` and the first row index are unchanged 1 s later (no height jumps)                                                                                                                         |
| Sticky header and identity alignment | **Browser, both projects:** maximum header-to-cell x and width difference 0.00 px over 66 visible cells at the top and 54 deep. The identity column x is +0.00 px from the grid's left at both positions. Strip `scrollLeft` equals grid `scrollLeft` (6,000). The header strip's y is unchanged (250.2 px in Chromium, 250.4 px in Firefox, with bundled Inter; 251.2 and 251.3 px in the first round). The committed tolerance is ≤ 1 px (`expectAligned` in `flows-grid.spec.ts` and `column-operations.spec.ts`). jsdom: "keeps the header strip horizontally aligned with the cells" |
| No selection cap                     | Browser: "Selected processes (220)" with `aria-colcount` 221 (220 process columns plus the identity column). jsdom: `aria-colcount` = 220 + 1 after selecting all 220. `comparison-queries.test.ts` › "splits any cell window into bounded batches without capping the selection"; `comparison.test.ts` › 320 processes                                                                                                                                                                                                                                                                   |

Re-measured at `0265639` with bundled Inter, both counts and alignment are
identical to the first round, except the strip y noted above.

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

**Elapsed** is measured with `performance.now()` from the deselection until
the grid is no longer busy. It is recorded, not asserted. Figures are at
`0265639`, with the first round's in brackets.

| Run                 | Hold elapsed      | Whole test           |
| ------------------- | ----------------- | -------------------- |
| File alone          | 6.8 s (6.3–6.4 s) | 10.8 s (10.2–10.3 s) |
| Full parallel run 1 | 8.9 s (14.8 s)    | 16.2 s (16.8 s)      |
| Full parallel run 2 | 14.0 s (14.8 s)   | 21.3 s (22.4 s)      |
| Full parallel run 3 | 13.8 s (9.4 s)    | 21.2 s (23.0 s)      |

- Mock latency alone accounts for 2.3 s (23 × 100 ms). The rest is jsdom
  rendering plus mock computation for 208 processes per page.
- The page count (23) and the rows (2,225 → 2,213) are unchanged by the
  merge. jsdom has no fonts.
- This scenario differs from #69's earlier estimate of about 18 pages and
  2.5 s. Here 220 processes are selected, 12 are removed, and the new
  comparison has 2,213 rows.

Hold behaviour is unchanged. **Open follow-up:** the maintainer decides
whether to bound the hold (O11). Real-API cost belongs to I1/R2.

### AC6: budgets and headroom

The table covers the tests with a limit of 20 s or more. Where a test has no
limit of its own, the limit comes from its `describe` block. Runs are the
three full parallel runs at `0265639`; the last column gives the first
round's maximum.

| Test                                                                        | Limit | Run 1  | Run 2  | Run 3  | Max %    | First round |
| --------------------------------------------------------------------------- | ----- | ------ | ------ | ------ | -------- | ----------- |
| `selection.test.tsx` › bounds mounted list items for 300 selections         | 30 s  | 18.9 s | 23.9 s | 24.7 s | **82 %** | 89 %        |
| `flows-grid.test.tsx` › deep scrolling pages rows in bounded steps…         | 20 s  | 12.7 s | 15.0 s | 15.1 s | **76 %** | 84 %        |
| `flows-grid.test.tsx` › mounts only the viewport window…                    | 20 s  | 5.4 s  | 5.5 s  | 5.5 s  | 28 %     | 32 %        |
| `flows-grid.test.tsx` › sizes mixed-sign rows…                              | 20 s  | 5.5 s  | 6.5 s  | 7.4 s  | 37 %     | 43 %        |
| `flows-grid.test.tsx` › names rows by all seven identifying fields…         | 20 s  | 4.0 s  | 5.4 s  | 5.2 s  | 27 %     | 29 %        |
| `flows-grid.test.tsx` › keeps one tab stop…                                 | 20 s  | 2.4 s  | 3.9 s  | 3.6 s  | 20 %     | 18 %        |
| `flows-grid.test.tsx` › keeps focus on a loading cell…                      | 30 s  | 8.1 s  | 8.6 s  | 8.8 s  | 29 %     | 31 %        |
| `flows-grid.test.tsx` › D1, D2 removed or added while deep                  | 40 s  | 8.7 s  | 9.2 s  | 9.6 s  | 24 %     | 26 %        |
| `flows-grid.test.tsx` › D2, D3 adds processes above the view                | 40 s  | 7.9 s  | 9.0 s  | 8.7 s  | 23 %     | 23 %        |
| `flows-grid.test.tsx` › D3 single removal                                   | 40 s  | 10.6 s | 10.7 s | 10.9 s | 27 %     | 27 %        |
| `flows-grid.test.tsx` › D4 scroll during update                             | 40 s  | 15.6 s | 15.9 s | 15.9 s | 40 %     | 44 %        |
| `flows-grid.test.tsx` › reorders columns without re-reading rows (D1)       | 20 s  | 2.5 s  | 3.0 s  | 2.4 s  | 15 %     | 13 %        |
| `flows-grid.test.tsx` › header strip aligned                                | 20 s  | 1.6 s  | 2.5 s  | 1.6 s  | 13 %     | 9 %         |
| `flows-grid-columns.test.tsx` › reorders by keyboard and pointer…           | 20 s  | 7.2 s  | 7.7 s  | 7.7 s  | 39 %     | 43 %        |
| `flows-grid-columns.test.tsx` › moves a column to an off-screen end         | 20 s  | 4.1 s  | 4.4 s  | 4.5 s  | 23 %     | 27 %        |
| `flows-grid-columns.test.tsx` › tab stop to the next column on removal      | 40 s  | 14.1 s | 19.7 s | 20.6 s | 52 %     | 55 %        |
| `flows-grid-columns.test.tsx` › top flow kept on × while deep               | 40 s  | 11.7 s | 14.5 s | 13.7 s | 36 %     | 36 %        |
| `flows-grid-columns.test.tsx` › reads nothing while paused (O2)             | 40 s  | 11.7 s | 11.2 s | 12.0 s | 30 %     | 34 %        |
| `flows-grid-columns.test.tsx` › unfetched flows unknown (O1)                | 40 s  | 5.9 s  | 7.0 s  | 7.3 s  | 18 %     | 17 %        |
| `flows-grid-anchoring.test.tsx` › O9 focus on removal of the focused column | 40 s  | 17.5 s | 20.9 s | 21.2 s | 53 %     | 61 %        |
| `flows-grid-anchoring.test.tsx` › O8 later recorded flow                    | 40 s  | 4.0 s  | 6.4 s  | 6.6 s  | 17 %     | 19 %        |
| `flows-grid-anchoring.test.tsx` › O8 every recorded flow removed            | 40 s  | 9.8 s  | 14.1 s | 14.5 s | 36 %     | 37 %        |
| `flows-grid-anchoring.test.tsx` › #69 error during the hold, Retry          | 40 s  | 9.6 s  | 10.6 s | 10.4 s | 27 %     | 29 %        |
| `flows-grid-anchoring.test.tsx` › #69 fails again after Retry               | 40 s  | 9.4 s  | 10.5 s | 10.0 s | 26 %     | 28 %        |
| `flows-grid-anchoring.test.tsx` › #69 selection change during the error     | 40 s  | 8.5 s  | 8.4 s  | 8.9 s  | 22 %     | 23 %        |
| `flows-grid-anchoring.test.tsx` › #69 first-page error (O12)                | 40 s  | 4.9 s  | 4.9 s  | 5.1 s  | 13 %     | 12 %        |
| `flows-grid-anchoring.test.tsx` › #69 error outside a hold                  | 40 s  | 8.0 s  | 8.3 s  | 7.8 s  | 21 %     | 22 %        |
| `flows-grid-hold.test.tsx` › hold reads every row page (new)                | 40 s  | 16.2 s | 21.3 s | 21.2 s | 53 %     | 58 %        |
| `composition.test.tsx` › serves the large synthetic workload…               | 20 s  | 5.6 s  | 6.4 s  | 6.5 s  | 33 %     | 35 %        |

The large e2e tests use Playwright's 30 s default limit, except the
50-process cases, which set 60 s. Times are from the local full run at
`0265639`.

| Test                                                    | Limit | Chromium  | Firefox   |
| ------------------------------------------------------- | ----- | --------- | --------- |
| `flows-grid.spec.ts:83` 220 × 2,000+ window             | 30 s  | 12.0 s    | 17.2 s    |
| `flows-grid.spec.ts:242` sidebar collapse and resize    | 30 s  | 6.7 s     | 7.3 s     |
| `column-operations.spec.ts:296` edge auto-scroll drag   | 30 s  | 10.1 s    | 11.5 s    |
| `column-operations.spec.ts:337` off-screen keyboard end | 30 s  | 3.8 s     | 4.6 s     |
| `flows-composition.spec.ts:358` 50 processes (× 2)      | 60 s  | 7.5–7.9 s | 9.3–9.6 s |

**Above 75 %.** Two tests are still over:

- the 300-selection test, at 82 % (previously 17.6 s at #69, 21.2 s at #25,
  and 89 % in the first round);
- the deep-scroll test, at 76 %.

Both are tracked in follow-up #76, which is still open. A first-round control
run without the new hold file measured 85 % and 76 %, so the pressure exists
without #26's added workload on this shared host.

In the three runs no 1 s `waitFor` timed out and no load-induced test timed
out. No limit was raised.

### AC8: coverage and honesty

See the two coverage tables below. The first round's failures are kept as
FAIL in its history table and were not counted as passing; the open #76
headroom items are shown as such.

### AC9: handoff

- Mock mode only: no proof of real authentication, authorization, API
  performance or data security.
- Remaining gates: B2, I1, R2 and #34.
- Open follow-ups: the O11 bounding decision, #76 and #85. #75, #77 and
  #79 are resolved (PRs #84, #83, #80).
- F4 is marked complete only by the coordinator, after QA and approved
  merge.

## F4 roadmap gate coverage

| Gate item                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Golden sorting                     | `comparison.test.ts` › represented identities sorted by identifying fields; case-insensitive sort (#24). `flows-composition.test.tsx` AC2 (service order, no re-sort). `flows-composition.spec.ts:119` (Upper after lower)                                                                                                                                                                |
| Signs                              | `geometry.test.ts` (golden −80/+20 row; mixed, positive-only and negative-only rows); `SignedValueCell.test.tsx` (sign without colour). `f4-gate.spec.ts` (`-80…, negative`)                                                                                                                                                                                                              |
| Zero and absence                   | `SignedValueCell.test.tsx` (present zero and −0 as 0; absent blank); `flows-composition.test.tsx` AC4; `comparison.test.ts` (exact zero vs absence vs N/A); `f4-gate.spec.ts`                                                                                                                                                                                                             |
| Exact labels                       | `flows-composition.test.tsx` AC4 (full lexemes in the tooltip and name); `SignedValueCell.test.tsx` (adaptive labels, full tooltip); `flows-composition.spec.ts:119`; `f4-gate.spec.ts`                                                                                                                                                                                                   |
| Geometry                           | `geometry.test.ts` (H × (P + N) / M, sub-pixel bars, exact-magnitude M, labels); `flows-grid.test.tsx` (row heights from summaries, stripes); `flow-summaries.test.ts` (offscreen extrema); warning geometry identical (`flows-composition.spec.ts:119`)                                                                                                                                  |
| Warnings                           | `comparison-headers.test.tsx` (amount OR unit mismatch, values unchanged); `flows-composition.test.tsx` AC5 and AC6; `SignedValueCell.test.tsx` cell warnings; `process-headers.spec.ts`; `f4-gate.spec.ts`                                                                                                                                                                               |
| Hundreds of columns, bounded cells | AC4 (220 columns × 2,225 rows: 17–22 rows, 187–418 cells and 11–16 headers mounted); `comparison-headers.test.tsx` (300 columns windowed)                                                                                                                                                                                                                                                 |
| Windowed reads                     | AC4 (100-row pages, one 100-row summary window, ≤ 1,000-cell tiles, aborted windows left behind); `comparison-queries.test.ts` (#64 cursors, tokens, batches)                                                                                                                                                                                                                             |
| Sticky alignment                   | AC4 (0.00 px measured in both browsers; ≤ 1 px committed tolerance)                                                                                                                                                                                                                                                                                                                       |
| Responsive controls                | `flows-grid.spec.ts:242` (sidebar collapse, the 1100 px viewport at the 120 px minimum, keyboard to far cells); `flows-composition.spec.ts:336/358` (1440 × 900 and 1280 × 800, page fixed, labels fit with bundled Inter, #79); `f2-gate.spec.ts:48/259/270` (keyboard order and sidebar height, #77); `foundation.spec.ts` (narrow viewport). PASS in both projects, locally and hosted |
| Recorded environment and workload  | This document (environment, workload, observation method); no SLA                                                                                                                                                                                                                                                                                                                         |

## Issue coverage (#20–#25, #64, #69)

| Issue                                                   | Evidence                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #20 snapshot-consistent windows and whole-row summaries | `comparison.test.ts` (snapshots, tokens, bounded windows); `flow-summaries.test.ts`; `comparison-queries.test.ts`                                                                          |
| #21 shared headers and comparability                    | `comparison-headers.test.tsx` › shared process headers; `model.test.ts`; `process-headers.spec.ts`; the f4-gate comparability warning                                                      |
| #22 signed-bar geometry and tooltips                    | `geometry.test.ts`; `SignedValueCell.test.tsx`                                                                                                                                             |
| #23 virtualization and sticky alignment                 | `flows-grid.test.tsx`; `grid-model.test.ts`; `flows-grid.spec.ts`; AC4                                                                                                                     |
| #24 Flows composition, missingness and cell warnings    | `flows-composition.test.tsx`; `flows-composition.spec.ts`; f4-gate                                                                                                                         |
| #25 column drag, keyboard reorder and removal           | `comparison-headers.test.tsx` › column operations; `flows-grid-columns.test.tsx`; `column-operations.spec.ts` (PASS in both projects; panel located by ID, #75/#85); f4-gate; AC3 (#25 O3) |
| #64 row-page tokens and multi-release order             | `comparison-queries.test.ts` › rejects later pages with another token; accepts both releases in any order                                                                                  |
| #69 Retry after a row-page error during the hold        | `flows-grid-anchoring.test.tsx` › row-page errors and the hold; `flows-grid-columns.test.tsx` › header × through the error and hold path; AC5                                              |

## Known gaps and follow-ups

- Resolved first-round blockers:
  - #75: Firefox crash, fixed by a test workaround in PR #84. The cause is a
    Playwright Firefox defect (microsoft/playwright#43967), and the
    workaround is reverted with #85.
  - #77: sidebar tab stop, fixed in PR #83.
  - #79: label overflow with the CI fonts, fixed by bundling Inter in PR #80.
- #85: revert the `#panel-flows` workaround in `column-operations.spec.ts`
  and `f4-gate.spec.ts` once Playwright is fixed.
- #76: budget headroom. The 300-selection test (82 %) and the deep-scroll
  test (76 %) are still above 75 % of their limit.
- O11: the maintainer decides whether to bound the hold. O13: no change.
- #51 (the AuthDialog flake; it did not occur in these runs) and #52 (tree
  ARIA positions) remain open.
- The default catalog does not overflow the grid, so browser scrolling is
  shown on the large and 50-process catalogs.
- Remaining gates:
  - Release browser matrix, Safari and release-candidate runs: #34.
  - Real API, performance and adapter parity: I1/R2.
  - Server-side selection: B2.
