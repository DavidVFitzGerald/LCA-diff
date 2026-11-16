import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FlowRow, FlowType } from "../../services/contracts";
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
import type { RowGeometry } from "./geometry";
import type { CellAttributes } from "./SignedValueCell";
import { useFlowGrid } from "./useFlowGrid";
import { selectionKey } from "../../app/selection";
import { useDifferences } from "../../app/differences";

/**
 * Compact visible Type labels for the bounded block (#24, O2); the full
 * type stays in the field's title and the rowheader's accessible name.
 */
const TYPE_LABELS: Readonly<Record<FlowType, string>> = {
  Reference: "Ref",
  Technosphere: "Tech",
  "Ecosphere Input": "Eco in",
  "Ecosphere Output": "Eco out",
};

/**
 * The seven Flows identifying fields, in specified order (spec §6.4). Each
 * inner column has a minimum (px) that keeps its header label (single words;
 * multi-word labels wrap to two lines) and compact values legible (#24, O2),
 * measured with the bundled Inter (#79). The minima plus gaps and padding
 * (406.4 px) stay within the 410 px block minimum.
 */
const FLOW_FIELDS: readonly {
  readonly label: string;
  readonly value: (row: FlowRow) => string | null;
  readonly display?: (row: FlowRow) => string;
  readonly min: number;
  readonly share: number;
}[] = [
  {
    label: "Type",
    value: (row) => row.flow_type,
    display: (row) => TYPE_LABELS[row.flow_type] ?? row.flow_type,
    min: 46,
    share: 0.9,
  },
  { label: "Flow Name", value: (row) => row.name, min: 40, share: 2 },
  { label: "Location", value: (row) => row.location, min: 52, share: 0.8 },
  {
    label: "Process Name",
    value: (row) => row.process_name,
    min: 51,
    share: 1.6,
  },
  { label: "Category", value: (row) => row.category, min: 57, share: 1.1 },
  {
    label: "Subcategory",
    value: (row) => row.subcategory,
    min: 78,
    share: 1.1,
  },
  { label: "Unit", value: (row) => row.unit, min: 28, share: 0.6 },
];
const template = FLOW_FIELDS.map(
  (field) => `minmax(${field.min}px, ${field.share}fr)`,
).join(" ");
/**
 * Flows block bounds: the shared share and maximum, with a minimum that
 * fits every inner column minimum plus gaps and padding.
 */
const FLOWS_LEADING_BOUNDS = { ...LEADING_BOUNDS, min: 410 } as const;

/** Pending geometry at a row's current height, one object per height. */
const pendingRows = new Map<number, RowGeometry>([
  [PENDING_ROW.rowHeight, PENDING_ROW],
]);
function pendingRow(rowHeight: number): RowGeometry {
  let row = pendingRows.get(rowHeight);
  if (!row) {
    // Heights are layout numbers only; keep the cache small.
    if (pendingRows.size > 64) pendingRows.clear();
    row = { ...PENDING_ROW, rowHeight };
    pendingRows.set(rowHeight, row);
  }
  return row;
}

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
      {FLOW_FIELDS.map((field) => (
        <span key={field.label} title={field.label}>
          {field.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Windowed Flows grid (#23): process headers, a bounded sticky block of the
 * seven identifying fields and signed value cells, reading only the mounted
 * row/column window. Rows are the service's union in service order; each
 * cell shows only its own service-supplied warnings (#24).
 */
export function FlowsGrid() {
  const { ref, width } = useWidth();
  const leading = boundedLeadingWidth(width, FLOWS_LEADING_BOUNDS);
  return (
    <div ref={ref} className="comparison-frame">
      <ComparisonHeader
        tab="flows"
        leading={<IdentityLabels />}
        leadingWidth={leading}
      >
        {(layout) => <FlowsBody layout={layout} leadingWidth={leading} />}
      </ComparisonHeader>
    </div>
  );
}

function FlowsBody({
  layout,
  leadingWidth,
}: {
  layout: ComparisonLayout;
  leadingWidth: number;
}) {
  const { entries, headers, width, headerScroller } = layout;
  const [range, setRange] = useState<{ rows: IndexRange; columns: IndexRange }>(
    { rows: null, columns: null },
  );
  const onRange = useCallback(
    (rows: IndexRange, columns: IndexRange) => setRange({ rows, columns }),
    [],
  );
  // The grid reports its anchor flows here; the data hook reads them when
  // the selection changes (no re-render per scroll).
  const anchors = useRef<readonly string[]>([]);
  const differences = useDifferences("flows");
  const data = useFlowGrid(
    entries,
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
  const rowKey = (index: number) =>
    data.row(index)?.row_key ?? `pending:${index}`;
  const renderLeading = (index: number, cell: CellAttributes) => {
    const row = data.row(index);
    if (!row)
      return (
        <div {...cell} className="identity-fields" aria-busy="true">
          <span className="identity-empty">Loading…</span>
        </div>
      );
    const values = FLOW_FIELDS.map((field) => field.value(row));
    return (
      <div
        {...cell}
        className="identity-fields"
        style={{ gridTemplateColumns: template }}
        aria-label={FLOW_FIELDS.map(
          (field, i) => `${field.label}: ${values[i] || "not specified"}`,
        ).join("; ")}
      >
        {values.map((value, i) =>
          value ? (
            <span key={FLOW_FIELDS[i].label} title={value}>
              {FLOW_FIELDS[i].display?.(row) ?? value}
            </span>
          ) : (
            <span key={FLOW_FIELDS[i].label} className="identity-empty">
              —
            </span>
          ),
        )}
      </div>
    );
  };
  const renderCell = (
    index: number,
    column: number,
    cell: CellAttributes,
    rowHeight: number,
  ) => {
    // One height per row in every commit (#87, spec §6.6): the grid applies
    // a summary's height to the row one commit after the summary arrives,
    // so until the row has that height its cells stay pending at the row's
    // current height instead of drawing the summary geometry.
    const summarized = data.geometry(index);
    const geometry =
      summarized?.rowHeight === rowHeight ? summarized : undefined;
    const value = data.cell(index, entries[column].id);
    // One component for every state keeps the focused DOM node when a
    // pending cell's data arrives.
    return (
      <SignedValueCell
        row={geometry ?? pendingRow(rowHeight)}
        context={columns[column].label}
        value={
          !geometry || !value
            ? { kind: "pending" }
            : value.present
              ? { kind: "present", amount: value.amount }
              : { kind: "absent" }
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
            ? "No differences: every flow has the same amount in all selected processes."
            : ""}
      </p>
      {data.error && (
        <p role="alert" className="comparison-grid-error">
          Flow values could not be loaded.{" "}
          <button type="button" onClick={data.retry}>
            Retry
          </button>
        </p>
      )}
      <ComparisonGrid
        label="Flows comparison"
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
