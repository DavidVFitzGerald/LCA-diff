# Unit-suite headroom (#76), the mixed-sign row height race (#87) and the deep-focus window race (#93)

Status: engineering evidence on branch `fix/76-87-unit-headroom`, one PR for
the three issues (maintainer decision 2026-11-15 for #76/#87; #93 added by
the coordinator on 2026-11-16 after QA's AC4 FAIL).

- **Baseline SHA.** `af5317d` (`main` at the start).
- **Checks SHA.** `decb56a` for the #76/#87 results below. It includes the
  merge of `main` after #88 (F5 #27), so #88's tests are in the
  measurements.
- **Final code SHA.** `9374bde`, the #93 fix on top of `decb56a`. The #93
  section, the two-suite pairs at `9374bde` and the final gates ran there.
- **Docs-only commits.** The commits that add or update this document
  change documentation only.

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
- **AC4 and #93.** At `decb56a`, 2 of 5 two-suite pairs (mine and QA's)
  failed the D1/D2 test, a race that also exists at the baseline: Bug #93.
- **#93 is a product defect (class B), now fixed.** After `pin()` scrolled
  to keep the anchor flow in place, the grid committed its row window at
  the old scroll offset, above the view, until the scroll event arrived.
  Both browsers committed that state too. The grid now gives the
  virtualizer the new offset at once and renders there before paint. At
  `9374bde`, 100 of 100 loaded D1/D2 runs and 4 of 4 two-suite pairs
  passed.

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

| #      | SHA, workers                          | Start load (1 min) | Peak          | Other containers > 50 % CPU at start | Result A       | Result B                | Wall A / B  |
| ------ | ------------------------------------- | ------------------ | ------------- | ------------------------------------ | -------------- | ----------------------- | ----------- |
| 1      | `0fb6ff8`, default                    | 3.38               | 14.2          | not recorded                         | **2 failed**   | **3 failed**            | 111 / 113 s |
| 2      | `0fb6ff8`, default (control)          | 2.25               | 13.2          | F5 scores workspace 224 %            | **4 failed**   | **3 failed**            | 105 / 106 s |
| 3      | `0fb6ff8`, `--maxWorkers=50%` (trial) | 1.73               | 9.8           | none                                 | 0 failed       | 0 failed                | 76 / 76 s   |
| 4      | `decb56a` (50 %)                      | 1.79               | 9.6           | none                                 | 0 failed       | **1 failed: #93**       | 77 / 76 s   |
| 5      | `decb56a` (50 %)                      | 2.26               | 9.3           | none                                 | 0 failed       | 0 failed                | 75 / 75 s   |
| QA 1–3 | `decb56a` (50 %), QA's run            | 1.77, 1.83, 1.69   | 9.4, 9.7, 8.6 | none                                 | 0, 0, 0 failed | 0, 0, **1 failed: #93** | 75–78 s     |
| 6      | `9374bde` (#93 fix)                   | 0.49               | 7.4           | none (27 containers)                 | 0 failed       | 0 failed                | 67 / 67 s   |
| 7      | `9374bde`                             | 1.87               | 8.4           | none                                 | 0 failed       | 0 failed                | 70 / 70 s   |
| 8      | `9374bde`                             | 1.77               | 8.8           | none                                 | 0 failed       | 0 failed                | 70 / 70 s   |
| 9      | `9374bde`                             | 1.73               | 8.5           | none                                 | 0 failed       | 0 failed                | 69 / 69 s   |

Attempts 6–9 ran 412 tests each (the #93 regression test is the new one).
Each started only after a gate had seen the 1-min load ≤ 2.0 and no
container above 50 % CPU in `docker stats`; no attempt was aborted.

- **Default-worker failures (attempts 1–2).** Deep scroll (10 s wait, up to
  13.5 s), the anchoring Retry test's 1 s default wait, the process tree's
  2,000-leaf test (5 s), a service-boundary test (5 s), a bulk-selection
  test and a flows-composition test (1 s `findBy`). That is
  oversubscription; it is fixed by the worker setting.
- **Attempt 4.** It failed `flows-grid.test.tsx` "keeps the same flows in
  view and focused… (QA D1, D2)" at line 253. `at(1310, -1)` was null just
  after its `waitFor` had seen that row loaded. A probe shows the race also
  exists at the baseline (next section). QA's pair 3 B failed the same way;
  #93 fixes it (see the #93 section).
- **Attempt 5** passed at `decb56a`. Its highest figures:
  - anchoring `:183` default wait, 61 %;
  - deep-scroll wait, 43 % (4.35 s);
  - harness `settledAt`, 38 %;
  - QA D4 test, 38 %;
  - deep-scroll test, 36 %;
  - hold test, 25 %.

  Attempt 4, apart from its failure, peaked at 63 % (anchoring `:183`), with
  the deep-scroll wait at 28 %.

- **QA's pairs at `decb56a`.** QA measured `flows-grid-anchoring.test.tsx:183`
  (1 s default wait) at **92.3 %** (0.923 s) in pair 3 B, and 75–79 % in two
  other runs; my attempts 4–5 saw 61–63 %. My earlier "nothing above 90 %"
  was wrong for `decb56a` as a whole.
- **Attempts 6–9 at `9374bde`.** Highest share in each run (A / B):

  | #   | Test with limit ≥ 20 s (QA D4) | Budget ≥ 5 s (harness `settled`/`settledAt`) | Anchoring `:183` (1 s) | Next flows-grid 1 s wait |
  | --- | ------------------------------ | -------------------------------------------- | ---------------------- | ------------------------ |
  | 6   | not recorded¹                  | 33.7 / 35.2 %                                | 48.2 / 47.6 %          | 1.2 / 2.2 %              |
  | 7   | 34.4 / 34.5 %                  | 35.3 / 34.3 %                                | 45.2 / 41.4 %          | 1.6 / 2.9 %              |
  | 8   | 33.4 / 34.9 %                  | 34.7 / 35.1 %                                | 51.4 / 52.2 %          | 4.0 / 1.9 %              |
  | 9   | 34.5 / 34.2 %                  | 36.2 / 35.3 %                                | 50.6 / **66.4 %**      | 2.3 / 1.9 %              |

  ¹ The timing setup read per-test durations too early in attempt 6 (all
  0 ms); it was fixed before attempt 7. Waits were recorded in every
  attempt: 623 per run, none rejected. Nothing was above 90 % in attempts
  6–9.

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

QA's AC4 run then failed on this race (pair 3 B), and #93 was made ready
and fixed in this PR: see the next section.

## #93: the window commits above the view after an anchoring scroll

### Cause (AC1)

A temporary trace in `ComparisonGrid.tsx` logged, in order, the resize
microtask, every render's virtualizer offset (`scrollOffset`), mounted range
and `scrollTop`, `pin`'s `scrollTo`, and every scroll event. The D1/D2
setup at `7e4e1c2` (code `decb56a`) gave this sequence, the same in every
run:

```text
resize            (summaries for the 100 rows above arrive)
pin               scrollTop 67,620 → +695 (the anchor flow moved down)
render            range 1282–1305, virtualizer offset 67,620, scrollTop 68,315
  → row 1310 unmounted (MutationObserver)
render            range 1282–1305, offset 67,620, scrollTop 68,315
scroll event      offset → 68,315; the next render mounts the view again
```

1. The resize microtask applies the summary heights with `resizeItem`,
   which schedules a grid render.
2. `pin()` then scrolls by how far the anchor flow moved (+695 px), with
   `element.scrollTo`.
3. The virtualizer learns the new offset only from the scroll event.
   Browsers dispatch that event asynchronously, at the next rendering
   step, and the jsdom stub mirrors that with a `setTimeout`.
4. The render scheduled in step 1 runs first, computing the window from the
   new heights and the old offset: rows 1282–1305, about 700 px above the
   view at 68,315. Row 1310, loaded and in view, is unmounted until the
   scroll event re-renders.

The PM's lead was right. In the test, `waitFor` can see row 1310 loaded
just before step 4, and then the focus call finds no row.

### Probes (AC1, AC5)

- **jsdom.** The D1/D2 setup, a `MutationObserver` counting batches in
  which row 1310 is unmounted after it was seen loaded, 300 ms past the
  `waitFor`. 10 runs per code.
- **Browser.** A temporary spec on the large scenario
  (`?mock-scenario=large`, 1440 × 900, 220 processes) jumped 12 times
  (`scrollTop` 15,000–101,000) and sampled 40 rAF frames after each,
  480 frames per run, while rows loaded, summaries arrived and the rows
  above resized (every jump caused an anchoring scroll). Each frame and
  each mutation batch was checked for (a) the mounted rows covering
  `[scrollTop, scrollTop + clientHeight]` in the layout the grid gave them
  and (b), from the fourth frame after a jump with the grid not busy, every
  loaded row in view in the previous frame still mounted.

| Code                | jsdom: runs with row 1310 unmounted (batches) | Browser runs | Frames failing (a) / (b) | Mutation batches failing (a) |
| ------------------- | --------------------------------------------- | ------------ | ------------------------ | ---------------------------- |
| `decb56a` (pre-fix) | **10 of 10** (1–2 each)                       | 3 Chromium   | 0 / 0 of 1,440           | **2** (1, 0, 1)              |
|                     |                                               | 3 Firefox    | 0 / 0 of 1,440           | **1** (0, 1, 0)              |
| final (the fix)     | 0 of 10                                       | 3 Chromium   | 0 / 0 of 1,440           | 0                            |
|                     |                                               | 3 Firefox    | 0 / 0 of 1,440           | 0                            |

Every failing browser batch followed `resize > pin > render`, the jsdom
sequence: for example Chromium at `scrollTop` 15,460 with the mounted rows
ending at 15,840 (the view ends at 16,360), and Firefox at 88,492.

### Classification (AC2): B, product defect

No painted frame failed, but both browsers committed the same window that
misses the viewport, through the same sequence: `scrollTo`, then a render
before the asynchronous scroll event. The issue's rule makes that a product
defect, not only a jsdom artifact. It was not painted because, in these
runs, the browser's scroll event and its synchronous re-render came before
the next frame; nothing in the grid guaranteed that order.

### Fix

In `ComparisonGrid.tsx` `pin()`, after its `scrollTo`:

- the virtualizer is given the read-back offset at once
  (`rowWindow.scrollOffset = element.scrollTop`), so the next render
  computes the window at the view the grid just moved to;
- the grid re-renders before the next paint. From the resize microtask it
  does so with `flushSync`; that is the same place `resizeItem` already
  notifies synchronously, outside any lifecycle method. From the layout
  effect it schedules a normal update, which React renders before paint.
  Without the synchronous render the browser probe painted 7–8 frames with
  rows missing: the scroll event, now a no-op for the virtualizer, no
  longer triggered the render;
- pins are updated before that render, so it does not scroll again. An
  earlier draft rendered first and moved the view twice (6 frames failing
  (b)).

What stays the same:

- #23 D2–D4 anchoring: `record`, the pins and `pin`'s delta are unchanged.
- #87: rows and cells still take one height per row per commit.
- No `flushSync` is added inside a lifecycle method. The full suite logs
  the same 125 "flushSync was called from inside a lifecycle method"
  warnings as before the fix, from the same five non-grid files.
- No ADR is needed: the change keeps §6.4/§9.1 virtualization and anchoring
  semantics and removes a transient wrong window.

### Regression (AC3)

`flows-grid.test.tsx` › "keeps the rows in view mounted in every commit while
rows above resize after a deep jump (#93)" observes every mutation batch
from the D1/D2 deep jump until the grid is settled. It fails on any batch
whose mounted rows do not cover the viewport, or that drops a loaded row
which was in view, and requires row 1310 mounted at the end.

| Code                                                   | Runs | Result                                                    |
| ------------------------------------------------------ | ---- | --------------------------------------------------------- |
| scratch copy, only `ComparisonGrid.tsx` from `decb56a` | 3    | **3 failed**: `top 68315: covered to 68607` (1–2 batches) |
| the fix                                                | 3    | 3 passed                                                  |

### D1/D2 test meaning (AC4)

The D1/D2 test is unchanged: same assertions, waits `10000`, limit `20000`.
The harness `scrollTo` stub still dispatches its scroll event in a
`setTimeout`. The anchoring, columns, hold and mixed-sign tests are
unchanged and pass.

### Stability (AC5)

At `9374bde`, two concurrent loops of 50 runs of `-t 'QA D1, D2'` in the
container (02:08:39–02:14:54, 100 runs, each run's log checked for
`1 passed`):

| Runs | Failures | 1-min load: start | Peak (20 s samples) | End  |
| ---- | -------- | ----------------- | ------------------- | ---- |
| 100  | 0        | 3.02              | 4.08                | 3.42 |

The AC1 probes at the final code: jsdom 0 of 10 runs with row 1310
unmounted; browser 0 failing frames and 0 failing batches in both projects
(table above).

### Commands (#93)

```sh
# AC3 regression, final and with only ComparisonGrid.tsx from decb56a (scratch copy), 3x each
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && npx vitest run src/services/mock/flows-grid.test.tsx -t "#93"'
# AC5: two of these loops at once, load sampled every 20 s
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && for i in $(seq 50); do npx vitest run src/services/mock/flows-grid.test.tsx -t "QA D1, D2" || echo FAIL $i; done'
# probes (temporary files, removed): jsdom probe test, and the browser spec per project
docker compose -p lca-diff-headroom exec -T workspace bash -lc 'cd apps/frontend && npx playwright test e2e/probe-93.spec.ts --project=chromium && npx playwright test e2e/probe-93.spec.ts --project=firefox'
```

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

**#76 AC3 again at `9374bde`.** Three consecutive quiet full runs (same
gate: load ≤ 2.0, no container above 50 % CPU):

| Run | Start load | End load | Tests      | Wall | ≥ 20 s test (QA D4) | ≥ 5 s budget (`settled`) | Anchoring `:183` |
| --- | ---------- | -------- | ---------- | ---- | ------------------- | ------------------------ | ---------------- |
| 1   | 1.56       | 4.13     | 412 passed | 47 s | 28.7 %              | 31.2 %                   | 28.7 %           |
| 2   | 1.95       | 3.42     | 412 passed | 41 s | 28.8 %              | 31.3 %                   | 25.6 %           |
| 3   | 1.92       | 3.38     | 412 passed | 42 s | 29.3 %              | 31.9 %                   | 31.2 %           |

All are within the AC3 targets (65 %, 65 %, 75 %); no wait was rejected.

In the container at `9374bde` (the #93 fix changes a product file, so full
e2e ran again):

| Check                                             | Result                |
| ------------------------------------------------- | --------------------- |
| `npm ci --no-audit --no-fund`, lockfile unchanged | pass (236 packages)   |
| `npm run format:check`, `lint`, `typecheck`       | pass                  |
| `npm run build`                                   | pass                  |
| `npm run test:e2e -- --grep @smoke`               | 14 passed (25.6 s)    |
| `npm run test:e2e`, both projects                 | 68 passed (2.9 min)   |
| Full unit suite                                   | 412 passed (33 files) |

The hosted `quality` run on the PR and a hosted `workflow_dispatch` full
run are recorded in the issue handoff.

## Residual risk

- **#93.** Fixed at `9374bde`. The browser probe saw the wrong window only
  in commits, never in a painted frame, so users were unlikely to see it;
  the fix removes the commit as well.
- **Two-suite margin: `flows-grid-anchoring.test.tsx:183`.** Its 1 s
  default wait is the closest budget under two suites. It reached
  **92.3 %** in QA's pair 3 B at `decb56a` (75–79 % in two other QA runs,
  61–63 % in mine), and 41–66 % in attempts 6–9 at `9374bde`. Above 90 %
  once, so listed here. Raising it is out of scope (#93); a further QA
  observation above 90 % would need its own issue.
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
