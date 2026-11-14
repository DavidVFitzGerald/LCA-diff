import type { DecimalString } from "./contracts";

/**
 * Exact comparison of canonical decimal lexemes (#20, spec §§6.6, 7.2). No
 * floating-point conversion: digits and exponents are compared as integers and
 * strings, so arbitrarily long or tiny values keep full precision. `-0` is zero.
 */
interface Parsed {
  /** -1, 0 or 1. */
  readonly sign: number;
  /** Significant digits without leading/trailing zeros ("" for zero). */
  readonly digits: string;
  /** Position of the decimal point relative to the first significant digit. */
  readonly magnitude: bigint;
}

const LEXEME = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

function parse(value: DecimalString): Parsed {
  const match = LEXEME.exec(value);
  if (!match || (match[2] === "" && (match[3] ?? "") === ""))
    throw new TypeError("Expected a finite decimal string");
  const integer = match[2];
  const fraction = match[3] ?? "";
  // BigInt keeps any exponent `decimalString` accepts exact (QA #20 D2).
  const exponent = match[4] === undefined ? 0n : BigInt(match[4]);
  const all = integer + fraction;
  const leading = all.length - all.replace(/^0+/, "").length;
  const digits = all.slice(leading).replace(/0+$/, "");
  if (digits === "") return { sign: 0, digits: "", magnitude: 0n };
  return {
    sign: match[1] === "-" ? -1 : 1,
    digits,
    magnitude: BigInt(integer.length - leading) + exponent,
  };
}

/** Compare absolute values: -1, 0 or 1. */
function compareMagnitude(a: Parsed, b: Parsed): number {
  if (a.sign === 0 || b.sign === 0)
    return a.sign === 0 ? (b.sign === 0 ? 0 : -1) : 1;
  if (a.magnitude !== b.magnitude) return a.magnitude < b.magnitude ? -1 : 1;
  const length = Math.max(a.digits.length, b.digits.length);
  const left = a.digits.padEnd(length, "0");
  const right = b.digits.padEnd(length, "0");
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Exact numeric ordering of two decimal lexemes: -1, 0 or 1. */
export function compareDecimal(a: DecimalString, b: DecimalString): number {
  const left = parse(a);
  const right = parse(b);
  if (left.sign !== right.sign) return left.sign < right.sign ? -1 : 1;
  return left.sign * compareMagnitude(left, right) || 0;
}

/** -1, 0 or 1; `-0`, `0.000` and `0e5` are zero. */
export function decimalSign(value: DecimalString): number {
  return parse(value).sign;
}

/** Compare |a| and |b| exactly: -1, 0 or 1. */
export function compareDecimalMagnitude(
  a: DecimalString,
  b: DecimalString,
): number {
  return compareMagnitude(parse(a), parse(b));
}

/** The same lexeme without a leading sign: exact absolute value. */
export function decimalMagnitude(value: DecimalString): DecimalString {
  return value.replace(/^[+-]/, "") as DecimalString;
}

/**
 * |a| / |b| as a finite float for chart pixels only (#22, spec §6.6). Both
 * operands keep their own exponents, so `1e-300 / 1e300` or `1e999 / 1e998`
 * neither overflow nor flush to an invalid value; the result is 0 for a zero
 * numerator and +Infinity when b is zero or |a| / |b| exceeds float range.
 * Never use it for equality, ordering or display.
 */
export function decimalRatio(a: DecimalString, b: DecimalString): number {
  const top = parse(a);
  const bottom = parse(b);
  if (top.sign === 0) return 0;
  if (bottom.sign === 0) return Number.POSITIVE_INFINITY;
  const mantissa = (digits: string) => Number(`0.${digits.slice(0, 17)}`);
  const shift = top.magnitude - bottom.magnitude;
  if (shift > 400n) return Number.POSITIVE_INFINITY;
  if (shift < -400n) return 0;
  const ratio =
    (mantissa(top.digits) / mantissa(bottom.digits)) * 10 ** Number(shift);
  return Number.isFinite(ratio) ? ratio : Number.POSITIVE_INFINITY;
}

/** The stored lexeme for full-precision display; `-0` forms show unsigned. */
export function displayDecimal(value: DecimalString): string {
  return parse(value).sign === 0 ? value.replace(/^[+-]/, "") : value;
}

/**
 * Adaptive compact label (#22, spec §6.6): fixed notation for magnitudes in
 * [1e-3, 1e6), scientific otherwise, rounded half-up to `significant` digits
 * from the exact digits (no float). Zero of any sign or form is `0`.
 */
export function formatDecimal(value: DecimalString, significant = 4): string {
  const { sign, digits, magnitude } = parse(value);
  if (sign === 0) return "0";
  let kept = digits.slice(0, significant);
  let exponent = magnitude - 1n; // scientific exponent of the first digit
  if (digits.length > significant && digits[significant] >= "5") {
    const rounded = (BigInt(kept) + 1n).toString();
    if (rounded.length > kept.length) exponent += 1n;
    kept = rounded.slice(0, significant);
  }
  kept = kept.replace(/0+$/, "") || "0";
  const minus = sign < 0 ? "-" : "";
  if (exponent >= -3n && exponent < 6n) {
    const e = Number(exponent);
    if (e >= 0) {
      const whole = kept.slice(0, e + 1).padEnd(e + 1, "0");
      const fraction = kept.slice(e + 1);
      return `${minus}${whole}${fraction ? `.${fraction}` : ""}`;
    }
    return `${minus}0.${"0".repeat(-e - 1)}${kept}`;
  }
  const fraction = kept.slice(1);
  return `${minus}${kept[0]}${fraction ? `.${fraction}` : ""}e${exponent}`;
}
