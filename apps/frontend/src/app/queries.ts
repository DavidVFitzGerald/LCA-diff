import { queryOptions } from "@tanstack/react-query";
import type {
  ComparisonRowsRequest,
  DataService,
  FlowCellsRequest,
  HeadersRequest,
  ScoreCellsRequest,
  ScoreRowsRequest,
  SearchRequest,
  ResolveSelectionRequest,
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
function capture<T>(input: T): T {
  return input === undefined ? input : (JSON.parse(JSON.stringify(input)) as T);
}
export function createServiceQueries(data: DataService, scope: QueryScope) {
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
        if (scope.uid === null)
          throw new ServiceQueryError({
            code: "AUTH_REQUIRED",
            message: "Verified authentication is required",
            request_id: "query-auth-guard",
            retryable: false,
          });
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
