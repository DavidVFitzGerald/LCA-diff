import { Fragment, memo, useId } from "react";
import type { HTMLAttributes } from "react";
import type { DecimalString, PublicWarning } from "../../services/contracts";
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
  | { readonly kind: "unavailable"; readonly reason: string }
  /** Not yet read (#23). Same root element, so a focused cell keeps focus. */
  | { readonly kind: "pending" };

export type CellAttributes = HTMLAttributes<HTMLDivElement> &
  Partial<Record<`data-${string}`, string | number>>;

const NO_WARNINGS: readonly PublicWarning[] = [];

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
  context,
  cell,
  warnings = NO_WARNINGS,
}: {
  value: CellState;
  /**
   * Service-supplied warnings of this cell only (spec §6.4), rendered
   * generically whatever their code; other cells never inherit them.
   */
  warnings?: readonly PublicWarning[];
  row: RowGeometry;
  /** Grids with roving focus (#23) pass false for non-active cells. */
  focusable?: boolean;
  /** Column identity prefixed to the accessible name, e.g. a process name. */
  context?: string;
  /** Grid role, position and key handling from the owning grid (#23). */
  cell?: CellAttributes;
}) {
  const prefix = context ? `${context}: ` : "";
  const tipId = useId();
  if (value.kind === "pending")
    return (
      <div
        className="signed-cell"
        data-pending=""
        aria-busy="true"
        style={{ height: row.rowHeight }}
        {...cell}
      >
        <span className="signed-sr-only">{prefix}Loading</span>
      </div>
    );
  const warned = warnings.length > 0;
  const warningText = warned
    ? `. Warning: ${warnings.map((warning) => warning.message).join("; ")}.`
    : "";
  if (value.kind === "absent")
    return (
      <div
        className="signed-cell"
        data-state="absent"
        data-warning={warned ? "" : undefined}
        style={{ height: row.rowHeight }}
        {...cell}
      >
        {/* Visually blank; announced as text, since a role-less div's
            aria-label may be ignored by assistive technology. */}
        <span className="signed-sr-only">
          {prefix}No flow{warningText}
        </span>
        {warned && (
          <>
            <WarningIcon />
            <span className="signed-tooltip" aria-hidden="true">
              <WarningList warnings={warnings} />
            </span>
          </>
        )}
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
      data-warning={warned ? "" : undefined}
      style={{ height: row.rowHeight }}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${prefix}${present ? full : "N/A"}, ${meaning}${warningText}`}
      aria-describedby={present ? undefined : tipId}
      {...cell}
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
      {/* Visual only for present values, whose accessible name already holds
          the full lexeme; N/A cells are described by it. */}
      <span
        id={tipId}
        role="tooltip"
        className="signed-tooltip"
        aria-hidden={present ? true : undefined}
      >
        {warned ? (
          <>
            <span className="signed-tooltip-value">{full}</span>
            <WarningList warnings={warnings} />
          </>
        ) : (
          full
        )}
      </span>
      {warned && <WarningIcon />}
    </div>
  );
});

/**
 * Corner marker for service-supplied cell warnings (spec §6.4): a glyph
 * shape, not colour alone, positioned over the cell's padding so bar
 * geometry, row height and value labels are unchanged. The message is in
 * the cell's accessible name and tooltip, so the icon itself is hidden.
 */
function WarningIcon() {
  return (
    <span className="signed-warning" data-testid="cell-warning" aria-hidden>
      !
    </span>
  );
}

function WarningList({ warnings }: { warnings: readonly PublicWarning[] }) {
  return (
    <span className="signed-tooltip-warnings">
      {/* Spaces keep the text content (and N/A descriptions) readable. */}
      {warnings.map((warning, index) => (
        <Fragment key={`${warning.code}:${index}`}>
          {" "}
          <span data-code={warning.code}>Warning: {warning.message}</span>
        </Fragment>
      ))}
    </span>
  );
}
