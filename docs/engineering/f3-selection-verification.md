# F3 selection verification — ordered selection and virtualized selected list (#18)

Status: engineering evidence on branch `feat/f3-selection`, based on `main` at
`4e8126e` (#16 merged). The delivered SHA, independent QA verdict and hosted CI
runs are recorded in the #18 handoff. This is mock evidence only: selection is
in-memory and does not prove persistence (F5), authorization or real data. No
product/specification deviation or ADR is introduced.

## Environment and commands

Rootless workspace, Compose project `lca-diff-f3-selection`
(`FRONTEND_PORT=5188`); same toolchain and browsers as the
[#16 record](f3-process-tree-verification.md). No dependency changes.

```sh
COMPOSE_PROJECT_NAME=lca-diff-f3-selection FRONTEND_PORT=5188 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f3-selection FRONTEND_PORT=5188 ./dev check
docker compose -p lca-diff-f3-selection exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:e2e -- --grep @smoke && npm run test:e2e'
```

## Results

| Check | Result |
| --- | --- |
| `./dev check`, frozen `npm ci` (232 packages, lockfile unchanged) | PASS |
| format:check, lint, typecheck, build | PASS |
| test:unit | PASS, 200 tests in 13 files (3 consecutive runs) |
| test:e2e `@smoke` | PASS, 10 cases |
| test:e2e full | PASS, 30 cases (15 × Chromium/Firefox) |

## Acceptance criteria evidence

| AC | Evidence | Layer |
| --- | --- | --- |
| AC1 append order, idempotence, removal everywhere, reappend | `selection.test.ts` › append/repeat/reappend, rapid toggles; `services/mock/selection.test.tsx` › list removal unchecks the tree row, reselect appends; `e2e/selection.spec.ts` › Gamma, Alpha, Beta order, keyboard removal and reselect | Unit, component, browser |
| AC2 survives collapse, paging and hidden rows | `selection.test.tsx` › selections across a "Load more" page remain checked and listed after collapsing the release root; a hidden entry is removable and its row is unchecked on re-expansion | Component |
| AC3 coherent count, checkbox and list; Clear all | `selection.test.tsx` › heading count, `aria-checked`, list text and posinset/setsize; Clear all unchecks every row, leaves tree expansion unchanged and announces the count; browser Clear all | Component, browser |
| AC4 bounded rendering, labels, removal and keyboard focus | `selection.test.tsx` › 300 entries mount ≤ viewport + overscan + active row; one tab stop; End scrolls the last item in; focus moves to the next/previous item after removal and to the empty-state text when the list empties; browser Tab order, ArrowDown and Enter removal with visible focus ring | Component, browser |
| AC5 hidden items, rapid toggles, duplicates, clear, empty state, shared API | `selection.test.ts` › `move` for F4 reorder, immutable snapshots, no cap (5,000 entries); `selection.test.tsx` › duplicate names get release-qualified removal names, empty state, signout/account change discard selection with no storage | Unit, component |

**Filtering (D8):** search arrives in #17. Here AC2 is proven by independence
from tree visibility; the search-filter retention journey belongs to #17
(AC3/AC4).

**Component-only notes:** jsdom does not synthesize button clicks from Enter or
Space, so component tests click the focused remove button; the browser test
proves real keys. Large-list bounds are component evidence; the browser uses
the three-process demo catalog.

`e2e/f2-gate.spec.ts` now passes through the "Selected processes (0)" button
(Clear all is disabled while empty) and matches the "Processes" heading
exactly. Tree component tests share `src/services/mock/test-harness.ts`.
