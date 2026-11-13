# LCA diff — Product Requirements Document

**Status:** Agreed scope, 12 November 2026  
**Audience:** Product owners, developers, and AI coding agents  
**Companion:** `LCA_diff_Implementation_Specification.md` (authoritative implementation detail)

## 1. Problem and objective

Life Cycle Assessment (LCA) practitioners struggle to choose appropriate unit-process datasets when similar products are represented in different databases or database versions. **LCA diff** is a web application for discovering processes and visually comparing their individual exchanges (flows), Life Cycle Impact Assessment (LCIA) scores, and eventually metadata. It is a comparison and inspection tool, **not** an LCA calculation engine.

## 2. Target users and primary workflows

Registered LCA practitioners can search a database hierarchy, select individual processes or whole groups, and compare them side by side. They can identify missing, additional, or differently quantified flows; compare impact scores; and eventually compare equivalent processes across database releases. The MVP serves every verified registered user the **BAFU:2026 v1** database. Database-specific access control is future scope.

## 3. MVP functional requirements

- **Authentication:** Public email/password registration with email verification; login, logout, and password reset. The landing page is the login page. Desktop/laptop browsers only.
- **Process discovery:** Left, collapsible sidebar with database/version → category → nested subcategories → processes. Reactive, case-insensitive substring search defaults to process name; advanced filters include location, category, subcategory, and reference-flow name. Words within and across populated fields use **AND**. Search retains the tree and expands matching branches. Clear-search control.
- **Selection:** Checkbox selection of individuals, all current search matches, and filtered or unfiltered tree branches. Parent checkboxes show partial selections. A collapsible selected-processes list supports removal and clear-all. Selection persists through searching; no hard process-count limit.
- **Comparison workspace:** Central side-by-side grid with draggable process columns and a remove control. Process headers show name, location, and reference output name/amount/unit on **both** tabs. Sticky headers and identifying columns, horizontal/vertical virtualization, responsive column widths down to a minimum, and progressive loading for large selections.
- **Flows tab (default):** One row per harmonized flow identifier **and flow type**, aligned across processes. Types and order: **Reference, Technosphere, Ecosphere Input, Ecosphere Output**. Further sort by category, subcategory, and flow name. Identifying columns: Type, Flow Name, Location, Process Name, Category, Subcategory, Unit. Preserve present-zero versus absent. Show signed vertical bars (green positive, red negative) on a common **within-row** absolute scale; mixed-sign rows grow vertically. Alternate subtle row shades. Show adaptive numerical labels and full-precision tooltips.
- **Scores tab:** Same process columns; rows identified by Method, Category (optional), Indicator, Unit. Right, collapsible method/category/indicator tree with individual and bulk selection. Default selection: **IPCC 2021 / GWP 100**. Preserve source indicator order. Render scores with the same signed-bar conventions. Missing scores display **N/A**, not zero.
- **Differences toggle:** Separate, initially off toggles for Flows and Scores. When enabled and at least two processes are selected, hide rows with identical present values across all processes; absence differs from zero. Compute on demand and cache until selection/data changes.
- **Comparability:** Never rescale selected processes automatically. Show a non-blocking warning if their reference **units or amounts** differ. Preserve all displayed amounts and scores in their documented reference basis.
- **Persistence:** Restore selected process IDs/order, selected indicators, active tab, and toggle states in account-namespaced browser storage on the same browser; reset search filters.

## 4. MVP data and operational scope

Import BAFU:2026 v1 from approximately **11,947 EcoSpold XML process files** and the supplied LCIA workbook. Preserve immutable source files and original fields in staging. Use Airflow for the ingestion workflow and PySpark for XML processing; convert to a harmonized PostgreSQL model with **stable new flow IDs** distinct from source IDs. Resolve technosphere references, distinguish environmental subcompartments, and aggregate duplicate source exchanges into one harmonized flow amount while preserving provenance and logging anomalies. Exclude processes with **more than one `outputGroup=0` exchange**; keep their raw data and log their exclusion.

Reconcile Excel score rows with XML processes, validate score units/bases, and never silently invent links or conversion factors. Keep import errors/warnings in machine-readable reports. Imports run via CLI; only an explicit, atomic publish command makes a validated release available. Missing LCIA scores do not exclude a process; unresolved critical data defects block publication unless an approved fallback resolves them.

## 5. Technology and deployment

Develop using VS Code Remote SSH and Dev Containers on a dedicated local laptop. Use a Dockerized TypeScript frontend, Python backend, PostgreSQL, Airflow, and PySpark. Use SQLAlchemy/Alembic and Terraform. Initially run Airflow and PySpark **locally**, while deploying frontend and backend as separate container services on **Google Cloud Run** and PostgreSQL on **Cloud SQL**. Secure database connections, backups, and least-privilege access are required.

## 6. Explicitly post-MVP

Additional databases/versions; curated cross-database flow, unit, and LCIA-indicator mappings; assisted process matching including one-to-many and many-to-many relationships; user database uploads; a metadata tab; detailed exchange inspection; multi-output process support; named cloud-saved comparisons; CSV/Excel export; zoom, row reordering, advanced search; and common-method LCIA recalculation. **Design extension points now; do not build these features in the MVP.**

## 7. MVP acceptance

A verified user can select and compare BAFU processes, switch between Flows/Scores, inspect complete signed values without confusing zero and missing, filter for differences, and restore the comparison after browser refresh. The import pipeline is repeatable, auditable, and does not expose partially published data. The app remains interactive with hundreds of process columns, using virtualization rather than an arbitrary selection cap.
