import { describe, expect, it } from "vitest";
import { decimalString } from "../../services/contracts";
import {
  barGeometry,
  BASELINE_INSET,
  CHART_PADDING,
  labelTop,
  LABEL_HEIGHT,
  MIN_BAR,
  rowGeometry,
} from "./geometry";

const H = 40;
const d = decimalString;
const row = (P: string, N: string) =>
  rowGeometry({ max_positive: d(P), max_negative_magnitude: d(N) }, H);
const bar = (value: string, r: ReturnType<typeof row>) =>
  barGeometry(d(value), r);

describe("signed row geometry (#22, spec §6.6)", () => {
  it("golden mixed row -80, +20: 1.25H tall, 0.25H above and H below zero", () => {
    const r = row("20", "80");
    expect(r.mode).toBe("mixed");
    expect(r.chartHeight).toBeCloseTo(1.25 * H);
    expect(r.axis).toBeCloseTo(0.25 * H);
    expect(bar("-80", r)).toMatchObject({ sign: -1, top: 0.25 * H, height: H });
    const up = bar("20", r)!;
    expect(up.sign).toBe(1);
    expect(up.top).toBeCloseTo(0);
    expect(up.height).toBeCloseTo(0.25 * H);
    // The bar baseline is always data y = 0.
    expect(up.top + up.height).toBeCloseTo(r.axis);
  });

  it("mixed rows use H × (P + N) / M with the axis H × P / M below the top", () => {
    const r = row("60", "20");
    expect(r.chartHeight).toBeCloseTo((H * 80) / 60);
    expect(r.axis).toBeCloseTo(H);
    expect(bar("60", r)).toMatchObject({ top: 0, height: H });
    expect(bar("-20", r)!.height).toBeCloseTo(H / 3);
    expect(bar("-10", r)!.top).toBeCloseTo(H);
  });

  it("equal positive and negative extrema reach 2H", () => {
    const r = row("5e-300", "5e-300");
    expect(r.chartHeight).toBeCloseTo(2 * H);
    expect(r.axis).toBeCloseTo(H);
    expect(bar("5e-300", r)!.height).toBeCloseTo(H);
    expect(bar("-5e-300", r)!.height).toBeCloseTo(H);
  });

  it("positive-only and negative-only rows keep H with the axis at bottom or top", () => {
    const up = row("3", "0");
    expect(up).toMatchObject({ mode: "positive", chartHeight: H, axis: H });
    expect(up.labels).toBe("above");
    expect(bar("3", up)).toMatchObject({ top: 0, height: H, sign: 1 });
    expect(bar("1.5", up)).toMatchObject({ top: H / 2, height: H / 2 });
    const down = row("0", "3");
    expect(down).toMatchObject({ mode: "negative", chartHeight: H, axis: 0 });
    expect(down.labels).toBe("below");
    expect(bar("-1.5", down)).toMatchObject({ top: 0, height: H / 2 });
  });

  it("all-zero, absent or N/A rows keep standard height and a near-top baseline without bars", () => {
    const r = row("0", "0");
    expect(r).toMatchObject({
      mode: "empty",
      chartHeight: H,
      axis: BASELINE_INSET,
      labels: "below",
      rowHeight: H + 2 * CHART_PADDING,
    });
    expect(bar("0", r)).toBeNull();
    expect(bar("-0", r)).toBeNull();
    // Zero never draws a bar in a scaled row either.
    expect(bar("0.000", row("2", "1"))).toBeNull();
  });

  it("intensity grows monotonically with magnitude", () => {
    const r = row("100", "100");
    const magnitudes = ["-1", "10", "-50", "99", "100"].map(
      (value) => bar(value, r)!.magnitude,
    );
    expect(magnitudes).toEqual([...magnitudes].sort((a, b) => a - b));
    expect(magnitudes.at(-1)).toBe(1);
  });

  it("extreme and inconsistent values never produce invalid geometry", () => {
    for (const [P, N, values] of [
      ["1e300", "0", ["1e-300", "1e300"]],
      ["1e-300", "0", ["1e-300", "1e-600"]],
      ["1e999", "1e-999", ["1e999", "-1e-999"]],
      ["0", "3", ["5", "-9"]],
      ["2", "0", ["-1", "7"]],
    ] as const) {
      const r = row(P, N);
      for (const value of [r.chartHeight, r.axis, r.rowHeight])
        expect(Number.isFinite(value)).toBe(true);
      for (const value of values) {
        const b = bar(value, r)!;
        expect(b.height).toBeGreaterThanOrEqual(MIN_BAR);
        expect(b.height).toBeLessThanOrEqual(H);
        expect(b.top).toBeGreaterThanOrEqual(0);
        expect(b.top + b.height).toBeLessThanOrEqual(r.chartHeight + 1e-9);
      }
    }
    // A nonzero value far below M still shows a hairline, never nothing.
    expect(bar("1e-300", row("1e300", "0"))!.height).toBe(MIN_BAR);
  });

  it("places labels just above zero, or below for non-positive rows, inside the padded cell", () => {
    expect(labelTop(row("3", "0"))).toBe(H - LABEL_HEIGHT);
    expect(labelTop(row("0", "3"))).toBe(0);
    expect(labelTop(row("0", "0"))).toBe(BASELINE_INSET);
    const tinyPositive = row("1e-9", "1");
    expect(tinyPositive.labels).toBe("above");
    expect(labelTop(tinyPositive)).toBe(-CHART_PADDING);
  });
});
