import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type {
  ComparisonRowsRequest,
  DataService,
  FlowCellsRequest,
  HeadersRequest,
  ScoreCellsRequest,
  ScoreRowsRequest,
  SearchNode,
  SearchRequest,
  ResolveSelectionRequest,
  Page,
  ProcessHeader,
  ProcessId,
  RevisionRef,
  ServiceResult,
  ServiceError,
  SnapshotRequest,
} from "../services/contracts";
import {
  useAuthState,
  useServiceContext,
  verifiedUid,
} from "./service-context";

export class ServiceQueryError extends Error {
  constructor(readonly detail: ServiceError) {
    super(detail.message);
    this.name = "ServiceQueryError";
  }
}
export interface QueryScope {
  readonly namespace: string;
  readonly uid: string | null;
}
/** Per-request item window for paged reads; never a total limit. */
export const SERVICE_WINDOW = 100;
function capture<T>(input: T): T {
  return input === undefined ? input : (JSON.parse(JSON.stringify(input)) as T);
}
export function createServiceQueries(data: DataService, scope: QueryScope) {
  const denied = () =>
    new ServiceQueryError({
      code: "AUTH_REQUIRED",
      message: "Verified authentication is required",
      request_id: "query-auth-guard",
      retryable: false,
    });
  function options<T>(
    operation: keyof DataService,
    input: unknown,
    read: (signal: AbortSignal) => Promise<ServiceResult<T>>,
  ) {
    return queryOptions({
      queryKey: [
        "lca-services",
        1,
        scope.namespace,
        scope.uid,
        operation,
        input,
      ] as const,
      enabled: scope.uid !== null,
      queryFn: async ({ signal }) => {
        if (scope.uid === null) throw denied();
        const result = await read(signal);
        if (!result.ok) throw new ServiceQueryError(result.error);
        return result.data;
      },
    });
  }
  return {
    identity: () =>
      options("identity", null, (signal) => data.identity({ signal })),
    releases: () =>
      options("releases", null, (signal) => data.releases({ signal })),
    search: (input: SearchRequest) => {
      const dto = capture(input);
      return options("search", dto, (signal) => data.search(dto, { signal }));
    },
    /** Cursor-paged search; the key omits the cursor, which is the page param. */
    searchPages: (input: Omit<SearchRequest, "cursor">) => {
      const dto: SearchRequest = capture(input);
      return infiniteQueryOptions({
        queryKey: [
          "lca-services",
          1,
          scope.namespace,
          scope.uid,
          "searchPages",
          dto,
        ] as const,
        enabled: scope.uid !== null,
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (last: Page<SearchNode>) =>
          last.next_cursor ?? undefined,
        queryFn: async ({ signal, pageParam }) => {
          if (scope.uid === null) throw denied();
          const result = await data.search(
            pageParam === undefined ? dto : { ...dto, cursor: pageParam },
            { signal },
          );
          if (!result.ok) throw new ServiceQueryError(result.error);
          return result.data;
        },
      });
    },
    /**
     * Every ID in a selection scope, following all cursors (#19, D1). The
     * response window bounds each request, never the total selection.
     */
    resolveAll: (input: Omit<ResolveSelectionRequest, "cursor" | "limit">) => {
      const dto = capture(input);
      return options("resolveSelection", ["all", dto], async (signal) => {
        const ids: ProcessId[] = [];
        let cursor: string | undefined;
        do {
          const result = await data.resolveSelection(
            { ...dto, limit: SERVICE_WINDOW, ...(cursor ? { cursor } : {}) },
            { signal },
          );
          if (!result.ok) return result;
          ids.push(...result.data.items);
          cursor = result.data.next_cursor ?? undefined;
        } while (cursor !== undefined);
        return { ok: true, data: ids } as const;
      });
    },
    /** Headers for any number of IDs in one release, batched by window (#19). */
    headersFor: (revision: RevisionRef, ids: readonly ProcessId[]) => {
      const snapshot = [capture(revision)];
      const wanted = [...ids];
      return options("headers", ["all", snapshot, wanted], async (signal) => {
        const headers: ProcessHeader[] = [];
        for (let start = 0; start < wanted.length; start += SERVICE_WINDOW) {
          const result = await data.headers(
            {
              revision_snapshot: snapshot,
              process_ids: wanted.slice(start, start + SERVICE_WINDOW),
            },
            { signal },
          );
          if (!result.ok) return result;
          headers.push(...result.data.items);
        }
        return { ok: true, data: headers } as const;
      });
    },
    resolveSelection: (input: ResolveSelectionRequest) => {
      const dto = capture(input);
      return options("resolveSelection", dto, (signal) =>
        data.resolveSelection(dto, { signal }),
      );
    },
    headers: (input: HeadersRequest) => {
      const dto = capture(input);
      return options("headers", dto, (signal) => data.headers(dto, { signal }));
    },
    indicatorTree: (input: SnapshotRequest) => {
      const dto = capture(input);
      return options("indicatorTree", dto, (signal) =>
        data.indicatorTree(dto, { signal }),
      );
    },
    flowRows: (input: ComparisonRowsRequest) => {
      const dto = capture(input);
      return options("flowRows", dto, (signal) =>
        data.flowRows(dto, { signal }),
      );
    },
    flowCells: (input: FlowCellsRequest) => {
      const dto = capture(input);
      return options("flowCells", dto, (signal) =>
        data.flowCells(dto, { signal }),
      );
    },
    scoreRows: (input: ScoreRowsRequest) => {
      const dto = capture(input);
      return options("scoreRows", dto, (signal) =>
        data.scoreRows(dto, { signal }),
      );
    },
    scoreCells: (input: ScoreCellsRequest) => {
      const dto = capture(input);
      return options("scoreCells", dto, (signal) =>
        data.scoreCells(dto, { signal }),
      );
    },
  };
}
export function useServiceQueries() {
  const { services, namespace } = useServiceContext();
  const auth = useAuthState();
  return createServiceQueries(services.data, {
    namespace,
    uid: verifiedUid(auth),
  });
}
