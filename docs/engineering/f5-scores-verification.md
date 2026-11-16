# F5 Scores verification — issue #28

Date: 2026-11-16. Phase 1, explicit synthetic/mock mode. Engineering evidence;
independent QA and hosted checks are recorded on issue #28 / the implementation PR.
No real API, Firebase, licensed data, LCIA calculation, publication or deployment
is exercised. Differences #29/#30, persistence/reconciliation #31/#32, async audit
#33, the full Phase 1 gate #34 and I1 real-service parity remain separate.

## Delivery and scope

Base: merged main `f5769bb`, after PR #88 / selector #27. F4 #26 and #27 are
closed; PM rechecked #28 READY before engineering. Branch `feat/f5-scores`:

- `77dbc2b`: Scores composition, provisional summaries/validated window queries,
  synthetic signed extrema and focused service/component/session/browser coverage.
- `1513c11`: browser actions hover the shared header to expose its remove control.

The grid reuses `ComparisonHeader`, `ComparisonGrid` and `SignedValueCell`.
`useScoreGrid` follows the existing paging/hold behavior without changing Flows.
Scores mounts while its tab is active; process and indicator selection remain in
shared providers. Exact provider values stay decimal strings, and only chart
geometry uses ratios. Null Category stays visually blank. Native method version,
indicator and unit metadata are retained; names establish no scientific equivalence.

`scoreSummaries` is provisional like `flowSummaries`; I1 must reconcile both with
generated OpenAPI DTOs and adapter parity/drift checks. Summaries cover the entire
selected set while row/cell reads use bounded windows. Every paged/windowed read
validates the immutable snapshot and comparison token before caching. The composed
auth guard forwards this new operation only for verified sessions and discards
pending successes after logout/account change.

## Criterion evidence

| Criterion | Engineering evidence |
| --- | --- |
| AC1 | Shared selection/store and headers; component reorder retains the row/summary query; browser pointer drag in Scores, tab switches and global header removal check order and value identity. |
| AC2 | Four sticky fields in required order. Component source labels deliberately oppose alphabetic order; browser selects alphabetically earlier synthetic indicator after GWP and verifies source order. Null Category renders an empty span. |
| AC3 | Every selected indicator is served for every selected process. Tests distinguish exact `0`, missing/unmapped fallback and `unresolved_basis`; N/A has no bar and carries a reason/cell warning. |
| AC4 | Shared signed geometry/cell/header components; precise mixed-sign component values, huge precision browser tooltip, readable process metadata and reference amount/unit warning. No quantity is rescaled. |
| AC5 | Query/service tests reject wrong snapshot/token in cells, summaries and row pages, reject a changed later-page token, abort all batches, preserve an old revision and enforce full-selection extrema. A 220-process × 230-indicator component fixture virtualizes both axes and pages/window-batches reads. Both browser projects inspect unchanged signed scale with the negative extreme offscreen. |
| AC6 | Browser verifies no-process guidance while keeping the default indicator, then select-an-indicator guidance with two processes retained, and the final no-process state with its indicator still selected. |

## Container environment and commands

Guarded project `lca-diff-f5-scores`, port 5199. Node 24.22.3, npm 11.19.1,
Playwright 1.65.1 and pinned Chromium/Firefox; no host installations. `./dev up`
and `./dev check` passed rootless namespace UID/GID 0 → parent 1000, dropped
capabilities, no-new-privileges, eight preflight regressions and frozen tooling.

Initial worktree `/tmp/lca-diff-f5-scores` was relocated, preserving Git state and
all edits, to `/home/david/projects/LCA-diff-AI-dev-project/.task-worktrees/f5-scores` after tmpfs
storage quotas caused EDQUOT writes. Only the task-owned container was recreated;
its guards were rechecked. Independent QA uses a separate sibling worktree,
project `lca-diff-f5-scores-qa`, port 5200. No unrelated worktree/container cleanup.

Run lifecycle commands in that host worktree; all development commands below run
inside its workspace container at `/workspaces/LCA-diff-AI-dev-project`:

```sh
COMPOSE_PROJECT_NAME=lca-diff-f5-scores FRONTEND_PORT=5199 ./dev up
COMPOSE_PROJECT_NAME=lca-diff-f5-scores FRONTEND_PORT=5199 ./dev check
docker compose -p lca-diff-f5-scores exec -T workspace bash -lc 'cd apps/frontend && npm ci --no-audit --no-fund'
docker compose -p lca-diff-f5-scores exec -T workspace bash -lc 'cd apps/frontend && npm run format:check && npm run lint && npm run typecheck && npm run build'
docker compose -p lca-diff-f5-scores exec -T workspace bash -lc 'cd apps/frontend && npx vitest run src/services/mock/scores-grid.test.tsx src/services/mock/scores-queries.test.ts src/app/session.test.tsx'
docker compose -p lca-diff-f5-scores exec -T workspace bash -lc 'cd apps/frontend && npm run test:unit'
docker compose -p lca-diff-f5-scores exec -T workspace bash -lc 'cd apps/frontend && npx vitest run src/services/mock/scores-grid.test.tsx src/services/mock/scores-queries.test.ts src/app/session.test.tsx src/services/mock/flows-grid.test.tsx src/services/mock/selection.test.tsx --maxWorkers=1'
docker compose -p lca-diff-f5-scores exec -T workspace bash -lc 'cd apps/frontend && npm run test:e2e -- --grep "@smoke|Scores windows keep|Flows shows the ordered union"'
```

Frozen frontend install: PASS. Static format/lint/types and explicit production
build: PASS, including after storage relocation. Focused Scores/query/session
checks: **25/25 PASS** before relocation. Post-relocation targeted Scores/auth plus
the existing Flows/selection failure files: **46/46 PASS**, one worker, 108.40 s.
Independent QA reports **55/55 focused cases** and **4/4 new Scores browser cases**
in Chromium/Firefox, plus static/build and a smaller-desktop keyboard probe; its
exact-SHA verdict is recorded separately on #28. After resuming the interrupted
session, the coordinator ran the documented combined browser command sequentially:
**20/20 PASS**, Chromium/Firefox, 42.7 s (critical smoke, both Scores journeys and
existing Flows ordered-union journey). No application or test changes followed
`1513c11`.

All four hosted checks passed at `1513c11`: frontend `quality` (run 43779293834),
`backend-quality` and `api-quality` (43779293773), and `etl-quality` (43779293787).
Frontend includes frozen install, static checks, the ordinary full unit suite,
build and critical browser smoke in both projects. Final documentation-head
hosted results and independent QA verdict belong to the issue/PR handoff;
pending results are never passes.

## Observed failures and recovery

The initial composed tests exposed an implementation omission: the explicit auth
guard method list did not forward `scoreSummaries`, leaving cells pending. Adding
the method fixed this; composed summary denial and pending logout/account-change
regressions now cover it. Raw service/query tests alone did not detect the omission.

New test development also corrected fixture/surface assumptions: select a loaded
category for bulk browser selection, use the active fixture revision, locate the
visual full-precision tooltip whose present-value text is intentionally aria-hidden,
assert loaded row identity after virtualized height changes, and hover a header
before clicking its normally hidden remove control. No assertion/time budget was
weakened. Browser runs before those corrections failed and are not passes.

The ordinary full local unit run returned **418/420 PASS**, two failed, in 129.88 s:
existing `flows-grid.test.tsx` deep scrolling remained pending at its 10 s inner
wait, and existing `selection.test.tsx` 300-selection keyboard/list case exceeded
its 30 s test limit. These files and their implementation were unchanged by #28;
existing #76 tracks headroom. The run coincided with storage/host contention; that
is context, not a proven root cause or a waiver. Focused Scores/session cases
passed in the same run. Successful targeted/hosted reruns do not erase these
observations. #91 remains the separate inherited hold/Retry observation; no
additional hold/Retry fix is claimed here.

The separate timing/geometry follow-up #76, with #87/#93 in PR #94, reached
independent QA/review while this session was interrupted. Its changes have not
been folded into #28; all local failures above remain part of this delivery's
record.

Initial later browser runs passed both large Scores extrema cases, while default
journeys failed at remove-control pointer interception; one diagnostic write also
reported EDQUOT. The task worktree/container were relocated before final browser
verification. Exact final outcomes and independent QA attribution belong to the
issue/PR handoff; this document does not certify QA.

A subsequent combined smoke run was interrupted after its preview files were
accidentally overwritten by engineering running a standalone `npm run build`
concurrently against the same `dist/`. Later pages correctly showed the fail-closed
service-configuration state rather than mock auth. This was a validation
orchestration error, not an attributed product regression. No such result is a
pass; final browser verification rebuilds mock mode and runs after standalone
builds finish. Independent QA used its own checkout and was unaffected.
