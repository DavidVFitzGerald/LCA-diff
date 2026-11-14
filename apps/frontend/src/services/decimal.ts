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
