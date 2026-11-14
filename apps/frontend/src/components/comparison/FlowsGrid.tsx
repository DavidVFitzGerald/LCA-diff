import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FlowRow } from "../../services/contracts";
import { ComparisonGrid } from "./ComparisonGrid";
import type { GridColumn } from "./ComparisonGrid";
import { ComparisonHeader } from "./ComparisonHeader";
import type { ComparisonLayout } from "./ComparisonHeader";
import { leadingWidth as boundedLeadingWidth } from "./grid-model";
import type { IndexRange } from "./grid-model";
import { SignedValueCell } from "./SignedValueCell";
import { PENDING_ROW } from "./geometry";
import type { CellAttributes } from "./SignedValueCell";
import { useFlowGrid } from "./useFlowGrid";
import { selectionKey } from "../../app/selection";

/** The seven Flows identifying fields, in specified order (spec §6.4). */
const FLOW_FIELDS = [
  { label: "Type", value: (row: FlowRow) => row.flow_type, share: 0.9 },
  { label: "Flow Name", value: (row: FlowRow) => row.name, share: 2 },
  { label: "Location", value: (row: FlowRow) => row.location, share: 0.8 },
  {
    label: "Process Name",
    value: (row: FlowRow) => row.process_name,
    share: 1.6,
  },
  { label: "Category", value: (row: FlowRow) => row.category, share: 1.1 },
  {
    label: "Subcategory",
    value: (row: FlowRow) => row.subcategory,
    share: 1.1,
  },
  { label: "Unit", value: (row: FlowRow) => row.unit, share: 0.6 },
] as const;
const template = FLOW_FIELDS.map((field) => `minmax(0, ${field.share}fr)`).join(
  " ",
);

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
 * row/column window. Flows semantics beyond the window (union, warnings,
 * empty states) are #24.
 */
export function FlowsGrid() {
  const { ref, width } = useWidth();
  const leading = boundedLeadingWidth(width);
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
  const data = useFlowGrid(entries, range.rows, range.columns);
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
              {value}
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
            : value.present
              ? { kind: "present", amount: value.amount }
              : { kind: "absent" }
        }
        cell={cell}
      />
    );
  };
  return (
    <>
      <p role="status" className="comparison-grid-status">
        {data.updating ? "Updating the comparison…" : ""}
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
        busy={data.updating}
        heights={data.heights}
        renderLeading={renderLeading}
        renderCell={renderCell}
        onRange={onRange}
        headerScroller={headerScroller}
      />
    </>
  );
}
