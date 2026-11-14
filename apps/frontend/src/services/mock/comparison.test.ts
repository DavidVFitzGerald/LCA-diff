import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flowRowKey } from "../contracts";
import type {
  ComparisonRowsRequest,
  FlowCellsRequest,
  ScoreRowsRequest,
  ServiceResult,
} from "../contracts";
import { createMockComparison } from "./comparison";
import { createComparisonCatalog } from "./comparison-fixtures";
import { FIXTURE_IDS } from "./fixtures";

const catalog = createComparisonCatalog();
const current = catalog.releases.map(({ release_id, revision_id }) => ({
  release_id,
  revision_id,
}));
const ids = catalog.revisions[1].processes.map((process) => process.header.id);
const base: ComparisonRowsRequest = {
  revision_snapshot: current,
  process_ids: ids,
  limit: 100,
};
const indicators = [FIXTURE_IDS.gwp, FIXTURE_IDS.otherIndicator];
function data<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("mock comparison scientific states", () => {
  it("returns indicator hierarchy/default and score rows in source order including all-missing rows", async () => {
    const service = createMockComparison();
    const tree = data(
      await finish(service.indicatorTree({ revision_snapshot: current })),
    );
    expect(tree.default_indicator_ids).toEqual([FIXTURE_IDS.gwp]);
    expect(tree.methods[0].indicators[0]).toMatchObject({
      name: "GWP 100",
      category: null,
    });
    expect(tree.methods[1].categories[0].indicators[0].category).toBe(
      "Synthetic category",
    );
    const result = data(
      await finish(
        service.scoreRows({
          ...base,
          process_ids: [ids[1]],
          indicator_ids: [...indicators].reverse(),
        }),
      ),
    );
    expect(result.items.map((row) => row.id)).toEqual(indicators);
    expect(result.total_count).toBe(2);
    expect(
      data(await finish(service.scoreRows({ ...base, indicator_ids: [] })))
        .items,
    ).toEqual([]);
  });

  it("returns only represented flow identities and sorts actual identifying fields", async () => {
    const service = createMockComparison();
    const single = data(
      await finish(service.flowRows({ ...base, process_ids: [ids[1]] })),
    );
    expect(single.items.map((row) => row.flow_id)).toEqual([
      FIXTURE_IDS.referenceBeta,
      FIXTURE_IDS.technosphere,
      FIXTURE_IDS.water,
      FIXTURE_IDS.airLow,
    ]);
    const both = data(
      await finish(
        service.flowRows({ ...base, process_ids: [ids[0], ids[1]] }),
      ),
    );
    expect(both.items.map((row) => row.flow_id)).toEqual([
      FIXTURE_IDS.reference,
      FIXTURE_IDS.referenceBeta,
      FIXTURE_IDS.technosphere,
      FIXTURE_IDS.water,
      FIXTURE_IDS.airLow,
      FIXTURE_IDS.airHigh,
    ]);
    expect(
      data(await finish(service.flowRows({ ...base, process_ids: [] }))).items,
    ).toEqual([]);
    const shuffled = {
      ...catalog,
      revisions: catalog.revisions.map((revision) => ({
        ...revision,
        flow_rows: [...revision.flow_rows].reverse(),
      })),
    };
    const sorted = data(
      await finish(createMockComparison({ catalog: shuffled }).flowRows(base)),
    );
    expect(sorted.items.map((row) => row.flow_id)).toEqual([
      FIXTURE_IDS.reference,
      FIXTURE_IDS.referenceGamma,
      FIXTURE_IDS.referenceBeta,
      FIXTURE_IDS.technosphere,
      FIXTURE_IDS.water,
      FIXTURE_IDS.airLow,
      FIXTURE_IDS.airHigh,
    ]);
  });

  it("preserves exact decimals, signed zero, absence, valid zero, N/A states and cell warnings", async () => {
    const service = createMockComparison();
    const rows = data(await finish(service.flowRows(base)));
    const keys = rows.items.map((row) => row.row_key);
    const flows = data(
      await finish(
        service.flowCells({
          revision_snapshot: current,
          process_ids: ids,
          row_keys: keys,
          comparison_token: rows.comparison_token,
        }),
      ),
    );
    expect(flows.cells).toHaveLength(21);
    expect(JSON.parse(JSON.stringify(flows.cells))).toEqual(flows.cells);
    const at = (
      processId: string,
      flowId: string,
      type: Parameters<typeof flowRowKey>[1],
    ) =>
      flows.cells.find(
        (cell) =>
          cell.process_id === processId &&
          cell.row_key === flowRowKey(flowId, type),
      );
    expect(at(ids[0], FIXTURE_IDS.technosphere, "Technosphere")).toMatchObject({
      present: true,
      amount: "-80.000000000000000000000001",
      warnings: [{ code: "AGGREGATED_DUPLICATES" }],
    });
    expect(at(ids[1], FIXTURE_IDS.technosphere, "Technosphere")).toMatchObject({
      present: true,
      amount: "20",
      warnings: [],
    });
    expect(at(ids[0], FIXTURE_IDS.water, "Ecosphere Input")).toMatchObject({
      present: true,
      amount: "0",
    });
    expect(at(ids[0], FIXTURE_IDS.airHigh, "Ecosphere Output")).toMatchObject({
      present: true,
      amount: "-0",
    });
    expect(at(ids[1], FIXTURE_IDS.airHigh, "Ecosphere Output")).toMatchObject({
      present: false,
      amount: null,
    });
    expect(at(ids[0], FIXTURE_IDS.airLow, "Ecosphere Output")?.amount).toBe(
      "0.000000000000000000000000000000123456790",
    );
    const scores = data(
      await finish(service.scoreRows({ ...base, indicator_ids: indicators })),
    );
    const cells = data(
      await finish(
        service.scoreCells({
          revision_snapshot: current,
          process_ids: ids,
          indicator_ids: indicators,
          comparison_token: scores.comparison_token,
        }),
      ),
    );
    expect(cells.cells.map((cell) => [cell.status, cell.amount])).toEqual([
      ["valid", "0"],
      ["valid", "123456789012345678901234567890.1234567890123456789"],
      ["missing", null],
      ["missing", null],
      ["unresolved_basis", null],
      ["unresolved_basis", null],
    ]);
    expect(cells.cells[0].warnings).toEqual([]);
    expect(cells.cells[4].warnings).toEqual([
      { code: "UNVERIFIED_SCORE_BASIS", message: expect.any(String) },
    ]);
  });

  it("defaults differences to false without filtering equal values or all-missing indicators; true is unsupported", async () => {
    const service = createMockComparison();
    const implicit = data(await finish(service.flowRows(base)));
    const explicit = data(
      await finish(service.flowRows({ ...base, differences_only: false })),
    );
    expect(explicit.items).toEqual(implicit.items);
    expect(explicit.comparison_token).toBe(implicit.comparison_token);
    expect(
      explicit.items.some((row) => row.flow_id === FIXTURE_IDS.water),
    ).toBe(true);
    expect(
      await finish(service.flowRows({ ...base, differences_only: true })),
    ).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_OPERATION" } });
    expect(
      await finish(
        service.scoreRows({
          ...base,
          indicator_ids: indicators,
          differences_only: true,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_OPERATION" } });
    expect(
      await finish(
        service.flowRows({
          ...base,
          differences_only: "false",
        } as unknown as ComparisonRowsRequest),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
  });

  it("honors per-process absence overrides of shared values in row unions and cells", async () => {
    const generated = createComparisonCatalog(3, 1);
    const key = Object.keys(generated.revisions[1].shared_flows)[0];
    const overridden = {
      ...generated,
      revisions: generated.revisions.map((revision) => ({
        ...revision,
        processes: revision.processes.map((process) => ({
          ...process,
          flows: {
            ...process.flows,
            [key]: { present: false as const, amount: null, warnings: [] },
          },
        })),
      })),
    };
    const service = createMockComparison({ catalog: overridden });
    expect(
      data(await finish(service.flowRows(base))).items.some(
        (row) => row.row_key === key,
      ),
    ).toBe(false);
  });
});

describe("mock comparison snapshots and bounded windows", () => {
  it("keeps old revisions immutable and rejects mixed snapshots and unavailable releases", async () => {
    const service = createMockComparison();
    const old = catalog.revisions[0];
    const oldBase = {
      ...base,
      revision_snapshot: [old.revision],
      process_ids: old.processes.map((process) => process.header.id),
    };
    const oldRows = data(await finish(service.flowRows(oldBase)));
    const key = flowRowKey(FIXTURE_IDS.airLow, "Ecosphere Output");
    const oldCells = data(
      await finish(
        service.flowCells({
          ...oldBase,
          row_keys: [key],
          comparison_token: oldRows.comparison_token,
        }),
      ),
    );
    expect(oldCells.cells[0].amount).toBe(
      "0.000000000000000000000000000000123456789",
    );
    expect(oldCells.revision_snapshot).toEqual([old.revision]);
    expect(
      await finish(
        service.flowCells({
          ...base,
          row_keys: [key],
          comparison_token: oldRows.comparison_token,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "STALE_SNAPSHOT" } });
    expect(
      await finish(
        service.flowRows({
          ...base,
          revision_snapshot: [{ ...current[0], revision_id: "unknown" }],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "STALE_SNAPSHOT" } });
    expect(
      await finish(
        service.flowRows({
          ...base,
          revision_snapshot: [
            { release_id: "unknown", revision_id: "unknown" },
          ],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "RELEASE_UNAVAILABLE" } });
    expect(
      await finish(
        service.flowRows({ ...base, process_ids: oldBase.process_ids }),
      ),
    ).toMatchObject({ ok: false, error: { code: "UNKNOWN_PROCESS" } });
  });

  it("binds canonical tokens/cursors to tab, selected sets, indicators and snapshot", async () => {
    const service = createMockComparison();
    const first = data(await finish(service.flowRows({ ...base, limit: 2 })));
    const reordered = data(
      await finish(
        service.flowRows({
          ...base,
          limit: 2,
          process_ids: [...ids].reverse(),
        }),
      ),
    );
    expect(reordered.comparison_token).toBe(first.comparison_token);
    expect(reordered.next_cursor).toBe(first.next_cursor);
    const next = data(
      await finish(
        service.flowRows({ ...base, limit: 2, cursor: first.next_cursor! }),
      ),
    );
    expect(next.items).not.toEqual(first.items);
    expect(next.comparison_token).toBe(first.comparison_token);
    expect(
      await finish(
        service.flowRows({
          ...base,
          process_ids: [ids[0]],
          cursor: first.next_cursor!,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    expect(
      await finish(
        service.scoreRows({
          ...base,
          indicator_ids: indicators,
          cursor: first.next_cursor!,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    const scores = data(
      await finish(
        service.scoreRows({ ...base, indicator_ids: indicators, limit: 1 }),
      ),
    );
    expect(
      data(
        await finish(
          service.scoreRows({
            ...base,
            indicator_ids: [...indicators].reverse(),
          }),
        ),
      ).comparison_token,
    ).toBe(scores.comparison_token);
    expect(
      await finish(
        service.scoreRows({
          ...base,
          indicator_ids: [indicators[0]],
          cursor: scores.next_cursor!,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    expect(
      await finish(
        service.flowCells({
          ...base,
          row_keys: [first.items[0].row_key],
          comparison_token: scores.comparison_token,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
  });

  it("returns precisely requested cells, rejects unrepresented rows and bounds both dimensions and their product", async () => {
    const service = createMockComparison({ window_limit: 3, cell_limit: 4 });
    const first = data(await finish(service.flowRows({ ...base, limit: 3 })));
    const window = {
      revision_snapshot: current,
      process_ids: [ids[1]],
      row_keys: [first.items[1].row_key],
      comparison_token: first.comparison_token,
    };
    const cells = data(await finish(service.flowCells(window)));
    expect(cells.cells).toHaveLength(1);
    expect(cells.cells[0]).toMatchObject({
      process_id: ids[1],
      row_key: window.row_keys[0],
    });
    expect(
      await finish(
        service.flowCells({
          ...window,
          process_ids: ids,
          row_keys: first.items.map((row) => row.row_key),
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "REQUEST_WINDOW_TOO_LARGE" } });
    expect(await finish(service.flowRows({ ...base, limit: 4 }))).toMatchObject(
      { ok: false, error: { code: "REQUEST_WINDOW_TOO_LARGE" } },
    );
    expect(
      await finish(
        service.flowCells({ ...window, row_keys: ["unknown|Reference"] }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    const single = data(
      await finish(
        service.flowRows({ ...base, process_ids: [ids[0]], limit: 3 }),
      ),
    );
    expect(
      await finish(
        service.flowCells({
          ...window,
          comparison_token: single.comparison_token,
          process_ids: [ids[1]],
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
  });

  it("supports 320 selected processes and 1000 shared rows with sparse storage and bounded responses", async () => {
    const large = createComparisonCatalog(320, 1000);
    const revision = large.revisions[1];
    expect(revision.processes).toHaveLength(320);
    expect(revision.flow_rows).toHaveLength(1324);
    expect(Object.keys(revision.shared_flows)).toHaveLength(1000);
    expect(
      revision.processes.reduce(
        (count, process) => count + Object.keys(process.flows).length,
        0,
      ),
    ).toBe(1600);
    const service = createMockComparison({
      catalog: large,
      window_limit: 25,
      cell_limit: 100,
    });
    const selectedIds = revision.processes.map((process) => process.header.id);
    const query = { ...base, process_ids: selectedIds, limit: 25 };
    const first = data(await finish(service.flowRows(query)));
    expect(first.total_count).toBe(1324);
    expect(first.items).toHaveLength(25);
    expect(first.comparison_token.length).toBeLessThan(64);
    expect(JSON.stringify(first).length).toBeLessThan(25000);
    const requestedRows = first.items.slice(0, 4).map((row) => row.row_key);
    const window = data(
      await finish(
        service.flowCells({
          revision_snapshot: current,
          process_ids: selectedIds.slice(0, 25),
          row_keys: requestedRows,
          comparison_token: first.comparison_token,
        }),
      ),
    );
    expect(window.cells).toHaveLength(100);
    expect(JSON.stringify(window).length).toBeLessThan(25000);
    const last = data(
      await finish(
        service.flowCells({
          revision_snapshot: current,
          process_ids: selectedIds.slice(-1),
          row_keys: requestedRows,
          comparison_token: first.comparison_token,
        }),
      ),
    );
    expect(
      last.cells.every((cell) => cell.process_id === selectedIds.at(-1)),
    ).toBe(true);
    const reference = revision.flow_rows.find(
      (row) =>
        row.row_key ===
        Object.keys(revision.processes[319].flows).find((key) =>
          key.endsWith("|Reference"),
        ),
    )!;
    expect(reference.sort_key.at(-1)).toBe(reference.flow_id);
    expect(reference.unit).toBe(revision.processes[319].header.reference_unit);
    expect(reference.process_name).toBe(revision.processes[319].header.name);
    expect(large.revisions[0].flow_rows.map((row) => row.row_key)).toEqual(
      revision.flow_rows.map((row) => row.row_key),
    );
  });

  it("evicts bounded token contexts safely rather than reusing stale token data", async () => {
    const service = createMockComparison({ token_limit: 1 });
    const first = data(await finish(service.flowRows(base)));
    await finish(service.scoreRows({ ...base, indicator_ids: indicators }));
    expect(
      await finish(
        service.flowCells({
          ...base,
          row_keys: [first.items[0].row_key],
          comparison_token: first.comparison_token,
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "STALE_SNAPSHOT" } });
  });
});

describe("comparison async scenarios and invalid requests", () => {
  it("supports deterministic latency, cancellation and failures using the shared runner", async () => {
    const service = createMockComparison({
      scenario: { latency_ms: (_, sequence) => (sequence === 1 ? 50 : 5) },
    });
    const completion: string[] = [];
    const first = service.flowRows(base).then((result) => {
      completion.push("first");
      return result;
    });
    const second = service
      .indicatorTree({ revision_snapshot: current })
      .then((result) => {
        completion.push("second");
        return result;
      });
    await vi.advanceTimersByTimeAsync(5);
    expect(completion).toEqual(["second"]);
    await finish(first);
    await second;
    expect(completion).toEqual(["second", "first"]);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = service.flowRows(base, { signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await rejection;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    expect(
      await finish(
        createMockComparison({
          scenario: { failures: { flowRows: "TEMPORARILY_UNAVAILABLE" } },
        }).flowRows(base),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        code: "TEMPORARILY_UNAVAILABLE",
        request_id: "synthetic-flowRows-1",
        retryable: true,
      },
    });
  });

  it("captures mutable inputs before latency and protects stored fixture values", async () => {
    const service = createMockComparison({ scenario: { latency_ms: 10 } });
    const input = { ...base, process_ids: [ids[0]] };
    const pending = service.flowRows(input);
    input.process_ids[0] = ids[1];
    const result = data(await finish(pending));
    expect(result.items[0].flow_id).toBe(FIXTURE_IDS.reference);
    Object.assign(result.items[0], { name: "changed" });
    expect(
      data(await finish(service.flowRows({ ...base, process_ids: [ids[0]] })))
        .items[0].name,
    ).toBe("Synthetic transport service");
  });

  it.each([
    { limit: 0 },
    { limit: NaN },
    { process_ids: [null] },
    { revision_snapshot: [] },
    { revision_snapshot: [...current, ...current] },
    { cursor: "broken" },
  ])("rejects invalid metadata input (%j)", async (override) => {
    expect(
      await finish(
        createMockComparison().flowRows({
          ...base,
          ...override,
        } as unknown as ComparisonRowsRequest),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
  });

  it("rejects unknown indicators and malformed windows with structured errors", async () => {
    const service = createMockComparison();
    expect(
      await finish(service.scoreRows({ ...base, indicator_ids: ["unknown"] })),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    expect(
      await finish(
        service.scoreRows({
          ...base,
          indicator_ids: null,
        } as unknown as ScoreRowsRequest),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
    const rows = data(await finish(service.flowRows(base)));
    expect(
      await finish(
        service.flowCells({
          ...base,
          row_keys: null,
          comparison_token: rows.comparison_token,
        } as unknown as FlowCellsRequest),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_FILTER" } });
  });
});
