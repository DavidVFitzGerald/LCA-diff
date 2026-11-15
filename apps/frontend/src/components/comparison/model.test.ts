import { describe, expect, it } from "vitest";
import { decimalString } from "../../services/contracts";
import { COLUMN_BOUNDS, columnWidth, comparability, shown } from "./model";

const basis = (amount: string, unit = "kg") => ({
  reference_amount: decimalString(amount),
  reference_unit: unit,
});

describe("column width bounds (#21, spec §6.3)", () => {
  it("documents separate per-tab bounds inside the specified ranges", () => {
    for (const { min, max } of Object.values(COLUMN_BOUNDS)) {
      expect(min).toBeGreaterThanOrEqual(110);
      expect(min).toBeLessThanOrEqual(130);
      expect(max).toBeGreaterThanOrEqual(230);
      expect(max).toBeLessThanOrEqual(260);
    }
    expect(COLUMN_BOUNDS.flows).not.toEqual(COLUMN_BOUNDS.scores);
  });

  it.each([
    [1200, 0, 240],
    [1200, 1, 240],
    [1200, 5, 240],
    [1200, 6, 200],
    [1200, 10, 120],
    [1200, 500, 120],
    [0, 3, 240],
    [Number.NaN, 3, 240],
  ])("flows: %s px for %s columns is %s px", (available, count, width) => {
    expect(columnWidth(available, count, COLUMN_BOUNDS.flows)).toBe(width);
  });

  it("uses the Scores bounds for Scores", () => {
    expect(columnWidth(5000, 2, COLUMN_BOUNDS.scores)).toBe(230);
    expect(columnWidth(1000, 400, COLUMN_BOUNDS.scores)).toBe(110);
  });
});

describe("comparability (spec §6.3)", () => {
  it("treats exactly equal decimals as the same reference amount", () => {
    expect(
      comparability([basis("1"), basis("1.0"), basis("1e0"), basis("+1.000")]),
    ).toEqual({ amounts: false, units: false });
    expect(comparability([basis("0"), basis("-0")]).amounts).toBe(false);
  });

  it("detects amount and unit differences independently", () => {
    expect(
      comparability([basis("1"), basis("1.0000000000000000000001")]),
    ).toEqual({ amounts: true, units: false });
    expect(comparability([basis("1"), basis("1", "MJ")])).toEqual({
      amounts: false,
      units: true,
    });
    // Units are compared exactly; no case folding or conversion.
    expect(comparability([basis("1", "kg"), basis("1", "KG")]).units).toBe(
      true,
    );
    expect(comparability([basis("2", "m"), basis("1", "km")])).toEqual({
      amounts: true,
      units: true,
    });
  });

  it("has nothing to compare for zero or one header", () => {
    expect(comparability([])).toEqual({ amounts: false, units: false });
    expect(comparability([basis("3")])).toEqual({
      amounts: false,
      units: false,
    });
  });

  it("never invents a display value for blank metadata", () => {
    expect(shown("")).toBeNull();
    expect(shown("  ")).toBeNull();
    expect(shown(null)).toBeNull();
    expect(shown("CH")).toBe("CH");
  });
});
