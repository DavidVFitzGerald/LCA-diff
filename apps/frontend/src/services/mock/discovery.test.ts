import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HeadersRequest,
  ResolveSelectionRequest,
  SearchNode,
  SearchRequest,
  ServiceResult,
} from "../contracts";
import { createDiscoveryCatalog, createMockDiscovery } from "./discovery";

const catalog = createDiscoveryCatalog();
const current = catalog.releases.map(({ release_id, revision_id }) => ({
  release_id,
  revision_id,
}));
const search: SearchRequest = {
  revision_snapshot: current,
  fields: {},
  limit: 2,
};
function data<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}
function flatten(nodes: readonly SearchNode[]): SearchNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(node.kind === "branch" ? flatten(node.children) : []),
  ]);
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("mock discovery reads", () => {
  it("always completes asynchronously and returns active snapshots and terminal release/header pages", async () => {
    const service = createMockDiscovery();
    let settled = false;
    const pending = service.releases().then((result) => {
      settled = true;
      return result;
    });
    expect(settled).toBe(false);
    const releases = data(await finish(pending));
    expect(releases).toMatchObject({
      items: catalog.releases,
      revision_snapshot: current,
      next_cursor: null,
      total_count: 1,
    });
    const ids = catalog.revisions[1].headers
      .map((header) => header.id)
      .reverse();
    const result = data(
      await finish(
        service.headers({ revision_snapshot: current, process_ids: ids }),
      ),
    );
    expect(result.items.map((header) => header.id)).toEqual(ids);
    expect(result.next_cursor).toBe(null);
    expect(result.items[1].reference_amount).toBe(
      "2.0000000000000000000000001",
    );
    expect(
      result.items.every(
        (header) => header.revision_id === current[0].revision_id,
      ),
    ).toBe(true);
  });

  it("combines every token and populated field using literal case-insensitive AND", async () => {
    const service = createMockDiscovery();
    const result = data(
      await finish(
        service.search({
          ...search,
          fields: {
            process_name: "  ROAD\t BeTA  ",
            geography: "DE",
            category: "SYSTEMS transport",
            subcategory: "INFRA road",
            reference_flow_name: "service TRANSPORT",
          },
        }),
      ),
    );
    expect(result.total_count).toBe(1);
    expect(
      flatten(result.items)
        .filter((node) => node.kind === "process")
        .map((node) => node.label),
    ).toEqual(["Synthetic road service Beta"]);
    const branches = flatten(result.items).filter(
      (node) => node.kind === "branch",
    );
    expect(branches.map((node) => node.label)).toEqual([
      "Synthetic precision fixture",
      "transport systems",
      "road",
      "operations",
      "infrastructure",
    ]);
    expect(
      branches.every(
        (node) =>
          node.kind === "branch" && node.matching_descendant_count === 1,
      ),
    ).toBe(true);
    for (const fields of [
      { process_name: "Alpha Beta" },
      { process_name: ".*" },
      { process_name: "Alpha OR Beta" },
      { process_name: "road", geography: "FR" },
    ]) {
      const empty = data(await finish(service.search({ ...search, fields })));
      expect(empty).toMatchObject({
        items: [],
        next_cursor: null,
        total_count: 0,
      });
    }
  });

  it("pages leaves while retaining full ancestry and matching descendant counts", async () => {
    const service = createMockDiscovery({
      catalog: createDiscoveryCatalog(31),
      window_limit: 4,
    });
    let cursor: string | undefined;
    const leafIds: string[] = [];
    do {
      const result = data(
        await finish(service.search({ ...search, limit: 4, cursor })),
      );
      const nodes = flatten(result.items);
      const leaves = nodes.filter((node) => node.kind === "process");
      expect(leaves.length).toBeLessThanOrEqual(4);
      expect(result.total_count).toBe(31);
      expect(result.items[0]).toMatchObject({
        kind: "branch",
        path: [],
        matching_descendant_count: 31,
      });
      expect(
        nodes.find(
          (node) => node.kind === "branch" && node.label === "operations",
        ),
      ).toMatchObject({ matching_descendant_count: 31 });
      leaves.forEach((leaf) =>
        expect(leaf.path.slice(0, 3)).toEqual([
          "transport systems",
          "road",
          "operations",
        ]),
      );
      leafIds.push(...leaves.map((leaf) => leaf.id));
      cursor = result.next_cursor ?? undefined;
    } while (cursor);
    expect(new Set(leafIds).size).toBe(31);
  });

  it("resolves all matching IDs beyond pages without a selection cap", async () => {
    const generated = createDiscoveryCatalog(257);
    const service = createMockDiscovery({
      catalog: generated,
      window_limit: 17,
    });
    let cursor: string | undefined;
    const ids: string[] = [];
    do {
      const result = data(
        await finish(
          service.resolveSelection({
            ...search,
            limit: 17,
            scope: "all_matching",
            cursor,
          }),
        ),
      );
      expect(result.items.length).toBeLessThanOrEqual(17);
      expect(result.total_count).toBe(257);
      ids.push(...result.items);
      cursor = result.next_cursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(257);
    expect(new Set(ids).size).toBe(257);
    expect(ids.slice(0, 3)).toEqual(
      generated.revisions[1].headers.slice(0, 3).map((header) => header.id),
    );
    const tooWide = await finish(
      service.headers({ revision_snapshot: current, process_ids: ids }),
    );
    expect(tooWide).toMatchObject({
      ok: false,
      error: { code: "REQUEST_WINDOW_TOO_LARGE" },
    });
    const fetched: string[] = [];
    for (let start = 0; start < ids.length; start += 17)
      fetched.push(
        ...data(
          await finish(
            service.headers({
              revision_snapshot: current,
              process_ids: ids.slice(start, start + 17),
            }),
          ),
        ).items.map((header) => header.id),
      );
    expect(fetched).toEqual(ids);
  });

  it("uses name, geography, ID ordering with stable ties independent of fixture order", async () => {
    const base = createDiscoveryCatalog(4);
    const tied = {
      ...base,
      revisions: base.revisions.map((revision) => ({
        ...revision,
        headers: revision.headers.map((header, index) => ({
          ...header,
          id: ["z", "c", "b", "a"][index],
          name: ["Beta", "alpha", "Alpha", "alpha"][index],
          geography: ["CH", "CH", "AT", "AT"][index],
        })),
      })),
    };
    const service = createMockDiscovery({ catalog: tied });
    const result = data(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "all_matching",
          limit: 4,
        }),
      ),
    );
    expect(result.items).toEqual(["a", "b", "c", "z"]);
  });

  it("scopes bulk resolution to exact branch segments and active filters", async () => {
    const service = createMockDiscovery();
    const root = data(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "branch",
          branch_path: [],
        }),
      ),
    );
    expect(root.total_count).toBe(3);
    expect(root.items).toEqual(
      catalog.revisions[1].headers.slice(0, 2).map((header) => header.id),
    );
    const branch_path = [
      "transport systems",
      "road",
      "operations",
      "infrastructure",
    ];
    const result = data(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "branch",
          branch_path,
          fields: { geography: "DE" },
        }),
      ),
    );
    expect(result.items).toEqual([catalog.revisions[1].headers[1].id]);
    const noPartial = data(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "branch",
          branch_path: ["transport systems", "ro"],
        }),
      ),
    );
    expect(noPartial.items).toEqual([]);
    const filtered = data(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "branch",
          branch_path,
          fields: { geography: "CH" },
        }),
      ),
    );
    expect(filtered.items).toEqual([]);
  });

  it("keeps older immutable snapshots and rejects process IDs from another revision", async () => {
    const service = createMockDiscovery();
    const oldSnapshot = [catalog.revisions[0].revision];
    const old = data(
      await finish(
        service.resolveSelection({
          ...search,
          revision_snapshot: oldSnapshot,
          scope: "all_matching",
        }),
      ),
    );
    expect(old.items).toEqual(
      catalog.revisions[0].headers.slice(0, 2).map((header) => header.id),
    );
    expect(old.revision_snapshot).toEqual(oldSnapshot);
    expect(
      await finish(
        service.headers({ revision_snapshot: current, process_ids: old.items }),
      ),
    ).toMatchObject({ ok: false, error: { code: "UNKNOWN_PROCESS" } });
  });

  it("copies request inputs and returned values so delayed reads cannot change meaning", async () => {
    const service = createMockDiscovery({ scenario: { latency_ms: 20 } });
    const mutable = {
      revision_snapshot: current.map((ref) => ({ ...ref })),
      fields: { process_name: "Alpha" },
      limit: 2,
    };
    const pending = service.search(mutable);
    mutable.fields.process_name = "Beta";
    mutable.revision_snapshot[0].revision_id = "changed";
    const result = data(await finish(pending));
    expect(
      flatten(result.items).find((node) => node.kind === "process")?.label,
    ).toBe("Synthetic road service Alpha");
    const first = data(await finish(service.releases()));
    Object.assign(first.items[0], { display_name: "changed" });
    expect(data(await finish(service.releases())).items[0].display_name).toBe(
      "Synthetic precision fixture",
    );
  });
});

describe("mock discovery cursors and safe failures", () => {
  it("uses deterministic cursors bound to operation, filters, branch, scope and revisions", async () => {
    const service = createMockDiscovery();
    const first = data(await finish(service.search({ ...search, limit: 1 })));
    const cursor = first.next_cursor!;
    expect(
      data(await finish(service.search({ ...search, limit: 1 }))).next_cursor,
    ).toBe(cursor);
    expect(
      data(await finish(createMockDiscovery().search({ ...search, limit: 1 })))
        .next_cursor,
    ).toBe(cursor);
    const next = data(
      await finish(service.search({ ...search, limit: 1, cursor })),
    );
    expect(
      flatten(next.items)
        .filter((node) => node.kind === "process")
        .map((node) => node.id),
    ).toEqual([catalog.revisions[1].headers[1].id]);
    for (const changed of [
      { ...search, cursor, fields: { geography: "CH" } },
      { ...search, cursor, branch_path: ["transport systems"] },
      { ...search, cursor, revision_snapshot: [catalog.revisions[0].revision] },
      { ...search, cursor: "broken" },
    ]) {
      expect(await finish(service.search(changed))).toMatchObject({
        ok: false,
        error: { code: "INVALID_FILTER" },
      });
    }
    expect(
      await finish(
        service.resolveSelection({ ...search, cursor, scope: "all_matching" }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    const resolved = data(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "all_matching",
          limit: 1,
        }),
      ),
    );
    expect(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "branch",
          branch_path: ["transport systems"],
          cursor: resolved.next_cursor!,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
  });

  it.each([
    { fields: { unknown: "SECRET" } },
    { fields: null },
    { fields: [] },
    { fields: { process_name: 1 } },
    { fields: { geography: "x".repeat(257) } },
    { limit: 0 },
    { limit: 1.5 },
    { limit: NaN },
    { branch_path: [null] },
    { branch_path: "road" },
    { revision_snapshot: [] },
    { revision_snapshot: [...current, ...current] },
  ])(
    "returns a structured safe invalid-filter error (%j)",
    async (override) => {
      const input = { ...search, ...override } as unknown as SearchRequest;
      const result = await finish(createMockDiscovery().search(input));
      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "INVALID_FILTER",
          message: "Invalid search or cursor",
          retryable: false,
        },
      });
      expect(JSON.stringify(result)).not.toContain("SECRET");
    },
  );

  it("distinguishes invalid scopes, unavailable releases, stale revisions and transport budgets", async () => {
    const service = createMockDiscovery();
    expect(
      await finish(
        service.search({
          ...search,
          revision_snapshot: [
            { release_id: "unavailable", revision_id: "unknown" },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "RELEASE_UNAVAILABLE" } });
    expect(
      await finish(
        service.search({
          ...search,
          revision_snapshot: [{ ...current[0], revision_id: "unknown" }],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "STALE_SNAPSHOT" } });
    expect(
      await finish(service.search({ ...search, limit: 101 })),
    ).toMatchObject({ ok: false, error: { code: "REQUEST_WINDOW_TOO_LARGE" } });
    expect(
      await finish(service.resolveSelection({ ...search, scope: "branch" })),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    expect(
      await finish(
        service.resolveSelection({
          ...search,
          scope: "bad",
        } as unknown as ResolveSelectionRequest),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    expect(
      await finish(
        service.headers({
          revision_snapshot: current,
          process_ids: [123],
        } as unknown as HeadersRequest),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    expect(
      await finish(
        service.headers({
          revision_snapshot: current,
          process_ids: ["unknown"],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "UNKNOWN_PROCESS" } });
  });

  it("provides deterministic failure scenarios and correlation IDs", async () => {
    const service = createMockDiscovery({
      scenario: { failures: { search: "TEMPORARILY_UNAVAILABLE" } },
    });
    expect(await finish(service.search(search))).toEqual({
      ok: false,
      error: {
        code: "TEMPORARILY_UNAVAILABLE",
        message: "Synthetic temporary failure",
        request_id: "synthetic-search-1",
        retryable: true,
      },
    });
    expect(data(await finish(service.releases())).request_id).toBe(
      "synthetic-releases-2",
    );
  });
});

describe("mock request scheduling and cancellation", () => {
  it("permits deterministic out-of-order completion without swapping results", async () => {
    const service = createMockDiscovery({
      scenario: { latency_ms: (_, sequence) => (sequence === 1 ? 50 : 5) },
    });
    const completed: string[] = [];
    const first = service
      .search({ ...search, fields: { process_name: "Alpha" } })
      .then((result) => {
        completed.push("old");
        return data(result);
      });
    const second = service
      .search({ ...search, fields: { process_name: "Beta" } })
      .then((result) => {
        completed.push("new");
        return data(result);
      });
    await vi.advanceTimersByTimeAsync(5);
    expect(completed).toEqual(["new"]);
    expect(
      flatten((await second).items).find((node) => node.kind === "process")
        ?.label,
    ).toContain("Beta");
    await vi.advanceTimersByTimeAsync(45);
    expect(completed).toEqual(["new", "old"]);
    expect(
      flatten((await first).items).find((node) => node.kind === "process")
        ?.label,
    ).toContain("Alpha");
  });

  it("rejects pre-aborted and pending requests and clears timers/listeners", async () => {
    const service = createMockDiscovery({ scenario: { latency_ms: 50 } });
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const resolved = vi.fn();
    const promise = service.search(search, { signal: controller.signal });
    promise.then(resolved, () => undefined);
    const rejection = expect(promise).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    await vi.runAllTimersAsync();
    expect(resolved).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    await expect(
      service.releases({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes abort listeners after successful completion", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = await finish(
      createMockDiscovery().releases({ signal: controller.signal }),
    );
    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(vi.getTimerCount()).toBe(0);
  });
});
