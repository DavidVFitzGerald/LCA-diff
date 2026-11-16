import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Indicator } from "../../services/contracts";
import { ComparisonGrid } from "./ComparisonGrid";
import type { GridColumn } from "./ComparisonGrid";
import { ComparisonHeader } from "./ComparisonHeader";
import type { ComparisonLayout } from "./ComparisonHeader";
import {
  leadingWidth as boundedLeadingWidth,
  LEADING_BOUNDS,
} from "./grid-model";
import type { IndexRange } from "./grid-model";
import { SignedValueCell } from "./SignedValueCell";
import { PENDING_ROW } from "./geometry";
import type { CellAttributes } from "./SignedValueCell";
import { useScoreGrid } from "./useScoreGrid";
import { scopedIndicatorIds, useIndicators } from "../../app/indicator-context";
import { selectionKey } from "../../app/selection";
import { useDifferences } from "../../app/differences";

/** The bounded sticky Scores identity block (spec §6.5). */
const SCORE_FIELDS: readonly {
  readonly label: string;
  readonly value: (row: Indicator) => string | null;
  readonly min: number;
  readonly share: number;
}[] = [
  {
    label: "Method",
    value: (row) =>
      `${row.method_name}${row.method_version ? ` / ${row.method_version}` : ""}`,
    min: 70,
    share: 1.5,
  },
  { label: "Category", value: (row) => row.category, min: 57, share: 1 },
  { label: "Indicator", value: (row) => row.name, min: 65, share: 1.8 },
  { label: "Unit", value: (row) => row.unit, min: 45, share: 1 },
];
const template = SCORE_FIELDS.map(
  (field) => `minmax(${field.min}px, ${field.share}fr)`,
).join(" ");
/**
 * Scores uses the shared bounded identity width.
 */
const SCORES_LEADING_BOUNDS = LEADING_BOUNDS;

/** Width of an element's content box, tracked through resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function IdentityLabels() {
  return (
    <div
      className="identity-fields"
      style={{ gridTemplateColumns: template }}
      aria-hidden="true"
    >
      {SCORE_FIELDS.map((field) => (
        <span key={field.label} title={field.label}>
          {field.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Windowed Scores grid (#28): process headers, a bounded sticky block of the
 * four identifying fields and signed value cells, reading only the mounted
 * row/column window. Rows follow the service's source indicator order; each
 * cell shows only its own service-supplied warnings (#24).
 */
export function ScoresGrid() {
  const { ref, width } = useWidth();
  const leading = boundedLeadingWidth(width, SCORES_LEADING_BOUNDS);
  return (
    <div ref={ref} className="comparison-frame">
      <ComparisonHeader
        tab="scores"
        leading={<IdentityLabels />}
        leadingWidth={leading}
      >
        {(layout) => <ScoresBody layout={layout} leadingWidth={leading} />}
      </ComparisonHeader>
    </div>
  );
}

function ScoresBody({
  layout,
  leadingWidth,
}: {
  layout: ComparisonLayout;
  leadingWidth: number;
}) {
  const { entries, headers, width, headerScroller } = layout;
  const { ids: chosen, tree } = useIndicators();
  const ids = useMemo(
    () =>
      scopedIndicatorIds(
        tree,
        chosen,
        new Set(entries.map((entry) => entry.release_id)),
      ),
    [tree, chosen, entries],
  );
  const [range, setRange] = useState<{ rows: IndexRange; columns: IndexRange }>(
    { rows: null, columns: null },
  );
  const onRange = useCallback(
    (rows: IndexRange, columns: IndexRange) => setRange({ rows, columns }),
    [],
  );
  // The grid reports its anchor indicators here; the data hook reads them when
  // the selection changes (no re-render per scroll).
  const anchors = useRef<readonly string[]>([]);
  const differences = useDifferences("scores");
  const data = useScoreGrid(
    entries,
    ids,
    range.rows,
    range.columns,
    () => anchors.current,
    differences.on,
  );
  const columns = useMemo(
    (): GridColumn[] =>
      entries.map((entry) => {
        const key = selectionKey(entry);
        return { key, label: headers.get(key)?.name ?? entry.name };
      }),
    [entries, headers],
  );
  const rowKey = (index: number) => data.row(index)?.id ?? `pending:${index}`;
  const renderLeading = (index: number, cell: CellAttributes) => {
    const row = data.row(index);
    if (!row)
      return (
        <div {...cell} className="identity-fields" aria-busy="true">
          <span className="identity-empty">Loading…</span>
        </div>
      );
    const values = SCORE_FIELDS.map((field) => field.value(row));
    return (
      <div
        {...cell}
        className="identity-fields"
        style={{ gridTemplateColumns: template }}
        aria-label={SCORE_FIELDS.map(
          (field, i) => `${field.label}: ${values[i] || "not specified"}`,
        ).join("; ")}
      >
        {values.map((value, i) =>
          value ? (
            <span key={SCORE_FIELDS[i].label} title={value}>
              {value}
            </span>
          ) : (
            <span key={SCORE_FIELDS[i].label} className="identity-empty" />
          ),
        )}
      </div>
    );
  };
  const renderCell = (index: number, column: number, cell: CellAttributes) => {
    const geometry = data.geometry(index);
    const value = data.cell(index, entries[column].id);
    // One component for every state keeps the focused DOM node when a
    // pending cell's data arrives.
    return (
      <SignedValueCell
        row={geometry ?? PENDING_ROW}
        context={columns[column].label}
        value={
          !geometry || !value
            ? { kind: "pending" }
            : value.status === "valid"
              ? { kind: "present", amount: value.amount }
              : {
                  kind: "unavailable",
                  reason:
                    value.status === "unresolved_basis"
                      ? "Reference basis has not been verified"
                      : "Score is missing or unmapped",
                }
        }
        warnings={geometry ? value?.warnings : undefined}
        cell={cell}
      />
    );
  };
  return (
    <>
      <p role="status" className="comparison-grid-status">
        {data.updating
          ? "Updating the comparison…"
          : differences.on &&
              data.token !== undefined &&
              !data.busy &&
              !data.error &&
              data.rowCount === 0
            ? "No differences: every selected indicator has the same score in all selected processes."
            : ""}
      </p>
      {data.error && (
        <p role="alert" className="comparison-grid-error">
          Score values could not be loaded.{" "}
          <button type="button" onClick={data.retry}>
            Retry
          </button>
        </p>
      )}
      <ComparisonGrid
        label="Scores comparison"
        columns={columns}
        columnWidth={width}
        leadingWidth={leadingWidth}
        rowCount={data.rowCount}
        rowKey={rowKey}
        busy={data.busy}
        locate={data.locate}
        onAnchor={(keys) => {
          anchors.current = keys;
        }}
        heights={data.heights}
        renderLeading={renderLeading}
        renderCell={renderCell}
        onRange={onRange}
        headerScroller={headerScroller}
      />
    </>
  );
}
