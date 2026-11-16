# LCA diff implementation roadmap

Status: 2026-11-16 — local-only MVP revision (accepted ADR 0006, #95). Remaining
MVP path: L1 → L2 → L3. Milestone status means verified delivery, not merely
written plans.

## Authority and delivery policy

Read [AGENTS.md](../../AGENTS.md), the [PRD](../product/LCA_diff_PRD.md), and the
[implementation specification](LCA_diff_Implementation_Specification.md) before
working. Specification references below use its section numbers. Approved,
merged ADRs on `main` take precedence as described in §0.2.

Every deviation requires an ADR and synchronized updates to both current PRD and
specification in the same PR; follow [the ADR workflow](../adr/README.md).
Historical archive/reference folders are excluded from agent context and searches
under root `AGENTS.md`. The initial ADRs record this governance and the previously
requested frontend-first order; ADR 0003 records the rootless workspace identity.
All three were accepted through the maintainer's merge of
[PR #35](https://github.com/DavidVFitzGerald/LCA-diff/pull/35), commit
`f809b179c5c54f47be32ec7b24a9abce36b64982`; see the ADR index for attribution.

This roadmap follows the maintainer's requested order instead of §12's suggested
sequence: workflow → roadmap → dev environment → GitHub issues → complete mock
frontend → backend → real frontend integration → production readiness. ADR 0005
allowed backend/frontend overlap. Accepted ADR 0006 then narrows the MVP to a
local, single-command, end-to-end application: workflow → environment → issues →
F1–F5 Scores and B1–B4 (delivered) → **L1 stack → L2 real adapter → L3
differences and acceptance** → post-MVP hosted release. Scientific requirements
and the required stack are unchanged.

All tools, installs, builds and tests run in containers. Nothing is installed on
the host without permission. Use the stack and repository layout in §3; choose
compatible pinned versions during environment setup, not by guessing here.

Milestones are larger than issues. The maintainer has explicitly requested all
F1–F5 issues now; keep later phases at roadmap level. Use Task and Bug forms and
recheck readiness before each task starts. Every implementation/fix after bootstrap needs
an issue before starting. Each issue must fit one session including checks,
commits and handoff; normally it produces one PR. Split by an independently
verifiable outcome rather than by arbitrary file count. A milestone is complete
only when its gate has evidence and associated issues are resolved through the
PM → Software Engineer → QA → review/merge workflow. Blocked is not complete.

## Current position

**Local-only MVP revision (accepted [ADR 0006](../adr/0006-local-only-mvp.md),
[#95](https://github.com/DavidVFitzGerald/LCA-diff/issues/95); accepted through the
maintainer's merge of PR #98 at `cf7f1d5` on 2026-11-16).** The maintainer removed deployment from the MVP
on 2026-11-16. The MVP is reached when the app runs locally end to end from one
command: the frontend calls the real API, data persists in PostgreSQL, and login
uses the Firebase Auth Emulator. B1–B4 and F1–F4 plus F5 #27/#28 are delivered.
The remaining work is three sequential implementation issues, one PR each:

| Step | Issue | Outcome | Depends on |
| --- | --- | --- | --- |
| L1 | [#96](https://github.com/DavidVFitzGerald/LCA-diff/issues/96) | `./dev app-up` / `make up` starts Postgres, migrations, synthetic seeded/published release, Auth Emulator with demo user, API and frontend; data persists | ADR 0006 merged (#95, PR #98 `cf7f1d5`) |
| L2 | [#97](https://github.com/DavidVFitzGerald/LCA-diff/issues/97) | Real HTTP + Firebase-emulator adapters, OpenAPI-generated DTOs with drift check, real-stack Playwright smoke | L1 |
| L3 | [#30](https://github.com/DavidVFitzGerald/LCA-diff/issues/30) (re-scoped) | Differences toggles on the real API; local MVP acceptance including one opt-in representative BAFU import | L2 |

Deferred to post-MVP (label `post-MVP`, milestone Post-MVP):
- #29 exhaustive mock difference predicates.
- #31 workspace persistence.
- #32 stale-ID/publication reconciliation.
- #33 state/accessibility audit.
- #34 mock-only Phase 1 gate.

Cloud deployment (former R1) and full-data release validation (former R2) also
move post-MVP. Open frontend Bugs #51, #91 and #85 are unchanged. Fix flaky
required tests when they block L1–L3 merges.

**Accepted sequencing revision:** [ADR 0005](../adr/0005-parallel-backend-delivery.md)
([#55](https://github.com/DavidVFitzGerald/LCA-diff/issues/55)) records the
maintainer's request to overlap B1–B4 with F3–F5, using exactly one issue and one
PR per backend milestone. PR #56 merged at `125b090` with explicit maintainer
authorization; this replaces the Phase 1 start
gate and session-sized splitting policy for those four milestones only. Work may
span sessions with incremental commits and criterion checklists. The existing
frontend backlog is unchanged. Keep tests focused on meaningful MVP behavior
under §9.2; no scientific, security, publication or release gate is waived.
Use isolated worktrees and container projects/ports/volumes, preserve frontend
files/contracts and coordinate shared root tooling/locks/CI/documentation.
Backend issues are published: B1 [#57](https://github.com/DavidVFitzGerald/LCA-diff/issues/57),
B2 [#58](https://github.com/DavidVFitzGerald/LCA-diff/issues/58),
B3 [#59](https://github.com/DavidVFitzGerald/LCA-diff/issues/59),
B4 [#60](https://github.com/DavidVFitzGerald/LCA-diff/issues/60).
B1 PR #61 is merged into `main` at `f790803`. B2 PR #70 and B3 PR #72 passed
independent QA and hosted CI. Their initial merges targeted predecessor feature
branches; recovery [PR #82](https://github.com/DavidVFitzGerald/LCA-diff/pull/82)
delivered the unchanged reviewed B2/B3 code to `main` at `9b0ebba` after independent
QA and hosted CI. The maintainer confirmed merge; #58, #59 and recovery #81 are
closed. See [delivery recovery](backend-delivery-recovery.md).
B4 #60 was delivered through [PR #86](https://github.com/DavidVFitzGerald/LCA-diff/pull/86),
merged to `main` at `f0e2f9c` after independent QA and hosted checks; its operator
workflow is documented in [B4 publication](b4-publication.md).

| Milestone | Status | Dependency |
| --- | --- | --- |
| M0 — workflow and roadmap | Baseline merged in PR #35 | None |
| M1 — container development environment | QA passed; runtime/editor evidence merged in PR #35 | M0 baseline merged |
| M2 — GitHub execution setup | Forms/PR guidance and activation merged; #4 solo protection proposal in review | M0/M1 delivered; main protection waits for approved ADR 0004 |
| F1 — frontend foundation | Complete: #5–#10 merged; final PR #44 at `9612943`, independent QA and hosted CI passed | M2 activation delivered; protection tracked separately in #4 |
| F2 — shell and simulated authentication | Complete: #11–#15 merged after independent QA and hosted CI (final PR #49 at `1f82774`) | F1 complete; each task's issue dependencies |
| F3–F5 — remaining mock frontend journeys | F3 complete: #16–#19 merged after independent QA and hosted CI (final PR #62 at `d3fddb1`). F4 complete: #20–#25, #64 and #69 merged after independent QA and hosted CI; gate #26 (PR #78, `af5317d`) recorded in [F4 verification](f4-verification.md) after blockers #75, #77 and #79 merged. F5: #27 merged through PR #88 at `f5769bb` and #28 Scores merged through PR #92 at `d4827c5`, each after independent QA and hosted CI. Under ADR 0006 #30 became L3 and #29, #31–#34 are post-MVP | F2 completion and each task's issue dependencies |
| B1–B4 — Phase 2, backend and ingestion | B1 #57 / PR #61 merged; B2 #58 and B3 #59 delivered to main through recovery PR #82 after QA/CI; B4 #60 / PR #86 merged at `f0e2f9c` after QA/CI | M1/M2 and accepted ADR 0005, then milestone gates below |
| L1 — single-command local stack (#96) | Delivered in PR #100 at `41c6b14`; #96 closed | ADR 0006 merged (PR #98, `cf7f1d5`); B1–B4 delivered |
| L2 — real adapter and Auth Emulator (#97), replaces I1 locally | Delivered in PR #105, merged at `cd6d8a6`; #97 closed after independent QA and all five hosted jobs passed | L1 delivered in PR #100 at `41c6b14` |
| L3 — differences toggles and local MVP acceptance (#30) | Not started | L2 |
| PM1 — hosted release: infrastructure/deployment (former R1) | Post-MVP | L3; maintainer scheduling |
| PM2 — full-data validation and hosted release (former R2) | Post-MVP | PM1 |
| PM3 — deferred frontend completion (#29, #31–#34) | Post-MVP | L3 |

M0–M2 are the explicitly authorized documentation/environment bootstrap exception
to issue-first execution. When M2 opens initial issues, record roadmap/environment
work already performed as such; do not fabricate earlier issue or QA history.
Role agents were not used for the original roadmap preparation. For M2, the PM
role agents groom the requested frontend backlog and QA reviews the plans. This
does not constitute application QA or make dependency-blocked issues ready.

## Preparation

### M0 — workflow and roadmap

Scope: root instructions, three role documents, Task/Bug source forms, this
roadmap, and their cross-references. Establish ADR governance without creating
architecture decisions unnecessarily. The renamed PM role is
[product-manager.md](../team/product-manager.md).

Gate: consistent documents reviewed against §§0, 3, 9 and the requested delivery
sequence; no product code or host installation introduced. Track approved/merged
status separately from local commits. This milestone does not activate GitHub forms.

### M1 — container development environment

Scope: Remote-SSH-compatible `.devcontainer/`, pinned toolchain images, Compose
profiles, sanitized environment examples, ignore rules for secrets/private inputs,
and setup instructions. Verify host Docker/Compose availability; ask before
installing any missing host prerequisite. Plan compatible Python/uv/Airflow/Spark
and frontend toolchains, including Playwright browsers inside containers.

Start with a workspace usable for Phase 1 without API, Postgres, Firebase or cloud
credentials. Establish the single uv workspace/lock and compatible dependency
resolution as bootstrap tooling where feasible without implementing Python
packages or services. Record any compatibility blocker; propose an ADR before
introducing separate projects/locks. Do not fabricate packages to make a lock or
check look complete. Backend runtime services and migrations belong to Phase 2.

Document container invocations and introduce the §3.1/§3.3 Make flows as their
underlying components become runnable. In particular, do not advertise a passing
`make import` or backend suite before those exist. No product shell/endpoints,
ETL logic or production resources in this setup step.

Gate: rebuild/open the workspace from a clean checkout using documented steps;
prove the required tool versions and container lifecycle work, bind mounted files
have usable permissions, shutdown/restart works, and no dependencies landed on
the host. Record unavailable checks as blockers. Frontend tooling must be ready
before F1; later profiles can be added in their own issues.

Bootstrap evidence and commands are tracked in
[development-environment.md](development-environment.md). Compose configuration
validation passed, and rootless Docker is now accessible. The workspace uses
namespace UID 0 mapped to the unprivileged host account under the guards in ADR
0003; runtime, lock, ownership, restart and clean-checkout checks passed against
committed candidate `a9399aa`. The maintainer supplied successful output in response
to the requested editor-reopen check; this is attributed user evidence rather than
agent-observed GUI interaction. M1's QA-passed delivery is merged in PR #35.
M2 chooser activation is now maintainer-verified; #3 records the final handoff.

### M2 — GitHub execution setup

Scope: inspect existing repository issues/labels/settings; activate synchronized
copies of the two source forms in `.github/ISSUE_TEMPLATE/`; verify/create Task
and Bug labels. Verify the existing ADR index/workflow; establish PR handoff guidance and roadmap
links as small documentation tasks if not already present. Configure relevant
review/CI protection when permissions and working checks permit; report any
admin-access blocker. Do not declare nonexistent checks required or successful.

Gate: forms work in GitHub, programmatic bodies contain their required sections,
bootstrap work is recorded honestly, and the requested F1–F5 backlog is groomed
with dependencies, criteria, container verification and role handoffs. Form
activation requires approved default-branch merge; issue publication alone does
not satisfy it. No product implementation precedes the applicable M1/M2 gates.
Do not expand backend or post-MVP milestones into issues yet.

## Phase 1 — complete frontend using mock services

### F1 — frontend foundation and service contracts

Depends on M2. Establish React/TypeScript/Vite, TanStack Query, the frontend lock,
Vitest/React Testing Library and containerized Playwright smoke tooling. Introduce
applicable PR checks with this first executable slice.

Define a single typed services boundary for specification §7 operations and auth.
Use provisional DTOs consistent with eventual OpenAPI: decimal strings, distinct
missing states, stable IDs, revisions, cursors/windows, safe errors and cancellation.
Select mock/real mode at one configuration boundary. Implement asynchronous mock
services with small deterministic synthetic fixtures; do not create a real API.
Components/hooks cannot import fixtures or call HTTP/Firebase directly.

Gate: a container-built frontend can exercise the mock boundary without any
backend/cloud dependency; contract/fixture tests cover precision and missingness,
and typecheck/unit/build/browser smoke checks run in CI. Later generated DTO
migration is explicitly reserved for I1.

Current delivery evidence: #5–#10 are merged. The maintainer merged final
[PR #44](https://github.com/DavidVFitzGerald/LCA-diff/pull/44) at `9612943`
after independent QA PASS and hosted quality/full-suite CI PASS recorded in #10.
The [F1 verification record](f1-verification.md) describes commands and coverage.
This completes the F1 foundation gate; product authentication remains F2 work.

### F2 — application shell and simulated authentication

Depends on F1. Build the direct `/` shell, centered accessible login modal,
non-interactive background, tabs, collapsible sidebar layout and desktop-required
state. Simulate login, registration, email verification, password reset, persistent
session restoration, expiry/revocation, logout and errors behind the auth service.
Clearly identify mock/demo mode. Do not fetch/render dataset content before mock
verified authentication or flash the modal while resolving a valid session.

Gate: keyboard/focus behavior and all simulated auth states have component and
browser evidence; logout/account switching clears protected in-memory state and
query caches. These checks do not prove real identity/security enforcement.

#11 (shell), #12 (mock auth), #13 (account forms) and #14 (session lifecycle)
are merged after independent QA and hosted CI. #15 consolidates the gate in the
[F2 verification record](f2-verification.md): browser and component evidence,
versions, accepted component-only transitions and real-auth checks deferred to
B2/I1. #15 passed QA and hosted CI and was merged (PR #49, `1f82774`);
the F2 milestone is complete.

### F3 — discovery and process selection

Depends on F2. Implement release/category/nested-subcategory tree, AND-tokenized
substring search across allowed fields, debounce/cancellation and no-results state.
Selection survives filtering. Bulk actions affect all matching descendants, not
just mounted/paged items; parent checkboxes reflect actionable scope. Add selected
list, deterministic append/bulk ordering, removal and clear behavior without an
arbitrary selection limit.

Gate: tests cover filtered bulk selection beyond a visible page, selection/order
retention, tri-state controls, empty/no-results states and keyboard operation.

### F4 — shared comparison grid and Flows

Depends on F3. Implement shared headers/metadata, sticky identifiers, synchronized
scrolling, row/column virtualization, drag/keyboard-accessible column operations,
windowed reads and cancellation. Flows align by ID plus type, sort per §6.4 and
show affected-cell warnings. Preserve absent versus zero and exact tooltip values.
Implement the shared signed-bar geometry from §6.6, including mixed-sign variable
row height, labels, accessibility and striping. Warn on reference amount OR unit
mismatch without changing values.

Gate: golden synthetic cases verify sorting, signs, zero/absence, exact labels,
geometry and warnings. A deterministic hundreds-of-columns fixture demonstrates
bounded rendered cells, windowed reads, sticky alignment and responsive controls;
record environment/workload evidence rather than inventing an SLA.

### F5 — Scores, differences and workspace completion

Current handoff (2026-11-16): F4 #26, selector #27 (PR #88, `f5769bb`) and
Scores #28 (PR #92, `d4827c5`) are merged/closed after independent QA and hosted
checks; see [Scores verification](f5-scores-verification.md). **Closed by
ADR 0006:** the differences toggles move to L3 (#30, re-scoped against the real
API). #29, #31, #32, #33 and #34 are post-MVP; their bodies are kept for later
re-grooming. F5's mock-delivered scope is therefore complete for the MVP. The
text below is the original F5 plan, kept for reference.

Depends on F4 for integrated Scores-grid delivery. Maintainer-authorized exception
(2026-11-15, #27): the independent indicator selector may overlap ongoing F4
verification, using merged #8/#9/#15/#19 service/auth/selection foundations. #28
requires both #26 and #27; no F4/F5 completion or product/scientific scope change
is implied. Selector work uses its own branch/worktree and container project.
Add method/category/indicator selection, source ordering, IPCC 2021
GWP 100 default and valid/missing/unresolved score states. Reuse grid/bar behavior.
Add independent differences toggles: initially off, disabled/reset below two
processes, exact comparisons on demand, order-independent cache reuse and revision
invalidation. Persist only the specified UID-scoped workspace fields; handle
stale selections and account changes. Complete loading/error/empty/retry states,
accessible controls, browser coverage and manual UAT (§9.3's UI scenarios).

Former Phase 1 gate (post-MVP #34 under ADR 0006; no longer a prerequisite of
L2): every MVP UI journey works with deterministic synthetic mocks;
Vitest, typecheck/build and Playwright pass in containers. Check Chromium and
Firefox, Safari as practicable, large grids and account isolation. Record a
UI/spec coverage checklist and remaining real-integration checks. A mock demo is
not a published BAFU release or a completed MVP. Under accepted ADR 0005 B1–B4
may overlap this work; I1 waited for this gate until ADR 0006 removed that prerequisite. Performance and integration
are rechecked later.

## Phase 2 — backend, ingestion and connection

### B1 — Python domain, schema and release contracts

Depends on verified M1/M2 and accepted ADR 0005. One issue and one PR for all B1.
Implement the single uv workspace packages, shared
Pydantic boundaries/config, SQLAlchemy schema and Alembic migrations under §4.
Use exact decimals, deterministic versioned flow keys, immutable revisions,
release-scoped staging and self-contained provenance. Enforce publication-pointer
membership in its release and protect published values. Add local Postgres
profile and separate runtime/ETL dependencies. Establish Ruff/MyPy/pytest,
Loguru context and local dotenv precedence checks.

Gate: clean-DB migrations and targeted Postgres tests prove constraints,
precision, revision isolation and provenance; frozen locks and applicable Python
quality checks pass. Data model readiness does not assert actual import success.

Implementation in [#57](https://github.com/DavidVFitzGerald/LCA-diff/issues/57) /
[PR #61](https://github.com/DavidVFitzGerald/LCA-diff/pull/61) adds the shared
member, single constrained uv lock, full schema and immutable publication guards,
safe API views/roles, isolated Postgres and backend CI. Local container checks
pass (9 unit cases, 5 database scenarios, Ruff/MyPy and compatible API/ETL
resolver probes); independent QA passed and the maintainer merged PR #61 at
`f790803`. Issue #57 is closed. See
[B1 verification](b1-verification.md) for commands, scope and B2/B3/B4 handoff.

### B2 — read API and real authorization

Delivered to `main` through recovery PR #82 at `9b0ebba`, preserving the reviewed
PR #70 implementation. Independent QA and all hosted checks passed; #58 is
closed. See [B2 verification](b2-verification.md) and the recovery record for the
original test evidence and subsequent main-delivery evidence.

Depends on B1. One issue and one PR for all B2. Implement §7 endpoints with validated DTOs and safe error envelopes,
indexed/batched reads, cursor/window budgets, revision snapshots and on-demand
exact differences. Firebase Admin verifies identity/email status; enforce published
release visibility and least-privilege read access. Use disposable synthetic data
and Firebase Auth Emulator in public CI. Add liveness/readiness, correlation IDs,
logging and no-sensitive-payload checks.

Gate: endpoint, auth, invalid-input, unpublished-data denial, snapshot and query
behavior pass unit/Postgres/targeted integration tests. Export valid OpenAPI for
I1. API tests must not depend on proprietary data or production Firebase accounts.

Carried from F2 QA (#13/#14): reconcile the reset unknown-account error with
Firebase email-enumeration protection, and map real 401/403 to the frontend
`AUTH_REQUIRED`/`EMAIL_NOT_VERIFIED` codes.

### B3 — miniature golden ingestion and LCIA reconciliation

Implementation was delivered in
[#59](https://github.com/DavidVFitzGerald/LCA-diff/issues/59) /
[PR #72](https://github.com/DavidVFitzGerald/LCA-diff/pull/72), originally stacked on B2.
The actual bounded Spark/Airflow pipeline, private source staging and full-row
audits, conservative score reconciliation and portable candidate artifact are
implemented. Focused golden/failure and actual Airflow integration pass; the
representative private validation retains unverified score bases as N/A; detailed
findings remain local. This is not full corpus validation. Independent final-SHA
QA and hosted checks passed; recovery PR #82 delivered it to main at `9b0ebba`
with the maintainer's confirmed merge. Issue #59 is closed; see
[B3 verification](b3-verification.md) and [operator workflow](b3-ingestion.md).

Depends on B1; B2 may proceed independently after B1. One issue and one PR for all
B3. Introduce private Airflow
and ETL profiles, segregated metadata, portable local Spark entry point and
manifest/CLI/DAG contracts. No Airflow Docker socket requirement. Archive bytes,
stage all original records, resolve references, preserve/aggregate duplicates,
classify groups, exclude multi-output processes and report invalid inputs.

Then extract workbook headers/rows, preserve cell types, reconcile deterministically
with curated overrides, and apply only verified score-basis rules. Unverified
scores remain N/A. Generate all §5.8 reports even after failed imports, including
complete original A:AY rows for every flagged workbook row and resolved anomaly.
Use synthetic/golden fixtures publicly; supplied samples only when their location,
availability and redistribution rights have been verified.

Gate: miniature DAG/CLI runs reproducibly and produces exact harmonized candidates,
constituent provenance, safe fallbacks/gates, full audit rows and deterministic
reports. Test quantity AND unit conversion direction, missing scores, malformed
XML, exclusions and matching ambiguities. Neither five samples nor synthetic data
prove full BAFU import completeness.

### B4 — promotion, atomic publication and rollback

Implementation is in draft PR #86 under #60 on `feat/b4-publication`, preserving one
issue and one PR. The CLI, immutable target archive transfer, transactional audit,
publication/rollback and synthetic B2 visibility checks are implemented locally.
See [operator commands](b4-publication.md) and [verification](b4-verification.md).
Do not mark complete until final-SHA independent QA, hosted checks and merge.

Depends on B3; the API visibility gate also requires B2. One issue and one PR for
all B4. Implement readiness gates, checksummed artifacts, self-contained
promoted provenance and authenticated maintainer operations. Prepare/run/promote
do not publish; publish atomically changes the active revision pointer. Test
rollback, retries/idempotence and failed/interrupted operations in disposable
local environments. Verify API visibility through B2 before integration handoff.

Gate: an end-to-end synthetic candidate can be validated, promoted, explicitly
published and rolled back without partial/mixed visibility, lost audit history,
or dependence on local-only staging FKs. Actual production publication still
requires the release gates and explicit approval below.

## Local MVP — single command, end to end (ADR 0006)

One issue and one PR per milestone, in sequence. Each issue body carries detailed
criteria and container verification. Each uses an isolated worktree and container
project, and coordinates shared root tooling (`compose.yaml`, `dev`, `Makefile`,
CI). Keep mock mode independently runnable throughout.

### L1 — single-command local stack with a seeded synthetic release (#96)

Depends on ADR 0006 (merged in PR #98 at `cf7f1d5`); B1–B4 are delivered. Add `./dev app-up` / `make up`,
`./dev app-down` and a confirmed `./dev app-reset`. The stack:
- starts Postgres (named volume);
- runs a one-shot migrate-and-seed task (never migrations on API startup) that
  idempotently seeds and publishes a committed synthetic release with the same
  immutable revision/publication semantics as B4;
- starts the Auth Emulator with a seeded local-only verified demo account;
- starts the API as `lca_api` with explicit local CORS, and the frontend.

Ports bind to localhost. Document the opt-in private BAFU import into the same
database with the B3/B4 commands.

Gate: from a clean checkout the single command yields healthy services. An
emulator-token request returns the seeded release, and unauthenticated/unverified
requests are denied. Data survives down/up, and reset recreates a clean seed. Seed
idempotence and decimal round-trip are tested. The README quick start is current.

Delivery (engineering, awaiting QA): `compose.app.yaml` with its own project and
volumes, `./dev app-up|app-down|app-reset --yes|app-status|app-logs|app-smoke|app-import`
and `make up`/`make down`. The committed invented seed is `data_pipeline/seed/`, a pre-built
B3 artifact loaded only through B4 with fixed operation IDs. The tests are `make
backend-test-seed` and the container-run `./dev app-smoke`. In L1 the stack frontend is
still an explicit mock-mode build; L2 switches it to the real adapters.

### L2 — real adapter, generated contracts and Auth Emulator (#97)

Replaces I1 for the local MVP. Depends on L1; the former Phase 1 gate is no longer
a prerequisite. Generate frontend DTOs from FastAPI OpenAPI into
`packages/contracts/` with reproducible drift checks. Replace provisional types
deliberately and verify mock/real adapter parity. Implement the HTTP and Firebase
JS SDK (emulator) adapters behind the existing services boundary and select them
through explicit validated configuration; never fall back silently to mocks. The
L1 stack runs the frontend in real mode. Derive exact positive/negative extrema
from B2's whole-selection `NumericSummary` carried on row pages, replacing the
provisional extra summary methods without changing the stateless §7 API.

Gate: login (demo and newly registered, emulator-verified), search, bulk select,
reorder and Flows/Scores comparison work against the L1 stack. Exact decimals,
zero/absence and N/A survive. No protected calls before login; 401/403 and
expiry/revocation lock the shell and clear caches. Misconfiguration shows an
explicit error. A real-stack Playwright smoke passes (per-PR CI if reliable on
hosted runners; otherwise a documented local check with a tracked gap).

Carried from F2 (#14/#15), applies in L2:
- browser-level expiry/revocation/401/403 journeys with the Auth Emulator;
- signout-failure UX for unverified sessions when the adapter emits no new state;
- no lock/unlock cycling when the adapter re-emits the same verified state against a persistent server 401/403.

See [F2 verification](f2-verification.md).

L2 delivery evidence: [real integration verification](l2-verification.md).
Generated types, adapter parity, real-mode proxy wiring and the five-journey
emulator/PostgreSQL browser suite are implemented. Final clean-clone QA and
hosted CI status are recorded on #97. PR #105 merged at `cd6d8a6`; #97 is closed.

### L3 — differences toggles and local MVP acceptance (#30)

Depends on L2. Add independent Flows/Scores "Show differences only" toggles backed
by the API's exact `differences_only` reads. Toggles start off, are disabled/reset
below two processes, and are not persisted. Cached eligibility is
order-independent and invalidated by membership, indicator or revision changes.
Mock mode gets only a minimal exact-string predicate for deterministic tests.
Then accept the MVP locally: §9.3 UAT journeys (except restoration) and the
real-stack smoke with a differences step. Run one opt-in import of the
representative private BAFU manifest into the local app, keeping evidence private.
Record everything in `local-mvp-verification.md`.

Gate (**local MVP definition of done**, specification §12): from a clean clone,
`./dev app-up` alone yields a working app in which an emulator-verified user can
log in, search, bulk-select, compare Flows and Scores from PostgreSQL, toggle
differences, reorder/remove columns, and find data persisted after restart. All
applicable per-PR checks pass. Remaining post-MVP gaps are listed explicitly.

## Post-MVP — hosted release and deferred completion

Not scheduled. Keep at milestone level and do not start without a new maintainer
instruction. These milestones retain the former R1/R2 contracts so that the
hosted release still meets specification §§3.2, 8 and 9.

### PM3 — deferred frontend completion

#29 exhaustive mock difference predicates, #31 UID-scoped workspace persistence,
#32 stale-ID/publication reconciliation, #33 state/accessibility audit, #34
full frontend acceptance/coverage checklist. Re-groom against the real adapter
before starting; #34's evidence becomes part of PM2.

### PM1 (former R1) — infrastructure and operational readiness

Depends on L3 for integrated staging acceptance; documentation/estimates can be
tracked earlier without provisioning production. Implement Terraform and separate
frontend/API Docker deployments to Cloud Run, Cloud SQL connectivity, private
GCS archives, Artifact Registry, Secret Manager, IAM, backups/deletion protection,
monitoring and budgets, and a production Firebase project. Keep Airflow/Spark local. Run migrations as a
controlled task, never implicitly on API startup. Document import/report/rule
approval, promotion/publication/rollback, restore and credential-revocation flows.

Gate: fmt/validate, reviewed plans/images, reproducible staging deployment,
backup/restore and rollback evidence, access/logging checks and smoke tests are
available. Production Terraform applies/deployments need maintainer approval;
this roadmap is not permission to incur cloud costs or publish data.

### PM2 (former R2) — full-data validation and hosted release

Depends on B3, B4, L3 and PM1. Obtain the actual complete XML manifest/workbook,
confirm hosting/redistribution rights and release metadata, and verify source
reconciliation/basis rules. Run full ingestion privately, inspect every report,
resolve critical issues and sign off the LCIA audit. Validate the real manifest
rather than treating the approximate 11,947 count as a correctness oracle.

Gate: full unit, PostgreSQL/Spark/Airflow integration, migration regression,
Playwright desktop E2E, audit-schema and performance suites pass; §§9.2–9.3 have
recorded evidence. Benchmark actual dev-laptop/Cloud SQL workloads with hardware,
release, row counts and network documented. No known MVP-critical failures remain.
With manifest/hash/migration previews and explicit maintainer approval, deploy
and atomically publish the ready release; run deployed smoke checks and retain
rollback capability. Only then claim the hosted-release definition of done (the
local MVP's definition of done is L3's gate).
Missing data/license/evidence blocks release, not unrelated synthetic development.

## Specification and test coverage ownership

The issue bodies will carry detailed checks. This table prevents milestone-level
scope loss; test numbers refer to the 19 mandatory behaviors in §9.2.

| Contract | Local MVP owners | Post-MVP owners | §9.2 behaviors |
| --- | --- | --- | --- |
| Governance, stack, environment, tiered CI (§§0, 3, 9) | M0–M2; F1/B1 checks; L1 single-command stack; L2 drift/real smoke | PM1–PM2 release gates | All applicable checks |
| UI, identity state and account isolation (§§6.1, 6.8, 8) | F2 mock; B2/L2 real (emulator); L3 acceptance | PM3 persistence (#31/#32) | 13, 17 |
| Search, bulk selection, ordering, grid, warnings (§§6.2–6.4, 9.1) | F3–F5; B2/L2; L3 acceptance | PM2 benchmarks | 17–18 |
| Scores, signed bars, exact differences (§§6.5–6.7) | F1/F4/F5; B2; L3 toggles | PM3 #29 mock predicates | 7, 15–16 |
| Schema, decimals, isolation, provenance (§4) | B1/B3/B4; L1 seed; L2 wire precision | — | 2–3, 11–12, 14 |
| XML mapping, duplicates, reference resolution, exclusion (§§1–2, 5.1–5.5) | B3; L3 opt-in representative import | PM2 full manifest | 1–6 |
| Workbook matching, verified basis, full-row audits (§§5.6–5.8) | B3 | PM2 audit signoff | 7–10 |
| Read API, snapshots, errors, auth (§7) | F1 provisional; B2 authoritative; L2 integration | — | 12–18 |
| Configuration/logs, security, publish/operations (§§5.8, 8) | B1–B4; L1 local stack | PM1–PM2 cloud items 4, 6, 7, 9 | 12–14, 19 |
| Future insertion points without future features (§10) | F1/B1/B3/B2 as applicable; inspect at L2 | — | Review against DESIGN-NOW scope |
| Conservative defaults and external verification (§11) | B3 data gates | PM2 data gates; PM1 licensing/operations | Relevant failure/gating cases |

## Published frontend issues and session handoffs

The maintainer requested the full F1–F5 backlog at M2. The
[frontend issue index](frontend-backlog.md) links all 30 session-sized tasks and
their implementation dependencies: F1 has 6, F2 has 5, F3 has 4, F4 has 7, and F5
has 8. Four additional bootstrap issues track baseline review, unfinished runtime
verification, GitHub setup and the private-repository branch-protection limitation.
No backend or post-MVP issues were created at M2. On 2026-11-16 (ADR 0006), the
coordinator re-scoped #30 into L3 and moved #29 and #31–#34 to the `post-MVP` label
and the Post-MVP milestone. It also published L1 #96 and L2 #97 in the new
"L — Local MVP" milestone.

Task/Bug forms are copied to `.github/ISSUE_TEMPLATE/` and a PR handoff template
is prepared. The `task`, `bug`, `frontend`, `bootstrap`, `blocked` and `post-MVP`
labels are available. Forms and PR guidance are merged into `main`; the maintainer confirmed
both forms visible in the rendered chooser. See [M2 verification](m2-verification.md).
The original private-repository protection probe returned HTTP 403.
On this follow-up, GitHub reports the repository public and main protection returns
HTTP 404, "Branch not protected". This session changed neither visibility nor
billing. Issue #4 now proposes solo-maintainer review through ADR 0004 and
the versioned protection payload. The candidate rule is tested on an isolated
branch; main activation waits for approved policy merge. See
[review-protection.md](review-protection.md). The real `quality` check exists
after PR #37; no placeholder contexts are configured. M1's runtime/editor
evidence in #2 is merged in PR #35.

PM role agents groomed the frontend bodies and independent QA reviewed their
documentation coverage and dependency graph. All implementation issues remain
blocked on their stated predecessors/environment gates; recheck the scope and
interfaces before starting, and split further if a slice will exceed a session.
The first scaffold leaves product shell/auth UX to F2. Later backend milestone
headings are not ready-to-implement issue bodies.

PM grooms using [product-manager.md](../team/product-manager.md); Engineering
implements one issue and commits regularly; QA checks the delivered SHA and
records PASS/FAIL/BLOCKED. Record issue/PR links and gate evidence in this roadmap
as work progresses. Update it when an accepted decision changes scope or a gate
completes; do not premark future work done. End sessions with branch/SHA, exact
container checks/results, open blockers and the next role/action in the issue.
Keep follow-up work linked and leave incomplete issues open.

## Deferred scope

No user uploads, exports, metadata/details tab, named cloud workspaces, multi-output
support, fuzzy search, cross-provider mappings, assisted matching, recalculated
LCIA, or managed cloud Airflow/Spark in MVP. See §10 for their future contracts.
Under ADR 0006, Google Cloud deployment/Terraform, production Firebase, full-corpus
release validation and licensing sign-off (PM1–PM2) are also outside the MVP, as is
browser workspace persistence and the deferred F5 work (PM3). Preserve required
extensibility now without opening a speculative post-MVP backlog beyond the
existing deferred issues. Earlier references to I1 in milestone history now
mean L2.
