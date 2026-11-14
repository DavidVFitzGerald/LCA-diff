/** Provisional §7 DTOs. Replace with generated OpenAPI DTOs in I1. */
declare const decimalBrand: unique symbol;
export type DecimalString = string & { readonly [decimalBrand]: true };

/** Validate finite decimal syntax without converting or normalizing its bytes. */
export function decimalString(value: string): DecimalString {
  if (
    typeof value !== "string" ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
  ) {
    throw new TypeError("Expected a finite decimal string");
  }
  return value as DecimalString;
}

export type ReleaseId = string;
export type RevisionId = string;
export type ProcessId = string;
export type FlowId = string;
export type IndicatorId = string;
export type Cursor = string;
export type FlowType =
  "Reference" | "Technosphere" | "Ecosphere Input" | "Ecosphere Output";
export type FlowRowKey = `${string}|${FlowType}`;
export function flowRowKey(flowId: FlowId, type: FlowType): FlowRowKey {
  return `${flowId}|${type}`;
}

export interface RevisionRef {
  readonly release_id: ReleaseId;
  readonly revision_id: RevisionId;
}
export type RevisionSnapshot = readonly RevisionRef[];
export interface RequestOptions {
  readonly signal?: AbortSignal;
}
export interface PageRequest {
  readonly cursor?: Cursor;
  readonly limit: number;
}
export interface SnapshotRequest {
  readonly revision_snapshot: RevisionSnapshot;
}
export interface SnapshotResponse extends SnapshotRequest {
  readonly request_id: string;
}
export interface Page<T> extends SnapshotResponse {
  readonly items: readonly T[];
  readonly next_cursor: Cursor | null;
  readonly total_count: number;
}
export type ServiceErrorCode =
  | "AUTH_REQUIRED"
  | "EMAIL_NOT_VERIFIED"
  | "RELEASE_UNAVAILABLE"
  | "UNKNOWN_PROCESS"
  | "INVALID_FILTER"
  | "STALE_SNAPSHOT"
  | "REQUEST_WINDOW_TOO_LARGE"
  | "TEMPORARILY_UNAVAILABLE"
  | "UNSUPPORTED_OPERATION"
  | "AUTH_FAILED";
export interface ServiceError {
  readonly code: ServiceErrorCode;
  readonly message: string;
  readonly request_id: string;
  readonly retryable: boolean;
}
export type ServiceResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ServiceError };
export interface PublicWarning {
  readonly code: string;
  readonly message: string;
}
export interface AuthUser {
  readonly uid: string;
  readonly email: string;
  readonly email_verified: boolean;
}
export interface Identity extends AuthUser {
  readonly email_verified: true;
  readonly access: { readonly published_catalog: boolean };
}
export type AuthState =
  | { readonly status: "resolving" }
  | { readonly status: "unauthenticated" }
  | { readonly status: "authenticated"; readonly user: AuthUser }
  | { readonly status: "error"; readonly error: ServiceError };
export interface Credentials {
  readonly email: string;
  readonly password: string;
}
export interface AuthService {
  /** Delivers initial state asynchronously, then lifecycle changes; unsubscribe stops delivery. */
  observe(listener: (state: AuthState) => void): () => void;
  signIn(
    input: Credentials,
    options?: RequestOptions,
  ): Promise<ServiceResult<void>>;
  register(
    input: Credentials,
    options?: RequestOptions,
  ): Promise<ServiceResult<void>>;
  signOut(options?: RequestOptions): Promise<ServiceResult<void>>;
  sendVerification(options?: RequestOptions): Promise<ServiceResult<void>>;
  resetPassword(
    email: string,
    options?: RequestOptions,
  ): Promise<ServiceResult<void>>;
  refreshSession(options?: RequestOptions): Promise<ServiceResult<void>>;
}
export interface Release extends RevisionRef {
  readonly database_code: string;
  readonly version: string;
  readonly display_name: string;
  readonly published_at: string | null;
}
export interface ProcessHeader extends RevisionRef {
  readonly id: ProcessId;
  readonly name: string;
  readonly geography: string;
  readonly category: string;
  readonly subcategory: string;
  readonly category_path: readonly string[];
  readonly reference_flow_name: string;
  readonly reference_amount: DecimalString;
  readonly reference_unit: string;
  readonly warnings: readonly PublicWarning[];
}
export interface SearchFields {
  readonly process_name?: string;
  readonly geography?: string;
  readonly category?: string;
  readonly subcategory?: string;
  readonly reference_flow_name?: string;
}
export interface SearchRequest extends SnapshotRequest, PageRequest {
  readonly fields: SearchFields;
  readonly branch_path?: readonly string[];
}
export type SearchNode =
  | {
      readonly kind: "branch";
      readonly id: string;
      readonly release_id: ReleaseId;
      readonly label: string;
      readonly path: readonly string[];
      readonly matching_descendant_count: number;
      readonly children: readonly SearchNode[];
    }
  | {
      readonly kind: "process";
      readonly id: ProcessId;
      readonly release_id: ReleaseId;
      readonly label: string;
      readonly geography: string;
      readonly path: readonly string[];
    };
export interface ResolveSelectionRequest extends SearchRequest {
  readonly scope: "all_matching" | "branch";
}
export interface HeadersRequest extends SnapshotRequest {
  readonly process_ids: readonly ProcessId[];
}
export interface Indicator {
  readonly id: IndicatorId;
  readonly release_id: ReleaseId;
  readonly method_id: string;
  readonly method_name: string;
  readonly method_version: string;
  readonly category: string | null;
  readonly name: string;
  readonly unit: string;
  readonly source_order: number;
}
export interface IndicatorCategory {
  readonly id: string;
  readonly name: string;
  readonly source_order: number;
  readonly indicators: readonly Indicator[];
}
export interface IndicatorMethod {
  readonly id: string;
  readonly release_id: ReleaseId;
  readonly name: string;
  readonly version: string;
  readonly source_order: number;
  readonly indicators: readonly Indicator[];
  readonly categories: readonly IndicatorCategory[];
}
export interface IndicatorTree extends SnapshotResponse {
  readonly methods: readonly IndicatorMethod[];
  readonly default_indicator_ids: readonly IndicatorId[];
}
export interface FlowRow {
  readonly row_key: FlowRowKey;
  readonly flow_id: FlowId;
  readonly flow_type: FlowType;
  readonly name: string;
  readonly location: string | null;
  readonly process_name: string | null;
  readonly category: string;
  readonly subcategory: string;
  readonly unit: string;
  readonly sort_key: readonly string[];
}
export type FlowValue =
  | { readonly present: true; readonly amount: DecimalString }
  | { readonly present: false; readonly amount: null };
export type ScoreValue =
  | { readonly status: "valid"; readonly amount: DecimalString }
  | { readonly status: "missing" | "unresolved_basis"; readonly amount: null };
export type FlowCell = FlowValue & {
  readonly process_id: ProcessId;
  readonly row_key: FlowRowKey;
  readonly warnings: readonly PublicWarning[];
};
export type ScoreCell = ScoreValue & {
  readonly process_id: ProcessId;
  readonly indicator_id: IndicatorId;
  readonly warnings: readonly PublicWarning[];
};
export interface ComparisonRowsRequest extends SnapshotRequest, PageRequest {
  readonly process_ids: readonly ProcessId[];
  /** Defaults to false. True remains unsupported until F5/#29. */
  readonly differences_only?: boolean;
}
export interface ScoreRowsRequest extends ComparisonRowsRequest {
  readonly indicator_ids: readonly IndicatorId[];
}
export interface ComparisonPage<T> extends Page<T> {
  readonly comparison_token: string;
}
export interface FlowCellsRequest extends HeadersRequest {
  readonly row_keys: readonly FlowRowKey[];
  readonly comparison_token: string;
}
export interface ScoreCellsRequest extends HeadersRequest {
  readonly indicator_ids: readonly IndicatorId[];
  readonly comparison_token: string;
}
export interface CellsResponse<T> extends SnapshotResponse {
  readonly cells: readonly T[];
  readonly comparison_token: string;
}
export interface DataService {
  identity(options?: RequestOptions): Promise<ServiceResult<Identity>>;
  releases(options?: RequestOptions): Promise<ServiceResult<Page<Release>>>;
  search(
    input: SearchRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<Page<SearchNode>>>;
  resolveSelection(
    input: ResolveSelectionRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<Page<ProcessId>>>;
  headers(
    input: HeadersRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<Page<ProcessHeader>>>;
  indicatorTree(
    input: SnapshotRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<IndicatorTree>>;
  flowRows(
    input: ComparisonRowsRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<ComparisonPage<FlowRow>>>;
  flowCells(
    input: FlowCellsRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<CellsResponse<FlowCell>>>;
  scoreRows(
    input: ScoreRowsRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<ComparisonPage<Indicator>>>;
  scoreCells(
    input: ScoreCellsRequest,
    options?: RequestOptions,
  ): Promise<ServiceResult<CellsResponse<ScoreCell>>>;
  health(
    options?: RequestOptions,
  ): Promise<ServiceResult<{ readonly status: "ok" }>>;
}
export interface Services {
  readonly auth: AuthService;
  readonly data: DataService;
}
