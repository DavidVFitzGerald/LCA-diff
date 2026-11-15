import { describe, expect, it } from "vitest";
import {
  CELL_TILE,
  leadingWidth,
  LEADING_BOUNDS,
  moveTarget,
  tilesFor,
  withIndex,
} from "./grid-model";

describe("cell tiles (#23)", () => {
  it("covers the mounted window with fixed, aligned tiles", () => {
    expect(tilesFor([12, 30], [3, 17], 2224, 220)).toEqual([
      { rowStart: 0, rowEnd: 50, columnStart: 0, columnEnd: 20 },
    ]);
    const tiles = tilesFor([45, 60], [18, 25], 2224, 220);
    expect(tiles).toEqual([
      { rowStart: 0, rowEnd: 50, columnStart: 0, columnEnd: 20 },
      { rowStart: 0, rowEnd: 50, columnStart: 20, columnEnd: 40 },
      { rowStart: 50, rowEnd: 100, columnStart: 0, columnEnd: 20 },
      { rowStart: 50, rowEnd: 100, columnStart: 20, columnEnd: 40 },
    ]);
    // Every tile stays within the service cell window (1,000 cells).
    for (const tile of tiles)
      expect(
        (tile.rowEnd - tile.rowStart) * (tile.columnEnd - tile.columnStart),
      ).toBeLessThanOrEqual(CELL_TILE.rows * CELL_TILE.columns);
  });

  it("is stable while scrolling within a tile, so windows are reused", () => {
    expect(tilesFor([3, 20], [0, 9], 2224, 220)).toEqual(
      tilesFor([10, 40], [2, 15], 2224, 220),
    );
  });

  it("clips to loaded rows and real columns, and is empty without a window", () => {
    expect(tilesFor([90, 130], [215, 230], 120, 220)).toEqual([
      { rowStart: 50, rowEnd: 100, columnStart: 200, columnEnd: 220 },
      { rowStart: 100, rowEnd: 120, columnStart: 200, columnEnd: 220 },
    ]);
    expect(tilesFor(null, [0, 3], 100, 4)).toEqual([]);
    expect(tilesFor([0, 3], null, 100, 4)).toEqual([]);
    expect(tilesFor([0, 3], [0, 3], 0, 4)).toEqual([]);
    expect(tilesFor([150, 160], [0, 3], 100, 4)).toEqual([]);
  });
});

describe("bounded identifying block (#23, spec §6.3)", () => {
  it("takes a share of the grid within fixed bounds", () => {
    expect(leadingWidth(1200)).toBe(Math.round(1200 * LEADING_BOUNDS.share));
    expect(leadingWidth(500)).toBe(LEADING_BOUNDS.min);
    expect(leadingWidth(4000)).toBe(LEADING_BOUNDS.max);
    expect(leadingWidth(0)).toBe(LEADING_BOUNDS.min);
    expect(leadingWidth(Number.NaN)).toBe(LEADING_BOUNDS.min);
  });
});

describe("grid keyboard targets (#23)", () => {
  const size = { rows: 2000, columns: 200, page: 10 };
  const at = { row: 5, column: 3 };
  it.each([
    ["ArrowUp", false, { row: 4, column: 3 }],
    ["ArrowDown", false, { row: 6, column: 3 }],
    ["ArrowLeft", false, { row: 5, column: 2 }],
    ["ArrowRight", false, { row: 5, column: 4 }],
    ["Home", false, { row: 5, column: -1 }],
    ["End", false, { row: 5, column: 199 }],
    ["Home", true, { row: 0, column: -1 }],
    ["End", true, { row: 1999, column: 199 }],
    ["PageDown", false, { row: 15, column: 3 }],
    ["PageUp", false, { row: 0, column: 3 }],
  ] as const)("%s (ctrl %s)", (key, ctrl, target) => {
    expect(moveTarget(key, ctrl, at, size)).toEqual(target);
  });

  it("never leaves the grid and ignores other keys", () => {
    expect(moveTarget("ArrowUp", false, { row: 0, column: 0 }, size)).toBe(
      null,
    );
    expect(moveTarget("ArrowLeft", false, { row: 0, column: -1 }, size)).toBe(
      null,
    );
    expect(moveTarget("ArrowRight", false, { row: 0, column: 199 }, size)).toBe(
      null,
    );
    expect(moveTarget("ArrowDown", false, { row: 1999, column: 0 }, size)).toBe(
      null,
    );
    expect(
      moveTarget("PageDown", false, { row: 1995, column: 0 }, size),
    ).toEqual({ row: 1999, column: 0 });
    expect(moveTarget("a", false, at, size)).toBe(null);
    expect(moveTarget("ArrowDown", false, at, { ...size, rows: 0 })).toBe(null);
  });

  it("keeps the active index mounted", () => {
    expect(withIndex([4, 5, 6], 90)).toEqual([4, 5, 6, 90]);
    expect(withIndex([4, 5, 6], 1)).toEqual([1, 4, 5, 6]);
    expect(withIndex([4, 5, 6], 5)).toEqual([4, 5, 6]);
    expect(withIndex([4, 5, 6], -1)).toEqual([4, 5, 6]);
  });
});
