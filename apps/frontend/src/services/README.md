# Provisional frontend service boundary

`contracts.ts` defines the replaceable, transport-independent boundary for
specification §§6–7. UI code will depend on `Services`, never HTTP, Firebase,
or fixture imports. Discovery/selection and comparison mocks are implemented in
#7/#8 and composed in #9. Simulated auth lifecycle execution is supplied by #12.

All methods are asynchronous. Expected failures return `ServiceResult` with safe
machine codes, correlation IDs and retryability; messages contain no raw provider
payloads or credentials. `AbortSignal` travels separately from serializable DTOs.
Cancellation rejects with an `AbortError` and must never deliver a stale success.
Auth observation delivers its initial state asynchronously and returns an
unsubscribe function. `authenticated` includes unverified accounts; protected
data requires the verified `Identity` response. Tokens stay inside adapters.

Measurements use validated `DecimalString` lexemes. Validation checks finite
decimal syntax without `Number`, rounding, normalization, or arithmetic. JSON
preserves exact strings including sign-of-zero. `FlowValue` and `ScoreValue`
make present-zero, absent, valid-zero, missing and unresolved-basis distinct.
Warnings belong to a specific cell; row metadata cannot spread warnings to other
processes. Flow rows use `flow_id|flow_type`, never names/source-like numbers.

Every read uses or returns `revision_snapshot` pairs of release and revision IDs.
Resolve the initial snapshot from releases and carry it through all metadata and
cell reads. Response envelopes bind their rows/cells to that snapshot. Immutable
older revisions must remain available or produce a typed stale/unavailable error;
adapters must never replace a requested revision with the latest publication.

Search is AND across whitespace-tokenized, case-insensitive substring fields and
across populated fields. `branch_path` scopes matching descendants; search nodes
retain ancestor paths and full matching descendant counts. Selection resolution
walks **all** cursor pages using the same filters, branch and snapshot to obtain
every eligible ID, ordered by name/geography/ID. A page/window limit bounds one
response and never limits total selection. Branch scope requires `branch_path`.
Release lists and explicit header batches are terminal pages (`next_cursor: null`);
oversized header batches fail safely and callers chunk them. Search/resolution/
row cursors are opaque and tied to semantic inputs and revision snapshots.

Flow rows sort by type (Reference, Technosphere, Ecosphere Input, Ecosphere Output),
then case-insensitive category/subcategory/name and stable ID. `sort_key` carries
the latter ordering components. Score indicators retain source order, with
method/optional category hierarchy and an explicit default indicator descriptor.
Cells accept only the visible process and row/indicator windows plus modest
overscan and an opaque comparison token matching the row query and snapshot.
`differences_only` defaults to false with no cross-process difference work. True
is explicitly unsupported until #29; no fabricated filtered result is allowed.

`mock/fixtures.ts` is fully invented, deterministic and deeply frozen. Two
revisions share stable flow identities and have distinct revision-bound process
IDs. They cover nested paths, differing reference quantities/units, signed values,
long/tiny decimals, zero/absence, missing/unresolved scores, cell warnings and
equal source-number-like labels in different environmental compartments. This is
neither BAFU ingestion nor evidence of real authentication/data security.

I1 will replace provisional wire DTOs with FastAPI OpenAPI generation, add
reproducible generation/drift checks, and reconcile route/field names, UUID
validation, error/status mapping, cursor/token encoding and transport bounds.
Keep auth actions behind the boundary and preserve decimal/missingness, snapshot,
cancellation and ordering semantics in mock/real adapter parity tests. No server,
scientific transformation or post-MVP functionality is introduced here.

## Discovery mock (#7)

`mock/discovery.ts` exports `createMockDiscovery`, a typed subset of `DataService`
covering releases, tree search, selection resolution and headers. Defaults use
the three-process precision fixture, whose active publication is revision two;
explicit revision-one reads remain available. `createDiscoveryCatalog(count)`
generates additional **discovery-only headers**, without inventing their flows
or scores. Tests resolve all 257 synthetic headers using 17-ID pages and header
batches; a 257-ID header request fails while the complete selection remains valid.

Configure `window_limit` for one transport response/batch (default 100), and
`scenario.latency_ms` as a fixed delay or a pure `(operation, sequence) => delay`
function. `scenario.failures` maps operations to safe structured error codes.
Sequences and request IDs follow invocation order, independent of completion
order. Even zero-latency requests complete asynchronously. Abort rejects with
`AbortError`, removes listeners and clears pending timers. Request DTOs are copied
at invocation; responses cannot mutate the adapter's stored catalog.

Search pages bound the number of process leaves, repeat their required ancestors,
and report branch counts over **all** matching descendants, including later
pages. `total_count` counts matching processes rather than returned tree nodes.
Process leaves and resolution IDs sort by case-insensitive name/geography, then
ID using deterministic lexical ordering. Source metadata is preserved verbatim.
Branch paths use exact segments; explicitly passing `[]` selects the release roots
in the requested snapshot, while branch scope without a path is invalid.

Cursors are deterministic, versioned opaque mock tokens bound to operation,
normalized search fields, branch, selection scope and immutable snapshot; they
continue after a stable process ID. Replaying across different semantic inputs
fails with `INVALID_FILTER`. These are local synthetic tokens, with no claim of
production signing/authentication. No component composition, auth simulation,
comparison logic, real server or network dependency is added in this issue.

## Comparison mock (#8)

`mock/comparison.ts` exports `createMockComparison`, the `DataService` subset for
indicator hierarchy and flow/score row/cell reads. It shares the existing mock
runner's delay, failure and abort behavior with discovery. Responses retain exact
decimal lexemes and independent present/absent/missing/unresolved states, with
warnings only on the affected cell. Inputs and outputs are copied.

Flow rows use the union represented by selected processes; present-zero counts
as represented. Presence checks use per-process values before shared defaults,
including explicit absence overrides. Rows sort by the specified flow type order
then case-insensitive category/subcategory/name and stable flow ID. Score rows
follow selected indicators' source order even if every selected process has N/A.
Omitted or false `differences_only` performs presence/metadata work without numeric
comparison, coercion or scientific calculations. True returns
`UNSUPPORTED_OPERATION` until #29 adds exact difference predicates.

Row calls accept arbitrarily many selected IDs. Only the row page is returned.
Cell calls accept process and row/indicator windows, with both dimensions bounded
by `window_limit` (default 100) and their product by `cell_limit` (default 1000).
Oversized transport reads fail with `REQUEST_WINDOW_TOO_LARGE`; callers split
them without reducing selection. Only the requested Cartesian window is emitted.

Session-local comparison tokens bind canonical process/indicator sets, tab and
immutable revision snapshot. Column reordering reuses the token. Cursor pages
continue after a stable row identity using that token. A cell window must use
the same snapshot, a subset of its token's processes and eligible rows, and the
correct tab. Both prior fixture revisions remain readable; unknown snapshots
and mixed row/cell snapshots fail safely. Tokens are small local cache handles,
not production authentication. `token_limit` bounds retained contexts (default
128); oldest contexts are evicted, and subsequent cell requests using them return
`STALE_SNAPSHOT`. Reload row metadata to obtain a fresh token.

`createComparisonCatalog(processCount, additionalFlowCount)` builds independent,
invented comparison data with discovery-compatible IDs. Each process has its own
reference flow identity/metadata, stable across revisions. Extra rows share values
without creating a complete cell matrix. The tested large fixture has 320 selected
processes and 1,324 flow rows per revision, stored as 1,600 sparse process entries
plus 1,000 shared entries. A 25-row metadata page and a 4-row × 25-process cell
window each serialize below 25 KB. This is synthetic response-bound evidence,
not a real-data browser/performance result. Grid/UI checks remain F4/#10; real
backend, generated contracts and security/integration evidence remain Phase 2.

## Application composition and queries (#9)

`app/composition.ts` is the single concrete adapter selection point. Only the
explicit `VITE_SERVICE_MODE=mock` value is supported; missing/invalid/real values
produce a visible safe startup error. No failure chooses mocks implicitly.
`ApplicationProviders` creates one stable TanStack Query client and the typed
services context. Components use `useServices`, `useAuthState` and
`useServiceQueries`; tests may inject any contract-compatible services object.

The mock auth observer transitions asynchronously from resolving to anonymous or
a restored simulated session. Account actions are supplied by #12. The current
page shows local demo status without initiating dataset queries; presentation
and forms belong to #11/#13.
Protected service methods are guarded at the provider boundary, including direct
calls, and query options remain disabled until an observed verified UID exists.
Logout, verification loss and account changes clear protected query caches and
abort pending work; the rendered query no longer retains prior-account results.
Direct pending service responses also check the authentication epoch before
delivering success. These local guards do not establish real backend security.

Query helpers forward TanStack's `AbortSignal` and turn structured service
failures into `ServiceQueryError`, rather than caching an error envelope as data.
Keys include adapter namespace, verified UID, operation and a copied serializable
request (including release/revision snapshots, windows and cursors). Request
array order remains part of the key, preserving header/cell response ordering;
difference-specific canonical cache reuse is reserved for F5.

ESLint rejects concrete service imports outside the exact composition module,
while permitting DTO imports. It also rejects direct transport globals, common
HTTP/auth SDK imports and dynamic import/require bypasses outside services.
Negative lint tests exercise fixture imports, HTTP/Firebase access and indirect
global fetch forms. Existing mock modules remain isolated behind the services
boundary; no real adapter, credentials or product auth UI is introduced.

TanStack behavior follows its official
[query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
and [query key](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys)
contracts. The pinned version and lockfile are resolved in the rootless workspace.

## Simulated authentication (#12)

`mock/auth.ts` implements `AuthService` without Firebase, network calls, real
email delivery or a password database. The fixed password for every demo account
is **`demo-password`**. Synthetic addresses use `@example.invalid` only:

- `verified@example.invalid` and `other@example.invalid` are verified accounts.
- `unverified@example.invalid` starts unverified.
- Register a new address such as `new@example.invalid` using the fixed password.
  Registration starts unverified; an existing account returns `AUTH_FAILED`.
- Call `sendVerification`, then `refreshSession` to simulate following a received
  verification link. Resending alone never verifies or unlocks data. A refresh
  before a successful resend leaves the account unverified.
- `resetPassword` succeeds for a known synthetic account and fails for an unknown
  account. Completion means returning to sign-in with **`demo-password`**; no
  email is sent and no submitted password is stored or changed.

The browser adapter persists only a versioned active-session marker under
`lca-diff:mock-session:v1`: synthetic UID/email, verification status and the pending
verification marker. Reload restores that user asynchronously. Missing, malformed
or non-synthetic markers resolve anonymous; unavailable browser storage keeps the
session in memory. Signout removes only this marker and retains workspace keys.
New account metadata lives in the adapter and the active marker: reloading after
signout resets newly registered demo accounts and their verification changes to
the built-in fixture defaults. This is a deliberate disposable simulation, not a
durable account database. Credentials never enter storage or logs.

`createMockAuth` accepts an optional storage double and the shared deterministic
`scenario.latency_ms` / `scenario.failures` controls for each auth operation,
including `restore`. `refresh_failure` simulates expiry, revocation or failed
refresh. The returned scenario driver's `expireSession` and `revokeSession`
immediately publish an error and erase the active marker; these drivers stay in
services/tests, while product UI consumes `AuthService` only. Aborted requests
reject with `AbortError`. Logout/account replacement invalidates delayed auth
actions so they cannot publish an obsolete identity. State observers receive
copies asynchronously on subscription and unsubscribe stops delivery.

The composed mock data adapter returns typed `AUTH_REQUIRED` or
`EMAIL_NOT_VERIFIED` before protected reads; verified identity exposes only safe
synthetic identity/access fields. Pending reads cannot deliver success after a
session transition, including signing back into the same UID. The provider/query
guards remain a second boundary; expanded controller coverage belongs to #14.
Forms and full browser auth journeys remain #13/#15. These mocks do not establish
real identity, token lifecycle or backend authorization.

## Account forms (#13)

`src/auth/AuthDialog.tsx` consumes only `AuthService` through the service
context. The composition root additionally supplies optional `demo` guidance
(the fixed demo password and synthetic account addresses) derived from the mock
constants, so product UI shows mock instructions without importing mock modules;
other runtimes omit it. Form actions forward an `AbortSignal` and are aborted
when their view, account or lock state changes. Observed auth state remains the
only unlock signal. See `docs/engineering/f2-auth-forms-verification.md`.

## Session lifecycle (#14)

The provider wraps both services: `guardDataService` and `guardAuthService`.
Protected reads returning `AUTH_REQUIRED`/`EMAIL_NOT_VERIFIED` in the current
session epoch lock the session to an error state until the adapter reports a
newer state; late results or failures from an earlier epoch are replaced with
`Authentication context changed` and never lock a newer account. Signout locks
protected UI and caches before the adapter answers. Real adapters must map
401/403 to these codes. See `docs/engineering/f2-session-verification.md`.

## Tree consumption (#16)

`src/components/process-tree/` reads only `queries.releases()` and
`queries.searchPages()`. Each expanded branch issues its own search with
`fields: {}`, a single-release `revision_snapshot`, `branch_path` set to the
branch path and `limit: 50`, continued through `next_cursor`. The component
merges pages by release and path prefix, deduplicates by release and ID, and
accepts `matching_descendant_count` only for branches at or below the request
scope. I1 adapter parity therefore requires the real search to support
single-release `branch_path` paging that returns ancestor chains with exact
in-scope counts. Scenario tests inject `createMockDiscovery` from
`src/services/mock/process-tree.test.tsx`, because the lint boundary forbids
mock imports elsewhere; no scenario switch ships in the composed app.

## Flow windows and row summaries (#20)

**Provisional read-summary extension.** `DataService.flowSummaries` is a
frontend-only provisional method that is not in spec §7.1. It returns whole-selection chart
metadata for one row window:

- `max_positive` (P): the exact stored lexeme of the largest present positive
  amount, or `"0"`.
- `max_negative_magnitude` (N): the exact unsigned lexeme of the most negative
  present amount, or `"0"`.
- Positive, negative, present-zero and absent counts over **every** selected process.

The request carries the complete selected `process_ids` (unbounded) and the
flow-rows `comparison_token`, plus at most `window_limit` row keys. Sending
the full set keeps a real backend stateless, as spec §7.3 requires: correctness must not
depend on a cached token. I1 must reconcile this DTO with the generated OpenAPI
contract, or replace it, through the ADR/spec workflow. This issue introduces no
production endpoint.

**Mock behaviour.** The mock accepts a summary request only when it matches the
token exactly:

- the token's tab is flows;
- the snapshot is identical to the token's;
- the process set is the token's whole set (a subset is `INVALID_FILTER`);
- every row belongs to the token's rows.

Unknown or evicted tokens and unknown revisions fail as `STALE_SNAPSHOT`.
Revision-bound IDs used against another snapshot fail as `UNKNOWN_PROCESS`.

**Extrema and ties.** Extrema use `services/decimal.ts`, which compares
lexemes exactly (digits and exponents, with `-0` as zero) and never converts to
floating point, and uses BigInt exponents, so any exponent `decimalString`
accepts compares exactly. Ties keep the first process in canonical ID order. Because
the request has no column window, every visible column window sees the same P and N.
Summaries carry no warnings, since cell warnings stay on the affected cell. They run
no difference predicate.

**Query helpers in `app/queries.ts`:**

- `flowRowPages`: an infinite cursor query keyed by the request.
- `flowSummaries`.
- `flowCellWindow`: splits any visible rows × processes window into batches
  within `SERVICE_WINDOW` (100) and `SERVICE_CELL_WINDOW` (1000), using
  `app/cell-batches.ts`.
  - All batches share one abort signal.
  - Results merge in batch order.
  - Every batch, including a lone one, must answer with the requested token
    and snapshot (release order does not matter). Otherwise the window fails
    as `STALE_SNAPSHOT` rather than caching another revision under the request key.
  - `flowSummaries` and `flowRowPages` responses are checked the same way.
  - Every later `flowRowPages` page must also carry the first page's
    `comparison_token` (#64). The page param holds the cursor and the token of
    the page it continues, so a page from another comparison session fails as
    `STALE_SNAPSHOT` and is never appended to the cached pages.
  - Release-order tolerance is tested against a two-release mock catalog: the
    mock answers refs sorted by release ID, and requests list them in the
    reverse order. A missing or extra release is still rejected for row pages,
    summaries and cell windows.

Batches bound requests, never the selection.

**Obsolete reads.** Query keys include the token and snapshot. An obsolete read loses
its observer and is aborted, so it cannot replace newer data. Chart geometry
(#22), virtualization (#23) and grid composition (#24) consume these helpers.

**Test evidence:**

- `services/decimal.test.ts`
- `app/cell-batches.test.ts`
- `services/mock/flow-summaries.test.ts`
- `services/mock/comparison-queries.test.ts`

This is mock evidence, not real-backend performance.

## Process headers and comparability (#21)

`components/comparison/ComparisonHeader` renders the shared metadata header for
a tab from the canonical ordered selection (`app/selection.ts`); it owns no
order. Flows mounts it now; Scores mounts the same component in #28.

**Headers query.** `queries.selectionHeaders(revision, ids, client)` issues
one query per selected revision:

- The key is the sorted ID set, so column reordering never refetches.
- Headers are immutable per revision and cached per process (a `header` key
  under the same adapter namespace and UID). A changed selection requests only
  uncached IDs, in `SERVICE_WINDOW` batches; already-known headers are shown
  as placeholder data meanwhile. If a read fails, the hook keeps showing the
  cached headers (placeholders apply only while pending), so loaded columns
  and known differences survive the failure. Per-process entries have no
  observers, so they are kept for the session (`gcTime: Infinity`) instead of
  expiring after 5 minutes; signout or account change clears them with the
  rest of the client. Bulk selection seeds the same
  cache through `queries.rememberHeaders`, so bulk-added columns are not
  fetched twice.
- Every batch, in both `selectionHeaders` and the bulk `headersFor`, must
  answer the requested revision (`STALE_SNAPSHOT` otherwise) with exactly the
  requested IDs, once each (`UNKNOWN_PROCESS` otherwise). A read with any
  rejected batch fails as a whole, so only validated headers are cached. I1
  adapter parity needs `POST /processes/headers` to accept a single-release
  snapshot and return each requested ID once.
- Header amounts must be valid decimal strings. The mock guarantees this; the
  real adapter must validate at its boundary (I1), since comparison would
  otherwise throw during render.

**Display.** Each header shows Process Name, Location, Reference Flow Name,
Reference Amount (the exact stored lexeme) and Reference Unit. Blank
geography, reference-flow name or unit shows `—` with the accessible text
"not specified"; nothing is invented. Long values ellipsize; the header's
accessible description and a hover/focus overlay give the full identity,
including release, revision and process ID. Columns are a single roving tab
stop (arrows, Home, End).

**Widths.** `components/comparison/model.ts` documents the per-tab bounds
within spec §6.3: Flows 120–240 px, Scores 110–230 px, using
`clamp(available / count, min, max)`. Columns are windowed horizontally
(`@tanstack/react-virtual`, overscan 4), and the active column stays mounted.
#23 shares this column window with the cell grid.

**Comparability warning.** It is shown, without blocking or confirmation,
when any loaded reference amount differs exactly (`services/decimal.ts`, so
`1`, `1.0` and `1e0` agree) or any unit differs as an exact string. While
headers load, it reports only differences already known and never claims the
bases are equal. Values are never rescaled. `services/decimal` is the one
transport-free services module the UI lint boundary now allows besides
`contracts`.

**Test evidence:**

- `components/comparison/model.test.ts`
- `services/mock/comparison-headers.test.tsx`
- `e2e/process-headers.spec.ts` (Chromium; also run in Firefox)

Large-selection windowing and invalid responses are component-level evidence;
the composed app has no large browser scenario yet (#23).
