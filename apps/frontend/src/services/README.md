# Frontend services boundary

Components consume injected AuthService/DataService contracts. Only app/composition.ts selects mock or real adapters. HTTP and Firebase remain under services; ID tokens never cross this boundary. Configuration accepts exactly mock or real; real requires /api/v1, a demo- project, a local public API-key placeholder and same-origin emulator mode. Invalid configuration fails visibly without fallback. Mock mode remains standalone and explicitly labelled.

## Generated contracts and L2 reconciliation (M1–M10)

The chain is FastAPI → apps/api/openapi.json → packages/contracts/openapi.ts.
Run npm run contracts:generate or contracts:check inside the frontend container.
The latter regenerates into a temporary file and byte-compares; neither needs a running API. Generated files are never edited manually. contracts.ts maps generated wire types to readonly UI types, validated decimal strings and discriminated cell/search unions. Components never import generated types.

1. **M1 summaries:** flowRows and scoreRows pages carry whole-selection extrema. The adapter derives P=max(maximum,0) and N=abs(min(minimum,0)) with services/decimal.ts exact comparisons, preserving the winning lexeme. absent_count=selected_count−present_count. No separate summary routes/methods or positive/negative/zero/missing-state counts remain. Indicator-tree entries have no required summary. Grid geometry uses these page summaries, including offscreen processes; it never derives extrema from visible cells.
2. **M2 errors:** unwrap the API error envelope, retaining its typed code, retryability and X-Request-ID (or body request_id). 401 AUTH_REQUIRED, 403 EMAIL_NOT_VERIFIED, 404 RELEASE_UNAVAILABLE/UNKNOWN_PROCESS, 409 STALE_SNAPSHOT, 422 INVALID_FILTER/REQUEST_WINDOW_TOO_LARGE, and 429/503 TEMPORARILY_UNAVAILABLE are distinct. Network/non-JSON/unknown-code/invalid payloads become safe retryable TEMPORARILY_UNAVAILABLE errors without raw payloads. AUTH_FAILED and UNSUPPORTED_OPERATION are client-only.
3. **M3 flattened unions:** validate schema shape and restore present⇔amount and valid⇔amount invariants, finite decimal syntax, branch counts/children and process geography. Invalid values are errors, never coerced into zero or absence.
4. **M4 identity:** access.published_catalog maps to true only for literal true. Identity requires the verified API response; auth observation may still represent an unverified user.
5. **M5 indicator tree:** GET with a JSON-encoded revision_snapshot query parameter, with no body.
6. **M6 bounds:** API pages and headers each allow up to 200; cell windows allow 200×200 dimensions and at most 10,000 cells, 2 MB requests/4 MB responses. UI uses 100-item windows/1,000-cell tiles and chunks headers. No transport bound caps total selection. Cell process IDs are a subset of the signed comparison token selection. The token grows with the selection; there is no server-held token state. The local proxy shares a client address; compose sets 6,000 requests/minute to permit concurrent grid/browser reads while keeping window limits.
7. **M7 IDs:** real process/indicator IDs are UUIDs, duplicates are rejected by the API, and flow row keys are UUID|FlowType. Cursors and comparison tokens are opaque and reused without interpretation. Mock IDs/tokens remain synthetic internal fixtures.
8. **M8 decimals:** preserve PostgreSQL NUMERIC/API lexemes, including uppercase exponents such as 1.2345E-33. No Number conversion controls data, equality or extrema. Only chart-pixel ratios use floats. Present-zero, absent flow, valid-zero, missing and unresolved_basis are separate states. Full stored precision appears in tooltips; missing/unresolved scores show N/A. No runtime normalization or LCIA calculation.
9. **M9 differences:** the HTTP adapter passes differences_only unchanged. L2 UI always requests false; mocks explicitly reject true. UI toggles and minimal mock predicates belong to L3 #30.
10. **M10 mode:** real uses Firebase SDK persistence/token refresh plus HTTP; mock uses deterministic asynchronous adapters. Local-demo labels/guidance appear only in mock mode. Runtime proxy targets are container environment settings, while same-origin browser settings are build-time validated.

## Sessions, revisions and cancellation

Firebase owns local persistence, initial session restoration, registration, login, reset, verification and logout. refreshSession reloads the user and forces a new token after verification. Each protected request retries at most once with forced refresh after 401; rejected refresh locks as AUTH_REQUIRED. A persistent 401/403 clears protected caches and stays locked even if Firebase re-emits the same verified user. Explicit sign-in/refresh or an account change permits recovery. An unverified signout failure leaves verification guidance mounted to report the failure.

Before verified authentication, resolving and locked shells make zero dataset reads. Logout/account change advances the session epoch, clears queries and selection, and rejects stale completions. Firebase session persistence is per browser origin; workspace selections are not persisted in the MVP.

Every metadata/cell request echoes the immutable revision_snapshot. Query helpers reject mismatched snapshots/tokens; adapters never substitute latest publication. Rows sort deterministically by flow type/category/subcategory/name/ID; indicators retain source order. Search is case-insensitive substring AND across words and populated fields; bulk selection walks every cursor page, then appends new columns in deterministic name/geography/ID order. Column order is UI state and does not alter query-set identity.

AbortSignal travels separately from DTOs. Cancelled reads reject with AbortError; checks after token acquisition, fetch, JSON parsing and mapping prevent stale success even if a transport ignores cancellation. Exact scientific transformations stay in ETL.

## Mocks and tests

mock/fixtures.ts and comparison-fixtures.ts contain only invented data, including revisions, signed values, exact precision, zero/absence, missing/unresolved scores and cell-scoped warnings. createDiscoveryCatalog/createComparisonCatalog supply hundreds of columns and thousands of rows for virtualization tests. Mock scenarios support deterministic latency/failures/cancellation without an API or Firebase. The protected mock wrapper enforces the same verified-session boundary.

adapter-contract.test.ts runs a shared mock/HTTP suite with generated-type wire fixtures and API-emitted lexemes, plus error/refresh/invariant checks. Component tests cover cache clearing, windowing, geometry, sticky identity, focus/anchoring, warning scope and reorder. The mock browser suite is separate from e2e-real; ./dev app-e2e exercises actual Firebase/API/PostgreSQL integration against the synthetic local release. Mock tests alone do not establish real authentication/security or private-data release validation.
