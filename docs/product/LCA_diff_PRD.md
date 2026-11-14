# LCA diff — Product Requirements Document

**Status:** Revised MVP scope, 13 November 2026 (v2)  
**Audience:** Product owner, human developers, and AI coding agents  
**Companion:** `LCA_diff_Implementation_Specification.md` (canonical copy under `docs/engineering/`)

## 1. Problem and objective

Life Cycle Assessment (LCA) practitioners struggle to determine which unit-process dataset best fits their modelling needs. **LCA diff** lets registered practitioners discover and compare unit processes side by side, including exchange flows and Life Cycle Impact Assessment (LCIA) scores. It is a comparison tool, **not** an interactive LCA calculation engine.

## 2. Users and MVP boundaries

Any email-verified registered user may access **BAFU:2026 v1**. Initially support desktop/laptop browsers only. Other LCA databases, new versions, cross-database mappings and uploaded datasets are post-MVP, but the data model must allow their later integration. The production application runs on Google Cloud; development and the Airflow/PySpark ingestion pipeline initially run on a dedicated laptop through Remote SSH and Dev Containers.

## 3. MVP user experience

- **Authentication:** Open directly into the application shell. If unauthenticated, show a centered **login modal** over a dimmed, non-interactive shell; **do not load database content**. Provide Firebase email/password self-registration, email verification, password reset, logout, and automatic restoration of valid sessions. No separate landing page.
- **Discovery:** Left sidebar with database/version → category → nested subcategories → processes. Reactive, case-insensitive substring search with process name as default; advanced fields: geography, category, subcategory, reference-flow name. Words within a field and populated fields combine using **AND**. Preserve matching tree structure and selection through filtering.
- **Selection:** Individual checkboxes, select/deselect all matches, category/subcategory bulk selection scoped to the active filter, and a collapsible selected-processes list. No arbitrary selection-count limit. New columns append in selection order; bulk-added columns sort alphabetically; users can drag/reorder/remove them.
- **Workspace:** Collapsible sidebars; central **Flows** (default) and **Scores** tabs. Sticky process headers and identifying columns; virtualized rows/columns; non-blocking large-comparison notices. Both tabs show process name, location, reference-output name, amount and unit.
- **Flows:** Align rows using harmonized `flow.id` plus type. Type order: **Reference, Technosphere, Ecosphere Input, Ecosphere Output**. Other identifying fields: name, location, process name, category, subcategory, unit. Preserve absent versus present-zero. Visualize positive/negative amounts with green/red signed bars, per-row absolute scaling, expanded mixed-sign row heights, alternating subtle backgrounds, adaptive labels and full-precision tooltips.
- **Scores:** Show provider-supplied or *verified source-basis-reconciled* scores. Right method/category/indicator tree supports individual and bulk selection; default **IPCC 2021 / GWP 100**. Maintain source indicator order. Missing or unresolved scores display **N/A**, never zero; score bars follow the same visualization rules.
- **Differences:** Independent, initially **off** toggles on both tabs. With at least two selected processes, compute exact difference rows on demand and cache them; absence differs from zero. Toggles are disabled with fewer than two processes.
- **Comparability:** Allow any processes to be compared without interactive normalization. Warn when reference-output quantities **or units** differ. Restore selection/order, indicators, active tab and toggles from account-namespaced browser storage; do not restore search filters.

## 4. MVP ingestion and data integrity

Import approximately **11,947 BAFU EcoSpold XML files** and the supplied LCIA workbook via **Airflow + PySpark**. Archive immutable raw sources; preserve raw extracted values in **BAFU-specific staging tables shared across BAFU versions**; transform to PostgreSQL harmonized tables `flow`, `process`, `process_flows`, `flow_provenance`, and `lcia_score`. Flow IDs are deterministic UUIDv5 identities, stable across reprocessing revisions of a release. Preserve source exchange provenance, distinguish environmental subcompartments, resolve missing references through approved mapping/fallback, and aggregate duplicated exchanges during ETL while retaining warnings. Exclude multi-output processes (more than one `outputGroup=0`) but retain their staging records.

Conservatively match workbook rows to XML processes without assuming row order or invented identifiers. **Convert LCIA scores to the XML reference quantity/unit only with verified, approved conversion rules**, retaining original values/factors. Unverified scores show N/A. Output an **auditable CSV with every inconsistent Excel row in full (original A:AY cells) and added issue, evidence and resolution columns**, including successfully resolved issues; report header issues and XML-only processes separately. Import and validation are CLI-operated. Publication is a **separate manual, atomic action**; unresolved critical issues block it. Preserve immutable release revisions, active-publication pointers, rollback and audit history.

## 5. Technology, quality and deployment

Use a **single uv workspace** for Python packages; **Ruff**, **MyPy**, **Pydantic**, **Loguru**, and **python-dotenv** for development configuration. Backend: **FastAPI + SQLAlchemy/Alembic + PostgreSQL**; frontend: React/TypeScript. Use Docker/Dev Containers locally; deploy frontend and backend as separate **Cloud Run** services and PostgreSQL on **Cloud SQL**; Terraform provisions cloud resources. Airflow/PySpark remain local initially. Cloud secrets use Secret Manager, not deployed `.env` files.

The local workspace uses **rootless Docker** without host Docker-group membership. Its namespace UID 0 maps to the unprivileged host user for writable source mounts, with all capabilities dropped and no-new-privileges enabled. Supported launch paths reject rootful daemons; tools run inside containers and host installs require permission. This development identity does not relax unprivileged production-runtime requirements. See ADR 0003 and the development-environment guide.

**Unit, integration and browser end-to-end testing are MVP requirements:** pytest and database/Spark/Airflow integration tests, Vitest, and Playwright. GitHub Actions runs Ruff/MyPy, unit, targeted integration and E2E smoke tests on every PR; full suites run on demand and before release.

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

**Delivery sequence (revision proposed in ADR 0005, issue #55):** after verified container tooling and initial issue setup, backend milestones B1–B4 may run alongside F3–F5 in isolated worktrees. Phase 1 retains a complete independently runnable mock frontend with simulated authentication and a centralized typed services boundary. Each backend milestone uses one issue and one PR, with incremental commits and uninterrupted implementation across sessions as needed. B1 precedes B2/B3; B3 precedes B4, whose API visibility checks also require B2. I1 waits for the Phase 1 gate, B2 and B4 before connecting the real adapter and generating frontend OpenAPI DTOs. Coordinate shared tooling changes and preserve frontend ownership. Use focused MVP behavior tests and applicable tiered CI; scientific, authorization, ingestion and atomic-publication checks and full release gates remain required. Mock mode must be explicit and cannot silently substitute for production failures. This revision takes effect after ADR 0005 is approved and merged; until then ADR 0002 remains authoritative. See `docs/engineering/roadmap.md` for gates.

Post-MVP: curated cross-release/database flow and indicator mappings; assisted one-to-many/many-to-many process matching; multiple source adapters; multi-output processes; user uploads and licensing entitlements; metadata tab; detailed exchange inspection; named cloud-saved comparisons; exports; zoom, rearrangeable rows and fuzzy search; common-method LCIA recalculation.

## 7. MVP success criteria

A verified user can sign in through the modal, search and bulk-select BAFU processes, inspect accurate signed flows and LCIA scores, filter differences, and restore their comparison. The ingestion pipeline is reproducible, auditable, safely publishable/rollback-capable, and explicitly identifies source discrepancies; the interface remains usable with hundreds of process columns.
