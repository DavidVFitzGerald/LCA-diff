import type { DecimalString } from "../../services/contracts";
import { decimalRatio, decimalSign } from "../../services/decimal";

/** H: nominal chartable height of a standard row, CSS px (spec §6.6). */
export const CHART_HEIGHT = 40;
/** Separate padding above and below every chart area. */
export const CHART_PADDING = 6;
/** Height of a value label; labels never change bar geometry. */
export const LABEL_HEIGHT = 14;
/** Inset of the thin zero baseline from the top when M = 0. */
export const BASELINE_INSET = 2;
/** Smallest drawn bar for a nonzero value, so no nonzero value is invisible. */
export const MIN_BAR = 1;

/** Whole-row extrema: exact lexemes of P and N over every selected process. */
export interface RowScaleInput {
  readonly max_positive: DecimalString;
  readonly max_negative_magnitude: DecimalString;
}
export type RowMode = "empty" | "positive" | "negative" | "mixed";
export interface RowGeometry {
  readonly mode: RowMode;
  /** M = max(P, N), exact; "0" when no value is nonzero. */
  readonly M: DecimalString;
  readonly H: number;
  /** Total chartable height: H, or H × (P + N) / M for mixed rows. */
  readonly chartHeight: number;
  /** Data y = 0, in px below the top of the chart area. */
  readonly axis: number;
  /** Labels sit above zero unless every populated value is non-positive. */
  readonly labels: "above" | "below";
  /** chartHeight plus padding: the row height a virtualizer should use. */
  readonly rowHeight: number;
}

/**
 * Row geometry from whole-selection extrema (#22, spec §6.6). Floats are
 * derived only for pixels, via exact-exponent ratios, so extreme lexemes
 * never overflow into invalid geometry.
 */
export function rowGeometry(
  summary: RowScaleInput,
  H: number = CHART_HEIGHT,
): RowGeometry {
  const P = summary.max_positive;
  const N = summary.max_negative_magnitude;
  const hasP = decimalSign(P) > 0;
  const hasN = decimalSign(N) > 0;
  const labels = hasP ? "above" : "below";
  const finish = (
    mode: RowMode,
    M: DecimalString,
    chartHeight: number,
    axis: number,
  ): RowGeometry => ({
    mode,
    M,
    H,
    chartHeight,
    axis,
    labels,
    rowHeight: chartHeight + 2 * CHART_PADDING,
  });
  if (!hasP && !hasN)
    return finish("empty", "0" as DecimalString, H, BASELINE_INSET);
  if (!hasN) return finish("positive", P, H, H);
  if (!hasP) return finish("negative", N, H, 0);
  // Mixed: the larger extreme is M; the smaller adds H × smaller / M.
  const positiveLarger = decimalRatio(P, N) >= 1;
  const M = positiveLarger ? P : N;
  const smaller = clampRatio(decimalRatio(positiveLarger ? N : P, M));
  return finish(
    "mixed",
    M,
    H * (1 + smaller),
    positiveLarger ? H : H * smaller,
  );
}

function clampRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 1;
}

export interface BarGeometry {
  readonly sign: 1 | -1;
  /** Px below the chart top; positives end at the axis, negatives start there. */
  readonly top: number;
  readonly height: number;
  /** |value| / M in [0, 1], for monotonic colour intensity. */
  readonly magnitude: number;
}

/**
 * One value's bar: up from zero for positives, down for negatives, height
 * H × |value| / M. Zero, absence and N/A have no bar. Inconsistent inputs
 * (a value beyond M or on a side the row lacks) are clamped into the chart.
 */
export function barGeometry(
  value: DecimalString,
  row: RowGeometry,
): BarGeometry | null {
  const sign = decimalSign(value);
  if (sign === 0 || row.mode === "empty") return null;
  const magnitude = clampRatio(decimalRatio(value, row.M));
  const height = Math.min(row.H, Math.max(MIN_BAR, row.H * magnitude));
  const wanted = sign > 0 ? row.axis - height : row.axis;
  const top = Math.min(Math.max(0, wanted), row.chartHeight - height);
  return { sign: sign > 0 ? 1 : -1, top, height, magnitude };
}

/** Label offset from the chart top, kept inside the padded cell. */
export function labelTop(row: RowGeometry): number {
  return row.labels === "above"
    ? Math.max(-CHART_PADDING, row.axis - LABEL_HEIGHT)
    : Math.min(row.axis, row.chartHeight + CHART_PADDING - LABEL_HEIGHT);
}

/** Colour intensity rises monotonically with |value| / M. */
export const barOpacity = (magnitude: number) => 0.35 + 0.65 * magnitude;
