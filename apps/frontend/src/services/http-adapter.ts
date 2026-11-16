import schema from "../../../api/openapi.json";
import type {
  DataService,
  ServiceResult,
  ServiceError,
  WireSchemas,
  RequestOptions,
  FlowCell,
  ScoreCell,
  SearchNode,
  FlowRow,
  Indicator,
} from "./contracts";
import { decimalString } from "./contracts";
import { deriveSummary } from "./summary";

type JsonSchema = {
  $ref?: string;
  anyOf?: JsonSchema[];
  type?: string;
  enum?: unknown[];
  const?: unknown;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
};
const schemas = schema.components.schemas as Record<string, JsonSchema>;
/** Validate generated-schema shapes before interpreting flattened wire unions. */
function valid(value: unknown, rule: JsonSchema): boolean {
  if (rule.$ref) return valid(value, schemas[rule.$ref.split("/").at(-1)!]);
  if (rule.anyOf) return rule.anyOf.some((part) => valid(value, part));
  if ("const" in rule && value !== rule.const) return false;
  if (rule.enum && !rule.enum.includes(value)) return false;
  if (rule.type === "null") return value === null;
  if (rule.type === "string") return typeof value === "string";
  if (rule.type === "boolean") return typeof value === "boolean";
  if (rule.type === "integer") return Number.isSafeInteger(value);
  if (rule.type === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (rule.type === "array")
    return (
      Array.isArray(value) &&
      value.every((item) => valid(item, rule.items ?? {}))
    );
  if (rule.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    return (
      (rule.required ?? []).every((key) => key in record) &&
      Object.entries(record).every(([key, item]) => {
        const child = rule.properties?.[key];
        return child
          ? valid(item, child)
          : rule.additionalProperties === false
            ? false
            : typeof rule.additionalProperties === "object"
              ? valid(item, rule.additionalProperties)
              : true;
      })
    );
  }
  return true;
}
const unavailable = (request_id = "client-transport"): ServiceError => ({
  code: "TEMPORARILY_UNAVAILABLE",
  message: "The service is unavailable. Please retry.",
  request_id,
  retryable: true,
});
const codes = new Set([
  "AUTH_REQUIRED",
  "EMAIL_NOT_VERIFIED",
  "RELEASE_UNAVAILABLE",
  "UNKNOWN_PROCESS",
  "INVALID_FILTER",
  "STALE_SNAPSHOT",
  "REQUEST_WINDOW_TOO_LARGE",
  "TEMPORARILY_UNAVAILABLE",
]);
export interface TokenSource {
  token(forceRefresh: boolean): Promise<string | null>;
}
export function createHttpData(
  base: string,
  tokens: TokenSource,
  transport: typeof fetch = fetch,
): DataService {
  async function request<T>(
    route: string,
    responseSchema: string,
    body: unknown,
    options?: RequestOptions,
    map: (value: unknown) => T = (value) => value as T,
  ): Promise<ServiceResult<T>> {
    const signal = options?.signal;
    const check = () => signal?.throwIfAborted();
    let request_id = "client-transport";
    let refreshing = false;
    try {
      check();
      for (let attempt = 0; attempt < 2; attempt++) {
        refreshing = attempt === 1;
        const token =
          route === "/health" ? null : await tokens.token(attempt === 1);
        check();
        refreshing = false;
        const response = await transport(base + route, {
          method: body === undefined ? "GET" : "POST",
          signal,
          headers: {
            ...(body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        check();
        request_id = response.headers.get("X-Request-ID") ?? request_id;
        if (response.status === 401 && attempt === 0 && route !== "/health")
          continue;
        const value: unknown = await response.json();
        check();
        if (!response.ok) {
          const envelope = value as { error?: ServiceError };
          const error = envelope?.error;
          if (
            !error ||
            !codes.has(error.code) ||
            typeof error.message !== "string" ||
            typeof error.request_id !== "string" ||
            typeof error.retryable !== "boolean"
          )
            return { ok: false, error: unavailable(request_id) };
          return {
            ok: false,
            error: {
              ...error,
              request_id:
                response.headers.get("X-Request-ID") ?? error.request_id,
            },
          };
        }
        if (!schemas[responseSchema] || !valid(value, schemas[responseSchema]))
          return { ok: false, error: unavailable(request_id) };
        const data = map(value);
        check();
        return { ok: true, data };
      }
      return { ok: false, error: unavailable(request_id) };
    } catch (error) {
      check();
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      return {
        ok: false,
        error: refreshing
          ? {
              code: "AUTH_REQUIRED",
              message: "Please sign in again.",
              request_id,
              retryable: false,
            }
          : unavailable(request_id),
      };
    }
  }
  function flow(value: WireSchemas["FlowCell"]): FlowCell {
    if (value.present !== (value.amount !== null))
      throw new TypeError("Invalid flow");
    return {
      ...value,
      row_key: value.row_key as FlowCell["row_key"],
      ...(value.present
        ? { present: true, amount: decimalString(value.amount!) }
        : { present: false, amount: null }),
    };
  }
  function score(value: WireSchemas["ScoreCell"]): ScoreCell {
    if ((value.status === "valid") !== (value.amount !== null))
      throw new TypeError("Invalid score");
    return {
      ...value,
      ...(value.status === "valid"
        ? { status: "valid", amount: decimalString(value.amount!) }
        : { status: value.status, amount: null }),
    };
  }
  function node(value: WireSchemas["SearchNode"]): SearchNode {
    if (value.kind === "process") {
      if (
        typeof value.geography !== "string" ||
        (value.children?.length ?? 0) !== 0 ||
        value.matching_descendant_count != null
      )
        throw new TypeError("Invalid process node");
      return { ...value, kind: "process", geography: value.geography };
    }
    if (
      !Number.isSafeInteger(value.matching_descendant_count) ||
      value.matching_descendant_count! < 0 ||
      value.geography != null
    )
      throw new TypeError("Invalid branch node");
    return {
      ...value,
      kind: "branch",
      matching_descendant_count: value.matching_descendant_count!,
      children: (value.children ?? []).map(node),
    };
  }
  const row = (value: WireSchemas["FlowRow"]): FlowRow => ({
    ...value,
    row_key: value.row_key as FlowRow["row_key"],
    summary: deriveSummary(value.summary),
  });
  const indicator = (value: WireSchemas["Indicator"]): Indicator => ({
    ...value,
    summary: value.summary ? deriveSummary(value.summary) : undefined,
  });
  return {
    identity: (options) =>
      request("/me", "Identity", undefined, options, (value) => {
        const item = value as WireSchemas["Identity"];
        return {
          ...item,
          email_verified: true,
          access: {
            published_catalog: item.access?.published_catalog === true,
          },
        };
      }),
    health: (options) => request("/health", "Health", undefined, options),
    releases: (options) =>
      request("/releases", "Page_Release_", undefined, options),
    search: (input, options) =>
      request(
        "/processes/search",
        "Page_SearchNode_",
        input,
        options,
        (value) => {
          const page = value as WireSchemas["Page_SearchNode_"];
          return { ...page, items: page.items.map(node) };
        },
      ),
    resolveSelection: (input, options) =>
      request("/processes/resolve-selection", "Page_str_", input, options),
    headers: (input, options) =>
      request("/processes/headers", "Page_Header_", input, options, (value) => {
        const page = value as WireSchemas["Page_Header_"];
        return {
          ...page,
          items: page.items.map((item) => ({
            ...item,
            reference_amount: decimalString(item.reference_amount),
          })),
        };
      }),
    indicatorTree: (input, options) =>
      request(
        "/indicators/tree?revision_snapshot=" +
          encodeURIComponent(JSON.stringify(input.revision_snapshot)),
        "IndicatorTree",
        undefined,
        options,
        (value) => {
          const tree = value as WireSchemas["IndicatorTree"];
          return {
            ...tree,
            methods: tree.methods.map((method) => ({
              ...method,
              indicators: method.indicators.map(indicator),
              categories: method.categories.map((category) => ({
                ...category,
                indicators: category.indicators.map(indicator),
              })),
            })),
          };
        },
      ),
    flowRows: (input, options) =>
      request(
        "/comparison/flows/rows",
        "ComparisonPage_FlowRow_",
        input,
        options,
        (value) => {
          const page = value as WireSchemas["ComparisonPage_FlowRow_"];
          return { ...page, items: page.items.map(row) };
        },
      ),
    scoreRows: (input, options) =>
      request(
        "/comparison/scores/rows",
        "ComparisonPage_Indicator_",
        input,
        options,
        (value) => {
          const page = value as WireSchemas["ComparisonPage_Indicator_"];
          if (page.items.some((item) => !item.summary))
            throw new TypeError("Missing summary");
          return { ...page, items: page.items.map(indicator) };
        },
      ),
    flowCells: (input, options) =>
      request(
        "/comparison/flows/cells",
        "Cells_FlowCell_",
        input,
        options,
        (value) => {
          const page = value as WireSchemas["Cells_FlowCell_"];
          return { ...page, cells: page.cells.map(flow) };
        },
      ),
    scoreCells: (input, options) =>
      request(
        "/comparison/scores/cells",
        "Cells_ScoreCell_",
        input,
        options,
        (value) => {
          const page = value as WireSchemas["Cells_ScoreCell_"];
          return { ...page, cells: page.cells.map(score) };
        },
      ),
  };
}
