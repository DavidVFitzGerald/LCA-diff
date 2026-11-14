import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { STANDARD_ROW_HEIGHT as DEFAULT_ROW_HEIGHT } from "./geometry";
import { moveTarget, withIndex } from "./grid-model";
import type { IndexRange } from "./grid-model";
import type { CellAttributes } from "./SignedValueCell";
import "./grid.css";

const ROW_OVERSCAN = 6;
const COLUMN_OVERSCAN = 4;
/** Reported ranges are rounded outward so scrolling rarely re-renders the owner. */
const QUANTUM = { rows: 10, columns: 5 } as const;

export interface GridColumn {
  readonly key: string;
  /** Column identity for accessible cell names, e.g. the process name. */
  readonly label: string;
}

interface Active {
  readonly row: number;
  readonly column: number;
  readonly rowKey: string | null;
  readonly columnKey: string | null;
}

function quantize(range: IndexRange, quantum: number, count: number) {
  if (!range || count <= 0) return null;
  return [
    Math.floor(range[0] / quantum) * quantum,
    Math.min(count - 1, Math.ceil((range[1] + 1) / quantum) * quantum - 1),
  ] as const;
}
const sameRange = (a: IndexRange, b: IndexRange) =>
  a === b || (!!a && !!b && a[0] === b[0] && a[1] === b[1]);

/**
 * Windowed comparison grid shared by Flows and Scores (#23, spec §§6.3–6.4).
 * Rows and process columns are both virtualized in one scroll container:
 * only the viewport plus overscan is mounted, the active cell always stays
 * mounted as the single roving tab stop, row heights come from whole-row
 * summaries (`heights`) and are applied through the virtualizer so rows
 * above the viewport never shift the visible content, and stripes follow
 * the row index. A bounded identifying block is sticky on the left; the
 * process header strip (`headerScroller`) is kept in horizontal sync.
 */
export function ComparisonGrid({
  label,
  columns,
  columnWidth,
  leadingWidth,
  rowCount,
  rowKey,
  heights,
  renderLeading,
  renderCell,
  onRange,
  headerScroller,
}: {
  label: string;
  columns: readonly GridColumn[];
  columnWidth: number;
  leadingWidth: number;
  rowCount: number;
  rowKey: (index: number) => string;
  heights: ReadonlyMap<number, number>;
  renderLeading: (index: number, cell: CellAttributes) => ReactNode;
  renderCell: (
    index: number,
    column: number,
    cell: CellAttributes,
  ) => ReactNode;
  onRange: (rows: IndexRange, columns: IndexRange) => void;
  headerScroller?: RefObject<HTMLDivElement | null>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active>({
    row: 0,
    column: -1,
    rowKey: null,
    columnKey: null,
  });
  const pendingFocus = useRef(false);

  // Resolve the active cell by key first, so reordering or new rows never
  // move the tab stop onto a different process or flow.
  const columnIndex = useMemo(
    () => new Map(columns.map((column, index) => [column.key, index])),
    [columns],
  );
  let activeRow = Math.min(active.row, rowCount - 1);
  if (active.rowKey !== null)
    for (
      let index = Math.max(0, activeRow - 200);
      index < Math.min(rowCount, activeRow + 200);
      index += 1
    )
      if (rowKey(index) === active.rowKey) {
        activeRow = index;
        break;
      }
  const activeColumn =
    active.column < 0
      ? -1
      : (columnIndex.get(active.columnKey ?? "") ??
        Math.min(active.column, columns.length - 1));

  // No React Compiler runs in this build; virtualizer methods are used only here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowWindow = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scroller.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    getItemKey: rowKey,
    rangeExtractor: (range) =>
      withIndex(defaultRangeExtractor(range), activeRow),
  });
  const columnWindow = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => columnWidth,
    overscan: COLUMN_OVERSCAN,
    paddingStart: leadingWidth,
    scrollPaddingStart: leadingWidth,
    getItemKey: (index) => columns[index].key,
    rangeExtractor: (range) =>
      withIndex(defaultRangeExtractor(range), activeColumn),
  });
  useEffect(
    () => columnWindow.measure(),
    [columnWindow, columnWidth, leadingWidth],
  );

  // Summary-derived heights; resizeItem keeps rows above the viewport from
  // shifting visible content (scroll anchoring) and is a no-op when equal.
  useLayoutEffect(() => {
    for (const [index, height] of heights)
      if (index < rowCount) rowWindow.resizeItem(index, height);
  }, [heights, rowCount, rowWindow]);

  const rowItems = rowWindow.getVirtualItems();
  const columnItems = columnWindow.getVirtualItems();
  const mountedRows: IndexRange = rowItems.length
    ? [rowItems[0].index, rowItems[rowItems.length - 1].index]
    : null;
  const mountedColumns: IndexRange = columnItems.length
    ? [columnItems[0].index, columnItems[columnItems.length - 1].index]
    : null;
  const reported = useRef<[IndexRange, IndexRange]>([null, null]);
  const rows = quantize(mountedRows, QUANTUM.rows, rowCount);
  const cols = quantize(mountedColumns, QUANTUM.columns, columns.length);
  useEffect(() => {
    const [lastRows, lastColumns] = reported.current;
    if (sameRange(lastRows, rows) && sameRange(lastColumns, cols)) return;
    reported.current = [rows, cols];
    onRange(rows, cols);
  });

  // Keep the header strip and the cells horizontally aligned, both ways.
  useEffect(() => {
    const header = headerScroller?.current;
    const body = scroller.current;
    if (!header || !body) return;
    const fromHeader = () => {
      if (body.scrollLeft !== header.scrollLeft)
        body.scrollLeft = header.scrollLeft;
    };
    header.scrollLeft = body.scrollLeft;
    header.addEventListener("scroll", fromHeader, { passive: true });
    return () => header.removeEventListener("scroll", fromHeader);
  }, [headerScroller]);
  function onScroll() {
    const header = headerScroller?.current;
    const body = scroller.current;
    if (header && body && header.scrollLeft !== body.scrollLeft)
      header.scrollLeft = body.scrollLeft;
  }

  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = scroller.current?.querySelector<HTMLElement>(
      `[data-row="${activeRow}"][data-col="${activeColumn}"]`,
    );
    if (!target) return;
    pendingFocus.current = false;
    target.focus({ preventScroll: true });
  });

  const position = (element: EventTarget | null) => {
    const cell = (element as HTMLElement | null)?.closest?.<HTMLElement>(
      "[data-row][data-col]",
    );
    if (!cell || !scroller.current?.contains(cell)) return null;
    return { row: Number(cell.dataset.row), column: Number(cell.dataset.col) };
  };
  const activate = (row: number, column: number) =>
    setActive({
      row,
      column,
      rowKey: rowKey(row),
      columnKey: column < 0 ? null : columns[column].key,
    });
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const at = position(event.target);
    if (at && (at.row !== activeRow || at.column !== activeColumn))
      activate(at.row, at.column);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = position(event.target);
    if (!at) return;
    const viewport = scroller.current?.clientHeight ?? 0;
    const target = moveTarget(event.key, event.ctrlKey || event.metaKey, at, {
      rows: rowCount,
      columns: columns.length,
      page: Math.max(1, Math.floor(viewport / DEFAULT_ROW_HEIGHT) - 1),
    });
    if (!target) return;
    event.preventDefault();
    pendingFocus.current = true;
    activate(target.row, target.column);
    rowWindow.scrollToIndex(target.row, { align: "auto" });
    if (target.column >= 0)
      columnWindow.scrollToIndex(target.column, { align: "auto" });
  }

  const attributes = (row: number, column: number): CellAttributes => ({
    role: column < 0 ? "rowheader" : "gridcell",
    "aria-colindex": column + 2,
    tabIndex: row === activeRow && column === activeColumn ? 0 : -1,
    "data-row": row,
    "data-col": column,
  });
  const totalWidth = columnWindow.getTotalSize();
  return (
    <div
      ref={scroller}
      className="comparison-grid-scroller"
      role="grid"
      aria-label={label}
      aria-rowcount={rowCount}
      aria-colcount={columns.length + 1}
      data-mounted-rows={rowItems.length}
      data-mounted-columns={columnItems.length}
      onScroll={onScroll}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <div
        className="comparison-grid-canvas"
        style={{ height: rowWindow.getTotalSize(), width: totalWidth }}
      >
        {rowItems.map((row) => (
          <div
            key={row.key}
            role="row"
            aria-rowindex={row.index + 1}
            className={`comparison-grid-row ${row.index % 2 ? "odd" : "even"}`}
            data-index={row.index}
            style={{
              transform: `translateY(${row.start}px)`,
              height: row.size,
              width: totalWidth,
            }}
          >
            <div
              className="comparison-grid-leading"
              style={{ width: leadingWidth }}
            >
              {renderLeading(row.index, attributes(row.index, -1))}
            </div>
            {columnItems.map((column) => (
              <div
                key={column.key}
                className="comparison-grid-cell"
                style={{ left: column.start, width: column.size }}
              >
                {renderCell(
                  row.index,
                  column.index,
                  attributes(row.index, column.index),
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
