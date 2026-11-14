import { memo, useId } from "react";
import type { DecimalString } from "../../services/contracts";
import {
  decimalSign,
  displayDecimal,
  formatDecimal,
} from "../../services/decimal";
import { barGeometry, barOpacity, CHART_PADDING, labelTop } from "./geometry";
import type { RowGeometry } from "./geometry";
import "./signed-value.css";

/**
 * One semantic cell state, shared by Flows and Scores: a present exact value
 * (zero included), an absent flow (blank), or an unavailable score (`N/A`).
 */
export type CellState =
  | { readonly kind: "present"; readonly amount: DecimalString }
  | { readonly kind: "absent" }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Signed bar plus value label (#22, spec §6.6). Geometry comes from the
 * whole-row `RowGeometry`, never from other mounted cells. Labels carry the
 * value only, in adaptive notation; hover or focus reveals the full stored
 * lexeme. Zero, absence and N/A draw no bar.
 */
export const SignedValueCell = memo(function SignedValueCell({
  value,
  row,
  focusable = true,
}: {
  value: CellState;
  row: RowGeometry;
  /** Grids with roving focus (#23) pass false for non-active cells. */
  focusable?: boolean;
}) {
  const tipId = useId();
  if (value.kind === "absent")
    return (
      <div
        className="signed-cell"
        data-state="absent"
        style={{ height: row.rowHeight }}
      >
        {/* Visually blank; announced as text, since a role-less div's
            aria-label may be ignored by assistive technology. */}
        <span className="signed-sr-only">No flow</span>
      </div>
    );
  const present = value.kind === "present";
  const sign = present ? decimalSign(value.amount) : 0;
  const bar = present ? barGeometry(value.amount, row) : null;
  const label = present ? formatDecimal(value.amount) : "N/A";
  const full = present ? displayDecimal(value.amount) : `N/A: ${value.reason}`;
  const meaning = !present
    ? "not available"
    : sign > 0
      ? "positive"
      : sign < 0
        ? "negative"
        : "zero";
  return (
    <div
      className="signed-cell"
      data-state={present ? meaning : "unavailable"}
      style={{ height: row.rowHeight }}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${present ? full : "N/A"}, ${meaning}`}
      aria-describedby={present ? undefined : tipId}
    >
      <div
        className="signed-chart"
        style={{ top: CHART_PADDING, height: row.chartHeight }}
      >
        <span
          className="zero-axis"
          data-testid="zero-axis"
          style={{ top: row.axis }}
        />
        {bar && (
          <span
            className={`signed-bar ${bar.sign > 0 ? "positive" : "negative"}`}
            data-testid="signed-bar"
            style={{
              top: bar.top,
              height: bar.height,
              opacity: barOpacity(bar.magnitude),
            }}
          />
        )}
        <span
          className={`signed-label ${row.labels}`}
          aria-hidden="true"
          style={{ top: labelTop(row) }}
        >
          <span className="signed-label-text">{label}</span>
        </span>
      </div>
      <span id={tipId} role="tooltip" className="signed-tooltip">
        {full}
      </span>
    </div>
  );
});
