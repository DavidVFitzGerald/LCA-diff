import { compareDecimal } from "../../services/decimal";
import type { ProcessHeader } from "../../services/contracts";

export type ComparisonTab = "flows" | "scores";
export interface ColumnBounds {
  readonly min: number;
  readonly max: number;
}
/**
 * Per-tab process-column width bounds in CSS px (#21, spec §6.3: max 230–260,
 * min 110–130). Flows cells carry signed bars plus a flow-unit context, so
 * they get the wider pair; Scores cells hold one value each. Final tuning is a
 * visual-QA decision within the specified ranges.
 */
export const COLUMN_BOUNDS: Readonly<Record<ComparisonTab, ColumnBounds>> = {
  flows: { min: 120, max: 240 },
  scores: { min: 110, max: 230 },
};

/**
 * `clamp(available / count, min, max)`: few columns keep the normal maximum,
 * crowded ones shrink to the readable minimum and then scroll horizontally.
 */
export function columnWidth(
  available: number,
  count: number,
  bounds: ColumnBounds,
): number {
  if (!(count >= 1) || !Number.isFinite(available) || available <= 0)
    return bounds.max;
  return Math.min(
    bounds.max,
    Math.max(bounds.min, Math.floor(available / count)),
  );
}

export interface Comparability {
  readonly amounts: boolean;
  readonly units: boolean;
}
/**
 * Which reference bases differ among the given headers (spec §6.3). Amounts
 * compare exactly as decimals, so `1` and `1.0` agree; units compare as exact
 * strings, with no conversion. Nothing is normalized or changed.
 */
export function comparability(
  headers: readonly Pick<
    ProcessHeader,
    "reference_amount" | "reference_unit"
  >[],
): Comparability {
  const [first] = headers;
  if (!first) return { amounts: false, units: false };
  return {
    amounts: headers.some(
      (header) =>
        compareDecimal(header.reference_amount, first.reference_amount) !== 0,
    ),
    units: headers.some(
      (header) => header.reference_unit !== first.reference_unit,
    ),
  };
}

/** Display text for an optional metadata field; never invents a value. */
export function shown(value: string | null | undefined): string | null {
  return value === null || value === undefined || value.trim() === ""
    ? null
    : value;
}
