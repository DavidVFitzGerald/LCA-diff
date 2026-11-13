# Frontend GitHub backlog

Status: published planning baseline, 13 November 2026. All 30 frontend tasks are
open and dependency-blocked; no application implementation or test PASS is claimed.

Read [the roadmap](roadmap.md) and [AGENTS.md](../../AGENTS.md) for requirements
precedence, containers, role handoffs and completion gates. GitHub issue bodies
are the actionable plans; this index does not replace their criteria.

Review/publish baseline: [PR #35](https://github.com/DavidVFitzGerald/LCA-diff/pull/35).
The branch is pushed; forms require approved merge into `main` before GitHub's
issue chooser can use them. M2 final activation remains open in issue #3.

## Preparation and blockers

| Tracking issue | Current action |
| --- | --- |
| [#1](https://github.com/DavidVFitzGerald/LCA-diff/issues/1) — M0 baseline | Review/approve/merge the prepared documentation and Proposed ADRs; do not infer acceptance from issue creation. |
| [#2](https://github.com/DavidVFitzGerald/LCA-diff/issues/2) — M1 runtime gate | Rootless access is configured; verify the guarded namespace identity, single container-generated lock, clean-checkout/restart/ownership behavior and actual editor reopen. |
| [#3](https://github.com/DavidVFitzGerald/LCA-diff/issues/3) — GitHub execution setup | Labels/milestones/issues published; forms and PR guidance activate only after approved default-branch merge and chooser verification. |
| [#4](https://github.com/DavidVFitzGerald/LCA-diff/issues/4) — Review protection | GitHub API returns HTTP 403 requiring GitHub Pro or public visibility for this private repo. Maintainer decides; no billing/visibility change was made. Add real CI contexts once available. |

Planning/publication was authorized despite the pending M1 verification. Frontend
implementation starts at [#5](https://github.com/DavidVFitzGerald/LCA-diff/issues/5) only after [#2](https://github.com/DavidVFitzGerald/LCA-diff/issues/2) and [#3](https://github.com/DavidVFitzGerald/LCA-diff/issues/3)
are resolved. Native protection availability is tracked separately; it was not
silently enabled, waived, or represented as enforced.

## Milestones and tasks

All tasks use Task type/label plus frontend and blocked labels. Dependencies
below are implementation predecessors, not every related scope/follow-up link.
Each issue also requires the verified environment and merged bootstrap baseline.
Re-groom before starting; do not treat a later slice's drafted interfaces as frozen.

### [F1 — Frontend foundation and service contracts](https://github.com/DavidVFitzGerald/LCA-diff/milestone/2) — 6 tasks

| Key | Issue | Blocking predecessors |
| --- | --- | --- |
| F1-01 | [#5 — scaffold the container-run React frontend and quality commands](https://github.com/DavidVFitzGerald/LCA-diff/issues/5) | [#3](https://github.com/DavidVFitzGerald/LCA-diff/issues/3), [#2](https://github.com/DavidVFitzGerald/LCA-diff/issues/2) |
| F1-02 | [#6 — define provisional service contracts and synthetic precision fixtures](https://github.com/DavidVFitzGerald/LCA-diff/issues/6) | [#5](https://github.com/DavidVFitzGerald/LCA-diff/issues/5) |
| F1-03 | [#7 — implement asynchronous mock discovery and selection services](https://github.com/DavidVFitzGerald/LCA-diff/issues/7) | [#6](https://github.com/DavidVFitzGerald/LCA-diff/issues/6) |
| F1-04 | [#8 — implement revision-consistent mock comparison and indicator services](https://github.com/DavidVFitzGerald/LCA-diff/issues/8) | [#6](https://github.com/DavidVFitzGerald/LCA-diff/issues/6) |
| F1-05 | [#9 — compose mock services with TanStack Query and an enforced UI boundary](https://github.com/DavidVFitzGerald/LCA-diff/issues/9) | [#7](https://github.com/DavidVFitzGerald/LCA-diff/issues/7), [#8](https://github.com/DavidVFitzGerald/LCA-diff/issues/8) |
| F1-06 | [#10 — add containerized Playwright smoke and required frontend CI checks](https://github.com/DavidVFitzGerald/LCA-diff/issues/10) | [#9](https://github.com/DavidVFitzGerald/LCA-diff/issues/9) |

### [F2 — Application shell and simulated authentication](https://github.com/DavidVFitzGerald/LCA-diff/milestone/3) — 5 tasks

| Key | Issue | Blocking predecessors |
| --- | --- | --- |
| F2-01 | [#11 — build the direct application shell and accessible locked login dialog](https://github.com/DavidVFitzGerald/LCA-diff/issues/11) | [#10](https://github.com/DavidVFitzGerald/LCA-diff/issues/10) |
| F2-02 | [#12 — implement deterministic mock authentication account and session scenarios](https://github.com/DavidVFitzGerald/LCA-diff/issues/12) | [#10](https://github.com/DavidVFitzGerald/LCA-diff/issues/10) |
| F2-03 | [#13 — connect mock login, registration, verification and password-reset flows](https://github.com/DavidVFitzGerald/LCA-diff/issues/13) | [#11](https://github.com/DavidVFitzGerald/LCA-diff/issues/11), [#12](https://github.com/DavidVFitzGerald/LCA-diff/issues/12) |
| F2-04 | [#14 — guard protected queries through session restoration and account changes](https://github.com/DavidVFitzGerald/LCA-diff/issues/14) | [#11](https://github.com/DavidVFitzGerald/LCA-diff/issues/11), [#12](https://github.com/DavidVFitzGerald/LCA-diff/issues/12) |
| F2-05 | [#15 — verify complete mock authentication and accessible shell journeys](https://github.com/DavidVFitzGerald/LCA-diff/issues/15) | [#13](https://github.com/DavidVFitzGerald/LCA-diff/issues/13), [#14](https://github.com/DavidVFitzGerald/LCA-diff/issues/14) |

### [F3 — Discovery and process selection](https://github.com/DavidVFitzGerald/LCA-diff/milestone/4) — 4 tasks

| Key | Issue | Blocking predecessors |
| --- | --- | --- |
| F3-01 | [#16 — render the paginated release and nested process tree](https://github.com/DavidVFitzGerald/LCA-diff/issues/16) | [#15](https://github.com/DavidVFitzGerald/LCA-diff/issues/15), [#7](https://github.com/DavidVFitzGerald/LCA-diff/issues/7) |
| F3-02 | [#17 — add reactive AND-tokenized process search with cancellation](https://github.com/DavidVFitzGerald/LCA-diff/issues/17) | [#16](https://github.com/DavidVFitzGerald/LCA-diff/issues/16), [#18](https://github.com/DavidVFitzGerald/LCA-diff/issues/18) |
| F3-03 | [#18 — manage individual selection order and a virtualized selected-process list](https://github.com/DavidVFitzGerald/LCA-diff/issues/18) | [#16](https://github.com/DavidVFitzGerald/LCA-diff/issues/16) |
| F3-04 | [#19 — implement filter-scoped bulk selection and tri-state parent checkboxes](https://github.com/DavidVFitzGerald/LCA-diff/issues/19) | [#17](https://github.com/DavidVFitzGerald/LCA-diff/issues/17), [#18](https://github.com/DavidVFitzGerald/LCA-diff/issues/18) |

### [F4 — Shared comparison grid and Flows](https://github.com/DavidVFitzGerald/LCA-diff/milestone/5) — 7 tasks

| Key | Issue | Blocking predecessors |
| --- | --- | --- |
| F4-01 | [#20 — Add snapshot-consistent flow windows and whole-row chart summaries](https://github.com/DavidVFitzGerald/LCA-diff/issues/20) | [#19](https://github.com/DavidVFitzGerald/LCA-diff/issues/19) |
| F4-02 | [#21 — Build shared process headers and comparability warnings](https://github.com/DavidVFitzGerald/LCA-diff/issues/21) | [#20](https://github.com/DavidVFitzGerald/LCA-diff/issues/20) |
| F4-03 | [#22 — Implement exact signed-bar geometry and full-precision value tooltips](https://github.com/DavidVFitzGerald/LCA-diff/issues/22) | [#20](https://github.com/DavidVFitzGerald/LCA-diff/issues/20) |
| F4-04 | [#23 — Virtualize comparison rows and columns with sticky alignment](https://github.com/DavidVFitzGerald/LCA-diff/issues/23) | [#20](https://github.com/DavidVFitzGerald/LCA-diff/issues/20), [#21](https://github.com/DavidVFitzGerald/LCA-diff/issues/21), [#22](https://github.com/DavidVFitzGerald/LCA-diff/issues/22) |
| F4-05 | [#24 — Assemble the Flows comparison with exact missingness and cell warnings](https://github.com/DavidVFitzGerald/LCA-diff/issues/24) | [#23](https://github.com/DavidVFitzGerald/LCA-diff/issues/23) |
| F4-06 | [#25 — Add shared column drag, keyboard reorder and global removal](https://github.com/DavidVFitzGerald/LCA-diff/issues/25) | [#24](https://github.com/DavidVFitzGerald/LCA-diff/issues/24) |
| F4-07 | [#26 — Verify large Flows comparisons and record the milestone gate](https://github.com/DavidVFitzGerald/LCA-diff/issues/26) | [#25](https://github.com/DavidVFitzGerald/LCA-diff/issues/25) |

### [F5 — Scores, differences and workspace completion](https://github.com/DavidVFitzGerald/LCA-diff/milestone/6) — 8 tasks

| Key | Issue | Blocking predecessors |
| --- | --- | --- |
| F5-01 | [#27 — Add the indicator tree and source-ordered selection state](https://github.com/DavidVFitzGerald/LCA-diff/issues/27) | [#26](https://github.com/DavidVFitzGerald/LCA-diff/issues/26) |
| F5-02 | [#28 — Assemble windowed Scores with valid and unavailable cell states](https://github.com/DavidVFitzGerald/LCA-diff/issues/28) | [#27](https://github.com/DavidVFitzGerald/LCA-diff/issues/27) |
| F5-03 | [#29 — Implement exact on-demand difference queries in mock services](https://github.com/DavidVFitzGerald/LCA-diff/issues/29) | [#28](https://github.com/DavidVFitzGerald/LCA-diff/issues/28) |
| F5-04 | [#30 — Wire independent difference toggles and canonical query caching](https://github.com/DavidVFitzGerald/LCA-diff/issues/30) | [#29](https://github.com/DavidVFitzGerald/LCA-diff/issues/29) |
| F5-05 | [#31 — Persist the versioned account-scoped workspace](https://github.com/DavidVFitzGerald/LCA-diff/issues/31) | [#30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30) |
| F5-06 | [#32 — Reconcile restored IDs and publication changes atomically](https://github.com/DavidVFitzGerald/LCA-diff/issues/32) | [#31](https://github.com/DavidVFitzGerald/LCA-diff/issues/31) |
| F5-07 | [#33 — Complete comparison loading, recovery and accessibility states](https://github.com/DavidVFitzGerald/LCA-diff/issues/33) | [#32](https://github.com/DavidVFitzGerald/LCA-diff/issues/32) |
| F5-08 | [#34 — Record full mock-frontend acceptance and the Phase 1 gate](https://github.com/DavidVFitzGerald/LCA-diff/issues/34) | [#33](https://github.com/DavidVFitzGerald/LCA-diff/issues/33) |

## Coverage and evidence ownership

| Required behavior | Owning issues |
| --- | --- |
| Toolchain, quality scripts/CI and container Playwright Chromium/Firefox | [#5](https://github.com/DavidVFitzGerald/LCA-diff/issues/5), [#10](https://github.com/DavidVFitzGerald/LCA-diff/issues/10) |
| Typed contracts, precision fixtures, asynchronous mock discovery/comparison, query boundary | [#6](https://github.com/DavidVFitzGerald/LCA-diff/issues/6), [#7](https://github.com/DavidVFitzGerald/LCA-diff/issues/7), [#8](https://github.com/DavidVFitzGerald/LCA-diff/issues/8), [#9](https://github.com/DavidVFitzGerald/LCA-diff/issues/9) |
| Shell/modal, simulated registration/reset/verification and guarded session/account lifecycle | [#11](https://github.com/DavidVFitzGerald/LCA-diff/issues/11), [#12](https://github.com/DavidVFitzGerald/LCA-diff/issues/12), [#13](https://github.com/DavidVFitzGerald/LCA-diff/issues/13), [#14](https://github.com/DavidVFitzGerald/LCA-diff/issues/14), [#15](https://github.com/DavidVFitzGerald/LCA-diff/issues/15) |
| Hierarchical discovery, ordered/retained selection, AND search and paged filtered bulk actions | [#16](https://github.com/DavidVFitzGerald/LCA-diff/issues/16), [#18](https://github.com/DavidVFitzGerald/LCA-diff/issues/18), [#17](https://github.com/DavidVFitzGerald/LCA-diff/issues/17), [#19](https://github.com/DavidVFitzGerald/LCA-diff/issues/19) |
| Snapshot windows, all-selection extrema, signed geometry, exact labels and two-axis virtualization | [#20](https://github.com/DavidVFitzGerald/LCA-diff/issues/20), [#22](https://github.com/DavidVFitzGerald/LCA-diff/issues/22), [#23](https://github.com/DavidVFitzGerald/LCA-diff/issues/23) |
| Shared headers, amount-or-unit warnings, Flows states and column actions | [#21](https://github.com/DavidVFitzGerald/LCA-diff/issues/21), [#24](https://github.com/DavidVFitzGerald/LCA-diff/issues/24), [#25](https://github.com/DavidVFitzGerald/LCA-diff/issues/25), [#26](https://github.com/DavidVFitzGerald/LCA-diff/issues/26) |
| Indicator hierarchy/default/source order and unavailable Scores | [#27](https://github.com/DavidVFitzGerald/LCA-diff/issues/27), [#28](https://github.com/DavidVFitzGerald/LCA-diff/issues/28) |
| Lazy exact difference services, independent toggles and revision-aware caching | [#29](https://github.com/DavidVFitzGerald/LCA-diff/issues/29), [#30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30) |
| UID-scoped browser fields, stale IDs/publication recovery, loading/errors/accessibility | [#31](https://github.com/DavidVFitzGerald/LCA-diff/issues/31), [#32](https://github.com/DavidVFitzGerald/LCA-diff/issues/32), [#33](https://github.com/DavidVFitzGerald/LCA-diff/issues/33) |
| Full Phase 1 evidence gate, browser/workload limitations and Phase 2 handoff | [#34](https://github.com/DavidVFitzGerald/LCA-diff/issues/34) |

Two PM role agents prepared the task bodies; independent QA reviewed scope, all
required Task sections, specification coverage and the acyclic dependency graph.
Reported overlap in difference predicates and search/browser dependencies was
corrected before final publication. That documentation review is not application
QA, container-runtime evidence, CI execution, approval/merge or readiness.

## Working the backlog

PM rechecks prerequisites and posts READY only after actual blockers resolve.
Engineer implements one session-sized issue, commits focused increments, and
hands the SHA and exact container checks to QA. QA reports PASS/FAIL/BLOCKED per
criterion. Coordinator closes only after QA, required checks and approved merge.
Keep blocked labels/comments current as predecessors close; split oversized work
and link follow-ups instead of silently changing criteria.

No Bug issue was invented for unimplemented behavior. Use the Bug form when an
actual existing-behavior defect is found. Backend, real Firebase/API integration,
ETL/publication and deployment remain roadmap B1–B4/I1/R1–R2, not new issues here.
