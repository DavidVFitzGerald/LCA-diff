import type {
  DataService,
  HeadersRequest,
  Page,
  ProcessHeader,
  RequestOptions,
  ResolveSelectionRequest,
  RevisionRef,
  RevisionSnapshot,
  SearchFields,
  SearchNode,
  SearchRequest,
  ServiceErrorCode,
  Release,
} from "../contracts";
import { createSyntheticFixtures } from "./fixtures";
import {
  copy,
  compare,
  createMockRequest,
  invalid,
  MockFailure,
} from "./runtime";

export type DiscoveryService = Pick<
  DataService,
  "releases" | "search" | "resolveSelection" | "headers"
>;
export type DiscoveryOperation = keyof DiscoveryService;
export interface DiscoveryCatalog {
  readonly releases: readonly Release[];
  readonly revisions: readonly {
    readonly revision: RevisionRef;
    readonly headers: readonly ProcessHeader[];
  }[];
}
export interface DiscoveryScenario {
  readonly latency_ms?:
    number | ((operation: DiscoveryOperation, sequence: number) => number);
  readonly failures?: Partial<Record<DiscoveryOperation, ServiceErrorCode>>;
}
export interface DiscoveryOptions {
  readonly catalog?: DiscoveryCatalog;
  /** Bounds a single response/batch, never total selection. */
  readonly window_limit?: number;
  readonly scenario?: DiscoveryScenario;
}

/** Discovery-only generated headers; no claim of generated inventory/score data. */
export function createDiscoveryCatalog(processCount = 3): DiscoveryCatalog {
  if (!Number.isSafeInteger(processCount) || processCount < 0)
    throw new TypeError("Invalid synthetic process count");
  const fixtures = createSyntheticFixtures();
  return {
    releases: fixtures.releases,
    revisions: fixtures.revisions.map(({ revision, headers }) => ({
      revision,
      headers: Array.from({ length: processCount }, (_, index) =>
        index < headers.length
          ? headers[index]
          : {
              ...headers[index % headers.length],
              id: `synthetic:${revision.revision_id}:${index}`,
              name: `Synthetic road service generated ${String(index).padStart(6, "0")}`,
            },
      ),
    })),
  };
}

const fieldNames = [
  "process_name",
  "geography",
  "category",
  "subcategory",
  "reference_flow_name",
] as const;
function order(a: ProcessHeader, b: ProcessHeader): number {
  return (
    compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
    compare(a.geography.toLowerCase(), b.geography.toLowerCase()) ||
    compare(a.id, b.id)
  );
}

export function createMockDiscovery(
  options: DiscoveryOptions = {},
): DiscoveryService {
  const catalog = copy(options.catalog ?? createDiscoveryCatalog());
  const windowLimit = options.window_limit ?? 100;
  if (!Number.isSafeInteger(windowLimit) || windowLimit < 1)
    throw new TypeError("Invalid transport window limit");
  const request = createMockRequest<DiscoveryOperation>(options.scenario);

  function snapshot(input: RevisionSnapshot): {
    refs: RevisionSnapshot;
    headers: ProcessHeader[];
  } {
    if (!Array.isArray(input) || input.length === 0) invalid();
    const seen = new Set<string>();
    const headers: ProcessHeader[] = [];
    for (const ref of input) {
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
        (entry) =>
          entry.revision.release_id === ref.release_id &&
          entry.revision.revision_id === ref.revision_id,
      );
      if (!revision) throw new MockFailure("STALE_SNAPSHOT");
      headers.push(...revision.headers);
    }
    return {
      refs: [...input].sort((a, b) => compare(a.release_id, b.release_id)),
      headers,
    };
  }

  function filtered(input: SearchRequest) {
    const { refs, headers } = snapshot(input.revision_snapshot);
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) invalid();
    if (input.limit > windowLimit)
      throw new MockFailure("REQUEST_WINDOW_TOO_LARGE");
    if (
      !input.fields ||
      typeof input.fields !== "object" ||
      Array.isArray(input.fields)
    )
      invalid();
    if (
      Object.keys(input.fields).some(
        (key) => !fieldNames.includes(key as keyof SearchFields),
      )
    )
      invalid();
    const fields: SearchFields = Object.fromEntries(
      fieldNames.flatMap((name) => {
        const value = input.fields[name];
        if (value === undefined) return [];
        if (typeof value !== "string" || value.length > 256) invalid();
        const normalized = value
          .trim()
          .toLowerCase()
          .split(/\s+/u)
          .filter(Boolean)
          .sort()
          .join(" ");
        return normalized ? [[name, normalized]] : [];
      }),
    );
    if (
      input.branch_path !== undefined &&
      (!Array.isArray(input.branch_path) ||
        input.branch_path.some(
          (segment) =>
            typeof segment !== "string" ||
            segment.length === 0 ||
            segment.length > 256,
        ))
    )
      invalid();
    const branch = input.branch_path ?? [];
    const matches = headers
      .filter(
        (header) =>
          branch.every(
            (segment, index) => header.category_path[index] === segment,
          ) &&
          fieldNames.every((field) => {
            const value =
              field === "process_name" ? header.name : header[field];
            return (fields[field]?.split(" ") ?? []).every((token) =>
              value.toLowerCase().includes(token),
            );
          }),
      )
      .sort(order);
    return { refs, fields, branch, matches };
  }

  function page(
    input: SearchRequest,
    operation: "search" | "resolveSelection",
    scope?: string,
  ) {
    const result = filtered(input);
    const key = JSON.stringify([
      operation,
      result.refs,
      result.fields,
      result.branch,
      scope ?? null,
    ]);
    let start = 0;
    if (input.cursor !== undefined) {
      if (
        typeof input.cursor !== "string" ||
        input.cursor.length > 16384 ||
        !input.cursor.startsWith("v1.")
      )
        invalid();
      let token: unknown;
      try {
        token = JSON.parse(decodeURIComponent(input.cursor.slice(3)));
      } catch {
        invalid();
      }
      if (
        !token ||
        typeof token !== "object" ||
        !("key" in token) ||
        token.key !== key ||
        !("after" in token) ||
        typeof token.after !== "string"
      )
        invalid();
      const index = result.matches.findIndex(
        (header) => header.id === token.after,
      );
      if (index === -1) invalid();
      start = index + 1;
    }
    const items = result.matches.slice(start, start + input.limit);
    const next =
      start + items.length < result.matches.length
        ? `v1.${encodeURIComponent(JSON.stringify({ key, after: items.at(-1)?.id }))}`
        : null;
    return { ...result, items, next };
  }

  type Leaf = Extract<SearchNode, { kind: "process" }>;
  type Branch = Omit<Extract<SearchNode, { kind: "branch" }>, "children"> & {
    children: (Branch | Leaf)[];
  };
  function tree(
    all: readonly ProcessHeader[],
    visible: readonly ProcessHeader[],
  ): SearchNode[] {
    const counts = new Map<string, number>();
    const nodeId = (release: string, path: readonly string[]) =>
      JSON.stringify([release, ...path]);
    for (const header of all)
      for (let depth = 0; depth <= header.category_path.length; depth += 1) {
        const id = nodeId(
          header.release_id,
          header.category_path.slice(0, depth),
        );
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    const roots: Branch[] = [];
    const branches = new Map<string, Branch>();
    for (const header of visible) {
      let children: (Branch | Leaf)[] = roots;
      for (let depth = 0; depth <= header.category_path.length; depth += 1) {
        const path = header.category_path.slice(0, depth);
        const id = nodeId(header.release_id, path);
        let branch = branches.get(id);
        if (!branch) {
          branch = {
            kind: "branch",
            id,
            release_id: header.release_id,
            label:
              path.at(-1) ??
              catalog.releases.find(
                (release) => release.release_id === header.release_id,
              )!.display_name,
            path,
            matching_descendant_count: counts.get(id) ?? 0,
            children: [],
          };
          branches.set(id, branch);
          children.push(branch);
        }
        children = branch.children;
      }
      children.push({
        kind: "process",
        id: header.id,
        release_id: header.release_id,
        label: header.name,
        geography: header.geography,
        path: header.category_path,
      });
    }
    return roots;
  }

  return {
    releases: (requestOptions?: RequestOptions) =>
      request(
        "releases",
        requestOptions?.signal,
        (request_id): Page<Release> => ({
          items: catalog.releases,
          total_count: catalog.releases.length,
          next_cursor: null,
          revision_snapshot: catalog.releases.map(
            ({ release_id, revision_id }) => ({ release_id, revision_id }),
          ),
          request_id,
        }),
      ),
    search: (input: SearchRequest, requestOptions?: RequestOptions) => {
      const captured = copy(input);
      return request(
        "search",
        requestOptions?.signal,
        (request_id): Page<SearchNode> => {
          const result = page(captured, "search");
          return {
            items: tree(result.matches, result.items),
            total_count: result.matches.length,
            next_cursor: result.next,
            revision_snapshot: result.refs,
            request_id,
          };
        },
      );
    },
    resolveSelection: (
      input: ResolveSelectionRequest,
      requestOptions?: RequestOptions,
    ) => {
      const captured = copy(input);
      return request(
        "resolveSelection",
        requestOptions?.signal,
        (request_id): Page<string> => {
          if (captured.scope !== "all_matching" && captured.scope !== "branch")
            invalid();
          if (
            captured.scope === "branch" &&
            !Array.isArray(captured.branch_path)
          )
            invalid();
          const result = page(captured, "resolveSelection", captured.scope);
          return {
            items: result.items.map((header) => header.id),
            total_count: result.matches.length,
            next_cursor: result.next,
            revision_snapshot: result.refs,
            request_id,
          };
        },
      );
    },
    headers: (input: HeadersRequest, requestOptions?: RequestOptions) => {
      const captured = copy(input);
      return request(
        "headers",
        requestOptions?.signal,
        (request_id): Page<ProcessHeader> => {
          const result = snapshot(captured.revision_snapshot);
          if (
            !Array.isArray(captured.process_ids) ||
            captured.process_ids.some((id) => typeof id !== "string")
          )
            invalid();
          if (captured.process_ids.length > windowLimit)
            throw new MockFailure("REQUEST_WINDOW_TOO_LARGE");
          const byId = new Map(
            result.headers.map((header) => [header.id, header]),
          );
          const items = [...new Set(captured.process_ids)].map((id) => {
            const header = byId.get(id);
            if (!header) throw new MockFailure("UNKNOWN_PROCESS");
            return header;
          });
          return {
            items,
            total_count: items.length,
            next_cursor: null,
            revision_snapshot: result.refs,
            request_id,
          };
        },
      );
    },
  };
}
