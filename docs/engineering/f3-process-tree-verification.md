# F3 process tree verification — lazily paged release and nested process tree (#16)

Status: engineering evidence on branch `feat/f3-process-tree`, based on `main`
at `1f82774`. The delivered SHA, independent QA verdict and hosted CI runs are
recorded in the #16 handoff and QA comment. This is mock evidence only: it does
not prove real search performance, authentication, authorization or data
security. No product/specification deviation or ADR is introduced.

## Environment and versions

Rootless workspace, Compose project `lca-diff-f3-tree` (`FRONTEND_PORT=5186`).
Node `v24.22.3`, npm `11.19.1`, Vitest `5.1.0`, Playwright `1.65.1`, Chromium
`159.0.8154.6`, Firefox `159.0`. Safari/WebKit remains UNAVAILABLE (see the
[F2 record](f2-verification.md)). New dependency: `@tanstack/react-virtual`
`3.14.24` (exact pin; its `@tanstack/virtual-core` `3.19.9`). The lockfile diff
is limited to those two packages; frozen `npm ci` installs 232 packages.

## Commands

```sh
COMPOSE_PROJECT_NAME=lca-diff-f3-tree FRONTEND_PORT=5186 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f3-tree FRONTEND_PORT=5186 ./dev check
docker compose -p lca-diff-f3-tree exec -T workspace bash -lc 'npm --prefix apps/frontend ci --no-audit --no-fund'
docker compose -p lca-diff-f3-tree exec -T workspace bash -lc 'cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build'
docker compose -p lca-diff-f3-tree exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --grep @smoke'
docker compose -p lca-diff-f3-tree exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e'
```

## Results

| Check | Result |
| --- | --- |
| `./dev check` | PASS |
| Frozen `npm ci` | PASS, 232 packages |
| format:check, lint, typecheck, build | PASS |
| test:unit | PASS, 185 tests in 11 files (stable over 5 consecutive runs) |
| test:e2e `@smoke` | PASS, 10 cases (5 × Chromium/Firefox) |
| test:e2e full | PASS, 28 cases (14 × Chromium/Firefox) |
| Hosted PR `quality` / full dispatch run | Recorded in the #16 handoff |

## Acceptance criteria evidence

Component scenario tests live in `src/services/mock/process-tree.test.tsx`,
not beside the component as the readiness note suggested, because the ESLint
boundary forbids mock imports outside `src/services/**` and
`src/app/composition.ts` (D9 keeps that rule intact).

| AC | Evidence | Layer |
| --- | --- | --- |
| AC1 roots and scoped loading | `model.test.ts` › six-segment verbatim paths, identical paths in two releases distinct; `process-tree.test.tsx` › roots collapsed with name/version, single-release `branch_path` search DTO with `limit` 50; `process-tree.spec.ts` | Unit, component, browser |
| AC2 paging and stable merge | `model.test.ts` › dedupe across pages/scopes, out-of-scope counts ignored, order independent of load order; `process-tree.test.tsx` › 120 leaves page 50 → 100 → 120 with the same DOM nodes, unique keys, continuation removed when exhausted | Unit, component |
| AC3 keyboard, ARIA, virtualization | `process-tree.test.tsx` › Arrow/Home/End/Enter, Space unbound, `aria-level`/`aria-setsize` (incl. `-1`)/`aria-posinset`, one `tabindex=0`, focus to collapsed ancestor; 2,000 leaves keep mounted rows ≤ viewport + overscan + active row and keyboard End scrolls the active row into view; `process-tree.spec.ts` › visible focus ring, levels 1–6, ArrowLeft to parent, counts 3/3/1 | Component, browser |
| AC4 states and cancellation | `process-tree.test.tsx` › loading under latency, empty catalog, empty release, releases and page `TEMPORARILY_UNAVAILABLE` then Retry keeping loaded nodes, `STALE_SNAPSHOT` without Retry, collapse aborts in-flight page silently and re-expand refetches, signout during/after load leaves no tree text or `lca-services` cache, re-login (same/different UID) starts collapsed with no storage; `process-tree.spec.ts` › signout clears tree text, re-login collapsed, no new storage keys | Component, browser |
| AC5 boundaries and duplicates | `model.test.ts` › duplicate branch labels and same-name/geography processes distinct; existing lint boundary test passes; no component imports `services/mock/**` | Unit, lint |

Every browser case asserts no fetch/XHR, `/api/` or external requests and no
console/runtime errors. `f2-gate.spec.ts` now passes through the tree's single
tab stop between the Scores tab and the process-sidebar toggle.

**Component-only evidence (D9):** the composed demo catalog has 3 processes,
so continuation, latency, failure and large-catalog DOM bounds are proven only
in jsdom with stubbed scroller geometry. A browser-reachable large synthetic
scenario is carried to #23 and the F3 gate (#19 AC6).

## Implementation notes

- Rows have a fixed height (`TREE_ROW_HEIGHT` 32 px); row offsets and the sizer
  height derive from row index, and keyboard moves scroll the active row to the
  nearest edge directly. The virtualizer only selects the mounted range.
- A collapsed branch keeps its already loaded pages in component state for
  stable names and counts; its in-flight query is aborted. State is discarded
  when the tree unmounts on signout or account change and is never persisted.
