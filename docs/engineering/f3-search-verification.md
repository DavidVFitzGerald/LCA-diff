# F3 search verification — reactive AND-tokenized process search (#17)

Status: engineering evidence on branch `feat/f3-search`, based on `main` at
`a7b529b` (#16 and #18 merged). The delivered SHA, independent QA verdict and
hosted CI runs are recorded in the #17 handoff. This is mock evidence only: it
does not prove real search performance or server-side matching parity (I1).
No product/specification deviation or ADR is introduced.

## Environment and commands

Rootless workspace, Compose project `lca-diff-f3-search` (`FRONTEND_PORT=5190`);
same toolchain and browsers as the [#16 record](f3-process-tree-verification.md).
No dependency changes.

```sh
COMPOSE_PROJECT_NAME=lca-diff-f3-search FRONTEND_PORT=5190 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f3-search FRONTEND_PORT=5190 ./dev check
docker compose -p lca-diff-f3-search exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund && npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build && npm run test:e2e -- --grep @smoke && npm run test:e2e'
```

## Results

| Check | Result |
| --- | --- |
| `./dev check`, frozen `npm ci` (232 packages, lockfile unchanged) | PASS |
| format:check, lint, typecheck, build | PASS |
| test:unit | PASS, 212 tests in 15 files (3 consecutive runs) |
| test:e2e `@smoke` | PASS, 10 cases |
| test:e2e full | PASS, 32 cases (16 × Chromium/Firefox) |

## Acceptance criteria evidence

| AC | Evidence | Layer |
| --- | --- | --- |
| AC1 default field, labelled advanced fields, AND | `services/mock/process-search.test.tsx` › Process Name default, Advanced disclosure with four labelled fields, one control per field; normalized multi-field DTO, root-scoped single-release requests, only the leaf matching every token and field; `process-search.spec.ts` › Process Name "road service" + Geography "de" → Beta | Component, browser |
| AC2 debounce and race safety | `process-search.test.tsx` › a four-keystroke burst issues one search per release; the slow superseded query's signal is aborted and its late response never replaces newer results | Component |
| AC3 matching leaves and expanded ancestors; states keep selections | `process-search.test.tsx` › exact matching counts, ancestors expanded, zero-match release row, "No processes match your search.", loading row, error → Retry recovery with the selection unchanged; browser "gamma" shows only Gamma's path, expanded, counts 1 | Component, browser |
| AC4 Clear resets and restores; no persistence | `process-search.test.tsx` › every field emptied, focus to Process Name, prior unfiltered expansion restored, selection kept, no local/session storage; browser Clear restores the collapsed tree with Gamma still selected and no new storage keys | Component, browser |
| AC5 whitespace, case, multiword, field AND, punctuation, races, no matches | `fields.test.ts` › trim/collapse, empty omission, literal case and punctuation; `process-search.test.tsx` › `STEEL.*` matches literally, `steel.+` does not, `(diesel)` matches, whitespace-only means no filter; `model.test.ts` › zero-match release count | Unit, component |

**Component-only notes:** debounce, cancellation races, failures and large
filtered paging use injected mocks in jsdom; the browser uses the three-process
demo catalog. Matching is the mock service's (trim, lowercase, whitespace
tokens, literal substring AND); I1 must prove the real search's parity.

`e2e/f2-gate.spec.ts` now passes through the Process Name field and the
Advanced search toggle.
