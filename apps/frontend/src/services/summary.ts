import { decimalString } from "./contracts";
import type { RowSummary, WireSchemas } from "./contracts";
import { decimalSign, decimalMagnitude, compareDecimal } from "./decimal";
/** Derive P/N without normalizing decimal lexemes or narrowing the selection. */
export function deriveSummary(
  value: WireSchemas["NumericSummary"],
): RowSummary {
  const { minimum, maximum, present_count, selected_count } = value;
  if (
    !Number.isSafeInteger(present_count) ||
    !Number.isSafeInteger(selected_count) ||
    present_count < 0 ||
    selected_count < present_count ||
    (present_count === 0
      ? minimum !== null || maximum !== null
      : minimum === null || maximum === null)
  )
    throw new TypeError("Invalid summary");
  const min = minimum === null ? null : decimalString(minimum);
  const max = maximum === null ? null : decimalString(maximum);
  if (min !== null && max !== null && compareDecimal(min, max) > 0)
    throw new TypeError("Invalid extrema");
  return {
    max_positive:
      max !== null && decimalSign(max) > 0 ? max : decimalString("0"),
    max_negative_magnitude:
      min !== null && decimalSign(min) < 0
        ? decimalMagnitude(min)
        : decimalString("0"),
    absent_count: selected_count - present_count,
  };
}
