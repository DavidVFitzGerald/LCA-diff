# LCA diff implementation roadmap

Status: initial planning baseline, 13 November 2026. No application implementation
has begun. Milestone status means verified delivery, not merely written plans.

## Authority and delivery policy

Read [AGENTS.md](../../AGENTS.md), the [PRD](../product/LCA_diff_PRD.md), and the
[implementation specification](LCA_diff_Implementation_Specification.md) before
working. Specification references below use its section numbers. Approved,
merged ADRs on `main` take precedence as described in §0.2.

This roadmap follows the maintainer's requested order instead of §12's suggested
sequence: workflow → roadmap → dev environment → GitHub issues → complete mock
frontend → backend → real frontend integration → production readiness. It does
not change scientific requirements, the required stack, or MVP scope.

All tools, installs, builds and tests run in containers. Nothing is installed on
the host without permission. Use the stack and repository layout in §3; choose
compatible pinned versions during environment setup, not by guessing here.

Milestones are larger than issues. Open only the next small dependency-ready
batch, using Task and Bug forms. Every implementation/fix after bootstrap needs
an issue before starting. Each issue must fit one session including checks,
commits and handoff; normally it produces one PR. Split by an independently
verifiable outcome rather than by arbitrary file count. A milestone is complete
only when its gate has evidence and associated issues are resolved through the
PM → Software Engineer → QA → review/merge workflow. Blocked is not complete.

## Current position

| Milestone | Status | Dependency |
| --- | --- | --- |
| M0 — workflow and roadmap | Documentation prepared; review/merge pending | None |
| M1 — container development environment | Next; not started | M0 baseline |
| M2 — GitHub execution setup | Not started | M1 |
| F1–F5 — Phase 1, frontend with mocks | Not started | M2, then gates below |
| B1–B4 — Phase 2, backend and ingestion | Not started | Phase 1 gate, then gates below |
| I1 — real frontend integration | Not started | B2 and validated synthetic publication from B4 |
| R1–R2 — production readiness and release | Not started | Dependencies below |

M0–M2 are the explicitly authorized documentation/environment bootstrap exception
to issue-first execution. When M2 opens initial issues, record roadmap/environment
work already performed as such; do not fabricate earlier issue or QA history.
Role agents are used for implementation tasks after bootstrap, not for this
roadmap preparation. This file creates no GitHub issues or milestones itself.

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

### M2 — GitHub execution setup

Scope: inspect existing repository issues/labels/settings; activate synchronized
copies of the two source forms in `.github/ISSUE_TEMPLATE/`; verify/create Task
and Bug labels. Establish ADR index/workflow, PR handoff guidance and roadmap
links as small documentation tasks if not already present. Configure relevant
review/CI protection when permissions and working checks permit; report any
admin-access blocker. Do not declare nonexistent checks required or successful.

Gate: forms work in GitHub, programmatic bodies contain their required sections,
bootstrap work is recorded honestly, and the first small implementation batch is
groomed with dependencies, criteria, container verification and role handoffs.
No product implementation precedes this gate. Do not expand all later milestones
into issues now.

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

Depends on F4. Add method/category/indicator selection, source ordering, IPCC 2021
GWP 100 default and valid/missing/unresolved score states. Reuse grid/bar behavior.
Add independent differences toggles: initially off, disabled/reset below two
processes, exact comparisons on demand, order-independent cache reuse and revision
invalidation. Persist only the specified UID-scoped workspace fields; handle
stale selections and account changes. Complete loading/error/empty/retry states,
accessible controls, browser coverage and manual UAT (§9.3's UI scenarios).

Phase 1 gate: every MVP UI journey works with deterministic synthetic mocks;
Vitest, typecheck/build and Playwright pass in containers. Check Chromium and
Firefox, Safari as practicable, large grids and account isolation. Record a
UI/spec coverage checklist and remaining real-integration checks. A mock demo is
not a published BAFU release or a completed MVP. Begin backend implementation only
after this gate; performance and full integration are rechecked later.

## Phase 2 — backend, ingestion and connection

### B1 — Python domain, schema and release contracts

Depends on Phase 1 gate. Implement the single uv workspace packages, shared
Pydantic boundaries/config, SQLAlchemy schema and Alembic migrations under §4.
Use exact decimals, deterministic versioned flow keys, immutable revisions,
release-scoped staging and self-contained provenance. Enforce publication-pointer
membership in its release and protect published values. Add local Postgres
profile and separate runtime/ETL dependencies. Establish Ruff/MyPy/pytest,
Loguru context and local dotenv precedence checks.

Gate: clean-DB migrations and targeted Postgres tests prove constraints,
precision, revision isolation and provenance; frozen locks and applicable Python
quality checks pass. Data model readiness does not assert actual import success.

### B2 — read API and real authorization

Depends on B1. Implement §7 endpoints with validated DTOs and safe error envelopes,
indexed/batched reads, cursor/window budgets, revision snapshots and on-demand
exact differences. Firebase Admin verifies identity/email status; enforce published
release visibility and least-privilege read access. Use disposable synthetic data
and Firebase Auth Emulator in public CI. Add liveness/readiness, correlation IDs,
logging and no-sensitive-payload checks.

Gate: endpoint, auth, invalid-input, unpublished-data denial, snapshot and query
behavior pass unit/Postgres/targeted integration tests. Export valid OpenAPI for
I1. API tests must not depend on proprietary data or production Firebase accounts.

### B3 — miniature golden ingestion and LCIA reconciliation

Depends on B1; B2 may proceed independently after B1. Introduce private Airflow
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

Depends on B3. Implement readiness gates, checksummed artifacts, self-contained
promoted provenance and authenticated maintainer operations. Prepare/run/promote
do not publish; publish atomically changes the active revision pointer. Test
rollback, retries/idempotence and failed/interrupted operations in disposable
local environments. Verify API visibility through B2 before integration handoff.

Gate: an end-to-end synthetic candidate can be validated, promoted, explicitly
published and rolled back without partial/mixed visibility, lost audit history,
or dependence on local-only staging FKs. Actual production publication still
requires the release gates and explicit approval below.

### I1 — real adapter and end-to-end integration

Depends on B2 and B4. Generate frontend DTOs from FastAPI OpenAPI with reproducible
drift checks; replace provisional types deliberately and verify mock/real adapter
parity. Implement the HTTP/Firebase adapter behind the existing services boundary,
then select it through explicit configuration. Never silently fall back to mocks.

Gate: complete UI journeys work against the real API and a published synthetic
release with emulator-backed auth. Verify no protected calls before login,
refresh/expiry/revocation, forbidden responses, query cancellation, exact decimals,
missingness, snapshots during publication, and restored/stale workspace behavior.
Mocks remain separately runnable. All applicable PR gates, targeted Spark/Airflow
checks and real-integration Playwright smoke checks pass.

## Production readiness and release

### R1 — infrastructure and operational readiness

Depends on I1 for integrated staging acceptance; documentation/estimates can be
tracked earlier without provisioning production. Implement Terraform and separate
frontend/API Docker deployments to Cloud Run, Cloud SQL connectivity, private
GCS archives, Artifact Registry, Secret Manager, IAM, backups/deletion protection,
monitoring and budgets. Keep Airflow/Spark local for MVP. Run migrations as a
controlled task, never implicitly on API startup. Document import/report/rule
approval, promotion/publication/rollback, restore and credential-revocation flows.

Gate: fmt/validate, reviewed plans/images, reproducible staging deployment,
backup/restore and rollback evidence, access/logging checks and smoke tests are
available. Production Terraform applies/deployments need maintainer approval;
this roadmap is not permission to incur cloud costs or publish data.

### R2 — full-data validation and MVP release

Depends on B3, B4, I1 and R1. Obtain the actual complete XML manifest/workbook,
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
rollback capability. Only then claim the PRD/specification MVP definition of done.
Missing data/license/evidence blocks release, not unrelated synthetic development.

## Specification and test coverage ownership

The issue bodies will carry detailed checks. This table prevents milestone-level
scope loss; test numbers refer to the 19 mandatory behaviors in §9.2.

| Contract | Milestones owning delivery and evidence | §9.2 behaviors |
| --- | --- | --- |
| Governance, stack, environment, tiered CI (§§0, 3, 9) | M0–M2; F1/B1 introduce checks; R1–R2 complete gates | All applicable checks |
| UI, identity state and account isolation (§§6.1, 6.8, 8) | F2/F5 mock; B2/I1 real; R2 acceptance | 13, 17 |
| Search, bulk selection, ordering, grid, warnings (§§6.2–6.4, 9.1) | F3–F5; B2/I1; R2 benchmarks | 17–18 |
| Scores, signed bars, exact differences (§§6.5–6.7) | F1/F4/F5; B2/I1 | 7, 15–16 |
| Schema, decimals, isolation, provenance (§4) | B1/B3/B4; B2/I1 wire precision | 2–3, 11–12, 14 |
| XML mapping, duplicates, reference resolution, exclusion (§§1–2, 5.1–5.5) | B3; R2 full manifest | 1–6 |
| Workbook matching, verified basis, full-row audits (§§5.6–5.8) | B3; R2 audit signoff | 7–10 |
| Read API, snapshots, errors, auth (§7) | F1 provisional; B2 authoritative; B4/I1 integration | 12–18 |
| Configuration/logs, security, publish/operations (§§5.8, 8) | B1–B4; I1; R1–R2 | 12–14, 19 |
| Future insertion points without future features (§10) | F1/B1/B3/B2 as applicable; inspect at I1 | Review against DESIGN-NOW scope |
| Conservative defaults and external verification (§11) | B3/R2 data gates; R1 licensing/operations | Relevant failure/gating cases |

## Progressive issue creation and session handoffs

At M2, inspect GitHub first and create only bootstrap records plus the next small
F1 batch. Candidate slices, to groom into Task issues rather than treat as issued:

1. Container-runnable frontend scaffold with typecheck/build and unit-test CI.
2. Typed service/auth interfaces and synthetic precision/missingness fixtures.
3. Asynchronous mock adapter with windows, errors, cancellation and revision tests.
4. Mock-mode browser smoke harness and applicable PR gate.

Keep the first batch small; create remaining F1/F2 slices when prerequisites are
clear. The scaffold may include a minimal technical mount target but leaves the
product shell/auth UX to F2. Each candidate still needs the full template, explicit
dependencies and a session-sized QA plan. If any candidate is too large, split it.
Later milestone headings are not ready-to-implement issue bodies.

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
Preserve required extensibility now without opening a speculative post-MVP backlog.
