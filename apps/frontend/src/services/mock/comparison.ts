import type {
  ComparisonPage,
  ComparisonRowsRequest,
  DataService,
  FlowCellsRequest,
  FlowRow,
  Indicator,
  IndicatorTree,
  RevisionSnapshot,
  ScoreCellsRequest,
} from "../contracts";
import { createComparisonCatalog } from "./comparison-fixtures";
import type {
  ComparisonCatalog,
  ComparisonProcess,
  ComparisonRevision,
} from "./comparison-fixtures";
import {
  compare,
  copy,
  createMockRequest,
  invalid,
  MockFailure,
} from "./runtime";
import type { MockScenario } from "./runtime";

export type ComparisonService = Pick<
  DataService,
  "indicatorTree" | "flowRows" | "flowCells" | "scoreRows" | "scoreCells"
>;
export interface ComparisonOptions {
  readonly catalog?: ComparisonCatalog;
  readonly window_limit?: number;
  readonly cell_limit?: number;
  readonly token_limit?: number;
  readonly scenario?: MockScenario<keyof ComparisonService>;
}
const flowOrder = [
  "Reference",
  "Technosphere",
  "Ecosphere Input",
  "Ecosphere Output",
];
function rowOrder(a: FlowRow, b: FlowRow): number {
  return (
    flowOrder.indexOf(a.flow_type) - flowOrder.indexOf(b.flow_type) ||
    compare(a.category.toLowerCase(), b.category.toLowerCase()) ||
    compare(a.subcategory.toLowerCase(), b.subcategory.toLowerCase()) ||
    compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
    compare(a.flow_id, b.flow_id)
  );
}
function uniqueIds(input: readonly string[]): string[] {
  if (!Array.isArray(input) || input.some((id) => typeof id !== "string"))
    invalid();
  return [...new Set(input)];
}
function indicators(revisions: readonly ComparisonRevision[]): Indicator[] {
  return revisions
    .flatMap((revision) =>
      revision.indicator_tree.methods.flatMap((method) => [
        ...method.indicators,
        ...method.categories.flatMap((category) => category.indicators),
      ]),
    )
    .sort((a, b) => a.source_order - b.source_order || compare(a.id, b.id));
}

export function createMockComparison(
  options: ComparisonOptions = {},
): ComparisonService {
  const catalog = copy(options.catalog ?? createComparisonCatalog());
  const windowLimit = options.window_limit ?? 100;
  const cellLimit = options.cell_limit ?? 1000;
  const tokenLimit = options.token_limit ?? 128;
  if (
    [windowLimit, cellLimit, tokenLimit].some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    )
  )
    throw new TypeError("Invalid mock comparison bounds");
  const request = createMockRequest<keyof ComparisonService>(options.scenario);
  interface Context {
    key: string;
    tab: "flows" | "scores";
    refs: RevisionSnapshot;
    processes: Map<
      string,
      { process: ComparisonProcess; revision: ComparisonRevision }
    >;
    row_ids: readonly string[];
  }
  const contexts = new Map<string, Context>();
  const byKey = new Map<string, string>();
  let tokenSequence = 0;

  function snapshot(refs: RevisionSnapshot) {
    if (!Array.isArray(refs) || refs.length === 0) invalid();
    const seen = new Set<string>();
    const revisions = refs.map((ref) => {
      if (
        !ref ||
        typeof ref.release_id !== "string" ||
        typeof ref.revision_id !== "string" ||
        seen.has(ref.release_id)
      )
        invalid();
      seen.add(ref.release_id);
      if (
        !catalog.releases.some(
          (release) => release.release_id === ref.release_id,
        )
      )
        throw new MockFailure("RELEASE_UNAVAILABLE");
      const revision = catalog.revisions.find(
        (candidate) =>
          candidate.revision.release_id === ref.release_id &&
          candidate.revision.revision_id === ref.revision_id,
      );
      if (!revision) throw new MockFailure("STALE_SNAPSHOT");
      return revision;
    });
    return {
      refs: [...refs].sort((a, b) => compare(a.release_id, b.release_id)),
      revisions,
    };
  }
  function selected(refs: RevisionSnapshot, ids: readonly string[]) {
    const result = snapshot(refs);
    const available = new Map(
      result.revisions.flatMap((revision) =>
        revision.processes.map(
          (process) => [process.header.id, { process, revision }] as const,
        ),
      ),
    );
    const processes = new Map(
      uniqueIds(ids).map((id) => {
        const process = available.get(id);
        if (!process) throw new MockFailure("UNKNOWN_PROCESS");
        return [id, process] as const;
      }),
    );
    return { ...result, processes };
  }
  function token(context: Context): string {
    const existing = byKey.get(context.key);
    if (existing) return existing;
    if (contexts.size >= tokenLimit) {
      const oldest = contexts.keys().next().value!;
      byKey.delete(contexts.get(oldest)!.key);
      contexts.delete(oldest);
    }
    const value = `synthetic-comparison-${++tokenSequence}`;
    contexts.set(value, context);
    byKey.set(context.key, value);
    return value;
  }
  function rowPage<T extends FlowRow | Indicator>(
    input: ComparisonRowsRequest,
    tab: "flows" | "scores",
    rows: readonly T[],
    context: Omit<Context, "row_ids" | "key" | "tab">,
    indicatorIds: readonly string[],
    request_id: string,
  ): ComparisonPage<T> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) invalid();
    if (input.limit > windowLimit)
      throw new MockFailure("REQUEST_WINDOW_TOO_LARGE");
    const row_ids = rows.map((row) =>
      "row_key" in row ? row.row_key : row.id,
    );
    const key = JSON.stringify([
      tab,
      context.refs,
      [...context.processes.keys()].sort(compare),
      [...indicatorIds].sort(compare),
      false,
    ]);
    const comparison_token = token({ ...context, key, tab, row_ids });
    let start = 0;
    if (input.cursor !== undefined) {
      if (
        typeof input.cursor !== "string" ||
        !input.cursor.startsWith("v1.") ||
        input.cursor.length > 16384
      )
        invalid();
      let cursor: unknown;
      try {
        cursor = JSON.parse(decodeURIComponent(input.cursor.slice(3)));
      } catch {
        invalid();
      }
      if (
        !cursor ||
        typeof cursor !== "object" ||
        !("token" in cursor) ||
        cursor.token !== comparison_token ||
        !("after" in cursor) ||
        typeof cursor.after !== "string"
      )
        invalid();
      const index = row_ids.indexOf(cursor.after);
      if (index < 0) invalid();
      start = index + 1;
    }
    const items = rows.slice(start, start + input.limit);
    const next_cursor =
      start + items.length < rows.length
        ? `v1.${encodeURIComponent(JSON.stringify({ token: comparison_token, after: row_ids[start + items.length - 1] }))}`
        : null;
    return {
      items,
      next_cursor,
      total_count: rows.length,
      revision_snapshot: context.refs,
      comparison_token,
      request_id,
    };
  }
  function differences(input: ComparisonRowsRequest) {
    if (
      input.differences_only !== undefined &&
      typeof input.differences_only !== "boolean"
    )
      invalid();
    if (input.differences_only) throw new MockFailure("UNSUPPORTED_OPERATION");
  }
  function cellContext(
    input: FlowCellsRequest | ScoreCellsRequest,
    tab: "flows" | "scores",
    rowIds: readonly string[],
  ) {
    const result = selected(input.revision_snapshot, input.process_ids);
    const rows = uniqueIds(rowIds);
    if (
      input.process_ids.length > windowLimit ||
      rowIds.length > windowLimit ||
      input.process_ids.length * rowIds.length > cellLimit
    )
      throw new MockFailure("REQUEST_WINDOW_TOO_LARGE");
    const context = contexts.get(input.comparison_token);
    if (
      !context ||
      JSON.stringify(context.refs) !== JSON.stringify(result.refs)
    )
      throw new MockFailure("STALE_SNAPSHOT");
    if (
      context.tab !== tab ||
      [...result.processes.keys()].some((id) => !context.processes.has(id)) ||
      rows.some((id) => !context.row_ids.includes(id))
    )
      invalid();
    return { ...result, rows };
  }
  return {
    indicatorTree: (input, options) => {
      const captured = copy(input);
      return request(
        "indicatorTree",
        options?.signal,
        (request_id): IndicatorTree => {
          const result = snapshot(captured.revision_snapshot);
          return {
            revision_snapshot: result.refs,
            request_id,
            methods: result.revisions
              .flatMap((revision) => revision.indicator_tree.methods)
              .sort(
                (a, b) =>
                  a.source_order - b.source_order || compare(a.id, b.id),
              ),
            default_indicator_ids: [
              ...new Set(
                result.revisions.flatMap(
                  (revision) => revision.indicator_tree.default_indicator_ids,
                ),
              ),
            ],
          };
        },
      );
    },
    flowRows: (input, options) => {
      const captured = copy(input);
      return request("flowRows", options?.signal, (request_id) => {
        differences(captured);
        const result = selected(
          captured.revision_snapshot,
          captured.process_ids,
        );
        const represented = new Set(
          [...result.processes.values()].flatMap(({ process }) =>
            Object.entries(process.flows)
              .filter(([, value]) => value.present)
              .map(([id]) => id),
          ),
        );
        for (const revision of result.revisions) {
          const selectedProcesses = [...result.processes.values()]
            .filter((entry) => entry.revision === revision)
            .map((entry) => entry.process);
          for (const [id, value] of Object.entries(revision.shared_flows)) {
            if (
              value.present &&
              selectedProcesses.some(
                (process) =>
                  process.flows[id] === undefined || process.flows[id].present,
              )
            )
              represented.add(id);
          }
        }
        const rows = [
          ...new Map(
            result.revisions
              .flatMap((revision) => revision.flow_rows)
              .filter((row) => represented.has(row.row_key))
              .map((row) => [row.row_key, row]),
          ).values(),
        ].sort(rowOrder);
        return rowPage(captured, "flows", rows, result, [], request_id);
      });
    },
    scoreRows: (input, options) => {
      const captured = copy(input);
      return request("scoreRows", options?.signal, (request_id) => {
        differences(captured);
        const result = selected(
          captured.revision_snapshot,
          captured.process_ids,
        );
        const ids = uniqueIds(captured.indicator_ids);
        const available = indicators(result.revisions);
        if (
          ids.some((id) => !available.some((indicator) => indicator.id === id))
        )
          invalid();
        return rowPage(
          captured,
          "scores",
          available.filter((indicator) => ids.includes(indicator.id)),
          result,
          ids,
          request_id,
        );
      });
    },
    flowCells: (input, options) => {
      const captured = copy(input);
      return request("flowCells", options?.signal, (request_id) => {
        const result = cellContext(captured, "flows", captured.row_keys);
        const cells = [...result.processes].flatMap(
          ([process_id, { process, revision }]) =>
            result.rows.map((row_key) => ({
              process_id,
              row_key: row_key as FlowCellsRequest["row_keys"][number],
              ...(process.flows[row_key] ??
                revision.shared_flows[row_key] ?? {
                  present: false as const,
                  amount: null,
                  warnings: [],
                }),
            })),
        );
        return {
          cells,
          revision_snapshot: result.refs,
          comparison_token: captured.comparison_token,
          request_id,
        };
      });
    },
    scoreCells: (input, options) => {
      const captured = copy(input);
      return request("scoreCells", options?.signal, (request_id) => {
        const result = cellContext(captured, "scores", captured.indicator_ids);
        const cells = [...result.processes].flatMap(
          ([process_id, { process }]) =>
            result.rows.map((indicator_id) => ({
              process_id,
              indicator_id,
              ...(process.scores[indicator_id] ?? {
                status: "missing" as const,
                amount: null,
                warnings: [],
              }),
            })),
        );
        return {
          cells,
          revision_snapshot: result.refs,
          comparison_token: captured.comparison_token,
          request_id,
        };
      });
    },
  };
}
