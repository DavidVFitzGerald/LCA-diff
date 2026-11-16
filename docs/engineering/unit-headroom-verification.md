# Unit-suite headroom (#76) and the mixed-sign row height race (#87)

Status: engineering evidence on branch `fix/76-87-unit-headroom`, one PR for
both issues (maintainer decision 2026-11-15).

- **Baseline SHA.** `af5317d` (`main` at the start).
- **Checks SHA.** `decb56a`, the last code commit. It includes the merge of
  `main` after #88 (F5 #27), so #88's tests are in the measurements. Every
  gate check in the "after" results ran there.
- **Docs-only commit.** The commit that adds this document changes
  documentation only.

Mock evidence only: none of this proves real API, authentication or
authorization behaviour.

## Summary

- **#87 is a geometry defect (class B), now fixed.** Value cells took their
  height from the row summary in the commit before the virtualizer gave the
  row that height. jsdom committed the mismatch in every run; Chromium
  painted it in 1 of 396 sampled frames. Cells now size from the row's
  committed height.
- **#76: the suite is cheaper, not given more time.** No limit or budget was
  raised. Four remedies, in the issue's order of preference:
  - the comparison mock no longer copies the 220 × 2,000+ catalog for every
    test (~2 s each);
  - it builds a selection's flow-row union once, not per 100-row page
    (~150 ms per page);
  - the 300-selection test fills its list with one branch selection instead
    of 300 tree clicks;
  - Vitest uses half the cores (`maxWorkers: "50%"`). This was needed for
    AC4: two concurrent suites at the default workers still failed.
- **Effect.**
  - Full-suite wall time fell from 105–107 s to 43–44 s on a quiet host.
  - The deep-scroll internal wait went from 107–114 % (it timed out in all
    three baseline runs) to 15–17 %.
  - The 300-selection test went from 92–95 % of its limit to 1 %.
- **AC4 and #93.** The first two-suite attempt at the final SHA failed one
  test, an existing race that a probe also shows at the baseline. It is now
  Bug #93. The second attempt passed cleanly.

## Method

- **Host.** 8 cores (`nproc`), rootless Docker, the workspace container of
  Compose project `lca-diff-headroom`. Other agents' containers were up
  throughout (25–26 running containers); the load columns show when their
  suites were active.
- **Per-test durations.** Vitest's JSON reporter.
- **Internal budgets.** A temporary, uncommitted wrapper around Testing
  Library's `asyncWrapper` logged every `waitFor`/`findBy*` call site with
  its wall-clock elapsed time and outcome. It was loaded through a temporary
  config (`vitest.headroom.config.ts`) that only adds it as a setup file.
  Budgets are read from the call site. Both files were removed afterwards.
- **Probes (#87, #93).** Temporary, uncommitted probes, described with their
  results below, also removed afterwards (`git status` clean).
- **Quiet host for AC3.** Before each run a driver waited until the 1-min
  load was ≤ 2.0 and no other container used more than 50 % CPU.
  - `docker stats` was the check, because a process-name check had missed
    another agent's suite once.
  - The same check ran again after each run.

## #87: reproduce, characterize, classify

### Reproduction counts (AC1)

| Runs at `af5317d`                    | Failures of the mixed-sign test | Other failures                                   | Load (1-min) start → end |
| ------------------------------------ | ------------------------------- | ------------------------------------------------ | ------------------------ |
| 50 isolated runs of the test (328 s) | 0                               | -                                                | 0.62 → 2.06              |
| 10 runs of `src/services/mock/`      | 0                               | 4 runs: deep-scroll × 4, 300-selection × 1 (#76) | 1.74 → 4.18              |
| 3 #76 baseline full runs             | 0                               | deep-scroll in all 3 (#76)                       | 4.18 → 4.19              |

The hosted failure did not reproduce by count. The probes found the cause.

### jsdom probe

A copy of the test's setup ran a `MutationObserver` on the grid during the
scroll to row 300 and for 1 s after. Each mutation batch was checked for a
mounted `[role="gridcell"][data-state]` whose `style.height` differs from its
row's. Each mismatch was re-checked after a microtask and after
`setTimeout(0)`.

| Code          | Runs | Mutation batches per run | Mismatched batches per run                        | Survived a microtask | Survived a macrotask |
| ------------- | ---- | ------------------------ | ------------------------------------------------- | -------------------- | -------------------- |
| `af5317d`     | 10   | 6                        | **2** (rows 295 and 301: 53px cells in 52px rows) | 2                    | 0                    |
| after the fix | 3    | 6                        | 0                                                 | 0                    | 0                    |

The mismatch was deterministic: every run committed it twice. The test
passed anyway because its `waitFor` only waited for _some_ row taller than
52px, and in these runs no mismatched batch coincided with that moment. In
the hosted failure one did.

### Browser probe

A temporary spec opened the large scenario (`?mock-scenario=large`). Every
`requestAnimationFrame` was sampled during a stepped scroll to row ~300
(208px per frame), 120 settle frames, a jump to `scrollTop` 40,000 and 200
more frames. A frame counted as mismatched if any mounted value cell's
`getBoundingClientRect().height` differed from its row's by more than 0.5px.

| Code          | Project  | Frames | Mismatched frames | Example                                |
| ------------- | -------- | ------ | ----------------- | -------------------------------------- |
| `af5317d`     | chromium | 396    | **1**             | frame 78, row 302: row 52px, cell 53px |
| `af5317d`     | firefox  | 396    | 0                 | -                                      |
| after the fix | chromium | 396    | 0                 | -                                      |
| after the fix | firefox  | 396    | 0                 | -                                      |

### Classification (AC2): B, geometry defect

Chromium painted a mismatched frame, so by the issue's rule this is a
geometry defect, not an assertion race.

**Cause.** The issue's lead was right.

1. `SignedValueCell` took its height from the summary geometry at render
   time.
2. The row's height was the virtualizer's `row.size`.
3. `ComparisonGrid` applies summary heights with `resizeItem` in a microtask
   queued from `useLayoutEffect` (to avoid `flushSync` in a lifecycle method).
4. `resizeItem` re-renders the grid through a normal, non-synchronous update.
   The commit in which a summary first arrives therefore has cells at the new
   height in rows at the old one, until the next commit. A browser may paint
   in between.

**Fix (product code).** `ComparisonGrid` passes each cell renderer the row's
height in that commit (`row.size`). `FlowsGrid` draws the summary geometry
only once the row has that height; until then the cell stays pending at the
row's current height. Row and cells take their height from one value in
every commit.

- View anchoring (#23 D2–D4) is untouched: the resize effect, `pin` and
  `record` are unchanged.
- No `flushSync` is added; the resize still runs in the microtask.
- A summarized cell now shows its value one commit later, in the same commit
  as its row's new height.

### Regression (AC3)

The mixed-sign grid test now checks every mutation batch, not only the
settled DOM, for a value cell whose height differs from its row's. It then
runs its existing checks on a settled grid (`settled()`).

| Code                   | Runs | Result                                                    |
| ---------------------- | ---- | --------------------------------------------------------- |
| `af5317d` product code | 3    | **3 failed**: 96 mismatches, e.g. `row 295: 53px in 52px` |
| `d78ccd8` (the fix)    | 3    | 3 passed                                                  |

The existing §6.6 tests (`geometry.test.ts`, `SignedValueCell.test.tsx`) are
unchanged and pass.

### Stability (AC4)

| Runs at `6c0b839`                       | Failures            | Load (1-min) start → end |
| --------------------------------------- | ------------------- | ------------------------ |
| 50 isolated runs of the test (238 s)    | 0                   | 2.44 → 2.34              |
| 10 runs of `src/services/mock/` (456 s) | 0                   | 2.34 → 5.79              |
| #76 AC3 and AC4 full runs               | 0 (mixed-sign test) | see below                |

## #76 baseline (AC1)

Three consecutive instrumented full runs at `af5317d`:

| Run | Start load (1/5/15 min) | End load       | Tests | Failed | Wall  |
| --- | ----------------------- | -------------- | ----- | ------ | ----- |
| 1   | 4.18 5.59 4.86          | 4.62 5.72 5.01 | 405   | 1      | 107 s |
| 2   | 4.62 5.72 5.01          | 4.19 5.69 5.11 | 405   | 1      | 106 s |
| 3   | 4.19 5.69 5.11          | 4.65 5.81 5.24 | 405   | 1      | 105 s |

The host was not quiet: other agents' suites ran during the baseline. The
failure in every run was the deep-scroll test's internal 10 s wait.

**Tests with a limit ≥ 20 s, and the large-workload files.** Tests below
2 s and under 20 % are omitted.

| Test                                                       | Limit | Run 1    | Run 2    | Run 3    | Max %            |
| ---------------------------------------------------------- | ----- | -------- | -------- | -------- | ---------------- |
| `selection` › bounds mounted list items for 300 selections | 30 s  | 28.6 s   | 28.3 s   | 27.5 s   | **95 %**         |
| `flows-grid` › deep scrolling pages rows…                  | 20 s  | 16.2 s ✗ | 17.0 s ✗ | 16.6 s ✗ | **85 %**, failed |
| `flows-grid-hold` › hold reads every row page              | 40 s  | 25.4 s   | 23.7 s   | 23.9 s   | 63 %             |
| `flows-grid-anchoring` › O9 focused column removed         | 40 s  | 25.1 s   | 23.6 s   | 23.6 s   | 63 %             |
| `flows-grid-columns` › tab stop to the next column         | 40 s  | 20.3 s   | 21.8 s   | 22.3 s   | 56 %             |
| `flows-grid` › QA D4 scroll during update                  | 40 s  | 18.5 s   | 15.9 s   | 15.7 s   | 46 %             |
| `flows-grid-columns` › reorders by keyboard and pointer    | 20 s  | 9.0 s    | 8.1 s    | 8.6 s    | 45 %             |
| `flows-grid` › sizes mixed-sign rows…                      | 20 s  | 8.1 s    | 7.5 s    | 7.5 s    | 41 %             |
| `flows-grid-anchoring` › O8 re-anchors when all removed    | 40 s  | 11.8 s   | 14.5 s   | 15.0 s   | 37 %             |
| `composition` › serves the large synthetic workload        | 20 s  | 6.6 s    | 7.4 s    | 6.5 s    | 37 %             |
| `flows-grid-columns` › top flow kept on column ×           | 40 s  | 12.6 s   | 14.1 s   | 14.6 s   | 36 %             |
| `flows-grid` › mounts only the viewport window             | 20 s  | 6.7 s    | 6.1 s    | 6.1 s    | 33 %             |
| `flows-grid` › QA D3 single removal                        | 40 s  | 11.3 s   | 13.1 s   | 11.5 s   | 33 %             |
| `flows-grid-columns` › O2 paused reads                     | 40 s  | 11.7 s   | 12.2 s   | 13.3 s   | 33 %             |
| `flows-grid` › keeps focus on a loading cell               | 30 s  | 9.6 s    | 8.6 s    | 8.8 s    | 32 %             |
| `flows-grid` › names rows by all seven fields              | 20 s  | 6.0 s    | 5.5 s    | 6.3 s    | 31 %             |

**Internal budgets ≥ 5 s and the flows-grid 1 s default waits.** Maximum
elapsed over the three runs; sites under 25 % are omitted.

| Call site (budget)                                       | Max elapsed            | Max %     |
| -------------------------------------------------------- | ---------------------- | --------- |
| `flows-grid.test.tsx:75` deep scroll to row 1,500 (10 s) | 11.45 s, timed out 3/3 | **114 %** |
| `flows-grid-anchoring.test.tsx:183` default wait (1 s)   | 0.82 s                 | **82 %**  |
| `flows-grid-hold.test.tsx:52` hold (25 s)                | 15.95 s                | 64 %      |
| `flows-grid-harness.ts` `settled` (15 s)                 | 8.35 s                 | 56 %      |
| `flows-grid-harness.ts` `settledAt` (15 s)               | 8.00 s                 | 53 %      |
| `flows-grid.test.tsx:205` (15 s)                         | 6.41 s                 | 43 %      |
| `flows-grid.test.tsx:219` (10 s)                         | 3.90 s                 | 39 %      |
| `flows-grid-harness.ts` `selectAll` (5 s)                | 1.65 s                 | 33 %      |

## Attribution and remedies (AC2)

Mock costs were measured with a temporary profile test: one mock instance,
0 ms latency, the 220 × 2,000+ catalog. Before → after the remedies:

| Mock operation                                  | Before              | After                                        |
| ----------------------------------------------- | ------------------- | -------------------------------------------- |
| `createMockComparison` (defensive catalog copy) | 1.9–2.5 s           | 0 (frozen catalog is read directly)          |
| `flowRows`, one 100-row page, 220 processes     | 151 ms (mean of 23) | 11 ms (first page of a selection 160–200 ms) |
| `flowRows`, one page, 208 processes (the hold)  | 130 ms              | 10 ms                                        |
| `flowSummaries`, 100 rows × 220                 | 7 ms                | unchanged                                    |
| `flowCells`, one 1,000-cell tile                | 3 ms                | unchanged                                    |

**Deep scroll (`flows-grid.test.tsx` "deep scrolling pages rows…").**

- Setup: `render()` paid the catalog copy (~2 s alone); `selectAll` took
  1.0–1.1 s.
- Measured step (the 10 s wait): 16 row pages. Mock work was 16 × ~150 ms ≈
  2.4 s alone and latency 16 × 20 ms = 0.3 s; the rest, 8 s of the 10.7–11.4 s
  under load, was React/jsdom rendering competing for CPU with other workers.
- Remedies: the row-set cache (mock work ≈ 16 × 11 ms) and the frozen
  catalog (setup). Same 220 × 2,000+ workload, same jump to row 1,500 at
  20 ms latency, same bounds.

**Hold (`flows-grid-hold.test.tsx`).**

- Setup: `selectAll` 1.3–1.5 s and `settledAt(150)` 0.7–0.9 s, plus the
  catalog copy.
- Measured step (the hold wait, 15.4–16.0 s): latency 23 × 100 ms = 2.3 s,
  mock work 23 × ~130 ms ≈ 3.0 s, the rest (~10 s) rendering under load.
- Remedies: the row-set cache and the frozen catalog. Still 220 selected,
  12 removed, exactly 23 pages.

**300 selections (`selection.test.tsx`).** Phase timings from a temporary
copy of the test, alone on the host (load ~4):

| Phase                                              | Before | After                |
| -------------------------------------------------- | ------ | -------------------- |
| mount and expand                                   | 0.28 s | ~0.3 s               |
| five "Load more" pages                             | 0.75 s | none                 |
| 300 tree-row clicks (32 ms each; 306 header reads) | 9.7 s  | one branch selection |
| measured list steps (End, removals, Home)          | 0.2 s  | 0.2 s                |
| whole test, alone                                  | ~11 s  | 0.3–0.9 s            |

- The cost was setup: every click re-rendered all 310 mounted tree rows
  (the test sized the tree viewport to fit them).
- Remedy: one branch selection of the folder adds the same 300 leaves in the
  same name order. The list under test is the same; single-row toggling is
  covered by the tree tests above it, branch selection by
  `bulk-selection.test.tsx`.

**Two concurrent suites (remedy 4).** The cost cuts alone gave three clean
single runs (history below), but not AC4. The cause was oversubscription:
two suites ran 16 workers on 8 cores. The failures spread to small
default-limit tests, not only the large ones. Halving the workers made both
the pair and a single run faster (table under AC4). No file splitting and no
limit change was needed.

## #76 after (AC3)

Three consecutive instrumented full runs at `decb56a`, each started on a
quiet host:

| Run | Start load (1/5/15 min) | End load       | Other containers > 50 % CPU (before, after) | Tests | Failed | Wall   |
| --- | ----------------------- | -------------- | ------------------------------------------- | ----- | ------ | ------ |
| 1   | 1.77 5.35 6.11          | 3.45 5.26 6.04 | none, none                                  | 411   | 0      | 43.6 s |
| 2   | 1.80 4.48 5.73          | 4.07 4.71 5.74 | none, none                                  | 411   | 0      | 43.4 s |
| 3   | 1.82 3.92 5.40          | 4.12 4.20 5.41 | none, none                                  | 411   | 0      | 43.7 s |

No failure and no timeout. 28 containers were up; none ran a suite.

**Targets.**

| Target                               | Highest at `decb56a`                                 | Result |
| ------------------------------------ | ---------------------------------------------------- | ------ |
| Tests with a limit ≥ 20 s: ≤ 65 %    | 31 %: `flows-grid` › QA D4 (12.4 s of 40 s)          | pass   |
| Internal budgets ≥ 5 s: ≤ 65 %       | 31 %: harness `settled`/`settledAt` (4.65 s of 15 s) | pass   |
| flows-grid 1 s default waits: ≤ 75 % | 34 %: `flows-grid-anchoring.test.tsx:183` (0.34 s)   | pass   |
| 0 failures, 0 timeouts               | 0 in all three runs                                  | pass   |

**The baseline's pressure points after the change.**

| Budget                                                | Limit | Baseline max        | After (3 runs) | % after                |
| ----------------------------------------------------- | ----- | ------------------- | -------------- | ---------------------- |
| deep scroll, internal wait (`flows-grid.test.tsx:75`) | 10 s  | 11.45 s, failed 3/3 | 1.54–1.72 s    | 15–17 %                |
| deep scroll, whole test                               | 20 s  | 17.0 s, failed      | 2.9–3.2 s      | 16 %                   |
| 300 selections, whole test                            | 30 s  | 28.6 s              | 0.2–0.3 s      | 1 %                    |
| hold wait (`flows-grid-hold.test.tsx:52`)             | 25 s  | 15.95 s             | 3.48–3.68 s    | 15 %                   |
| hold, whole test                                      | 40 s  | 25.4 s              | 5.7–6.1 s      | 15 %                   |
| anchoring O9, whole test                              | 40 s  | 25.1 s              | 4.4–4.8 s      | 12 %                   |
| anchoring `:183` default wait                         | 1 s   | 0.82 s              | 0.27–0.34 s    | 34 %                   |
| full suite wall time                                  | -     | 105–107 s           | 43.4–43.7 s    | 41 % of the AC1 median |

Every other test with a limit ≥ 20 s used ≤ 19 %. Every other budget used
≤ 31 %.

**History: runs at `0fb6ff8`.** Before the worker change, three runs at
`0fb6ff8` (start loads 1.47, 1.80, 1.95) also passed: 411 tests, 0 failures,
50–54 s. The highest figures were 45 % (deep-scroll wait), 65 % (anchoring
`:183`) and 36 % (deep-scroll test). They do not count for AC3, because the
SHA changed afterwards.

## Two-suite load (AC4)

Two instrumented full runs started together in the container:
`(full.sh A & full.sh B; wait)`. Every attempt is listed, failed ones
included.

| #   | SHA, workers                          | Start load (1 min) | Peak | Other containers > 50 % CPU at start | Result A     | Result B          | Wall A / B  |
| --- | ------------------------------------- | ------------------ | ---- | ------------------------------------ | ------------ | ----------------- | ----------- |
| 1   | `0fb6ff8`, default                    | 3.38               | 14.2 | not recorded                         | **2 failed** | **3 failed**      | 111 / 113 s |
| 2   | `0fb6ff8`, default (control)          | 2.25               | 13.2 | F5 scores workspace 224 %            | **4 failed** | **3 failed**      | 105 / 106 s |
| 3   | `0fb6ff8`, `--maxWorkers=50%` (trial) | 1.73               | 9.8  | none                                 | 0 failed     | 0 failed          | 76 / 76 s   |
| 4   | `decb56a` (50 %)                      | 1.79               | 9.6  | none                                 | 0 failed     | **1 failed: #93** | 77 / 76 s   |
| 5   | `decb56a` (50 %)                      | 2.26               | 9.3  | none                                 | 0 failed     | 0 failed          | 75 / 75 s   |

- **Default-worker failures (attempts 1–2).** Deep scroll (10 s wait, up to
  13.5 s), the anchoring Retry test's 1 s default wait, the process tree's
  2,000-leaf test (5 s), a service-boundary test (5 s), a bulk-selection
  test and a flows-composition test (1 s `findBy`). That is
  oversubscription; it is fixed by the worker setting.
- **Attempt 4.** It failed `flows-grid.test.tsx` "keeps the same flows in
  view and focused… (QA D1, D2)" at line 253. `at(1310, -1)` was null just
  after its `waitFor` had seen that row loaded. A probe shows the race also
  exists at the baseline (next section), so it is tracked in #93 and not
  fixed here.
- **Attempt 5** is the clean pass at the final SHA. Its highest figures:
  - anchoring `:183` default wait, 61 %;
  - deep-scroll wait, 43 % (4.35 s);
  - harness `settledAt`, 38 %;
  - QA D4 test, 38 %;
  - deep-scroll test, 36 %;
  - hold test, 25 %.

  Attempt 4, apart from its failure, peaked at 63 % (anchoring `:183`), with
  the deep-scroll wait at 28 %.

- **Over 90 %.** No budget was above 90 % in attempts 3–5. Residual risk is
  listed below.

### #93 probe: the D1/D2 failure predates this PR

A temporary probe ran the D1/D2 setup: `render(30)`, `selectAll`,
`scrollTo(1300 × 52 + 20)`, then the test's `waitFor`.

- A `MutationObserver` recorded every batch in which row 1310's header was
  unmounted after it had been seen loaded, and whether `waitFor` had resolved
  yet.
- 3 runs per SHA, on a quiet host.

| SHA       | Row 1310 unmounted after loading | When                      | Mounted rows then | Batches in that state per run |
| --------- | -------------------------------- | ------------------------- | ----------------- | ----------------------------- |
| `af5317d` | 3 of 3 runs                      | before `waitFor` resolved | 1282–1305         | 1, 1, 1                       |
| `decb56a` | 3 of 3 runs                      | before `waitFor` resolved | 1282–1305         | 1, 2, 2                       |

- **The race.** On every run the header loads, then one commit briefly
  shifts the mounted window up, unmounting row 1310, before it returns.
  If `waitFor` checks in the brief loaded moment, the shift can land before
  the test's focus call. The failure needs that timing, which is why it is
  rare.
- **What differs at `decb56a`.** The unmounted state lasted one extra
  mutation batch in 2 of 3 runs. That is plausibly #87's deferred cell
  geometry adding a commit; it is the same race, possibly slightly wider.
- **A lead ruled out.** An earlier lead was that the summaries land in the
  gap. A forced-gap probe found them already in and row 1310 mounted at both
  SHAs.
- **Still open.** Why the window shifts is left to #93.

Result posted on #93:
https://github.com/DavidVFitzGerald/LCA-diff/issues/93#issuecomment-6904095131

## Modified tests (AC5)

| Test                                                                | Before                                                                                            | After                                                                                                                                                                                 | Fixture       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `flows-grid.test.tsx` › sizes mixed-sign rows…                      | After some row exceeds 52px: every value cell's height equals its row's; stripes; contiguity      | Same checks, on a settled grid, plus no mismatch in any mutation batch during the scroll (#87)                                                                                        | 220 × 2,000+  |
| `selection.test.tsx` › bounds mounted list items for 300 selections | 300 selected by 300 tree clicks; mounted-item bound, one tab stop, End/ArrowUp/removal/Home focus | Same assertions; 300 selected by one branch selection, same order                                                                                                                     | 300 leaves    |
| `comparison.test.ts` › serves a frozen catalog… (new)               | -                                                                                                 | Frozen and copied catalogs serve the same pages, in any process order and repeated; frozen catalogs reject writes; responses are copies; a second instance has no tokens of the first | 30 × 250      |
| `flows-grid-hold.test.tsx` › hold                                   | Comment on per-page mock cost                                                                     | Comment only; assertions and budget unchanged                                                                                                                                         | 220 / 12 / 23 |

All other large-workload tests use the frozen catalog through
`flows-grid-harness.ts`, with unchanged assertions and workload. Every
existing test in `comparison*.test.ts`, `flow-summaries.test.ts` and the
service-boundary tests is unchanged and passes; the one new mock test is
added alongside them. `e2e/flows-grid.spec.ts:83` is unchanged.

**Mock adapter (`comparison.ts`).**

- **Frozen catalog.** `freezeComparisonCatalog` deep-freezes a catalog, and
  a mock created from a frozen catalog reads it without the defensive copy.
  Otherwise the mock copies its catalog as before.
- **Row-set cache.** `flowRows` caches the sorted row set per instance, by
  snapshot and process set, and bounds the cache like the tokens.
- **What stays the same.** Validation, tokens, cursors, page contents,
  latency, cancellation and errors. Every response is still copied, and no
  state is shared between instances.
- **Protected data.** Sign-out and account-change clearing is not affected:
  the cache lives inside the mock instance, which holds no account data. The
  session and service-boundary tests pass.

## Limits and configuration (AC6, AC7)

- **AC6.** No limit or budget was raised.
- **AC7.** One Vitest setting changed: `maxWorkers: "50%"` in
  `apps/frontend/vite.config.ts`, with the measurement in a comment.
  - **Before/after.** Two-suite attempts 1–3 above. A single quiet run went
    from 50–54 s (default workers, at `0fb6ff8`) to 43–44 s.
  - **Wall time.** 41 % of the AC1 median of 106 s, well within the 125 %
    cap.
  - **Coverage.** `npm run test:unit` and the CI workflow still run every
    test file: 411 tests in 33 files, the same count as with the default
    workers.
  - **CI.** Hosted runners have fewer cores, so they get fewer workers. The
    hosted `quality` timing is in the PR handoff.

## Gates (AC9)

In the container at `decb56a`:

| Check                                             | Result                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm ci --no-audit --no-fund`, lockfile unchanged | pass (236 packages; `git diff` of `package-lock.json` empty)               |
| `npm run format:check`                            | pass                                                                       |
| `npm run lint`                                    | pass                                                                       |
| `npm run typecheck`                               | pass                                                                       |
| `npm run build`                                   | pass                                                                       |
| `npm run test:e2e -- --grep @smoke`               | 14 passed (25.5 s)                                                         |
| `npm run test:e2e`, both projects                 | 68 passed in 3.0 min (also 66/66 at `6c0b839`, before the merge of `main`) |

The hosted `quality` run on the PR and a hosted `workflow_dispatch` full
run are recorded in the issue handoff.

## Residual risk

- **#93: the D1/D2 deep-focus race.** Bug #93 tracks it (Refs #93). It
  failed once in the two-suite attempts (attempt 4). The probe shows it
  exists at the baseline, and at `decb56a` the transient state may last one
  more commit.
- **Two-suite margin.** With two suites at once the anchoring Retry test's
  1 s default wait reached 61–68 %. That is under the 90 % residual-risk line
  and the AC3 target of 75 %, but it is the closest budget.
- **Shared host.** The workspace counts as a quiet host only when other
  agents keep to the two-suite rule. Attempts 1–2 show that default workers
  plus extra load fail broadly.
- **Mock evidence only.** These results do not show real-API performance.
  That belongs to I1/R2.
- **Pre-existing warnings.** The 300-selection test logs React's "flushSync
  was called from inside a lifecycle method" warning from the selected list.
  It does so at the baseline too; it is not changed here.

## Commands

```sh
# worktree /tmp/lca-diff-headroom, Compose project lca-diff-headroom, port 5221
COMPOSE_PROJECT_NAME=lca-diff-headroom FRONTEND_PORT=5221 ./dev up
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund'
# #87 counts
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && for i in $(seq 1 50); do npx vitest run src/services/mock/flows-grid.test.tsx -t "sizes mixed-sign rows"; done'
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && for i in $(seq 1 10); do npx vitest run src/services/mock/; done'
# AC3 runs (with the temporary timing config; plain `npx vitest run` runs the same tests)
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && npx vitest run --config vitest.headroom.config.ts --reporter=dot --reporter=json --outputFile.json=<run>.json'
# AC4 pair: two of the above started together in the container
# gates
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npm run build && npm run test:e2e -- --grep @smoke && npm run test:e2e'
COMPOSE_PROJECT_NAME=lca-diff-headroom ./dev down
```
