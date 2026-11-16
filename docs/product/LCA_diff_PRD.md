# LCA diff — Product Requirements Document

**Status:** Revised MVP scope, 16 November 2026 (v3: local-only MVP, proposed ADR 0006)  
**Audience:** Product owner, human developers, and AI coding agents  
**Companion:** `LCA_diff_Implementation_Specification.md` (canonical copy under `docs/engineering/`)

## 1. Problem and objective

Life Cycle Assessment (LCA) practitioners struggle to determine which unit-process dataset best fits their modelling needs. **LCA diff** lets registered practitioners discover and compare unit processes side by side, including exchange flows and Life Cycle Impact Assessment (LCIA) scores. It is a comparison tool, **not** an interactive LCA calculation engine.

## 2. Users and MVP boundaries

Any email-verified registered user may access **BAFU:2026 v1**. Initially support desktop/laptop browsers only. Other LCA databases, new versions, cross-database mappings and uploaded datasets are post-MVP, but the data model must allow their later integration. **The MVP runs locally only (ADR 0006):** the whole application, its database and the Airflow/PySpark ingestion pipeline run on the dedicated laptop through Remote SSH, Dev Containers and rootless Docker Compose. A single command starts the app end to end: the frontend calls the real API, data persists in PostgreSQL, and login uses the Firebase Auth Emulator. Hosting on Google Cloud is post-MVP.

## 3. MVP user experience

- **Authentication:** Open directly into the application shell. If unauthenticated, show a centered **login modal** over a dimmed, non-interactive shell; **do not load database content**. Provide Firebase email/password self-registration, email verification, password reset, logout, and automatic restoration of valid sessions. No separate landing page. In the local MVP these flows run against the Firebase Auth Emulator, with a seeded local-only verified demo account.
- **Discovery:** Left sidebar with database/version → category → nested subcategories → processes. Reactive, case-insensitive substring search with process name as default; advanced fields: geography, category, subcategory, reference-flow name. Words within a field and populated fields combine using **AND**. Preserve matching tree structure and selection through filtering.
- **Selection:** Individual checkboxes, select/deselect all matches, category/subcategory bulk selection scoped to the active filter, and a collapsible selected-processes list. No arbitrary selection-count limit. New columns append in selection order; bulk-added columns sort alphabetically; users can drag/reorder/remove them.
- **Workspace:** Collapsible sidebars; central **Flows** (default) and **Scores** tabs. Sticky process headers and identifying columns; virtualized rows/columns; non-blocking large-comparison notices. Both tabs show process name, location, reference-output name, amount and unit.
- **Flows:** Align rows using harmonized `flow.id` plus type. Type order: **Reference, Technosphere, Ecosphere Input, Ecosphere Output**. Other identifying fields: name, location, process name, category, subcategory, unit. Preserve absent versus present-zero. Visualize positive/negative amounts with green/red signed bars, per-row absolute scaling, expanded mixed-sign row heights, alternating subtle backgrounds, adaptive labels and full-precision tooltips.
- **Scores:** Show provider-supplied or *verified source-basis-reconciled* scores. Right method/category/indicator tree supports individual and bulk selection; default **IPCC 2021 / GWP 100**. Maintain source indicator order. Missing or unresolved scores display **N/A**, never zero; score bars follow the same visualization rules.
- **Differences:** Independent, initially **off** toggles on both tabs. With at least two selected processes, compute exact difference rows on demand and cache them; absence differs from zero. Toggles are disabled with fewer than two processes.
- **Comparability:** Allow any processes to be compared without interactive normalization. Warn when reference-output quantities **or units** differ. *Post-MVP (ADR 0006):* restore selection/order, indicators, active tab and toggles from account-namespaced browser storage, without restoring search filters. In the MVP a reload starts a fresh comparison; logout/account change still clears protected in-memory data.

## 4. MVP ingestion and data integrity

Import approximately **11,947 BAFU EcoSpold XML files** and the supplied LCIA workbook via **Airflow + PySpark**. Archive immutable raw sources; preserve raw extracted values in **BAFU-specific staging tables shared across BAFU versions**; transform to PostgreSQL harmonized tables `flow`, `process`, `process_flows`, `flow_provenance`, and `lcia_score`. Flow IDs are deterministic UUIDv5 identities, stable across reprocessing revisions of a release. Preserve source exchange provenance, distinguish environmental subcompartments, resolve missing references through approved mapping/fallback, and aggregate duplicated exchanges during ETL while retaining warnings. Exclude multi-output processes (more than one `outputGroup=0`) but retain their staging records.

**Input availability, 15 November 2026:** the maintainer has supplied three private
ZIP archives for the XML release, impact-score workbook and XML schema
descriptions. B3's representative import
is separate from this full input inventory. **Local MVP data (ADR 0006):** the
single-command stack seeds and publishes a small committed synthetic release. The
private BAFU inputs can be imported into the same local database through the
documented opt-in B3/B4 commands. Full-corpus reconciliation, LCIA audit sign-off,
licensing confirmation and release validation are post-MVP and required before any
hosted or shared release. No licensed inputs are committed.

Conservatively match workbook rows to XML processes without assuming row order or invented identifiers. **Convert LCIA scores to the XML reference quantity/unit only with verified, approved conversion rules**, retaining original values/factors. Unverified scores show N/A. Output an **auditable CSV with every inconsistent Excel row in full (original A:AY cells) and added issue, evidence and resolution columns**, including successfully resolved issues; report header issues and XML-only processes separately. Import and validation are CLI-operated. Publication is a **separate manual, atomic action**; unresolved critical issues block it. Preserve immutable release revisions, active-publication pointers, rollback and audit history.

## 5. Technology, quality and deployment

Use a **single uv workspace** for Python packages; **Ruff**, **MyPy**, **Pydantic**, **Loguru**, and **python-dotenv** for development configuration. Backend: **FastAPI + SQLAlchemy/Alembic + PostgreSQL**; frontend: React/TypeScript. Use Docker/Dev Containers locally. **MVP:** frontend, API, PostgreSQL, Auth Emulator and Airflow/PySpark run as local Compose services, and `./dev app-up` (or `make up`) starts the application. **Post-MVP (ADR 0006):** deploy frontend and backend as separate **Cloud Run** services and PostgreSQL on **Cloud SQL**, provisioned with Terraform, with secrets in Secret Manager rather than deployed `.env` files.

The local workspace uses **rootless Docker** without host Docker-group membership. Its namespace UID 0 maps to the unprivileged host user for writable source mounts, with all capabilities dropped and no-new-privileges enabled. Supported launch paths reject rootful daemons; tools run inside containers and host installs require permission. This development identity does not relax unprivileged production-runtime requirements. See ADR 0003 and the development-environment guide.

**Unit, integration and browser end-to-end testing are MVP requirements:** pytest and database/Spark/Airflow integration tests, Vitest, and Playwright. GitHub Actions runs Ruff/MyPy, unit, targeted integration and E2E smoke tests on every PR; full suites run on demand and before release. The MVP adds a real-stack E2E smoke against the local Compose application.

## 6. Governance and post-MVP

**Solo-maintainer review (ADR 0004):** require PRs, independent agent QA of the
delivered commit, passing relevant CI and an explicit maintainer merge as approval
evidence. Native approval count is zero because PRs use the maintainer's identity;
this does not claim review by another human. Enforce the current GitHub Actions
`quality` check against an up-to-date branch for administrators too, require
resolved conversations, and block force pushes/deletion without bypass allowances.
Apply the solo exception only after its proposed ADR is approved and merged.
Revisit native approvals if another regular maintainer joins.

Keep this PRD and the current specification as **living GitHub Markdown documents**. Every decision deviating from either requires a numbered **Architecture Decision Record (ADR)** in `docs/adr/` and updates to **both current documents in the same PR**; do not defer reconciliation. An ADR becomes authoritative **only after its PR is approved and merged into `main`**. Accepted ADRs govern if an unexpected inconsistency remains, which must be corrected. GitHub Issues track implementation rather than changing architectural authority. See `docs/adr/README.md` for the workflow.

The old documents in `docs/product/archive/` and `docs/engineering/archive/`, and all of `docs/reference/`, remain for human historical reference. Agents must exclude them from routine reading, searching, citations and delegated context unless explicitly asked to investigate history; they are not sources of implementation requirements.

**Delivery sequence (accepted ADR 0005, issue #55 / PR #56):** after verified container tooling and initial issue setup, backend milestones B1–B4 may run alongside F3–F5 in isolated worktrees. Phase 1 retains a complete independently runnable mock frontend with simulated authentication and a centralized typed services boundary. Each backend milestone uses one issue and one PR, with incremental commits and uninterrupted implementation across sessions as needed. B1 precedes B2/B3; B3 precedes B4, whose API visibility checks also require B2. I1 waits for the Phase 1 gate, B2 and B4 before connecting the real adapter and generating frontend OpenAPI DTOs. Coordinate shared tooling changes and preserve frontend ownership. Use focused MVP behavior tests and applicable tiered CI; scientific, authorization, ingestion and atomic-publication checks and full release gates remain required. Mock mode must be explicit and cannot silently substitute for production failures. PR #56 was explicitly authorized and merged at `125b090` on 2026-11-14; ADR 0005 partially supersedes ADR 0002's scheduling gate while preserving its service boundary. See `docs/engineering/roadmap.md` for gates.

**Local-only MVP (proposed ADR 0006, issue #95):** the remaining MVP is three sequential implementation issues/PRs:
- L1 #96: single-command local stack with a seeded synthetic release.
- L2 #97: real HTTP/Firebase-emulator adapter with OpenAPI-generated DTOs; replaces I1 locally.
- L3 #30: differences toggles and local end-to-end acceptance.

The mock-only Phase 1 gate is no longer a prerequisite for integration. Deferred F5 tasks (#29, #31–#34), cloud infrastructure/deployment and full-data release validation are post-MVP.

Post-MVP: Google Cloud deployment (Cloud Run, Cloud SQL, GCS, Artifact Registry, Secret Manager, Terraform) and a production Firebase project; full BAFU corpus validation, LCIA audit sign-off and licensing confirmation for a hosted release; browser workspace persistence/restoration and stale-selection reconciliation; the full loading/accessibility audit; curated cross-release/database flow and indicator mappings; assisted one-to-many/many-to-many process matching; multiple source adapters; multi-output processes; user uploads and licensing entitlements; metadata tab; detailed exchange inspection; named cloud-saved comparisons; exports; zoom, rearrangeable rows and fuzzy search; common-method LCIA recalculation.

## 7. MVP success criteria

From a clean checkout, one command starts the local application. A verified user (Auth Emulator) can sign in through the modal, search and bulk-select processes of the published release, inspect accurate signed flows and LCIA scores served from PostgreSQL, and filter differences. Data persists across restarts. The ingestion pipeline is reproducible, auditable, safely publishable/rollback-capable, explicitly identifies source discrepancies, and can load the private BAFU inputs into the local app as an opt-in. The interface remains usable with hundreds of process columns. Hosted deployment, full-corpus validation and workspace restoration are post-MVP.
