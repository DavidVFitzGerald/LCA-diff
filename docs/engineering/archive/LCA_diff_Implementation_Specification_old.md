# LCA diff — Detailed Product and Engineering Specification

**Status:** Implementation blueprint, 12 November 2026  
**Audience:** AI software engineering agents, human engineers, QA, and maintainers  
**Companion:** `LCA_diff_PRD.md` (under 1,000 words)

> **Scope notation:** **[MVP]** = required for the first release; **[DESIGN-NOW]** = establish an extensible interface/schema now, but do not implement the feature; **[POST-MVP]** = implement later. Unlabeled normative requirements in MVP sections are MVP requirements. This document incorporates all 55 brainstorming decisions, including revisions. Where the original description conflicts with those decisions, the decisions prevail.

## 1. Product contract and domain rules

### 1.1 Objective [MVP]

Provide registered LCA practitioners with a fast, read-only web interface for comparing the **unaggregated unit-process inventories as supplied by the database provider**, displayed in a harmonized schema, and the **provider-supplied LCIA scores**. Here, “unaggregated” describes the unit-process system boundary—not whether accidental duplicate exchange records can be combined during ingestion. No upstream or downstream LCA calculations are performed interactively.

The MVP contains one source release: **BAFU:2026 v1**. It must support selecting arbitrarily many unit processes (no product-enforced hard count limit). The user can compare processes with different reference amounts/units, but the UI must explicitly warn that direct numerical comparison can be misleading. Never silently rescale one selected process to match another.

### 1.2 Immutable data and canonical meaning [MVP]

1. Preserve **original source bytes** plus checksums and provenance.
2. Store **staging records** that retain original XML attributes, element fields, and original spreadsheet cells; give every XML exchange a **synthetic staging ID** because source `exchange.number` is not necessarily unique, even when combined with category and subcategory.
3. Create a harmonized model with **new, stable flow identifiers**, independent of source numbering. Canonical names come from BAFU in the MVP.
4. Align rows using **harmonized flow ID + displayed flow type**. Identical source numbers from distinct ecosphere compartments/subcompartments must not collapse to one harmonized flow.
5. Before harmonization, resolve references and aggregate exchange records mapping to the same `(process, harmonized flow ID, flow type)`; retain a full provenance list of constituents. Aggregation is an ETL transformation, **not** an interactive UI calculation.
6. After publication, do not mutate published flow amounts or impact scores. Runtime formatting, chart scaling, scrolling, filtering, and user-requested equality/difference checks are permitted. No UI-side re-normalization of numerical quantities.
7. Preserve the distinction between **present value 0**, **missing/absent exchange**, and **missing/invalid LCIA score**.
8. Dataset versions remain individually selectable. Reimports/corrections must not silently overwrite previously published releases.

### 1.3 Flow type taxonomy [MVP]

| Source XML condition | Harmonized `flow_type` | Display order |
|---|---|---:|
| `outputGroup = 0` | `Reference` | 1 |
| `inputGroup = 5`, whether amount is positive, negative, or zero | `Technosphere` | 2 |
| `inputGroup = 4` | `Ecosphere Input` | 3 |
| `outputGroup = 4` | `Ecosphere Output` | 4 |

Unknown source group combinations must produce a validation issue, not an arbitrary mapping.

### 1.4 Multi-output exclusion [MVP]

A process containing **more than one exchange with `outputGroup=0`** is classified as multi-output. Preserve its original records and flag its exclusion in validation reports, but **do not publish it into the MVP harmonized process catalog** and do not render it in the selector. A missing reference output (`0` entries) is a separate data-quality error and requires resolution or exclusion. Additional products represented via non-reference exchange groups do **not** by themselves trigger the multi-output rule. Multi-output support is [POST-MVP].

## 2. Verified input characteristics and critical import caveats

### 2.1 Provided artifacts

- `LCA-diff description for initial prompt.md` — original UX and ingestion requirements.
- Five `process_*.xml` files — examples of BAFU process exports in an EcoSpold 01-like structure.
- Three `EcoSpold01*Simple.html` files — schema documentation, useful guidance but **not** an unquestioned validator for these files.
- `BAFU-2026 v1 LCIA Results_corrected.xlsx` — LCIA workbook.

The supplied workbook has an `Info` sheet and a **`BAFU_2026 v1`** data sheet. The data sheet contains **11,947 data rows (Excel rows 3–11,949)**, and **47 indicator columns `E:AY`**, following four identity columns `A:D` (`Product`, `Category`, `Sub-category`, `Unit`). Row 1 identifies methods, with blank cells to be **forward-filled within each method span**; row 2 identifies indicators and their bracketed units. Method spans shown in the file are **IPCC 2021**, **Ecological Scarcity 2021**, and **EF 3.1**. Default indicator: **IPCC 2021 → GWP 100 [kg CO2-eq]**.

**Critical fact:** The spreadsheet does **not** supply the numeric XML `dataset.number` as a dedicated key. A curated, validated **row-to-process reconciliation** is therefore mandatory; do not join using spreadsheet row number. `Product` includes a geographic suffix such as ` - CH`, but may not be a safe primary key on its own. Use product name, geography, category, subcategory, and reference-unit information as a composite matching candidate; verify against XML. When ambiguity remains, require an explicit override. Never fuzzy-match silently.

**Critical unit mismatch:** Some attached XML references use `km` while their workbook rows say `m`; examples also show `tkm` versus `t*km`. This is a real source reconciliation issue, not merely a hypothetical future cross-database issue. See §5.7 for the conservative, explicit score-basis policy. Distinguish conversion **within one source process's score reference basis** from the expressly prohibited **interactive normalization between selected processes**.

The sample XMLs also demonstrate repeated exchanges with the same source `number`, category, subcategory and group (including ecosphere emissions). Such duplicates are not safe to deduplicate by “keep first.” They must be preserved in staging and numerically aggregated during harmonization, with validation records and provenance.

### 2.2 Completeness expectations

The reported input contains ~11,947 XML files; do not assume that count is always exact or sufficient as a validation oracle. Validate the **actual supplied manifest** and explicitly compare the set of parsed process identities against the spreadsheet rows. Different geography suffixes with otherwise identical names may represent distinct processes. A score row that cannot be mapped must never be associated with an arbitrary process. Source labels and source attributes always remain recoverable.

## 3. Recommended MVP technology stack

| Layer | MVP choice | Rationale / boundary |
|---|---|---|
| Frontend | React + TypeScript + Vite, in a Docker image serving a static SPA | Simple client-side grid; separate deployable service |
| Grid/data | TanStack Query, appropriate virtual-grid primitives, drag-and-drop library | Fetch windowed cells, cache requests, reorder columns without rendering all cells |
| Backend | Python, FastAPI, Pydantic | Typed HTTP APIs, generated OpenAPI, high-performance read access |
| Persistence | PostgreSQL; SQLAlchemy 2.x ORM/Core; Alembic migrations | Relational integrity and SQL learning goals |
| User identity | Firebase Authentication email/password; Firebase Admin SDK token verification | Verified self-registration without custom password storage |
| Pipeline orchestration | Apache Airflow, Dockerized on local development laptop | Required technology; local-only initial deployment |
| XML ETL | PySpark in local mode initially, with a portable Spark job entry point | Required technology; parallel ingestion/normalization |
| Local development | VS Code Remote SSH + Dev Containers + Docker Compose | All app development on dedicated laptop; no host-specific manual setup |
| Production app hosting | Two Google Cloud Run services (frontend and backend) | Separate Docker-deployed services; autoscaling |
| Production database | Google Cloud SQL for PostgreSQL | Managed backups and security |
| Raw artifacts / releases | Filesystem for local runs; private Google Cloud Storage for production source archives and release artifacts | Immutable, reproducible release records |
| Images / secrets / IaC | Artifact Registry, Secret Manager, Terraform | Reproducible infrastructure; no committed credentials |

**[DESIGN-NOW]** Airflow and PySpark job entry points should be environment-independent so they can later be deployed on Google Cloud. **[POST-MVP]** Managed Airflow/Spark hosting; do not provision Cloud Composer or an always-on Spark cluster for the MVP. Google currently offers the managed product **Managed Service for Apache Spark** (formerly Dataproc), which can execute serverless batches when needed.

### 3.1 Local topology [MVP]

Use one Dev Container workspace attached via VS Code Remote SSH. `docker compose` profiles start:

- `frontend` (Vite dev server in development; production image serves compiled SPA)
- `api` (FastAPI; hot reload locally)
- `postgres` (application/source data, with named volume)
- `airflow-api` / `airflow-scheduler` and Airflow metadata database **or** isolated Airflow schema (do **not** mix operational tables with LCA application tables)
- `etl` (Python + PySpark + Spark runtime; Airflow tasks invoke `spark-submit --master local[*]` using a reproducible image/environment)

Choose an Airflow executor appropriate to local Compose, e.g. LocalExecutor; keep its UI private to localhost/SSH forwarding. Do not require Docker socket exposure to an Airflow container just to run ETL jobs. An optional Spark standalone cluster profile is permissible for learning, but **not required for MVP correctness**. Add one documented `make dev-up`, `make test`, `make import`, and `make dev-down` flow. Container images and dependency lock files must be pinned/reproducible.

### 3.2 Initial Google Cloud topology [MVP]

```text
Browser
  ├── Cloud Run: frontend (static React container)
  └── Cloud Run: API (FastAPI container)
          └── Cloud SQL PostgreSQL (published harmonized data)

Local dev laptop (Remote SSH / Dev Containers)
  └── Airflow → PySpark / ETL → local staging + ready release
          └── maintainer CLI → validated release transfer → Cloud SQL
                                                  └── explicit atomic publish

Google Cloud Storage: private source archives / release manifests
Artifact Registry: versioned frontend/backend images
Terraform: services, database, IAM, secrets, storage, budgets
```

Deploy Cloud Run services and Cloud SQL in a common selected region. Use the **Cloud SQL Python Connector with SQLAlchemy** or documented Cloud Run/Cloud SQL integration. From the laptop, use **Cloud SQL Auth Proxy** with authenticated access for maintenance operations; do not expose a PostgreSQL listener directly to the internet. Production migrations run through a controlled deployment task, never implicitly on every API startup. Enable automated backups, database deletion protection, reasonable retention, and budget alerts. A simple staging-to-production promotion command is sufficient; a production ETL scheduler is explicitly **not** required yet.

### 3.3 Repository contract [MVP]

```text
lca-diff/
  .devcontainer/              # Remote-compatible workspace definition
  apps/frontend/              # React SPA
  apps/api/                   # FastAPI routes and read-service layer
  packages/contracts/         # OpenAPI-generated TS types / shared schemas
  data_pipeline/
    dags/                     # Airflow DAG definitions
    jobs/                     # Spark parsers/transformers and CLI entry points
    rules/                    # Versioned mapping, alias and validation rules
    tests/                    # Golden XML / spreadsheet fixtures
  db/
    models/                   # SQLAlchemy models
    migrations/               # Alembic
  infra/terraform/            # GCP modules, environments, IAM
  ops/                        # Release, backup, import/publish commands
  docs/                       # Data dictionary and ADRs
  compose.yaml
  Makefile
  README.md
```

Use one monorepo and CI for lint/typecheck, test, container build, migration verification, IaC validation, and vulnerability scanning. Keep local secrets in untracked files or approved credential tooling.

## 4. PostgreSQL data model [MVP unless noted]

Implement normalized relations rather than a single wide JSON table. Use immutable release revisions and foreign keys; retain a source-preserving staging area and a read-optimized harmonized area. Physical SQL names below are recommended and may be adjusted only with a documented ADR; preserve their semantic contracts.

### 4.1 Release and provenance tables

| Table | Essential fields / constraints |
|---|---|
| `database_release` | `id UUID PK`, `database_code` (e.g. `BAFU`), `release_label` (`2026 v1`), `display_name` (`BAFU:2026 v1`), `source_published_at` (maintainer supplied), `ingested_at`, `license_policy`, unique `(database_code, release_label)` |
| `release_revision` | `id UUID PK`, `database_release_id FK`, monotonically increasing `revision_no`, `status` (`staging`, `validated`, `ready`, `published`, `superseded`, `rejected`), `mapping_rule_version`, `manifest_sha256`, `created_at`, `published_at`; unique `(database_release_id, revision_no)` |
| `release_publication` | `database_release_id PK`, `active_revision_id FK`, `activated_at`; a transactionally replaced pointer to the published immutable revision |
| `import_run` | `id UUID PK`, `revision_id`, `dag_run_id`, `started_at`, `ended_at`, `status`, parser/transformer versions, rule revision, counts, structured report URI |
| `source_object` | `id UUID PK`, `revision_id`, `relative_path`, content SHA-256, byte size, object kind (`process_xml`, `lcia_xlsx`, `manifest`), immutable storage URI; unique `(revision_id, relative_path)` |
| `validation_issue` | `id`, `import_run_id`, `stage`, `severity`, `code`, `source_object_id`, `process_source_id`, `exchange_ordinal`, `spreadsheet_row`, `message`, `resolution_state`, `resolution_rule_id`, timestamps |
| `resolution_rule` | `id`, rule type, source release scope, input key, target key / unit factor, author, reason, approval, effective version, checksum; tracked in source control and import manifest |

**Important:** `error` severity is stage-specific. An error in staging may be resolved in harmonization. Publication gates depend on **unresolved critical issues**, not solely the presence of any historical ERROR event. Retain both the original event and its resolution; do not delete logs to make a release pass.

### 4.2 Staging tables (preserve source nomenclature)

| Table | Contract |
|---|---|
| `stg_process` | Synthetic PK; revision; source file; XML `dataset.number`; source reference function attributes; geography; unmodified parsed metadata JSONB; source filename UUID if available; stable extraction ordinal |
| `stg_exchange` | Synthetic PK; parent staged process; **exchange ordinal** (document order); original `number`, `name`, `meanValue` **as text**, `unit`, `category`, `subCategory`, `location`, `inputGroup` or `outputGroup`, JSONB of all original attributes and child elements |
| `stg_lcia_row` | Synthetic PK; revision; **original Excel row number**; values `A:D` as supplied; original score cells `E:AY` as text/structured JSONB; reconciliation state |
| `stg_lcia_column` | Original Excel column address/index, method from row 1, complete indicator header from row 2, parsed indicator label and unit, stable source order |
| `stg_reference_resolution` | Source exchange PK, attempted source process number, resolved process PK or explicit fallback state, applied mapping rule and diagnostics |

Do **not** put `UNIQUE(process_id, exchange.number)` or `UNIQUE(process_id, exchange.number, subCategory)` on staging exchanges. The real unique record key is `(stg_process.id, exchange_ordinal)`. Keep original source fields separately even if a derived typed representation exists. XML text (comments, uncertainty, flags) may be retained in JSONB without dedicated first-class fields in the MVP.

### 4.3 Harmonized catalog and measurements

| Table | Essential fields / constraints |
|---|---|
| `harmonized_flow` | `flow_id UUID PK`; canonical name, canonical unit, category, subcategory, location/compartment metadata as relevant, flow identity namespace, mapping status; stable across imports |
| `source_flow_identity` | `(source database, source identity fingerprint, reference context) → flow_id`; unique source identity in its declared scope; mapping provenance / rule ID; supports reuse across releases |
| `harmonized_process` | `process_id UUID PK`, revision FK, `source_process_number`, name, geography, category, subcategory, reference product name, reference amount, reference unit; unique `(revision_id, source_process_number)`; flag quality warnings |
| `harmonized_exchange` | `process_id FK`, `flow_id FK`, `flow_type ENUM`, `amount NUMERIC NOT NULL`, flow label metadata; **unique `(process_id, flow_id, flow_type)`** |
| `exchange_provenance` | `(harmonized_exchange PK reference, stg_exchange_id)` many-to-one links, each original amount, aggregation group/reason |
| `impact_method` | `id`, provider/source database, method name/version, source display order; unique method identity in its defined scope |
| `impact_indicator` | `id`, method ID, optional category, indicator label, original header/unit, display order, canonical comparison identity [DESIGN-NOW] |
| `process_score` | `(process_id, indicator_id)` PK, `amount NUMERIC NULL`, `status` (`valid`, `missing`, `unresolved_basis`), `source_basis_unit`, `resolved_basis_unit`, source row and column references, applied conversion rule ID |
| `process_warning` | Process/flow or process/score scoped public warning code, safe display text, provenance link, linked validation issue |

Keep the `impact_method`/`impact_indicator` data model source-aware. BAFU's supplied scores are **provider results**, not values independently recalculated by LCA diff. Only use verified indicator identities to align provider scores across databases in a future version.

Use PostgreSQL `NUMERIC` without an application-imposed 10–15 decimal-place truncation for all scientifically significant stored amounts. Parse source decimal **strings** into Python `Decimal` with a controlled sufficient precision during ETL. Transmit numerical measurements via the HTTP API as **decimal strings**, not JavaScript floating-point literals; display and exact equality checks must not lose meaningful stored precision. Numeric conversions for chart pixel coordinates can happen separately without altering the canonical value.

### 4.4 Flow identifier registry and identity keys

**Required invariant:** Every harmonized `flow_id` refers to exactly one scientifically comparable canonical flow identity, including relevant compartment and unit semantics. Two records must not share a `flow_id` merely because `exchange.number` matches.

For **BAFU MVP**, derive or register a stable source identity from the source flow number plus **all meaning-determining discriminators**: source flow family (technosphere/reference vs. elementary), source category, source subcategory/compartment, canonical unit, and environmental location where applicable. The exact tuple must be encoded in a versioned canonical key function covered by tests. Do **not** use signed amount or display process column as part of a normal shared flow identity. Keep `flow_type` in the comparison row key; a reference and technosphere appearance can share a physical flow ID but remain distinct row types.

Technosphere identity is preferentially resolved via the referenced source process (`exchange.number` → XML `dataset.number`) so the canonical Process Name and geography come from the **referenced process**, not the exchange's potentially stale location attribute. A repeated source number with **different** environment subcategories (e.g. emissions to two air compartments) must receive different IDs; repeated exchanges whose complete canonical identity agrees receive the **same ID** and are summed for one process. Any incompatible units for a proposed same flow ID are a blocking conflict until explicitly resolved.

Stable ID assignment may use a namespaced deterministic UUID (`UUIDv5`) based on a canonical fingerprint, but must check for semantic collisions and retain a **persistent registry**. On new source versions, reuse an existing ID only when the identity is verified as equivalent. Do not accidentally merge two items because a provider reused its numeric identifier. For unknown or unresolved technosphere references, assign a **clearly scoped provisional ID** that cannot be mistaken for a verified cross-process match; its context must prevent accidental global alignment.

**[POST-MVP]** Curated cross-database source-flow mappings point to the same harmonized ID only after unit and amount transformations have been verified. The mapping implementation is deliberately outside MVP scope; keep schema and importer interfaces ready for it.

### 4.5 Indexing and read access

Add at minimum:

- B-tree index on `(revision_id, category, subcategory, name)` and on `(revision_id, geography)` for process tree/search.
- Case-insensitive search support using normalized searchable fields (and PostgreSQL trigram indexing only if profiling justifies it; fuzzy matching is not an MVP UI behavior).
- Index on `harmonized_exchange(process_id, flow_type, flow_id)` plus `(flow_id, process_id)` for row-union and cell retrieval.
- Index on `process_score(process_id, indicator_id)` and its reverse order.
- Index on `impact_indicator(method_id, display_order)`.
- Scope all public API queries to **published** `release_revision` IDs. No endpoint may leak staging/raw records.

Store front-end tree category paths in a derived browse structure or a materialized catalog index if necessary; refresh it during publication, not per UI keystroke.

## 5. Airflow + PySpark ingestion contract [MVP]

### 5.1 Inputs, manifest, and CLI

Supply the **complete** BAFU XML release in addition to the five attached examples before attempting a full production import. The uploaded five XML files are **test fixtures**, not a substitute for the approximately 11,947 files required by the full MVP. The workbook is supplied in full.

A maintainer-owned versioned manifest (YAML/JSON) must contain at least:

```yaml
release:
  database_code: BAFU
  release_label: "2026 v1"
  display_name: "BAFU:2026 v1"
  published_date: null            # maintainer must supply/verify
  license_policy: all_verified_users
sources:
  process_xml_directory: /data/raw/BAFU_2026_v1/processes
  lcia_workbook: /data/raw/BAFU_2026_v1/BAFU-2026 v1 LCIA Results_corrected.xlsx
  lcia_sheet: "BAFU_2026 v1"
validation_rules: data_pipeline/rules/bafu_2026_v1.yaml
score_basis_rules: data_pipeline/rules/bafu_2026_score_units.yaml
```

The CLI should expose consistent commands (names indicative):

```text
lca-import prepare --manifest <file>
lca-import run --manifest <file>           # trigger/monitor Airflow DAG
lca-import report --run-id <id>            # machine-readable + human summary
lca-import promote --revision <id> --target production
lca-import publish --revision <id> --target production
lca-import rollback --release <id> --revision <previous-id>
```

`prepare`/`run`/`promote` must not make data publicly visible. `publish` is the **separate explicit action** approved in Decision 28. `rollback` transactionally restores an earlier active revision pointer, retaining the published revision history. Validate operator role and manifest checksums before any promotion or publication.

### 5.2 Pipeline DAG

A single manually triggered, idempotent Airflow DAG should orchestrate:

1. **Register revision / freeze manifest** — identify source release, create a new import run and candidate revision; compute checksums, detect repeated/changed inputs, record tool/rule versions.
2. **Archive raw artifacts** — keep source bytes unchanged on the local devbox and publish an immutable, private source archive to Cloud Storage as part of promotion.
3. **Parse process XML with PySpark** — create source-preserving records and parse diagnostics. Use Spark `binaryFile` or a similarly bounded parallel read, with secure XML parsing (no DTD/external entity/network resolution). Maintain source file path and exchange order. Do not load all files into driver memory.
4. **Load staging** — batch insert/COPY extracted process and exchange rows into PostgreSQL, with immutable raw source values and a per-exchange ordinal. Capture all stage-level validation issues.
5. **Parse LCIA workbook** — read the named sheet, preserve row/column coordinates and raw numeric cell text as accurately as the input parser supports, parse method/indicator headers, stage rows and metadata.
6. **Validate sources and reconcile processes** — resolve process identities, identify multi-output exclusions, validate source process number uniqueness, map workbook rows to XML processes, resolve technosphere links.
7. **Apply harmonization rules** — transform source group codes into flow types, generate/reuse stable flow IDs, choose canonical descriptions, resolve approved score-unit rules, and aggregate duplicate exchanges **in PySpark or a deterministic SQL aggregation stage**, with complete provenance.
8. **Load harmonized candidate** — bulk-write into revision-scoped candidate relations; add/refresh query indexes and browse-tree materializations.
9. **Quality gates / readiness** — validate row counts and semantic invariants; mark revision `ready` only if there are no unresolved critical issues. Save machine-readable `report.json`, anomalies CSV/Parquet, and a readable summary.
10. **Produce promotion artifact** — signed/checksummed manifest, database export/bulk-loading files, provenance and validation report. Record an exact content hash and pipeline version.

`promote` then transfers the candidate into the production Cloud SQL database in **non-visible, revision-scoped** tables/partitions using efficient bulk loading; a final verification checks hashes/counts/foreign keys. The `publish` command atomically updates `release_publication.active_revision_id` inside one database transaction. Clients switch revision consistently; none see a partially loaded release. Re-run steps must be safe/idempotent, with retries and immutable records rather than silent overwrites.

### 5.3 XML parsing rules

- Parse `<ecoSpold><dataset>` and its `number`; read `<metaInformation><processInformation><referenceFunction>`; `<geography location="...">`; `<flowData><exchange>`.
- The XML files can differ in child order, spelling of boolean values (`true`/`True`), optional attributes, and metadata completeness. Parse by **tag/attribute**, never by element position.
- Capture exchange fields `number`, `name`, `meanValue`, `unit`, `category`, `subCategory`, `location`, `inputGroup`/`outputGroup`, plus all remaining source attributes/children. Do not discard `generalComment` or uncertainty fields from staging.
- Keep source decimal text, leading/trailing meaningful text, and original strings. Reject or report NaN/Infinity/malformed quantities. Unescaped invalid XML must generate a critical issue with file identity rather than crash an entire multi-file Spark task.
- Validate `dataset.number` uniqueness **within a release**; duplicates referring to distinct processes are a critical identity conflict. A file-naming UUID and textual UUID in comments may be captured as supporting provenance but are not substitutes for `dataset.number` without an approved rule.
- Use the actual `outputGroup=0` exchanges to identify reference products. Exclude processes containing more than one such exchange. The reference amount, name and unit in the process header come from the validated reference exchange; compare these to `referenceFunction` attributes and log inconsistencies.
- Interpret hierarchical subcategory delimiters for UI browsing but preserve the exact original string in staging and the canonical normalized path in the harmonized record.

### 5.4 Stage-level errors vs harmonization warnings

| Issue | Staging behavior | Harmonization / publish behavior |
|---|---|---|
| Same source exchange identity repeated in one process | **ERROR**; preserve every occurrence | Sum amounts with same full harmonized `(flow ID, type)`; **WARNING** with constituent IDs; then eligible for publication |
| Same number in distinct environmental compartments | Preserve; do not treat as duplicate | Give **different** harmonized flow IDs; no forced aggregation |
| Technosphere reference number absent from imported processes | **ERROR**, preserve original reference/name/location | First apply approved manual mapping; otherwise create distinct safe fallback using original fields and `unresolved reference` warning; **block loading if neither mechanism is implemented** |
| XML process has multiple `outputGroup=0` records | Record exclusion issue | Preserve staging, **exclude** from published process catalog; issue does not necessarily block unrelated processes |
| Source process has invalid or conflicting stable identity | **ERROR** | **BLOCK** until resolved or excluded under an explicit documented rule |
| Source group code unknown | **ERROR** | **BLOCK** relevant process/release until mapped or excluded |
| LCIA row missing/unmatched/ambiguous | Record with source row | Do not make up score link; process may publish with `N/A`; retain unmapped row report |
| LCIA cell missing or unparsable | Record cell error | Return score `N/A` with appropriate quality warning; never use `0` as fallback |
| Score reference unit/basis unresolved | Record discrepancy | Return `N/A` until resolved by an approved explicit rule; preserve source score/basis in staging |
| Numeric overflow/underflow/non-finite unrepresentable amount | **ERROR** | **BLOCK** affected harmonized exchange or explicitly exclude the process per reviewed rule |

**Interpretation of log severity:** A staged ERROR documents a defect in the source, not a mandate to abort source retention. A handled error can transition to `resolved` while its historical event remains. A validated fallback is a **deliberate resolution path**, not a claim that the original data is correct. Publish only when every critical error has an approved resolution/exclusion and the resulting harmonized data passes referential and numerical consistency checks.

For technosphere fallback, do not claim the reference is verified. Populate a visible warning on the **affected exchange/process cell**, with a safe explanation and, if appropriate, the unresolved source reference number. Fallback IDs must not accidentally equate missing references across unrelated processes.

### 5.5 Aggregation semantics

For a given harmonized process `P`, harmonized flow `F`, and `flow_type T`, define:

```text
amount(P,F,T) = exact_decimal_sum(
  stg_exchange.meanValue for every source exchange that maps to (P,F,T)
)
```

Preserve every contributing staging record and source amount via `exchange_provenance`. The positive/negative signs are **not** transformed into different flow types. Mixed-sign occurrences may cancel exactly to zero; that **still counts as a present flow** and must result in a displayed `0`, not an absent cell. If source exchanges with the same candidate identity disagree in canonical unit or meaning, do **not** sum until a deterministic approved normalization or separation rule resolves the conflict.

### 5.6 LCIA workbook extraction and matching

- Locate sheet **`BAFU_2026 v1`** by name, not first worksheet position.
- Row 1: method headings across `E:AY`; **carry forward the last non-empty method cell** until the next heading. BAFU has no additional impact-category level. Row 2: full indicator headers, including `[unit]`; preserve source string and parse unit only from a verified trailing bracket group. Store original column index to preserve presentation order.
- Rows 3 onward: `A = Product`, `B = Category`, `C = Sub-category`, `D = Unit`. Score cells `E:AY` may be zero, negative, very small, or missing. Convert numeric values to exact decimal representation as far as the workbook permits.
- Construct source candidate matches by the XML reference name and geography (prefer comparing against a verified `name + " - " + geography` representation), plus category, subcategory, and reference-unit equivalence rules. A trailing ` - CH` or similar suffix must be parsed cautiously; do not use a substring occurrence to infer a unique match.
- Use a **deterministic, conservative matching pass**. If exactly one high-confidence XML process matches, link it and record the evidence. If no match or multiple matches, require `row → dataset.number` rules in a version-controlled reconciliation file; otherwise leave unmapped and log.
- Validate both directions: XML processes without score rows, workbook rows without processes, duplicate worksheet keys, and incompatible reference bases. If an excluded multi-output process has a spreadsheet row, keep that row staged without publishing process scores.
- Build **one score record per `(published process, indicator)`** with status. A process lacking some/all scores still appears in the app. Use `N/A` only for missing or unusable scores; exact zero remains exact zero.

### 5.7 Score basis and unit discrepancies: explicit policy

**Do not guess or silently convert.** The sample transport processes show discrepancies such as XML reference `km` versus workbook `m`, or XML `tkm` versus workbook `t*km`. Implement the following:

1. Persist both the **XML reference quantity and unit** and the **workbook score reference unit** independently.
2. Normalize harmless **unit spellings** only through an approved alias table (`tkm`/`t*km` may be equivalent if verified); persist the applied rule.
3. If dimensions/bases differ (e.g. `km` versus `m`), require an **explicit, verified, source-specific conversion rule** before associating a published score with the XML reference basis. If the workbook's scores are confirmed to be per 1 m and XML reference is per 1 km, ETL would multiply the workbook score by 1,000 **for that process's XML reference basis**; this is permitted **inside harmonization**, not triggered by the user selecting processes.
4. If the basis or conversion direction cannot be verified, publish the process and its flows but mark the affected score `unresolved_basis` / `N/A`. Do not place a raw per-metre score under a per-kilometre header as though it were comparable.
5. Log the mismatch, evidence, approved factor, source unit, target unit, original score, normalized score, and rule ID. Ensure outputs are deterministic on re-import.

**Implementation caveat:** The brainstorm prohibited **automatic comparison normalization in the MVP**, not audited correction of incompatible reference bases between two files from the **same source release**. This ETL reconciliation is needed for scientifically valid display. Whether the BAFU workbook's `m` entries truly denote a different quantitative basis must be **verified with the provider/source documentation**; the examples alone are not proof of conversion direction. Until verified, use `N/A`, not an assumed factor.

### 5.8 Publication gates and reports

A candidate revision may be `ready` if:

- Every published process has exactly one valid reference output and unique identity within its revision.
- Every harmonized exchange has a valid flow identity, flow type, unit, finite decimal amount, and provenance.
- Source exchange duplicates have been retained, aggregated correctly, and resolved in issue tracking.
- Missing references have approved manual resolution or explicitly scoped fallback, with a process/flow warning.
- Excluded processes and missing scores are counted and reported, never silently dropped.
- An approved score basis exists for every *published numeric score*; otherwise that score is `N/A`.
- No unresolved **critical** validation issue remains; expected source counts, release checksums, and source-to-target record/reconciliation metrics are recorded.

Generate at least `run.json`, `validation_issues.csv`, `process_match_report.csv`, `score_basis_report.csv`, `excluded_processes.csv`, `aggregation_report.csv`, and `release_manifest.json`. Include totals for input files, parsed/failed XML, staging rows, harmonized processes, excluded multi-output processes, source exchanges, aggregated exchanges, resolved/fallback links, matched/unmatched workbook rows, valid/missing scores, and ready/published status. Make these reports consumable by CI and humans.

## 6. Frontend behavior and UX [MVP]

### 6.1 Routes, authentication and layout

- Unauthenticated `/` displays a centered **LCA diff** title, email/password login, links to registration and password reset. Registration is open to anyone; require email verification before any comparison API access. Use email as the user identifier; a separate username is **not** required despite the earlier landing-page wording.
- Authenticated users land in `/app` with a full-width top bar: LCA diff branding at left; account/logout and settings at right. Settings may contain nonessential display preferences and account/logout links; do not build a large preference system in MVP.
- Desktop/laptop only. Mobile shows an explanatory larger-screen-needed state and must not attempt to render the full virtualized comparison grid. The desktop grid must work in current Chromium and Firefox, with Safari support tested if practicable.
- App body: collapsible **left process selector**; central **Flows** and **Scores** tabs; collapsible **right LCIA indicator selector** in Scores only. Default: left open, right open in Scores, Flows selected. Keep tab-specific layout settings independent for later tabs.
- The comparison grid is read-only. Do not present editing, export, process mapping, score calculation, user data uploading, or named comparison saving in MVP.

### 6.2 Process selector and search

The tree shape is:

```text
BAFU:2026 v1 [checkbox/expand]
  category [checkbox/expand]
    subcategory segment [checkbox/expand]
      next subcategory segment [checkbox/expand]
        process — geography [checkbox]
```

For `transport systems / road\operations\infrastructure`, the latter three path segments become separate nested nodes. Retain source strings for matching/data integrity. Display database versions as separate roots, [DESIGN-NOW] even though only one exists in MVP.

At top, show primary process-name search field and a one-click clear `×` button. An **Advanced search** expansion contains: Process Name, Geography, Category, Subcategory, Reference Flow Name. Defaults: only Process Name displayed and active. Search rules:

1. Case-insensitive substring matching; tokenize each field on whitespace. **All words in a populated field must match**, in any order, and **all populated fields** must match (logical AND).
2. No stemming, synonym matching, automatic approximate matching, regex syntax or Boolean operators in MVP. Normalize harmless whitespace for input, but do not rewrite stored names.
3. Search is reactive with short debounce (e.g. 200 ms) and request cancellation for obsolete queries; results appear within the existing category tree, only matching leaves shown and ancestors expanded.
4. Clear-search resets the search fields and restores the full tree; **never clear selected processes** as a side effect.
5. If a category checkbox is used during an active filter, apply its select/deselect action **only to matching descendant processes**, including any not currently mounted on screen due to virtualization. When no filter is active, affect all descendant processes.
6. Parent checkboxes are checked, unchecked or indeterminate relative to their **currently actionable scope** (filtered children when filtering; full descendants otherwise).
7. Search does not automatically deselect processes hidden by a new filter, and previously selected processes stay visible in the comparison pane.

Bulk actions: select all **search matches**, deselect all matching, category/subcategory select/deselect, and individual toggles. The right-side of the sidebar or a collapsible lower section shows **Selected processes (N)** with virtualized items; allow single removal and **Clear all** (ask for confirmation only if necessary to prevent accidental loss of a very large selection). Selected processes remain selectable/removable when outside the current search results.

### 6.3 Column selection, order and headers

- On selection, append a process column immediately. Single selections preserve **selection order**; bulk actions append only newly selected processes in **alphabetical process-name order** (use a deterministic geography/ID tie-break).
- Support drag-to-reorder process columns in either tab. A small `×` is exposed in a process header on hover/focus; clicking it deselects that process globally and removes its column from both tabs and the selected list. Provide a keyboard-accessible removal control as well.
- Display **the same metadata in both tabs:** Process Name; Location; Reference Flow Name; Reference Amount; Reference Unit. Long fields ellipsize; hover/focus reveals the full text. The process/release identity remains available in tooltip/accessible name. The MVP has exactly one reference output per published process.
- If selected processes differ in **reference amount or unit**, show a non-blocking comparability warning above the grid, with explanatory tooltip: no normalization has been applied and values may be based on different quantities or units. The warning does **not** prevent comparison.
- Column width is computed separately for each tab. Suggested initial bounds: max 230–260 CSS px, min 110–130 CSS px (final tune in visual QA). Use `width = clamp(available_grid_width / process_count, tab_min, tab_max)` when crowded; while fewer columns fit, keep their normal max width. Once the minimum is reached, preserve that minimum and scroll horizontally. Use text ellipses, multiline compact header layout and tooltips rather than microscopic text. [POST-MVP] Zoom.
- Synchronize horizontal scrolling between process headers and process-value cells. Keep all relevant **identifying fields** visually pinned on the left, and the process headers and metadata header pinned vertically. Implement the identifying fields as a bounded sticky block with compact inner columns (not seven wide, unconstrained sticky columns); all named fields must still be visibly present. Keep the grid usable when the left/right sidebars are expanded.

### 6.4 Flows tab

- Flows is the initial tab and initial content after selecting a process.
- Each row is the union of `(harmonized_flow_id, flow_type)` occurring in at least one selected process. **Do not** create rows for unselected/unrepresented flows; remove a row when its last contributing selected process is deselected.
- Identifying fields in order: **Type, Flow Name, Location, Process Name, Category, Subcategory, Unit**. For reference/technosphere flows, Process Name is the relevant canonical/ref-linked process name; for ecosphere it can be blank. Technosphere Location comes from the referenced process when resolved. Ecosphere Location may be absent; show a blank or em dash instead of inventing a geography.
- Sort groups in order **Reference → Technosphere → Ecosphere Input → Ecosphere Output**; within group, sort case-insensitively by Category → Subcategory → canonical Flow Name, with stable ID tie-break.
- A flow may be **present with exact `0`** or **absent**. Present-zero gets a numeric `0` label; absent gets an empty cell with neither a bar nor a label. Never treat absent as zero when filtering.
- If a reference/technosphere flow has a fallback unresolved source link, show a warning icon and a tooltip associated with the **affected process/flow cell**. Other processes on the same row must not implicitly inherit that warning.
- Alternate very subtle row background shades rather than draw visible horizontal borders. If virtualized rows have different heights, maintain stripe consistency by row index.
- Both horizontal and vertical scrolling must remain usable with hundreds of columns and potentially thousands of rows. Virtualize grid **rows and process columns**, fetching cell windows on demand.

### 6.5 Scores tab and indicator selector

- The same selected processes and process-column order appear as in Flows. Switching tabs must not change selection or ordering.
- Sticky left identifying fields: **Method, Category, Indicator, Unit**. `Category` is blank for the BAFU workbook; retain the data model for other methods.
- Right sidebar displays **method → optional category → indicators**, with expand/collapse affordances and checkboxes. Expanding a method reveals all its child indicators, including optional category headings if they exist. Selecting a method/category selects/deselects all descendants; parent checkboxes are tri-state.
- **Default selection:** only **IPCC 2021 / GWP 100**, even before any processes are selected. Adding indicators adds rows immediately; deselecting removes rows. Show indicator rows in **source workbook order `E:AY`** (not alphabetical) within the MVP.
- Display every selected indicator for every selected process. A valid zero is displayed as `0`; a missing/unmapped/unresolved-basis score displays **`N/A`** (with tooltip where useful). Never render a bar for `N/A`.
- All score values are provider-supplied or source-basis reconciled **during ingestion**. No runtime LCIA computation. Only compare scores as equivalent if their provider method + version + indicator + unit are verified to match. For BAFU MVP, use native method/indicator keys. [POST-MVP] Verified cross-database indicator mapping.

### 6.6 Signed bar visualization: exact geometry

Use the same component and value formatting rules in Flows and Scores. For each displayed row and selected processes, ignore **absent/N/A** entries when calculating bar magnitude but retain them as semantic states. Define:

```text
P = max(0, all present positive values)
N = max(0, absolute value of all present negative values)
M = max(P, N)
H = nominal chartable height of a standard row (excluding padding/labels)
```

For `M > 0`:

| Signs present | Total chartable height | Zero-axis placement |
|---|---|---|
| Positive only (or positive + zeros/absences) | `H` | near bottom |
| Negative only (or negative + zeros/absences) | `H` | near top |
| Both positive and negative | `H × (P + N) / M` | `H × P / M` below the top edge |

A positive value draws a bar **upward** from zero of height `H × value / M`; a negative draws **downward** of height `H × abs(value) / M`. The largest absolute value always has height `H`, irrespective of sign, and a mixed row grows by a factor of up to **2×**, as originally specified. Example `min = -80`, `max = +20`: below-zero component `H`, above-zero component `0.25H`, total `1.25H`. Always place the bar baseline at **data y=0**.

For `M = 0` (all values zero/absent/N/A), use the standard row height, a thin zero baseline near the top, and no positive/negative bars; still print labels for **present zeros**. Missing/absent cells remain blank or `N/A` as applicable.

Color: positive bars are green, negative bars red; saturation/opacity increases monotonically with absolute magnitude relative to `M`. Use distinct hue and accessibility-supporting sign/number labels; do not rely solely on color. Zero has no substantive bar. Numerical labels contain the **value only** (no unit); place labels just **above** the zero axis except when all populated values are non-positive, when labels go **below** it. Avoid overlap via a reserved text strip or responsive text layout without changing numerical geometry. Use separate padding around chart area.

Formatting: use **adaptive decimal/scientific notation** suitable for extremely small or large values and avoid labels that do not fit. Hover/focus reveals the **full stored decimal precision**. Comparison/equality decisions must use the full canonical numeric value, **not rounded display text**. Keep unit in the identifying column/header, not appended to each number.

### 6.7 Independent “Show differences only” toggles

Each tab has its **own** toggle, initially OFF. It is disabled and unchecked while **fewer than two** processes are selected. With two or more:

- **OFF:** show all relevant flows (Flows), or all selected indicators (Scores). **Do not perform cross-process numerical difference computation** merely to populate the default grid.
- **ON:** Flows: hide a row only if every selected process has the same **present amount** for that row. If one process is missing the flow while another has it—even a zero amount—**show** the row. Scores: hide a row when all selected processes have the same score **state and exact value**; show when one is valid and another `N/A`, or their valid amounts differ. Uniformly missing/N/A scores are not meaningful differences.
- Exact equality; no numerical tolerance or percent-threshold setting in MVP. Values `-0` and `0` are numerically equal but both remain present; handle sign-of-zero for display consistently.
- **Compute only on activation or when inputs change while ON**. Cache the computed eligible-row set in the front-end query cache (and optionally short-lived backend cache). Toggling OFF then ON with unchanged inputs should reuse it. Invalidate cache when selected process identities, published revision IDs, indicator selection, or actual underlying release data changes. Column **order** changes do not change the difference set.
- A newly disabled toggle after reducing selection to one process resets to OFF. Both tabs persist their independent toggle state in browser storage when valid.

For large comparisons, the **backend** may compute row-difference predicates across selected processes and return a windowed set of visible row IDs; this is a runtime query, not modification of stored LCA values. Do not fetch an entire millions-of-cells matrix solely to determine differences.

### 6.8 States, accessibility, and persistence

- With no processes: show an actionable empty state explaining selection. With one: show all rows, difference toggle disabled. With no matching search results: show an explicit no-results message without clearing selections. With no chosen indicators: Scores shows a select-an-indicator empty state.
- Loading large comparisons: progress/skeletons and a non-blocking performance notice. **Never** require confirmation just for a large selection. Keep controls responsive and allow cancellation.
- All checkboxes, tree disclosure buttons, tabs, selected-process removal, column actions, tooltips, and sidebars must be accessible via keyboard; expose focus rings, labels, `aria-checked="mixed"`, informative warnings, and contrast appropriate for quantitative data.
- Save the following under a versioned, **user-UID-scoped** browser storage key: ordered process IDs, selected indicator IDs, current tab, Flows difference toggle, Scores difference toggle. Restore on reload/revisit using the same browser. **Do not** persist search filters, temporary expanded tree nodes, or sidebar collapse state. Selected processes removed from the published catalog on a later revision should be skipped with a visible explanation.
- Sign-out does not delete this account-scoped state; sign-in as another user must **never load or display** the first user's stored state. Browser storage is not a strong boundary against a person with control of the same operating-system browser profile; do not store secrets or proprietary raw payloads there. Explain shared-browser limitations in privacy guidance if relevant.

## 7. Backend API contract [MVP]

Version all endpoints under `/api/v1`. Frontend-generated TypeScript types should come from FastAPI OpenAPI. Backend response DTOs should contain both stable identifiers and display metadata. A logged-in, **email-verified** user may query all published BAFU processes; unpublished revisions and raw/staging sources require maintainer privileges and must not be accessible via user APIs.

### 7.1 Proposed endpoints

| Method + route | Purpose / essential behavior |
|---|---|
| `GET /api/v1/me` | Verified authenticated identity and relevant access flags |
| `GET /api/v1/releases` | List published database versions, stable release and active revision IDs; only authorized versions |
| `POST /api/v1/processes/search` | Search/filter by fields and category path; return hierarchical result nodes with descendant counts and cursor pagination; preserve search logic §6.2 |
| `POST /api/v1/processes/resolve-selection` | Resolve search+branch/all-matching action into **all eligible process IDs**, not just rendered page; return deterministic alphabetical order and count |
| `POST /api/v1/processes/headers` | Bulk fetch process names, locations, reference names/amounts/units, publication revisions, public warnings |
| `GET /api/v1/indicators/tree` | Method/category/indicator tree, source order, and default selected indicator; scoped to published available releases |
| `POST /api/v1/comparison/flows/rows` | Ordered union of flow identities across selected processes; optional `differences_only`; paginated metadata and a comparison cache token |
| `POST /api/v1/comparison/flows/cells` | Window of `(flow row IDs × selected process IDs)`; exact decimal amounts or absent, with cell-scoped warning codes |
| `POST /api/v1/comparison/scores/rows` | Ordered selected indicator rows, optional `differences_only`; output source order, missing-score metadata |
| `POST /api/v1/comparison/scores/cells` | Window of `(indicator IDs × selected process IDs)`; valid amount or `N/A` state |
| `GET /api/v1/health` | Liveness; separate readiness route may check database connection safely |

Use POST for complex comparison/search bodies and GET for resource metadata. Search/retrieval must be **read only**. Avoid endpoints returning millions of cells in one response. Request only row ID ranges and process-column ranges currently visible, with modest overscan for fast scrolling. An API may limit **transport batch sizes** for reliability; this must never be interpreted as a **product-wide maximum number of selected processes**. If the process selection is very large, internally chunk requests and compute consistent aggregate results server-side.

### 7.2 Example request/response shape

```json
POST /api/v1/comparison/flows/cells
{
  "process_ids": ["<process-uuid-1>", "<process-uuid-2>"],
  "row_keys": ["<flow-uuid>|Technosphere"],
  "revision_snapshot": ["<published-revision-uuid>"]
}
```

```json
{
  "revision_snapshot": ["<published-revision-uuid>"],
  "cells": [
    {
      "process_id": "<process-uuid-1>",
      "row_key": "<flow-uuid>|Technosphere",
      "present": true,
      "amount": "0",
      "warnings": []
    },
    {
      "process_id": "<process-uuid-2>",
      "row_key": "<flow-uuid>|Technosphere",
      "present": false,
      "amount": null,
      "warnings": []
    }
  ]
}
```

For Scores, replace `present` with a categorical `status` (`valid`, `missing`, `unresolved_basis`) and nullable decimal amount. Missing score statuses must never be changed to valid zero. All list/grid endpoints return stable row IDs, deterministic sort keys, source release/revision IDs and an explicit `next_cursor` where applicable. **Do not serialize decimals as JSON numbers**.

### 7.3 Query, cache, and revision consistency

- Search requires indexed server-side filtering; return result IDs/counts and hierarchy data without fetching exchange payloads.
- Comparison row metadata can be computed by SQL `SELECT DISTINCT`/grouping over selected processes; cell amounts are joined by `(process_id, flow_id, type)` and score keys. Avoid one SQL query **per cell** (N+1).
- For difference filtering, calculate on the server **only if requested**. For each candidate row, distinguish absent vs present before comparing exact numeric values. Conceptually, a flow row differs if `present_count < selected_process_count` **or** `min(amount) != max(amount)`; scores differ if their presence/status differs or their valid amounts differ. Account for duplicate-safe normalized rows so the comparison predicate has one value per process/row.
- Cache filtered row IDs/results keyed by a canonical set of process IDs (order-independent), release revision IDs, selected indicator IDs, tab, and difference flag. TanStack Query can retain results while the user toggles tabs/flags. Bounded server caching is optional; correctness must not depend on one Cloud Run instance holding cache entries.
- Every grid session carries a **revision snapshot** from the initial metadata response. Later cell requests must use the same published immutable revision data, even if an admin publishes a new revision meanwhile. After a new publication, show a non-blocking refresh notice or explicitly reload the workspace as a unit; never mix rows and cells from different revisions.
- Use keyset/cursor pagination for large sorted result sets; protect SQL from unlimited synchronous work via timeouts, response size budgets, indexes and cancellation. No product-enforced hard process-selection cap.

### 7.4 API errors and observability

Return structured errors with machine-readable codes: `AUTH_REQUIRED`, `EMAIL_NOT_VERIFIED`, `RELEASE_UNAVAILABLE`, `UNKNOWN_PROCESS`, `INVALID_FILTER`, `STALE_SNAPSHOT`, `REQUEST_WINDOW_TOO_LARGE`, `TEMPORARILY_UNAVAILABLE`. HTTP status codes must distinguish 401, 403, 404, 409, 422, 429, and 5xx appropriately. Use request correlation IDs, structured logging, minimal PII, operational metrics, tracing for slow queries, and production error monitoring. Never return XML comments or raw provider source payloads unintentionally in standard comparison endpoints.

## 8. Security, reliability, operations [MVP]

1. **Authentication:** Firebase Authentication email/password registration and verification; login, password reset and logout flows. Require verified Firebase ID tokens on every private API call; derive user UID server-side rather than trust submitted user IDs. Deny unverified users. Follow provider best practices for session expiry and token revocation.
2. **Authorization:** One shared published BAFU release entitlement for all verified registered users. Model entitlements behind an interface for later per-database licenses; do not expose unpublished or proprietary releases without explicit entitlement checks.
3. **Database:** Least-privileged read-only API DB role for harmonized data; separate ETL/import/publish roles; Alembic migration role; TLS/authenticated Cloud SQL access. Never run the app using a superuser DB credential.
4. **Secrets:** Google Secret Manager for production secrets; least-privilege service accounts; no credentials, service account keys or raw data blobs committed to Git. Public Firebase client configuration is not treated as a secret; private Admin credentials are.
5. **Transport and UI:** HTTPS, controlled CORS origins, CSP where possible, parameterized SQL, safe output escaping, rate limiting and input-length limits, secure password flows through identity provider, no raw user input in SQL/XML transforms.
6. **Data license:** Before publishing centrally hosted BAFU files and scores, confirm the applicable data redistribution/hosting license. “All registered users can access” is a product access rule, **not** proof of permission to redistribute the dataset. Store source license/version metadata.
7. **Database resilience:** Cloud SQL automated backups, deletion protection, monitored storage, restore procedure and tested rollback. Archive release manifests and checksums. Keep immutable prior published revisions for rollback while controlling retention/cost.
8. **Airflow:** Local orchestration UI is not internet-facing. Its metadata database and logs are segregated from end-user data. Lock down execution credentials and avoid unsafe public Docker socket mounts. Spark processing must have bounded per-file memory consumption and errors isolated by file.
9. **Cloud infrastructure:** Terraform-managed Cloud Run services, Cloud SQL, private Cloud Storage buckets, Artifact Registry, required APIs, IAM, Secret Manager, monitoring and budget notifications. Terraform state uses a controlled private backend. Enable CI checks of `terraform validate/plan` and require approval before applies to production.
10. **Operational playbooks:** Document `dev-up`, `run fixture import`, `run full import`, `inspect report`, `approve basis mapping`, `promote`, `publish`, `rollback`, `restore DB`, and `revoke compromised credentials`.

## 9. Performance and quality expectations [MVP]

### 9.1 Performance-oriented design

- Support 1 through hundreds (and more) selected processes **without an arbitrary cap**. Do not render every process-column/row intersection in the browser DOM.
- Read-optimized harmonized relations with indexes; no database-wide recalculation when a user selects/deselects processes.
- Virtualize process rows and columns, memoize row/cell components, debounce search, cancel stale requests, and fetch visible grid windows with overscan. Use progressive loading and non-blocking warnings for unusually large selections.
- Use row heights derived from the fixed normalization formula (including mixed-sign expansion) and a variable-size virtualizer; ensure sticky headers remain aligned while scrolling. Avoid scroll-jump when rows arrive asynchronously.
- Prefer batched SQL results and canonical sorted process/indicator ID arrays over repeated N+1 fetches. SQL aggregation handles union/difference predicates for a selected process set; source data stays unchanged.
- After integration, establish reproducible performance benchmarks on the actual dev laptop and Cloud SQL. Indicative acceptance targets—not contractual guarantees—are: process search normally feels reactive on BAFU; first two-process grid usable within a few seconds; 100-column grid scrolls without sustained UI freezing; progressively larger selections load with clear progress rather than crashing. Benchmark must specify hardware, dataset version, row count and network.

### 9.2 Automated tests

**Importer / parsing fixtures:**

1. `outputGroup=0` maps to `Reference`; `inputGroup=5` positive **and negative** map to `Technosphere`.
2. Same harmonized physical flow across selected processes aligns by ID and type; opposite signs share a row and render on opposite sides of zero.
3. Same elementary source `number` in **different subcompartments** yields distinct canonical IDs.
4. Multiple identical source exchanges in one process remain separate in staging; their decimal amounts are summed in harmonized data; historical ERROR + resolved WARNING and provenance are generated.
5. A missing referenced process creates a staging ERROR; approved mapping resolves it; otherwise fallback uses an isolated identifier and visible warning; absence of implemented handling blocks harmonized load.
6. A process with **two `outputGroup=0`** exchanges is staged, reported, and excluded from the published catalog. A process with one is retained.
7. Reimporting the same approved source identity preserves its harmonized flow ID; conflicting identities cannot silently reuse an ID.
8. XML metadata out of order, boolean-case differences, missing optional attributes and malformed files produce deterministic outcomes.
9. Workbook method labels forward-fill properly; IPCC GWP 100 is default; each of 47 source columns has one indicator identity and source ordering.
10. Workbook rows cannot be matched by row index or approximate name alone; name/geography ambiguities and reference-basis mismatches are reported. An approved per-source basis rule has exact, tested conversion direction; an unverified rule produces `N/A` rather than an incorrect score.
11. Ready/publish gates reject unresolved critical issues, while successfully handled source duplicates and explicitly excluded multi-output processes do not automatically block an otherwise valid release.
12. Atomic publish and rollback never expose incomplete revisions.

**API/UI:**

13. A present `0` cell is labeled `0`; an absent flow has no label; a missing score shows `N/A`.
14. Difference filtering is OFF by default; ON hides only exact equal states/values and distinguishes missing from zero; it is disabled with fewer than two processes; toggling OFF/ON with unchanged inputs reuses cache.
15. Search uses AND across fields and all words, independent of order and case; changing search does not deselect items; filtered category bulk selection affects only matches.
16. Sticky headers/identifying fields, drag reorder, remove-column synchronization, large-set progress, and dynamic process-column widths work in both tabs.
17. Browser persistence is UID-scoped and restores only the agreed state; signing in as another account never displays the first account's comparison.
18. A comparison across different reference amounts or units warns without converting or blocking.
19. Tests for API authorization, verified email requirement, unpublished release isolation, input validation, large selection batching, and selected revision snapshot consistency.

Use unit tests for mapping math and parsing; property-based tests for decimal/sign/absence invariants; integration tests with a disposable PostgreSQL instance; and Playwright end-to-end tests for critical user workflows. CI must validate migrations and infrastructure templates. Include a small, redistributable **synthetic** fixture set for public automated testing if original provider files cannot be committed.

### 9.3 Manual UAT scenarios

- Log in as a newly email-verified user; search for Swiss electricity processes using name+geography; select a filtered category; confirm only matching descendants are selected.
- Compare two processes having both shared and unique flows; inspect positive, negative, present-zero and absent states, then toggle differences and re-order columns.
- Compare two processes with different reference units; verify warning and unchanged numbers.
- Select additional LCIA methods and nested categories; verify rows follow workbook order and score values/units display correctly; toggle score differences.
- Select 100+ processes; drag/scroll horizontally and vertically, preserve sticky identification, switch tabs, remove processes, and refresh the browser to confirm restoration.
- In a test import, insert duplicate exchanges, missing references, multi-output processes, missing LCIA rows and a score unit mismatch; inspect error/resolution reports, verify gating, and publish an approved candidate atomically.

## 10. Full-version extensibility and post-MVP features

This section specifies the intended **full application**. These behaviors are **not MVP deliverables**, but the MVP's architecture must leave clean insertion points for them. Do not implement a feature simply because its future contract is described here.

### 10.1 Multiple databases and versions [POST-MVP]

- A database adapter must expose `extract_source_processes()`, `extract_source_exchanges()`, `extract_source_scores()`, `source_identity_rules()` and `to_harmonized_candidates()` against the common staging/harmonization contracts. Implement a BAFU adapter first; later adapters can accept EcoSpold variants, ILCD or other formats without rewriting the API/grid.
- Each source release/version is a **separately expandable and selectable tree root**. Users can select processes from any combination of releases permitted by their entitlements. Raw source identifiers are always scoped by `(database, version, source id)`.
- Cross-database flow mappings are **curated and version-controlled**: an administrator or trusted mapping provider asserts that one or more source flow identities correspond to one canonical harmonized flow. The canonical flow has a verified **unit and meaning**, including compartment/subcompartment. Conversion of units and amounts occurs **only during the harmonization pipeline**. Unmapped or uncertain flows stay separate; never align solely on similar names.
- Support multiple versions of one database simultaneously; do not overwrite earlier version catalogs. An import of a new release can reuse a harmonized flow ID if it passes identity verification. Map source provider versions explicitly in provenance.
- For units of a mapped flow, store `source_unit`, `canonical_unit`, rational/decimal factor or explicit transformation rule, and audit trail. Reject transformations that alter physical meaning or use unverified dimensions. Offer a future mapping-review workflow; MVP only stores the registry shape.

### 10.2 Assisted process matching mode [POST-MVP]

A user can toggle **Assisted Matching Mode**. The backing data is a curated, provider/admin-maintained **process-correspondence graph** independent of flow mappings. Suggested relational model:

```text
process_correspondence_group(id, rule_version, rationale, confidence, approved_by)
process_correspondence_member(group_id, database_release_id, source_process_id, role)
```

A group can link **one-to-one, one-to-many, many-to-one or many-to-many** process sets, across **different versions of one database or completely different databases**. When the user selects a process in assisted mode, identify its correspondence group(s), resolve the connected curated members according to version/database selection scope, and **automatically select all related processes from both sides**. Display a clear message describing additional selected processes and any missing/unlicensed target. Selecting/deselecting remains coherent with the ordinary selection list and comparison columns. Unmapped processes may be selected manually and must not be incorrectly auto-matched.

**Do not** interpret one-to-many matching as permission to sum the processes into one comparison column; selecting several processes is distinct from numerically aggregating them. If overlapping correspondence groups lead to ambiguous transitive closure, show a mapping warning or use an explicitly bounded, approved correspondence set rather than making an unverified inferred match. Process correspondence metadata must have traceable approval and revisioning.

### 10.3 LCIA indicator harmonization and recalculation [POST-MVP]

Provider-supplied scores across databases must share a row **only** if a verified identity records equivalent **method, method version, impact category (if present), indicator, and score unit/reference meaning**. Similar labels alone are not sufficient. Unmapped methods/indicators remain separate, with `N/A` for processes that lack a particular indicator.

Later, a calculation pipeline may recompute impact scores using one **common LCIA method version** for compatible databases. Such calculations run **as part of scheduled/admin ETL and publication**, not on user selection. Store score provenance distinguishing provider scores from computed scores, linked method/characterization-factor versions, software version, assumptions, and reference quantities. The user should be able to understand which score series is being compared; default comparability should favor verified common-method results when available, subject to a product decision at that time.

### 10.4 Metadata comparison tab and exchange details [POST-MVP]

Add a **Metadata** tab with the same selected process columns, sticky headers, ordering, and scroll/virtualization behavior. Use a schema-driven **metadata field registry** of labels/types/source paths; list fields such as temporal coverage, geography, technology description, boundary conditions, assumptions, modeling framework, validation, authors/source citations and dataset version. Missing metadata is explicitly absent, not empty invented prose. Preserve original provider text/structure and expose a canonical field when a verified mapping exists. Enable later user-configurable metadata rows and sorting.

Clicking a flow/score cell may later open a **details drawer** containing original source exchange attributes, comments, uncertainty data, source identifiers, unit conversion, aggregation constituents, score provenance, and warnings. The MVP intentionally has only tooltips and cell warnings; detailed inspection must not creep into MVP development.

### 10.5 User uploads and database entitlement model [POST-MVP]

Add user-managed database uploads after the centrally maintained BAFU MVP is stable. Use private object storage, short-lived authorized uploads, size/format quotas, ZIP-bomb and malicious XML protections, per-user/team ownership, ingestion job tracking, validation report review and an explicit publication gate. A source may be **private to one owner/team** or shared only within valid license entitlements. All process/catalog/flow/score API calls must enforce dataset entitlements server-side; a saved comparison or shared link must **not** circumvent a database license.

The harmonized public catalog can retain globally defined flow identities without exposing a restricted provider's unpublished raw source data. Consider per-tenant partitions or access-policy-enforced release IDs if the user base grows. Do not grant ordinary users Airflow or Cloud SQL credentials.

### 10.6 Multi-output processes [POST-MVP]

Extend the process model to hold **multiple reference outputs**, each with amount/unit and allocation/provenance. UI process headers must show all reference outputs and clearly mark multi-output datasets. Before comparing LCIA scores, model/validate whether each score applies to the full process or to an allocated reference output; otherwise show an explicit unknown-basis state. Do not silently divide impacts between products. Introduce reference-output identity as a first-class selection/comparison context only after allocation semantics and UX are agreed.

### 10.7 Saved workspaces, exports, search and display customization [POST-MVP]

- **Saved comparisons:** Server-side, account-associated named comparison objects with selected processes/order, indicators, active tab, filters, display preferences, and release snapshots. Include cross-device restore, clone, edit, delete, and stale-process resolution. Sharing, if added, must check viewer's database entitlements.
- **Export:** CSV and XLSX from the current visible/difference-filtered comparison state, with complete process identifiers, indicator/flow IDs, reference amounts/units and full numeric precision. Provide explicit missing/zero states and normalized basis metadata; no rounding in exported numeric data. Export should be streamed or generated as a batch if very large.
- **Display:** Zoom in/out, draggable flow/indicator row ordering, resizable/hideable identifying fields, saved presets, sign-specific or percent-difference sorting, optional user-defined absolute/relative difference tolerances.
- **Search:** Fuzzy/semantic matching or typo tolerance as an optional advanced mode; keep deterministic literal substring behavior available, particularly for scientific validation.
- **Cloud ETL deployment:** Move DAG orchestration/Spark execution to Google Cloud only when justified by operational need. Candidate services include managed Airflow/managed serverless Spark; maintain the same versioned manifest, rules, staging schema and atomic publication protocol.

## 11. Open implementation risks and conservative defaults

The brainstorming is finished; the following are **implementation-time verification gates**, not additional questions to the user. Agents must not hide them or silently invent answers.

| Risk / unresolved fact | Required default and action |
|---|---|
| Only **five XML samples** were supplied, versus ~11,947 expected for full BAFU | Implement/test with samples; **do not claim the full BAFU database is imported** until complete XML release is obtained and reconciled |
| Workbook has **no numeric process ID** column | Use strict composite matching plus version-controlled curated overrides; unresolved rows never auto-associate |
| Workbook/ XML unit mismatch (`m`/`km`, `t*km`/`tkm`) | **Do not silently normalize**; obtain source evidence and approved unit rules; mark ambiguous scores `N/A` until reconciled; record impact on coverage |
| Provider licensing for centralized storage/redistribution | Confirm legally before public deployment; product decision on all-registered access remains, subject to permission |
| Stable flow identity across future source versions is not guaranteed by source `number` alone | Use versioned identity fingerprints, registry and equivalence validation; do not conflate different compartments |
| Missing technosphere referenced process | Use approved manual rule if available; otherwise explicit isolated fallback with warning and provenance; block harmonized load if no safe resolution is implemented |
| Multi-output exclusions may affect score/workbook row counts | Report separately from missing XML/score errors and do not misreport exclusion as accidental data loss |
| Very large comparisons may exceed any single request's resource budget | Retain unlimited user selection but batch/cursor reads, background query cancellation, clear performance notices and workload telemetry |
| Unspecified visual pixel thresholds/performance SLAs | Use the recommended accessible defaults in §6 and §9, then validate/tune against representative browsers and dataset fixtures |

The workbook's `Info` sheet reports **BAFU:2026 v1** and a July 2026 correction note, but the **release publication date field** is maintainer-controlled. Do not infer a legal publication date or license solely from the workbook note.

## 12. Suggested implementation order / agent milestones

1. **Foundation:** Monorepo, Dev Container, Compose, local Postgres, CI, Terraform scaffolding, auth, FastAPI health and release metadata, frontend shell. Document source/target environment variables and secrets. **[MVP]**
2. **Data contracts:** SQLAlchemy models, Alembic, source staging tables, harmonized flow registry, process/exchange/score schemas, release/version state, exact-decimal serialization. **[MVP]**
3. **Miniature golden ETL:** Airflow DAG and PySpark XML parser processing the five attached samples; stage and harmonize duplicate cases, group mapping, referential fallback, multi-output exclusion; unit tests and reports. **[MVP]**
4. **Workbook + reconciliation:** Load LCIA sheet with correct method hierarchy; implement conservative process reconciliation and verified score-unit rules, report mismatches, support `N/A`. **[MVP]**
5. **Full import/publish:** Run full XML corpus when provided, validate, transfer release candidate to Cloud SQL, explicitly publish with rollback; GCS manifests and provenance. **[MVP]**
6. **Core app:** Registration/login, tree search/checkboxes/bulk selection, selected list, grid row/cell API, virtualized Flows tab, common process headers, zero/absent semantics, signed bars and warnings. **[MVP]**
7. **Scores and polish:** Indicator tree/selection, Scores tab, differential toggles with caching, drag-reorder, sticky/virtualized grid, browser persistence, accessibility and responsive desktop behavior. **[MVP]**
8. **Production hardening:** Terraform apply, Cloud Run images, Cloud SQL connectivity, backups, budgets, access control, benchmark, E2E/UAT and data license sign-off. **[MVP]**
9. **Future layers:** Multiple source adapters, curated cross-database mappings, assisted process correspondence, metadata/exchange details, user uploads, saved comparisons, exports, and calculated common-method LCIA. **[POST-MVP]**

**Definition of done for MVP:** A full validated/published BAFU:2026 v1 release is available to any verified registered user; users can search/select/bulk-select processes and indicators, compare accurate harmonized flows and vetted LCIA scores side by side, inspect signed values and missingness, toggle exact differences on demand, rearrange columns, and restore the browser-local workspace. Pipeline behavior is reproducible, transparent about missing/invalid data, and no unpublished data is visible.

## 13. Source and platform references

**User-supplied sources (authoritative for product intent and BAFU sample behavior):**

- `LCA-diff description for initial prompt.md`
- `process_00a93752-8f60-391f-9c33-d67536731c5b.xml`
- `process_00abc63c-5d5b-4360-95cb-a0078d3413cc.xml`
- `process_00b2b4b3-ab99-3753-94fe-7e20ff5bd632.xml`
- `process_00b30df5-b17e-3105-a05b-ceb1d0c59e57.xml`
- `process_00beeea6-7895-3564-a334-4c458dc8b78a.xml`
- `EcoSpold01Dataset_Simple.html`, `EcoSpold01ElementaryDataset_Simple.html`, `EcoSpold01ImpactDataset_Simple.html`
- `BAFU-2026 v1 LCIA Results_corrected.xlsx` (`Info`, `BAFU_2026 v1`)
- Decisions 1–55 from the product brainstorming in this conversation (the later corrections supersede earlier draft suggestions).

**Implementation references (verify current versions when coding):**

- [Cloud Run: deploy container images](https://docs.cloud.google.com/run/docs/deploying)
- [Cloud SQL for PostgreSQL: connect from Cloud Run and use SQLAlchemy](https://docs.cloud.google.com/sql/docs/postgres/connect-run)
- [Cloud SQL Auth Proxy for local maintenance](https://docs.cloud.google.com/sql/docs/postgres/connect-auth-proxy)
- [Cloud SQL backup/restore concepts](https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups)
- [Firebase Authentication: verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Apache Airflow: Docker Compose development caveats](https://airflow.apache.org/docs/apache-airflow/stable/howto/docker-compose/index.html)
- [Managed Service for Apache Spark: serverless future option](https://docs.cloud.google.com/managed-spark/docs/serverless-overview)

**Precedence for AI agents:** (1) explicit brainstorm decisions and clarifications; (2) this detailed specification; (3) PRD summary; (4) original description, where not superseded; (5) attached raw files for source-format facts; (6) external best-practice references. If a source-data ambiguity materially changes scientific meaning, choose the conservative `N/A`/warning or block applicable publication step rather than guessing.
