# Provisional frontend service boundary

`contracts.ts` defines the replaceable, transport-independent boundary for
specification §§6–7. UI code will depend on `Services`, never HTTP, Firebase,
or fixture imports. Discovery/selection mocks are implemented in #7. Comparison
follows in #8, composition/query integration in #9, and auth lifecycle execution
in #12.

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
