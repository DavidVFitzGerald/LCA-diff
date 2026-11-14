# F3 verification: discovery, bulk selection and the F3 gate (#19)

Status: engineering evidence on branch `feat/f3-bulk-selection`, based on `main`
at `b5704da` (#16, #17 and #18 merged). The #19 handoff records the delivered
SHA, the independent QA verdict and the hosted CI runs. F3 is complete only
after this PR passes QA and CI and is merged.

This is mock evidence only. It does not prove real selection resolution (B2),
real-backend performance or adapter parity (I1). This PR introduces no product
or specification deviation and no ADR. There are no contract or dependency
changes.

Earlier F3 records:

- [process tree (#16)](f3-process-tree-verification.md)
- [ordered selection (#18)](f3-selection-verification.md)
- [search (#17)](f3-search-verification.md)

## Environment and commands

Rootless workspace, Compose project `lca-diff-f3-bulk` (`FRONTEND_PORT=5192`).
The toolchain and browsers are the same as in the #16 record.

```sh
COMPOSE_PROJECT_NAME=lca-diff-f3-bulk FRONTEND_PORT=5192 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f3-bulk FRONTEND_PORT=5192 ./dev check
docker compose -p lca-diff-f3-bulk exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:e2e -- --grep @smoke && npm run test:e2e'
```

## Results

| Check                                                             | Result                                           |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `./dev check`, frozen `npm ci` (232 packages, lockfile unchanged) | PASS                                             |
| format:check, lint, typecheck, build                              | PASS                                             |
| test:unit                                                         | PASS, 234 tests in 17 files (3 consecutive runs) |
| test:e2e `@smoke`                                                 | PASS, 12 cases                                   |
| test:e2e full                                                     | PASS, 36 cases (18 each in Chromium and Firefox) |

## Design as delivered (readiness D1–D8)

- **Query layer.** `queries.resolveAll` follows every `resolveSelection` cursor with a 100-item window. `queries.headersFor` batches header reads by 100. Both are cancellable `queryOptions`. The window bounds each request, never the total selection.
- **Selection store.** `SelectedProcess.path` records the category path. `selectMany` appends only absent entries in the given order, with one notification. `deselectMany` removes keys with one notification.
- **Bulk scopes.**
  - Branch rows (release root, category, subcategory) resolve `scope: "branch"` with the current normalized fields.
  - While a filter is active, **Select all matches** and **Deselect all matches** resolve `all_matching` for each release.
  - A branch with no eligible processes is a no-op that stays unchecked. It is not exposed as `aria-disabled`, because that would also disable expanding the row.
- **Bulk ordering.** New entries are sorted by lowercased name, then geography, then ID (spec §6.3) and appended after the existing selection.
- **Tri-state parents.**
  - A branch's state compares selected entries inside the actionable scope with the branch's exact `count`: checked, mixed (`aria-checked="mixed"`) or unchecked.
  - While filtering, an entry counts only if it is in the release's matching-ID set. That set is resolved only for releases that have selections; until it arrives, the loaded matching leaves are used and the row is `aria-busy`.
- **Interaction.** Space or a click on the checkbox bulk-toggles a branch. The toggle decides select vs deselect from the resolved scope at run time: it deselects only when every resolved ID is already selected. A pending or failed tri-state read therefore cannot invert it (QA F-1). While a bulk action runs, branch checkboxes are dimmed and inert, and the status area names the running action and offers Cancel. Enter, the arrow keys and a click on the label still expand and collapse.
- **Async states.**
  - Only one bulk action runs at a time. The status area shows progress and Cancel.
  - Selection changes only after every read succeeds, and then all at once.
  - If the filtered matching-set read for a release fails, its rows stop being busy, and a notice says checkbox states there may be incomplete, with Retry (QA F-1).
  - Cancel, failure, signout or an account change leave the selection unchanged. The failure message says "Selection unchanged: …", with Retry when the error is retryable, and Dismiss.

## Acceptance criteria evidence (#19)

| AC                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Layer                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| AC1: all eligible IDs across cursors and unmounted rows | `services/mock/bulk-selection.test.tsx` › a 260-leaf branch with one 50-row tree page loaded selects all 260 through three resolve windows and three header batches; all matches across two releases                                                                                                                                                                                                                                                                                                                                                                  | Component                |
| AC2: hidden selections kept; Clear changes scope only   | `bulk-selection.test.tsx` › filtered branch deselect keeps the hidden non-matching selection, and Clear turns the branch from checked into mixed without changing the selection; `bulk-selection.spec.ts` › Deselect all matches keeps the hidden Beta                                                                                                                                                                                                                                                                                                                | Component, browser       |
| AC3: tri-state relative to scope                        | `scope.test.ts` › `checkState`, `selectedByScope`; component › root, category and subcategory `true`, `mixed` and `false` both filtered and unfiltered; browser › root, operations and infrastructure states                                                                                                                                                                                                                                                                                                                                                          | Unit, component, browser |
| AC4: order kept, no duplicates, no cap                  | `selection.test.ts` › `selectMany` order and duplicate handling, 50,000 entries; `scope.test.ts` › `bulkOrder`; component › Zulu and Beta kept first, then Alpha/CH, alpha/CH, alpha/DE; browser › Gamma, then Alpha and Beta                                                                                                                                                                                                                                                                                                                                         | Unit, component, browser |
| AC5: loading, cancellation and errors coherent          | component › progress and Cancel abort the signal with the selection unchanged; a second action is ignored while one runs; resolve then header failures report "Selection unchanged" and Retry recovers; non-retryable errors hide Retry; signout mid-action applies nothing; a shared matching-set read recovers after Cancel; a failed matching-set read is explained with Retry and the toggle still deselects a fully selected scope; a filter change mid-run keeps the starting scope; an account change mid-run applies nothing; Cancel during the details phase | Component                |
| AC6: F3 gate                                            | `e2e/f3-gate.spec.ts` (`@smoke`) › arrow-key tree expansion, Space on a process, keyboard search with Advanced Geography, Space bulk toggles on a filtered branch, Clear keeps the list and the parent becomes mixed, signout clears; plus the #16–#18 suites                                                                                                                                                                                                                                                                                                         | Browser                  |

## F3 roadmap gate coverage

| Gate item                                     | Evidence                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Filtered bulk selection beyond a visible page | AC1 component test (260 leaves, 50 loaded)                             |
| Selection and order retention                 | #18 record, AC4 above, `process-search.spec.ts`, `f3-gate.spec.ts`     |
| Tri-state controls                            | AC3 above                                                              |
| Empty and no-results states                   | #16 and #17 records (empty release, "No processes match your search.") |
| Keyboard operation                            | #16 tree keyboard, #18 list keyboard, `f3-gate.spec.ts`                |

## Known gaps and follow-ups

- Mock resolution does not show real-backend cost. B2 must resolve selection server-side without fetching cell values.
- Tree pseudo-row `aria-posinset`/`aria-setsize` remains tracked in #52, and the flaky `AuthDialog` focus assertion in #51.
- A cancelled bulk resolve that shares its key with a tri-state matching-set query is refetched for active observers, so the parent state recovers.
