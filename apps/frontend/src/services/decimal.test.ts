import { describe, expect, it } from "vitest";
import { decimalString } from "./contracts";
import {
  compareDecimal,
  compareDecimalMagnitude,
  decimalMagnitude,
  decimalSign,
} from "./decimal";

const d = decimalString;

describe("exact decimal comparison", () => {
  it("orders values across signs, exponents and lexeme forms without floats", () => {
    const sorted = [
      "1e3",
      "-100000000000000000000.0000001",
      "0.000000000000000000000123456789",
      "-0",
      "999.9999999999999999999",
      "-1E-30",
      "+12",
      "1000.0000000000000000001",
      ".5",
      "-100000000000000000000.00000009",
    ]
      .map(d)
      .sort(compareDecimal);
    expect(sorted).toEqual([
      "-100000000000000000000.0000001",
      "-100000000000000000000.00000009",
      "-1E-30",
      "-0",
      "0.000000000000000000000123456789",
      ".5",
      "+12",
      "999.9999999999999999999",
      "1e3",
      "1000.0000000000000000001",
    ]);
  });

  it("treats equal numbers in different lexemes as equal and keeps the bytes", () => {
    expect(compareDecimal(d("1.50"), d("15e-1"))).toBe(0);
    expect(compareDecimal(d("-0"), d("0.000"))).toBe(0);
    expect(compareDecimal(d("0e99"), d("-0.0"))).toBe(0);
    expect(compareDecimal(d("00012.3400"), d("12.34"))).toBe(0);
    // Doubles cannot separate these; exact comparison can.
    expect(compareDecimal(d("0.30000000000000001"), d("0.3"))).toBe(1);
    expect(compareDecimal(d("9007199254740993"), d("9007199254740992"))).toBe(
      1,
    );
  });

  it("reports sign, magnitude ordering and exact absolute lexemes", () => {
    expect(
      ["-3", "-0", "0", "+0.0", "2e-400"].map((v) => decimalSign(d(v))),
    ).toEqual([-1, 0, 0, 0, 1]);
    expect(compareDecimalMagnitude(d("-80"), d("20"))).toBe(1);
    expect(compareDecimalMagnitude(d("-2e1"), d("20.0"))).toBe(0);
    expect(compareDecimalMagnitude(d("0"), d("-1e-999"))).toBe(-1);
    expect(decimalMagnitude(d("-100000000000000000000.0000001"))).toBe(
      "100000000000000000000.0000001",
    );
    expect(decimalMagnitude(d("+5"))).toBe("5");
    expect(decimalMagnitude(d("7.10"))).toBe("7.10");
  });

  it("rejects non-decimal input", () => {
    for (const value of ["", ".", "1e", "NaN", "Infinity", "0x1", "1,0"])
      expect(() => compareDecimal(value as never, d("1"))).toThrow(TypeError);
  });
});
