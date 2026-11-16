import { describe, it, expect } from "vitest";
import { createMockComparison } from "./comparison";
import { createComparisonCatalog } from "./comparison-fixtures";
import { decimalString } from "../contracts";
import type { ServiceResult } from "../contracts";
function data<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
describe("row-page whole-selection summaries", () => {
  it("includes extrema beyond visible columns and retains immutable revisions", async () => {
    const original = createComparisonCatalog(250, 3);
    const revision = original.revisions[1];
    const row = revision.flow_rows.find(
      (row) => row.flow_type === "Ecosphere Output",
    )!;
    const catalog = {
      ...original,
      revisions: original.revisions.map((item) =>
        item === revision
          ? {
              ...item,
              processes: item.processes.map((process, index) => ({
                ...process,
                flows: {
                  ...process.flows,
                  [row.row_key]: {
                    present: true as const,
                    amount: decimalString(
                      index === 220 ? "-80" : index === 180 ? "20.0" : "0",
                    ),
                    warnings: [],
                  },
                },
              })),
            }
          : item,
      ),
    };
    const service = createMockComparison({
      catalog,
      scenario: { latency_ms: 0 },
    });
    const input = {
      revision_snapshot: [revision.revision],
      process_ids: revision.processes.map((p) => p.header.id),
      limit: 100,
    };
    async function allRows(request: typeof input) {
      let page = data(await service.flowRows(request));
      const items = [...page.items];
      while (page.next_cursor) {
        page = data(
          await service.flowRows({ ...request, cursor: page.next_cursor }),
        );
        items.push(...page.items);
      }
      return { ...page, items };
    }
    const page = await allRows(input);
    expect(
      page.items.find((item) => item.row_key === row.row_key)?.summary,
    ).toEqual({
      max_positive: "20.0",
      max_negative_magnitude: "80",
      absent_count: 0,
    });
    const reordered = await allRows({
      ...input,
      process_ids: [...input.process_ids].reverse(),
    });
    expect(reordered.items).toEqual(page.items);
    const cells = data(
      await service.flowCells({
        ...input,
        process_ids: input.process_ids.slice(0, 100),
        row_keys: [row.row_key],
        comparison_token: page.comparison_token,
      }),
    );
    expect(cells.cells.every((cell) => cell.amount === "0")).toBe(true);
    const old = original.revisions[0];
    const oldPage = data(
      await service.flowRows({
        revision_snapshot: [old.revision],
        process_ids: old.processes.slice(0, 3).map((p) => p.header.id),
        limit: 100,
      }),
    );
    expect(oldPage.revision_snapshot).toEqual([old.revision]);
    expect(
      oldPage.items.find((item) => item.row_key === row.row_key)?.summary,
    ).not.toEqual(
      page.items.find((item) => item.row_key === row.row_key)?.summary,
    );
  });
});
