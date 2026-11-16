# F5 indicator selector verification — issue #27

Date: 2026-11-15. Branch: `feat/f5-indicator-tree`, PR #88. Application delivery:
`9d0037e00e2c9444bf6af02b5ea69d195d403e43` after merging current main
`af5317d` (subsequent evidence-only commits do not change executable files). Independent QA and merge status are recorded on
[#27](https://github.com/DavidVFitzGerald/LCA-diff/issues/27).

## Scope and scheduling

The maintainer authorized #27 alongside F4 verification. Its service/auth/selection
prerequisites #8/#9/#15/#19 and M1/M2 are merged. Scores-grid integration #28 still
requires **both #26 and #27**. During delivery, the maintainer merged #26 /
PR #78 at `af5317d`; that F4 delivery is inherited unchanged. This selector slice
does not complete F5.

The UID-keyed workspace mounts an indicator provider even while Flows is active.
It obtains published releases and the hierarchy/default through typed service
queries, initializes defaults once, and exposes source-ordered selection through
`useIndicators`. The Scores sidebar provides method/category descendant actions,
mixed checkbox state, keyboard disclosure and one tree tab stop. Existing process
selection/order is independent. No persistence, real adapter, Scores grid,
scientific transformation, dependency upgrade or Flows-grid change is included.

## Environment and commands

Isolated worktree `/tmp/lca-diff-f5-indicators`; guarded rootless Compose project
`lca-diff-f5-indicators`, frontend port 5197. Namespace UID/GID 0 map to host
UID/GID 1000, all capabilities dropped, no-new-privileges. `./dev check` passed
all eight preflight scenarios, frozen Python lock/toolchain and workspace writes.
Node 24.22.3, npm 11.19.1, Playwright 1.65.1; pinned Chromium and Firefox projects.
No host dependencies were installed and the F4 project was not reconfigured.

Run from this worktree on the Docker host:

```sh
COMPOSE_PROJECT_NAME=lca-diff-f5-indicators FRONTEND_PORT=5197 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f5-indicators FRONTEND_PORT=5197 ./dev check
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck'
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npx vitest run src/services/mock/indicator-tree.test.tsx'
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npm run test:unit -- --maxWorkers=2 && npm run build'
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- e2e/indicator-tree.spec.ts'
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --grep @smoke && npm run test:e2e'
```

## Criterion evidence

| Criterion | Evidence |
| --- | --- |
| AC1 — verified-only default, zero processes | `indicator-tree.test.tsx` initializes only GWP 100 with process count 0; its injected-service spy verifies no indicator calls/render before verified authentication and an eager call while Flows is active. Browser spec checks the default before selecting processes. |
| AC2 — hierarchy, disclosure and tri-state | Component cases cover one roving tab stop, arrow/End/Space behavior, native flat IPCC hierarchy, optional category, mixed method/category parents and source positions. Browser spec exercises keyboard disclosure/selection in both projects; child groups are owned by their parent treeitems. |
| AC3 — full descendants, native flat layout | Component cases select/deselect category/method descendants and check mixed-to-full parent transitions; GWP 100 is a level-2 child directly under IPCC, with no invented category. |
| AC4 — source order and process independence | Component fixture uses labels opposite source order, clicks later before earlier, and verifies canonical IDs including the default; adding a process preserves IDs. The provider never reads process selection/order. |
| AC5 — recovery preserving choices | A deferred read verifies loading keeps selections; failure/empty/retry preserve indicator IDs and process count, recovery does not re-default deliberately cleared choices. The account-isolation case verifies collapse/tab retention, reset for another UID and empty query cache on logout. |

Legacy discovery-only component harnesses now answer an empty typed indicator tree
instead of retaining a separately signed-out composed mock adapter. The F2 shell
and session harnesses likewise supply their own indicator response. Shell tests
expect catalog/default reads after verified login and await initialization before
synchronous logout. Unauthenticated zero-call assertions remain intact.

## Results and limitations

The original default full
parallel unit run during implementation exposed the existing 300-selection and
deep-scroll budget pressure tracked in #76 (300 selections: 32.5 s against 30 s),
along with an early shell-harness synchronization defect subsequently corrected.
No timeouts or assertions were weakened. The constrained full run uses the same
suite and limits with two workers; hosted `quality` retains normal concurrency.

| Check | Result |
| --- | --- |
| Rootless environment / frozen npm install | PASS; eight preflight scenarios, `npm ci` installed 236 packages. |
| Format/lint/type, final merged branch | PASS. |
| New selector component cases | PASS 5/5. |
| Merged-branch selector + App + session focused suite | PASS 27/27, unchanged limits. |
| Explicit merged-branch production build | PASS. |
| Indicator browser spec, Chromium + Firefox | PASS 2/2; independently repeated by QA. |
| Small `@smoke` suite before F4 merge | PASS 12/12. The inherited F4 smoke case is covered by final hosted quality. |
| Optional full browser suite before F4 merge | 64/66 PASS; all 33 Chromium cases pass. Firefox pointer edge-auto-scroll exceeded 30 s; large-grid row visibility exceeded 5 s. |
| Targeted rerun of those two Firefox cases, after main merge | PASS 2/2 in 49.3 s, no timeout/assertion changes. |
| Complete two-worker unit run before main merge | 405/408 PASS. Three existing bare-grid anchoring/hold cases failed; this is not a passing full run. |
| Sequential targeted rerun of those three unit cases | 2/3 PASS; the hold-error Retry assertion still fails and is tracked in [#91](https://github.com/DavidVFitzGerald/LCA-diff/issues/91). |
| Hosted checks at application predecessor `6c823c8` | All four PASS: frontend `quality` (normal full unit + smoke/build/static), `backend-quality`, `api-quality`, `etl-quality`. Final-head hosted outcomes remain recorded on PR #88 before review. |

The three constrained-run failures were `flows-grid-anchoring.test.tsx`:
“re-anchors on the flows in view when every recorded flow is removed (O8)” and
“keeps the previous comparison through an error during the hold and restores the
anchor on Retry”, plus `flows-grid.test.tsx`: “keeps the same flows in view and
focused when processes are removed or added while deep (QA D1, D2)”. Their
unchanged harness renders bare `FlowsGrid`, without App or IndicatorProvider.
The first and third pass in the sequential rerun; #91 tracks the remaining
transient-state assertion without assuming a product root cause. Host load
reached 18.08 during broad checks. #76 already tracks large-test headroom; no
existing timeout, assertion or application behavior was changed to hide a failure.

Exact targeted reruns:

```sh
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npx vitest run --maxWorkers=1 src/services/mock/flows-grid-anchoring.test.tsx src/services/mock/flows-grid.test.tsx -t "re-anchors on the flows in view when every recorded flow is removed|keeps the previous comparison through an error during the hold|keeps the same flows in view and focused"'
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --project=firefox e2e/column-operations.spec.ts e2e/flows-grid.spec.ts --grep "a pointer drag auto-scrolls|220 ×"'
docker compose -p lca-diff-f5-indicators exec -T workspace bash -lc 'cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npx vitest run --maxWorkers=1 src/services/mock/indicator-tree.test.tsx src/App.test.tsx src/app/session.test.tsx && npm run build'
```

Mock/synthetic behavior only. These checks do not prove real authentication,
authorization, API performance, publication or production data security. Scores
rendering remains #28, persistence #31, stale/publication reconciliation #32 and
complete Phase 1 acceptance #34. F4 verification stays with #26 and its owner.

Independent QA also ran the #91 single case sequentially in the same QA
container on current main `af5317d` (PASS, 14.8 s) and merged application
`9d0037e` (PASS, 9.94 s). This comparison establishes no deterministic selector
regression; it does not erase the two engineering observations or close #91.
