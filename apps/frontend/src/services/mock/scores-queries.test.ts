import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createServiceQueries, ServiceQueryError } from "../../app/queries";
import type { DataService, ServiceResult } from "../contracts";
import { createMockComparison } from "./comparison";
import { negative, PRECISE, scoresCatalog } from "./scores-test-fixtures";

function data<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
const errorCode = (error: unknown) => (error as ServiceQueryError).detail.code;
function setup(latency = 0) {
  const catalog = scoresCatalog(220, 230);
  const service = createMockComparison({
    catalog,
    scenario: { latency_ms: latency },
  });
  const scoreRows = vi.fn(service.scoreRows);
  const scoreCells = vi.fn(service.scoreCells);
  const scoreSummaries = vi.fn(service.scoreSummaries);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const queries = createServiceQueries(
    {
      ...service,
      scoreRows,
      scoreCells,
      scoreSummaries,
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
    scoreSummaries,
    client,
    queries,
    snapshot,
    ids,
    indicator_ids,
    input,
  };
}
async function first(app: ReturnType<typeof setup>) {
  const result = await app.client.fetchInfiniteQuery(
    app.queries.scoreRowPages(app.input),
  );
  return result.pages[0];
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
    const summary = await app.client.fetchQuery(
      app.queries.scoreSummaries(input),
    );
    expect(app.scoreSummaries).toHaveBeenCalledTimes(1);
    expect(summary.summaries[0]).toMatchObject({
      max_positive: PRECISE,
      max_negative_magnitude: negative.slice(1),
    });
    const s = summary.summaries[0];
    expect(s.zero_count).toBeGreaterThan(0);
    expect(s.missing_count).toBeGreaterThan(0);
    expect(s.unresolved_basis_count).toBeGreaterThan(0);
    expect(
      s.positive_count +
        s.negative_count +
        s.zero_count +
        s.missing_count +
        s.unresolved_basis_count,
    ).toBe(220);
    expect(
      window.cells.find((cell) => cell.process_id === app.ids[0])?.amount,
    ).toBe("0");
    expect(
      window.cells.find((cell) => cell.process_id === app.ids[1])?.status,
    ).toBe("missing");
  });

  it("rejects wrong snapshot or token in rows, cells and summaries before caching", async () => {
    for (const kind of ["scoreCells", "scoreSummaries"] as const) {
      for (const change of [
        { revision_snapshot: [{ release_id: "other", revision_id: "other" }] },
        { comparison_token: "other" },
      ]) {
        const app = setup();
        const page = await first(app);
        const original = app.service[kind];
        (app[kind] as ReturnType<typeof vi.fn>).mockImplementation(
          async (request, options) => {
            const result = await original(request, options);
            return result.ok
              ? { ok: true, data: { ...result.data, ...change } }
              : result;
          },
        );
        const input = {
          ...app.input,
          indicator_ids: [app.indicator_ids[0]],
          comparison_token: page.comparison_token,
        };
        const options =
          kind === "scoreCells"
            ? app.queries.scoreCellWindow(input)
            : app.queries.scoreSummaries(input);
        const error = await app.client
          .fetchQuery(options as ReturnType<typeof app.queries.scoreCellWindow>)
          .catch((error: unknown) => error);
        expect(errorCode(error)).toBe("STALE_SNAPSHOT");
        expect(app.client.getQueryData(options.queryKey)).toBeUndefined();
      }
    }
    const app = setup();
    app.scoreRows.mockImplementationOnce(async (request, options) => {
      const result = await app.service.scoreRows(request, options);
      return result.ok
        ? { ok: true, data: { ...result.data, revision_snapshot: [] } }
        : result;
    });
    expect(errorCode(await first(app).catch((error: unknown) => error))).toBe(
      "STALE_SNAPSHOT",
    );
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

  it("aborts all score batches and summary reads when cancelled", async () => {
    const app = setup(50);
    const page = await first(app);
    const input = {
      ...app.input,
      indicator_ids: app.indicator_ids.slice(0, 20),
      comparison_token: page.comparison_token,
    };
    const cells = app.queries.scoreCellWindow(input);
    const summaries = app.queries.scoreSummaries(input);
    const pending = [
      app.client.fetchQuery(cells).catch(() => undefined),
      app.client.fetchQuery(summaries).catch(() => undefined),
    ];
    await vi.waitFor(() =>
      expect(app.scoreCells.mock.calls.length).toBeGreaterThan(1),
    );
    await app.client.cancelQueries();
    await Promise.all(pending);
    for (const [, options] of [
      ...app.scoreCells.mock.calls,
      ...app.scoreSummaries.mock.calls,
    ])
      expect(options?.signal?.aborted).toBe(true);
    expect(app.client.getQueryData(cells.queryKey)).toBeUndefined();
    expect(app.client.getQueryData(summaries.queryKey)).toBeUndefined();
  });

  it("requires the full token selection and a bounded row window, retaining immutable old revision values", async () => {
    const app = setup();
    const page = await first(app);
    const input = {
      ...app.input,
      comparison_token: page.comparison_token,
      indicator_ids: [app.indicator_ids[0]],
    };
    const subset = await app.service.scoreSummaries({
      ...input,
      process_ids: app.ids.slice(1),
    });
    expect(!subset.ok && subset.error.code).toBe("INVALID_FILTER");
    const oversized = await app.service.scoreSummaries({
      ...input,
      indicator_ids: app.indicator_ids.slice(0, 101),
    });
    expect(!oversized.ok && oversized.error.code).toBe(
      "REQUEST_WINDOW_TOO_LARGE",
    );
    const oldCatalog = scoresCatalog(220, 230);
    const oldInput = {
      ...app.input,
      revision_snapshot: [oldCatalog.revisions[0].revision],
      process_ids: oldCatalog.revisions[0].processes.map(
        ({ header }) => header.id,
      ),
    };
    const old = data(await app.service.scoreRows(oldInput));
    const oldSummary = data(
      await app.service.scoreSummaries({
        ...oldInput,
        comparison_token: old.comparison_token,
        indicator_ids: [app.indicator_ids[0]],
      }),
    );
    expect(oldSummary.summaries[0].max_positive).toBe("1");
    expect(oldSummary.summaries[0].max_negative_magnitude).toBe("0");
  });
});
