import { describe, expect, it } from "vitest";
import { decimalString } from "./contracts";
import { decimalRatio, displayDecimal, formatDecimal } from "./decimal";

const d = decimalString;

describe("decimalRatio (#22): float only for pixels, never overflowing", () => {
  it.each([
    ["20", "80", 0.25],
    ["-80", "80", 1],
    ["80", "-80", 1],
    ["1e-300", "1e-300", 1],
    ["1e300", "2e300", 0.5],
    ["5e999", "1e1000", 0.5],
    ["0.000", "3", 0],
    ["-0", "3", 0],
  ])("|%s| / |%s| = %s", (a, b, expected) => {
    expect(decimalRatio(d(a), d(b))).toBeCloseTo(expected, 12);
  });

  it("stays finite or exact zero for extreme exponent gaps", () => {
    expect(decimalRatio(d("1e-300"), d("1e300"))).toBe(0);
    expect(decimalRatio(d("1e-5000"), d("1"))).toBe(0);
    expect(decimalRatio(d("1e5000"), d("1"))).toBe(Number.POSITIVE_INFINITY);
    expect(decimalRatio(d("1"), d("0"))).toBe(Number.POSITIVE_INFINITY);
    const tiny = decimalRatio(d("1e-300"), d("1e-299"));
    expect(tiny).toBeCloseTo(0.1, 12);
  });

  it("keeps significant digits beyond float range of whole lexemes", () => {
    expect(
      decimalRatio(
        d("123456789012345678901234567890e-400"),
        d("1.23456789012345678901234567890e-371"),
      ),
    ).toBeCloseTo(1, 12);
  });
});

describe("formatDecimal (#22): adaptive labels from exact digits", () => {
  it.each([
    ["0", "0"],
    ["-0", "0"],
    ["0.000e5", "0"],
    ["1", "1"],
    ["1.0", "1"],
    ["-80", "-80"],
    ["20", "20"],
    ["123456", "123500"],
    ["999999", "1e6"],
    ["1000000", "1e6"],
    ["-2.0000000000000000000000001", "-2"],
    ["0.001", "0.001"],
    ["0.00123456", "0.001235"],
    ["0.000999", "9.99e-4"],
    ["0.000000000000000000000123456789", "1.235e-22"],
    ["-100000000000000000000.0000001", "-1e20"],
    ["1e-300", "1e-300"],
    ["9.9995e299", "1e300"],
    ["12345.678", "12350"],
  ])("%s → %s", (value, label) => {
    expect(formatDecimal(d(value))).toBe(label);
  });
});

describe("displayDecimal (#22): full stored precision", () => {
  it("keeps every digit and exponent and unsigns zeros only", () => {
    for (const value of [
      "-80.000000000000000000000001",
      "0.000000000000000000000123456789",
      "1e-300",
      "+5",
    ])
      expect(displayDecimal(d(value))).toBe(value);
    expect(displayDecimal(d("-0"))).toBe("0");
    expect(displayDecimal(d("-0.000"))).toBe("0.000");
  });
});
