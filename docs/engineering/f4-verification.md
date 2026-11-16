# F4 verification: large Flows comparisons and the F4 gate (#26)

Status: engineering evidence on branch `feat/f4-flows-gate`.

- **Checks SHA.** Every check in the current results ran at `1b4fd1b`.
  - `1b4fd1b` merges `main` at `f0e2f9c`, which adds only backend commits since
    `cc67a45`.
  - It also gives the hold test a measured hold budget, after the QA FAIL
    round.
- **Docs-only commit.** The commit that adds this revision of the document
  changes documentation only.
- **Earlier rounds.** Two earlier rounds are kept below as history:
  - the first round at `4f8e8c8`;
  - the QA FAIL round at `ba912b4`, whose checks ran at `0265639`.

The #26 handoff records the delivered SHA and the independent QA verdict.

**Gate result: engineering checks pass at `1b4fd1b`.** That covers:

- the static checks and the build;
- three consecutive full unit runs, with load recorded;
- `@smoke`;
- the full browser suite in both projects, locally and in a hosted
  `workflow_dispatch` run.

**Remaining risk (#76).** With the hold file running in parallel, the
deep-scroll test's internal 10 s `waitFor` reached **97 %** (9.7 s) in an
instrumented run. Without the hold file it reached 73–77 %. It passed in
every run at `1b4fd1b`, but QA saw it time out in 3 of 6 runs at `ba912b4`.
Its budget is not changed here. PM or the coordinator decides whether #76
must land before this gate.
Follow-up: the #76/#87 headroom work and its measurements are recorded in
[`unit-headroom-verification.md`](unit-headroom-verification.md).

The first round's blockers are resolved on `main`:

- #75: PR #84, a test workaround for a Playwright Firefox defect.
- #77: PR #83, the sidebar layout.
- #79: PR #80, bundled Inter.

These follow-ups remain open: #76 (test-budget headroom) and #85 (revert the
#75 workaround). F4 is complete only after QA passes and the coordinator
merges this PR.

This is mock evidence only. It does not prove real authentication,
authorization, API performance, adapter parity or data security. The
remaining gates are B2, I1, R2 and #34.

This PR changes no product code, specification or contract, and has no ADR.
It changes no dependencies. The only test limit it changes is the new hold
test's own internal hold budget, which was raised from 15 s to 25 s (see
AC5). The merges from `main` bring in the fixes listed above.

## Environment and commands

- **Container.** Rootless workspace, Compose project `lca-diff-f4-gate`
  (`FRONTEND_PORT=5193`). Image `node:24-bookworm@sha256:9d26…7496` with the
  uv layer, Debian 12.
- **Toolchain.** Node 24.22.3, npm 11.19.1, `@playwright/test` 1.65.1,
  Chromium 159.0.8154.6 and Firefox 159.0 (the Playwright builds), Vitest 5.1.0.
  Inter is bundled since #79.
- **Host.** 8 cores and 14 GB, shared with other Compose projects. The load
  average is recorded per run below. All timings are observations under that
  load, not thresholds.

```sh
COMPOSE_PROJECT_NAME=lca-diff-f4-gate FRONTEND_PORT=5193 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f4-gate FRONTEND_PORT=5193 ./dev check
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck && npm run build'
for i in 1 2 3; do cat /proc/loadavg; docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npx vitest run --reporter=verbose'; done
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --grep @smoke'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e'
docker compose -p lca-diff-f4-gate exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --project=firefox e2e/column-operations.spec.ts e2e/f4-gate.spec.ts'
COMPOSE_PROJECT_NAME=lca-diff-f4-gate ./dev down
```

## Results (AC7), at `1b4fd1b`

| Check                                                             | Result                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `./dev check`; frozen `npm ci` (236 packages, lockfile unchanged) | PASS                                                                                                                                                                     |
| format:check, lint, typecheck, build                              | PASS                                                                                                                                                                     |
| Unit run 1 (load at start/end 1.45/3.32)                          | PASS, 405/405 in 92.9 s; hold 9.2 s                                                                                                                                      |
| Unit run 2 (load 3.32/4.14)                                       | PASS, 405/405 in 101.4 s; hold 14.7 s                                                                                                                                    |
| Unit run 3 (load 4.14/4.70)                                       | PASS, 405/405 in 103.2 s; hold 14.4 s                                                                                                                                    |
| test:e2e `@smoke`                                                 | PASS, 14 of 14                                                                                                                                                           |
| test:e2e full                                                     | PASS, 66 of 66 (33 per project)                                                                                                                                          |
| Firefox, column operations and F4 gate run explicitly             | PASS, 4 of 4                                                                                                                                                             |
| Hosted `quality` on PR #78 (`pull_request`)                       | PASS: unit 405/405, `@smoke` 14/14 ([run 43762464690](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/actions/runs/43762464690)). The backend workflows on the PR also pass |
| Hosted full suite (`workflow_dispatch`)                           | PASS: unit 405/405 (hold 5.1 s) and e2e 66/66 ([run 43762465426](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/actions/runs/43762465426))                                 |

All three unit runs were consecutive, with no timeouts and no #51 flake.

In runs 2 and 3 the hold took 14.7 s and 14.4 s. That is 98 % and 96 % of
the old 15 s hold budget: it would have passed, but only just.

### Remaining shortcut (#75, #85)

Playwright 1.65.1's Firefox build (`firefox-1572`) crashes the content
process on a named role query on the Flows tabpanel. The upstream issue is
microsoft/playwright#43967, and the crash is still present on the pinned
version.

- `f4-gate.spec.ts` and `column-operations.spec.ts` locate the panel by
  `#panel-flows` instead of by role and name.
- Both still assert that the panel has the `tabpanel` role and the accessible
  name "Flows".
- Inside the panel, the headers are found by role: the "Process columns" list
  and the named `group`s.
- #85 tracks reverting this once Playwright is fixed.

### History: QA FAIL round at `ba912b4` (checks at `0265639`)

QA reported FAIL on AC6 and AC7 at `ba912b4`
([comment](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/issues/26#issuecomment-6901151062)).

- **The hold test.** Its internal `waitFor({ timeout: 15000 })` timed out in
  4 of 6 full unit runs. The hold took 14–15 s under parallel load.
- **The deep-scroll test.** Its internal 10 s `waitFor` timed out in 3 of 6
  runs.
- **Control runs.** Two runs that excluded the hold file passed 404/404.
- **No product defect.** All AC1–AC5 content checks, browser checks and
  hosted runs passed.
- **Engineering's own runs.** My three runs at `0265639` had passed, with a
  hold of up to 14.0 s (93 % of 15 s). The AC6 table did not list internal
  `waitFor` budgets.

**Resolution in `1b4fd1b`.** The hold budget is now 25 s, derived from
measurement (see AC5). The internal budgets are now in AC6. The deep-scroll
risk is recorded above under #76.

### History: first round at `4f8e8c8` (FAIL)

| Check                                                                                                                      | Result then                                                                                                                                                         | Resolution                  |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Local full e2e, Firefox                                                                                                    | **FAIL**, 28 of 30. `column-operations.spec.ts` (default journey) crashed with signal 11. `f2-gate.spec.ts:48` lost focus to the sidebar                            | #75: PR #84. #77: PR #83    |
| Hosted full suite ([run 43734192952](https://github.com/DavidVFitzGerald/LCA-diff-AI-dev-project/actions/runs/43734192952), at `794e48f`) | **FAIL**, 50 of 60. The failures above, plus `flows-composition.spec.ts` layout cases in both projects ("Location" label 58 px in a 50 px column with the CI fonts) | #79: PR #80 (bundled Inter) |
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

Status: PASS in both projects, locally and in the hosted full runs, at
`0265639` and `1b4fd1b`. In the first round, Firefox failed `column-operations` (#75) and
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
the grid is no longer busy. It is recorded, not asserted. The main figures
are at `1b4fd1b`. Figures in brackets are at `0265639`.

| Run                    | Load at start | Hold elapsed                                     | Whole test      |
| ---------------------- | ------------- | ------------------------------------------------ | --------------- |
| File alone (`0265639`) | —             | 6.8 s                                            | 10.8 s          |
| Full parallel run 1    | 1.45          | 9.2 s (8.9 s)                                    | 16.7 s (16.2 s) |
| Full parallel run 2    | 3.32          | 14.7 s (14.0 s)                                  | 22.3 s (21.3 s) |
| Full parallel run 3    | 4.14          | 14.4 s (13.8 s)                                  | 22.6 s (21.2 s) |
| QA's runs at `ba912b4` | 2.0–4.4       | 14.3 s and 15.1 s when passing; > 15 s in 4 of 6 | up to 23.1 s    |

**Hold budget.** The hold's `waitFor` budget is now 25 s. It was 15 s.

- **Cost per page.** An uncommitted probe called the mock's `flowRows` for
  the 23 pages directly, with no latency. Each page cost 115–173 ms
  (median about 120 ms). The mock rebuilds the represented-row union for the
  208 remaining processes on every page.
- **Total cost.** Each page therefore costs about 225 ms: 100 ms of latency
  plus that mock work. Over 23 pages that is about 5.2 s before jsdom
  rendering. Under parallel load, the hold ran 1.3–2.4 times longer than in
  the file-alone run.
- **Old budget.** At 15 s, the hold was at 93–101 % of its budget under
  parallel load.
- **New budget.** 25 s gives about 1.7 times the worst passing hold (15.1 s).
  Setup takes up to 8 s (from the whole-test time minus the hold), so setup,
  the hold and the settle step still fit inside the 40 s test limit.
- **What did not change.** The hold's behaviour, the exact 23-page assertion,
  the sampled row count and anchor, and the logged elapsed time are all
  unchanged. Only this test's own budget was raised; no other test's limit
  changed.
- **Load reduction considered, not used.** Fewer processes would change the
  measured scenario (220 selected, 12 removed, 23 pages). The setup reads
  (`selectAll`, then settling at row 150) are what put the grid deep before
  the removal, so they cannot be dropped. The final `settled()` call takes
  about 1 s.

Other notes:

- Mock latency alone accounts for 2.3 s (23 × 100 ms). The rest is mock
  computation and jsdom rendering. jsdom has no fonts.
- The page count (23) and the rows (2,225 → 2,213) are unchanged by the
  merges.
- This scenario differs from #69's earlier estimate of about 18 pages and
  2.5 s. Here 220 processes are selected, 12 are removed, and the new
  comparison has 2,213 rows.

Hold behaviour is unchanged. **Open follow-up:** the maintainer decides
whether to bound the hold (O11). Real-API cost belongs to I1/R2.

### AC6: budgets and headroom

**Test limits.** The first table covers the tests with a limit of 20 s or
more. Where a test has no limit of its own, the limit comes from its
`describe` block.

- Runs are the three consecutive full parallel runs at `1b4fd1b`, with load
  averages of 1.45, 3.32 and 4.14 at the start.
- The last column gives the maximum at `0265639`.

| Test                                                                        | Limit | Run 1  | Run 2  | Run 3  | Max %    | `0265639` |
| --------------------------------------------------------------------------- | ----- | ------ | ------ | ------ | -------- | --------- |
| `selection.test.tsx` › bounds mounted list items for 300 selections         | 30 s  | 21.1 s | 26.7 s | 26.6 s | **89 %** | 82 %      |
| `flows-grid.test.tsx` › deep scrolling pages rows in bounded steps…         | 20 s  | 12.9 s | 16.1 s | 16.1 s | **81 %** | 76 %      |
| `flows-grid.test.tsx` › mounts only the viewport window…                    | 20 s  | 5.4 s  | 5.5 s  | 5.7 s  | 29 %     | 28 %      |
| `flows-grid.test.tsx` › sizes mixed-sign rows…                              | 20 s  | 6.3 s  | 7.6 s  | 7.3 s  | 38 %     | 37 %      |
| `flows-grid.test.tsx` › names rows by all seven identifying fields…         | 20 s  | 3.8 s  | 5.5 s  | 5.5 s  | 28 %     | 27 %      |
| `flows-grid.test.tsx` › keeps one tab stop…                                 | 20 s  | 2.8 s  | 3.5 s  | 4.7 s  | 24 %     | 20 %      |
| `flows-grid.test.tsx` › keeps focus on a loading cell…                      | 30 s  | 8.7 s  | 8.7 s  | 10.0 s | 33 %     | 29 %      |
| `flows-grid.test.tsx` › D1, D2 removed or added while deep                  | 40 s  | 9.5 s  | 10.4 s | 9.9 s  | 26 %     | 24 %      |
| `flows-grid.test.tsx` › D2, D3 adds processes above the view                | 40 s  | 8.3 s  | 9.7 s  | 8.2 s  | 24 %     | 23 %      |
| `flows-grid.test.tsx` › D3 single removal                                   | 40 s  | 10.6 s | 10.2 s | 11.3 s | 28 %     | 27 %      |
| `flows-grid.test.tsx` › D4 scroll during update                             | 40 s  | 15.6 s | 16.4 s | 16.4 s | 41 %     | 40 %      |
| `flows-grid.test.tsx` › reorders columns without re-reading rows (D1)       | 20 s  | 2.9 s  | 2.4 s  | 2.1 s  | 15 %     | 15 %      |
| `flows-grid.test.tsx` › header strip aligned                                | 20 s  | 2.5 s  | 1.6 s  | 2.4 s  | 13 %     | 13 %      |
| `flows-grid-columns.test.tsx` › reorders by keyboard and pointer…           | 20 s  | 7.7 s  | 8.1 s  | 8.6 s  | 43 %     | 39 %      |
| `flows-grid-columns.test.tsx` › moves a column to an off-screen end         | 20 s  | 4.2 s  | 5.1 s  | 5.0 s  | 26 %     | 23 %      |
| `flows-grid-columns.test.tsx` › tab stop to the next column on removal      | 40 s  | 15.4 s | 20.9 s | 21.1 s | 53 %     | 52 %      |
| `flows-grid-columns.test.tsx` › top flow kept on × while deep               | 40 s  | 11.9 s | 13.8 s | 14.8 s | 37 %     | 36 %      |
| `flows-grid-columns.test.tsx` › reads nothing while paused (O2)             | 40 s  | 11.1 s | 13.4 s | 11.9 s | 34 %     | 30 %      |
| `flows-grid-columns.test.tsx` › unfetched flows unknown (O1)                | 40 s  | 6.3 s  | 6.4 s  | 6.6 s  | 17 %     | 18 %      |
| `flows-grid-anchoring.test.tsx` › O9 focus on removal of the focused column | 40 s  | 19.3 s | 22.1 s | 22.9 s | 57 %     | 53 %      |
| `flows-grid-anchoring.test.tsx` › O8 later recorded flow                    | 40 s  | 4.0 s  | 7.0 s  | 6.7 s  | 18 %     | 17 %      |
| `flows-grid-anchoring.test.tsx` › O8 every recorded flow removed            | 40 s  | 10.2 s | 14.0 s | 15.2 s | 38 %     | 36 %      |
| `flows-grid-anchoring.test.tsx` › #69 error during the hold, Retry          | 40 s  | 9.7 s  | 11.0 s | 11.0 s | 28 %     | 27 %      |
| `flows-grid-anchoring.test.tsx` › #69 fails again after Retry               | 40 s  | 9.8 s  | 10.3 s | 10.4 s | 26 %     | 26 %      |
| `flows-grid-anchoring.test.tsx` › #69 selection change during the error     | 40 s  | 8.0 s  | 8.8 s  | 9.8 s  | 25 %     | 22 %      |
| `flows-grid-anchoring.test.tsx` › #69 first-page error (O12)                | 40 s  | 5.3 s  | 4.7 s  | 5.7 s  | 14 %     | 13 %      |
| `flows-grid-anchoring.test.tsx` › #69 error outside a hold                  | 40 s  | 7.8 s  | 8.7 s  | 7.5 s  | 22 %     | 21 %      |
| `flows-grid-hold.test.tsx` › hold reads every row page (new)                | 40 s  | 16.7 s | 22.3 s | 22.6 s | 57 %     | 53 %      |
| `composition.test.tsx` › serves the large synthetic workload…               | 20 s  | 5.8 s  | 7.2 s  | 6.2 s  | 36 %     | 33 %      |

**Internal `waitFor` budgets.** A test can time out on an internal `waitFor`
well before it reaches its own limit, as QA found. The second table lists
these budgets.

- **How they were measured.** A temporary wrapper around Testing Library's
  `waitFor` logged each call's budget and elapsed time. It is not committed;
  `git status` was clean afterwards.
- **Runs.**
  - One run of the large-workload unit directory (`src/services/mock/`,
    195 tests, 94 s, load 3.4–4.0), with the hold file included.
  - Two control runs of the same directory without the hold file (194 tests
    each, load 3.0–4.7).
- **What the figures show.** Each figure is the maximum elapsed time for that
  call site across those runs. The hold row uses the three full runs.

| Call site (budget)                                                                                | Max elapsed                                              | % of budget                            |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------- |
| `flows-grid.test.tsx:76`, deep scroll to row 1,500 (10 s)                                         | **9.7 s** with the hold file; 7.3 s and 7.7 s without it | **97 %** (73–77 % without)             |
| `flows-grid-hold.test.tsx`, hold until not busy (25 s; was 15 s)                                  | 14.7 s (full run 2)                                      | 59 % (it would have been 98 % of 15 s) |
| `flows-grid-anchoring.test.tsx:184`, default `waitFor` (1 s)                                      | 0.69 s                                                   | 69 %                                   |
| `flows-grid-harness.ts` `settled` / `settledAt` (15 s)                                            | 7.3 s                                                    | 49 %                                   |
| `flows-grid.test.tsx:206` (15 s)                                                                  | 5.9 s                                                    | 40 %                                   |
| `flows-grid.test.tsx:220` (10 s)                                                                  | 3.8 s                                                    | 38 %                                   |
| Other `flows-grid*.test.tsx` 10 s waits (`:88/116/175/226/273/287/295/308`, anchoring `:204/286`) | ≤ 2.1 s                                                  | ≤ 21 %                                 |
| `flows-grid-harness.ts` `selectAll` (5 s)                                                         | 1.1 s                                                    | 22 %                                   |

The large e2e tests use Playwright's 30 s default limit, except the
50-process cases, which set 60 s. Times are from the local full run at
`0265639`. At `1b4fd1b` the local full run passed 66/66 in 3.5 min.

| Test                                                    | Limit | Chromium  | Firefox   |
| ------------------------------------------------------- | ----- | --------- | --------- |
| `flows-grid.spec.ts:83` 220 × 2,000+ window             | 30 s  | 12.0 s    | 17.2 s    |
| `flows-grid.spec.ts:242` sidebar collapse and resize    | 30 s  | 6.7 s     | 7.3 s     |
| `column-operations.spec.ts:296` edge auto-scroll drag   | 30 s  | 10.1 s    | 11.5 s    |
| `column-operations.spec.ts:337` off-screen keyboard end | 30 s  | 3.8 s     | 4.6 s     |
| `flows-composition.spec.ts:358` 50 processes (× 2)      | 60 s  | 7.5–7.9 s | 9.3–9.6 s |

**Above 75 %.** These are all tracked in follow-up #76, which is still open.

- **The 300-selection test, at 89 % of its 30 s limit.** It was 82 % at
  `0265639`. Earlier figures: 17.6 s at #69 and 21.2 s at #25.
- **The deep-scroll test, at 81 % of its 20 s limit.**
- **The deep-scroll test's internal 10 s `waitFor`, at 97 %.** This is the
  riskiest budget. It peaks when the hold file runs in parallel. QA's control
  runs at `ba912b4` passed with deep-scroll at 16.2 s and 16.6 s, and the
  first-round control run without the hold file measured 85 % and 76 %. So
  the pressure exists without #26's added workload on this shared host, but
  #26 adds to it.

The deep-scroll budget is not changed here; that belongs to #76. In the three
runs at `1b4fd1b`, no `waitFor` and no test timed out.

### AC8: coverage and honesty

See the two coverage tables below. The first round's failures and the QA FAIL
round at `ba912b4` are kept as history and were not counted as passing; the open #76
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
- #76: budget headroom. The 300-selection test (89 %) and the deep-scroll
  test (81 %, and 97 % of its internal 10 s `waitFor`) are above 75 %.
- O11: the maintainer decides whether to bound the hold. O13: no change.
- #51 (the AuthDialog flake; it did not occur in these runs) and #52 (tree
  ARIA positions) remain open.
- The default catalog does not overflow the grid, so browser scrolling is
  shown on the large and 50-process catalogs.
- Remaining gates:
  - Release browser matrix, Safari and release-candidate runs: #34.
  - Real API, performance and adapter parity: I1/R2.
  - Server-side selection: B2.
