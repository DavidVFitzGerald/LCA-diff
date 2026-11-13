# Working instructions for LCA diff

## Start every session

1. Read this file, `docs/product/LCA_diff_PRD.md`, and
   `docs/engineering/LCA_diff_Implementation_Specification.md` (the specification).
   Read applicable accepted ADRs in `docs/adr/` when present, the assigned issue,
   dependencies, relevant code/tests, and the role document for your task.
2. Inspect the branch, working tree, and recent commits. Preserve unrelated and
   untracked work; stage explicit files rather than everything in the checkout.
3. Check `docs/engineering/roadmap.md` when created. Resume/select one ready issue
   that fits a session, including validation and handoff. Avoid duplicate issues.
4. State scope and verification; confirm container tooling before development.

The roadmap, environment, directories, and commands below are planned contracts
until implemented. Do not claim to run missing tools or complete unverified work.

## Authority and scope

Follow specification §0.2: approved-and-merged accepted ADRs on `main` → current
specification on `main` → PRD → historical references/discovery notes → incidental
issue text. Raw inputs govern their actual contents. Code, tests, draft ADRs,
and acceptance criteria cannot silently change product/scientific meaning.
Resolve conflicting accepted ADRs by explicit supersession; raise a blocker if
precedence is unclear. Preserve historical reference files.

The maintainer requests the frontend-first delivery sequence below instead of
specification §12's suggested order. This changes scheduling, not MVP scope.
Use §0.2's ADR workflow for material architecture/product changes; ordinary
implementation choices need no ADR. Implement MVP only; establish the specified
DESIGN-NOW interfaces without implementing POST-MVP features.

## Delivery sequence and gates

1. **Workflow documentation (current step):** establish this file, roles, and
   templates. No application implementation or role-agent runs yet.
2. **Roadmap:** create `docs/engineering/roadmap.md` with milestones, dependencies,
   completion gates, and specification coverage, including testing, security,
   ETL, publication and deployment. Keep distant work at milestone level; groom
   only the next small batch of tasks.
3. **Dev environment:** prepare and verify pinned Dev Container/Compose tooling
   and documented container commands. No product implementation during setup.
   Track roadmap/environment bootstrap work as initial Task issues when issue
   setup begins, accurately recording any work already completed.
4. **Issue setup:** activate forms, verify labels, and open/groom an initial small
   dependency-ordered batch. Every subsequent implementation or fix needs a
   GitHub issue before work starts. This ends the documentation/bootstrap
   exception; do not create the entire MVP backlog in advance.
5. **Phase 1 — frontend with mocks:** build all MVP UI journeys using React,
   TypeScript, Vite, TanStack Query, virtualization, and accessible drag/drop.
   Centralize backend access in one typed services layer with an asynchronous,
   deterministic mock adapter. The entire frontend must run without an API,
   database, Firebase project, cloud credentials, or proprietary files. Mock the
   authentication lifecycle, including verified/unverified/error states, behind
   an auth boundary. Clearly identify local demo mode. Cover loading, empty,
   error, cancellation, pagination, revision/warning states, and synthetic large
   comparisons. Gate completion on MVP UI journeys and applicable Vitest and
   Playwright checks, with real-integration gaps documented.
6. **Phase 2 — backend and integration:** implement shared Python contracts,
   FastAPI, PostgreSQL/Alembic, Firebase verification, Airflow/PySpark ingestion,
   reconciliation, audit reports, and publication through small issues. Connect
   a real service adapter; retain mocks for deterministic tests. Generate TS
   DTOs from FastAPI OpenAPI, reconcile provisional contracts, and verify adapter
   parity. Complete real auth/integration/E2E checks. Infrastructure, deployment,
   licensing and full-data validation remain MVP completion gates.

In Phase 1 define provisional typed DTOs against specification §7 without
implementing an API server early. Components/hooks must not call HTTP/Firebase
directly or import mock fixtures. Select adapters at one composition boundary
using validated configuration; never silently fall back to mocks in production.
Keep transport/auth inside the services boundary, UI state in the frontend, and
scientific transformations in ETL. Both adapters preserve decimal strings,
missingness, revision snapshots, structured errors, read windows and cancellation.
Later generated DTOs need reproducible generation/drift checks, not manual edits.
Mock completion does not prove real authentication, authorization or data security.

## Roles and issue lifecycle

Use these role agents once implementation begins:

| Role | Instructions | Responsibility |
| --- | --- | --- |
| Product Manager | `docs/team/product_manager.md` | Groom tasks/bugs, scope, dependencies, criteria |
| Software Engineer | `docs/team/software-engineer.md` | Implement one ready issue, validate, commit, hand off |
| QA Engineer | `docs/team/qa-engineer.md` | Independently verify the delivered commit and report |

The coordinator owns sequencing, issue creation, handoffs and closure. Supply
agents the issue URL, role file, phase, branch/commit, spec references, dependencies
and expected output. Only one agent writes an issue's implementation at a time.
Use isolated branches/worktrees for parallel work; avoid conflicting Git mutations
in a shared checkout. PM and QA do not modify application code. Engineers do not
change acceptance criteria or close issues. FAIL returns to engineering and then
QA; BLOCKED requires resolving the blocker, not waiving evidence.

Use `docs/issue_templates/task.yml` for features, documentation, infrastructure,
refactoring, investigations and tooling; use `docs/issue_templates/bug.yml` for
existing-behavior defects. No third type is needed now. These are canonical
source forms. During issue setup copy them to `.github/ISSUE_TEMPLATE/`, where
GitHub recognizes forms, and keep both copies synchronized on later edits.
Verify/create `task` and `bug` labels before relying on them. API/CLI-created
issues must contain the same required sections rendered as Markdown; GitHub
form validation does not enforce programmatic issue bodies.

Lifecycle: **draft → groomed/ready → implementing → QA → ready for review →
merged/closed**. Record states in comments until labels/projects are configured;
do not assume those labels exist. Ready requires a session-sized outcome, phase,
spec references, bounded scope, satisfied dependencies, objective criteria and a
container verification plan. Split oversized work and link follow-ups. Deferred
required work must not disappear into an unlinked out-of-scope note.

Use one issue per reviewable PR by default. Include `Refs #N`, behavior, checks
and limitations. Avoid automatic closing keywords until QA passes. The coordinator
closes after required checks, QA and approved merge. Blocked checks never pass;
a roadmap entry alone neither replaces an issue nor proves completion.

## Containers and required technology

All development, dependency installation/resolution, generation, formatting,
linting, typechecking, builds and tests run inside Dev Containers or explicit
Docker Compose containers. Install nothing on the host: no runtimes, package
managers, CLIs, browsers or global tools. Ask permission before installing any
missing host prerequisite. Do not use an existing host runtime as a shortcut.
Host Git, file inspection/editing, available GitHub orchestration tools, and
Docker/Dev Container lifecycle commands are permitted without host installation.
CI tools run in containers too. Documentation-only inspection/editing can proceed
before the environment exists without bootstrapping a host toolchain.

Follow specification §3's stack and layout: React/TypeScript/Vite, TanStack Query;
Python FastAPI, Pydantic v2/Settings; SQLAlchemy 2.x, Alembic, PostgreSQL; Airflow,
PySpark; Ruff, MyPy, Loguru, python-dotenv; pytest/pytest-cov, Vitest/React Testing
Library, Playwright; Terraform and the specified Google Cloud services.
Pin compatible images/dependencies. Use one uv workspace and committed `uv.lock`,
honoring Airflow constraints with a mutually supported Python version. Document
resolver incompatibility and propose an ADR before splitting locks/projects.
Use frozen CI/build installs; keep ETL dependencies out of the API runtime.
Also choose and commit a pinned frontend package-manager lockfile.

Provide container-backed `make dev-up`, `make dev-down`, `make import`,
`make format`, `make lint`, `make typecheck`, `make test`, `make test-unit`,
`make test-integration`, and `make test-e2e` flows. Document exact invocations once
implemented. Compose profiles must let mock frontend work run independently of
API/Postgres/Airflow/Spark. Separate Airflow metadata from application data,
keep its UI private, and do not expose the Docker socket to Airflow for ETL.

## Correctness and quality gates

- Preserve original bytes, staging, checksums and full provenance. Never commit
  licensed datasets, confidential workbooks, raw audit rows, secrets or production
  `.env` files. Public CI uses small deterministic synthetic/licensed fixtures.
- Reference is `outputGroup=0`; signed `inputGroup=5` stays Technosphere. Exclude
  multi-output processes from publication. Preserve duplicate staging exchanges;
  aggregate exact amounts only in ETL with constituent provenance.
- Flow identity includes meaning/type/compartment, not names or signs. No silent
  fuzzy workbook joins or guessed score conversions. Unverified scores are
  `N/A`; retain required full-original-row audit CSVs privately.
- Measurements cross APIs as decimal strings. Exact equality distinguishes zero,
  absent flows and missing/invalid scores. Chart floats cannot alter stored data.
  Never normalize between selected processes interactively.
- No arbitrary selection cap. Virtualize rows and columns, batch/window reads,
  preserve revision snapshots, and compute differences only on demand.
- No protected data before verified authentication; clear in-memory data/caches
  on logout/account change. Persist workspace under versioned UID-scoped keys.
- Published revisions are immutable; promotion is not publication. Production
  publish and Terraform apply require explicit maintainer approval (§§8–9).

Apply specification §9.2's tiered CI. Every PR receives applicable frozen-lock,
format/lint/type, unit, targeted integration, build, migration, Terraform and
critical Playwright smoke checks. Full integration/E2E/performance checks run on
request and for release candidates. Introduce checks with their components; do
not report unbuilt layers as passed or weaken gates to conceal failures.
Use meaningful behavior/regression tests for application changes, not tests that
mirror simple documentation edits. Record exact container commands/results and
blockers; track missing coverage in issues.

## Git and session handoff

Commit focused coherent increments regularly on task branches, referencing the
issue once assigned. Review diffs and stage explicit files; preserve unrelated
work. Never rewrite shared history or force-push. Push branches/open PRs within
authorized scope; completion alone does not authorize merge, deploy or publish.

End each session with an issue handoff: branch/SHA, completed criteria, commands
and results, blockers, follow-ups and next role/action. Leave unfinished work
open. If GitHub is unavailable, keep the same information in a local handoff note
and report the synchronization blocker. Confirm actions before claiming an
issue/comment/commit/push exists.
