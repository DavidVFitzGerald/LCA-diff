/**
 * Comparison query helpers (#20) over the injected comparison mock: cursor
 * row pages, batched cell windows, summaries, abort and obsolete results.
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  createServiceQueries,
  SERVICE_CELL_WINDOW,
  SERVICE_WINDOW,
  ServiceQueryError,
} from "../../app/queries";
import type {
  DataService,
  FlowCellsRequest,
  FlowRow,
  ServiceResult,
} from "../contracts";
import { createMockComparison } from "./comparison";
import type { ComparisonOptions } from "./comparison";
import { createComparisonCatalog } from "./comparison-fixtures";

const catalog = createComparisonCatalog(250, 80);
const snapshot = catalog.releases.map(({ release_id, revision_id }) => ({
  release_id,
  revision_id,
}));
const ids = catalog.revisions[1].processes.map((p) => p.header.id);

function setup(options: ComparisonOptions = {}) {
  const service = createMockComparison({ catalog, ...options });
  const flowRows = vi.fn(service.flowRows);
  const flowCells = vi.fn(service.flowCells);
  const flowSummaries = vi.fn(service.flowSummaries);
  const data = {
    ...service,
    flowRows,
    flowCells,
    flowSummaries,
  } as unknown as DataService;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const queries = createServiceQueries(data, { namespace: "test", uid: "u1" });
  return { service, flowRows, flowCells, flowSummaries, client, queries };
}
async function firstPage(app: ReturnType<typeof setup>, process_ids = ids) {
  const rows = await app.client.fetchInfiniteQuery(
    app.queries.flowRowPages({
      revision_snapshot: snapshot,
      process_ids,
      limit: 25,
    }),
  );
  return rows.pages[0];
}

describe("comparison query helpers", () => {
  it("follows stable row cursors in deterministic order without duplicates", async () => {
    const app = setup();
    const options = app.queries.flowRowPages({
      revision_snapshot: snapshot,
      process_ids: ids,
      limit: 25,
    });
    let result = await app.client.fetchInfiniteQuery(options);
    while (result.pages.at(-1)!.next_cursor !== null)
      result = await app.client.fetchInfiniteQuery({
        ...options,
        pages: result.pages.length + 1,
      });
    const rows: FlowRow[] = result.pages.flatMap((page) => page.items);
    expect(rows).toHaveLength(result.pages[0].total_count);
    expect(new Set(rows.map((row) => row.row_key)).size).toBe(rows.length);
    // §6.4 group order, then category/subcategory/name/ID.
    const groups = [
      "Reference",
      "Technosphere",
      "Ecosphere Input",
      "Ecosphere Output",
    ];
    const ranks = rows.map((row) => groups.indexOf(row.flow_type));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    // Every page shares one token and snapshot; replaying a cursor is stable.
    expect(
      new Set(result.pages.map((page) => page.comparison_token)).size,
    ).toBe(1);
    const replay = await app.service.flowRows({
      revision_snapshot: snapshot,
      process_ids: ids,
      limit: 25,
      cursor: result.pages[0].next_cursor!,
    });
    expect(replay.ok && replay.data.items).toEqual(result.pages[1].items);
  });

  it("splits any cell window into bounded batches without capping the selection", async () => {
    const app = setup();
    const page = await firstPage(app);
    const rowKeys = page.items.slice(0, 20).map((row) => row.row_key);
    const window = await app.client.fetchQuery(
      app.queries.flowCellWindow({
        revision_snapshot: snapshot,
        comparison_token: page.comparison_token,
        process_ids: ids,
        row_keys: rowKeys,
      }),
    );
    expect(window.cells).toHaveLength(20 * 250);
    const requests = app.flowCells.mock.calls.map(
      (call) => call[0] as FlowCellsRequest,
    );
    expect(requests).toHaveLength(5); // 50 processes × 20 rows per batch
    for (const request of requests) {
      expect(request.process_ids.length).toBeLessThanOrEqual(SERVICE_WINDOW);
      expect(
        request.process_ids.length * request.row_keys.length,
      ).toBeLessThanOrEqual(SERVICE_CELL_WINDOW);
    }
    expect(new Set(requests.flatMap((r) => r.process_ids))).toEqual(
      new Set(ids),
    );
    expect(window.revision_snapshot).toEqual(page.revision_snapshot);
    // Summaries take the whole selection and one row window: one request.
    const summaries = await app.client.fetchQuery(
      app.queries.flowSummaries({
        revision_snapshot: snapshot,
        comparison_token: page.comparison_token,
        process_ids: ids,
        row_keys: rowKeys,
      }),
    );
    expect(app.flowSummaries).toHaveBeenCalledTimes(1);
    expect(summaries.summaries.map((s) => s.row_key)).toEqual(rowKeys);
  });

  it("aborts every batch of a cancelled cell window together", async () => {
    const app = setup({
      scenario: { latency_ms: (op) => (op === "flowCells" ? 5000 : 0) },
    });
    const page = await firstPage(app);
    const options = app.queries.flowCellWindow({
      revision_snapshot: snapshot,
      comparison_token: page.comparison_token,
      process_ids: ids,
      row_keys: page.items.slice(0, 20).map((row) => row.row_key),
    });
    const pending = app.client
      .fetchQuery(options)
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(app.flowCells).toHaveBeenCalledTimes(5));
    await app.client.cancelQueries({ queryKey: options.queryKey });
    await pending;
    for (const call of app.flowCells.mock.calls)
      expect(call[1]?.signal?.aborted).toBe(true);
    expect(app.client.getQueryData(options.queryKey)).toBeUndefined();
  });

  it("never lets an obsolete slow response replace the newer window", async () => {
    // The first summary read (row A) is slow; the next (row B) is fast.
    let summaryCalls = 0;
    const app = setup({
      scenario: {
        latency_ms: (op) =>
          op === "flowSummaries" ? (++summaryCalls === 1 ? 300 : 10) : 0,
      },
    });
    const page = await firstPage(app);
    const rowsA = [page.items[0].row_key];
    const rowsB = [page.items[1].row_key];
    const input = {
      revision_snapshot: snapshot,
      comparison_token: page.comparison_token,
      process_ids: ids,
    };
    const observer = new QueryObserver(
      app.client,
      app.queries.flowSummaries({ ...input, row_keys: rowsA }),
    );
    const seen: string[][] = [];
    const unsubscribe = observer.subscribe((result) => {
      if (result.data) seen.push(result.data.summaries.map((s) => s.row_key));
    });
    await vi.waitFor(() => expect(app.flowSummaries).toHaveBeenCalledTimes(1));
    observer.setOptions(
      app.queries.flowSummaries({ ...input, row_keys: rowsB }),
    );
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data?.summaries[0].row_key).toBe(
        rowsB[0],
      ),
    );
    // Let the slow, obsolete row-A response arrive.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(summaryCalls).toBe(2);
    // The obsolete row-A read was aborted and never stored any data.
    expect(app.flowSummaries.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(
      app.client.getQueryData(
        app.queries.flowSummaries({ ...input, row_keys: rowsA }).queryKey,
      ),
    ).toBeUndefined();
    expect(observer.getCurrentResult().data?.summaries[0].row_key).toBe(
      rowsB[0],
    );
    expect(seen.at(-1)).toEqual(rowsB);
    unsubscribe();
  });

  it("rejects cell batches answered from different revisions", async () => {
    const app = setup();
    const page = await firstPage(app);
    let call = 0;
    app.flowCells.mockImplementation(async (input, options) => {
      const result = await app.service.flowCells(input, options);
      call += 1;
      if (!result.ok || call === 1) return result;
      return {
        ok: true,
        data: {
          ...result.data,
          revision_snapshot: [{ ...snapshot[0], revision_id: "other" }],
        },
      } satisfies ServiceResult<typeof result.data>;
    });
    const error = await app.client
      .fetchQuery(
        app.queries.flowCellWindow({
          revision_snapshot: snapshot,
          comparison_token: page.comparison_token,
          process_ids: ids,
          row_keys: page.items.slice(0, 20).map((row) => row.row_key),
        }),
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceQueryError);
    expect((error as ServiceQueryError).detail.code).toBe("STALE_SNAPSHOT");
  });
});
