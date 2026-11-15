import { describe, expect, it } from "vitest";
import { cellBatches } from "./cell-batches";

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}${index}`);

describe("transport cell batches", () => {
  it("covers every requested pair exactly once within both limits", () => {
    const rows = ids("r", 30);
    const processes = ids("p", 250);
    const batches = cellBatches(rows, processes, { window: 100, cells: 1000 });
    const pairs = new Set<string>();
    for (const batch of batches) {
      expect(batch.row_keys.length).toBeLessThanOrEqual(100);
      expect(batch.process_ids.length).toBeLessThanOrEqual(100);
      expect(
        batch.row_keys.length * batch.process_ids.length,
      ).toBeLessThanOrEqual(1000);
      for (const row of batch.row_keys)
        for (const process of batch.process_ids) {
          const pair = `${row}/${process}`;
          expect(pairs.has(pair)).toBe(false);
          pairs.add(pair);
        }
    }
    expect(pairs.size).toBe(30 * 250);
    expect(batches).toHaveLength(8); // 33 processes per 30-row batch
  });

  it("splits tall windows by rows and never caps the selection", () => {
    const batches = cellBatches(ids("r", 150), ids("p", 5000), {
      window: 100,
      cells: 1000,
    });
    expect(batches.every((batch) => batch.process_ids.length === 10)).toBe(
      true,
    );
    expect(new Set(batches.flatMap((batch) => batch.process_ids)).size).toBe(
      5000,
    );
    expect(new Set(batches.flatMap((batch) => batch.row_keys)).size).toBe(150);
  });

  it("deduplicates, handles empty windows and rejects invalid limits", () => {
    expect(cellBatches([], ["p"], { window: 10, cells: 10 })).toEqual([]);
    expect(
      cellBatches(["a", "a", "b"], ["p", "p"], { window: 10, cells: 10 }),
    ).toEqual([{ row_keys: ["a", "b"], process_ids: ["p"] }]);
    expect(() => cellBatches(["a"], ["p"], { window: 0, cells: 1 })).toThrow(
      TypeError,
    );
  });
});
