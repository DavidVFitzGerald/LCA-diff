import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createServiceQueries, ServiceQueryError } from "../../app/queries";
import type { DataService } from "../contracts";
import { createMockComparison } from "./comparison";
import { scoresCatalog } from "./scores-test-fixtures";

const errorCode = (error: unknown) => (error as ServiceQueryError).detail.code;
function setup(latency = 0) {
  const catalog = scoresCatalog(220, 230);
  const service = createMockComparison({
    catalog,
    scenario: { latency_ms: latency },
  });
  const scoreRows = vi.fn(service.scoreRows);
  const scoreCells = vi.fn(service.scoreCells);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const queries = createServiceQueries(
    {
      ...service,
      scoreRows,
      scoreCells,
    } as unknown as DataService,
    { namespace: "scores", uid: "u1" },
  );
  const snapshot = [catalog.revisions[1].revision];
  const ids = catalog.revisions[1].processes.map(({ header }) => header.id);
  const indicator_ids =
    catalog.revisions[1].indicator_tree.methods[0].indicators.map(
      ({ id }) => id,
    );
  const input = {
    revision_snapshot: snapshot,
    process_ids: ids,
    indicator_ids,
    limit: 100,
  };
  return {
    service,
    scoreRows,
    scoreCells,
    client,
    queries,
    snapshot,
    ids,
    indicator_ids,
    input,
  };
}

describe("Scores summaries and bounded queries (#28)", () => {
  it("pages in source order, batches the matrix and summarizes the entire selection exactly", async () => {
    const app = setup();
    const options = app.queries.scoreRowPages({
      ...app.input,
      indicator_ids: [...app.indicator_ids].reverse(),
    });
    const pages = await app.client.fetchInfiniteQuery({ ...options, pages: 3 });
    expect(
      pages.pages.flatMap((page) => page.items.map(({ id }) => id)),
    ).toEqual(app.indicator_ids);
    expect(new Set(pages.pages.map((page) => page.comparison_token)).size).toBe(
      1,
    );
    const input = {
      revision_snapshot: app.snapshot,
      process_ids: app.ids,
      comparison_token: pages.pages[0].comparison_token,
      indicator_ids: app.indicator_ids.slice(0, 20),
    };
    const window = await app.client.fetchQuery(
      app.queries.scoreCellWindow(input),
    );
    expect(window.cells).toHaveLength(220 * 20);
    for (const [request] of app.scoreCells.mock.calls) {
      expect(request.process_ids.length).toBeLessThanOrEqual(100);
      expect(request.indicator_ids.length).toBeLessThanOrEqual(100);
      expect(
        request.process_ids.length * request.indicator_ids.length,
      ).toBeLessThanOrEqual(1000);
    }
    expect(
      window.cells.find((cell) => cell.process_id === app.ids[0])?.amount,
    ).toBe("0");
    expect(
      window.cells.find((cell) => cell.process_id === app.ids[1])?.status,
    ).toBe("missing");
  });

  it("never appends a later row page with another comparison token", async () => {
    const app = setup();
    const observer = new InfiniteQueryObserver(
      app.client,
      app.queries.scoreRowPages(app.input),
    );
    const stop = observer.subscribe(() => undefined);
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data?.pages).toHaveLength(1),
    );
    app.scoreRows.mockImplementationOnce(async (request, options) => {
      const result = await app.service.scoreRows(request, options);
      return result.ok
        ? { ok: true, data: { ...result.data, comparison_token: "other" } }
        : result;
    });
    const result = await observer.fetchNextPage();
    expect(errorCode(result.error)).toBe("STALE_SNAPSHOT");
    expect(result.data?.pages).toHaveLength(1);
    stop();
  });
});
