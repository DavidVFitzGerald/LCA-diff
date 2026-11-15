import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, KeyboardEvent, ReactNode, RefObject } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { STANDARD_ROW_HEIGHT as DEFAULT_ROW_HEIGHT } from "./geometry";
import { moveTarget, withIndex } from "./grid-model";
import type { IndexRange } from "./grid-model";
import type { CellAttributes } from "./SignedValueCell";
import "./grid.css";

const ROW_OVERSCAN = 6;
/** Loaded rows from the viewport top recorded as view anchors. */
const PIN_COUNT = 12;
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
function windowOf(
  range: { startIndex: number; endIndex: number } | null,
  overscan: number,
  count: number,
): IndexRange {
  if (!range || count <= 0) return null;
  return [
    Math.max(0, range.startIndex - overscan),
    Math.min(count - 1, range.endIndex + overscan),
  ];
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
  busy = false,
  locate,
  onAnchor,
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
  /** Data identity of a row, for keeping the tab stop on the same row. */
  rowKey: (index: number) => string;
  /** A changed row set is loading; the previous rows stay shown. */
  busy?: boolean;
  /**
   * Index of a row key in the shown rows: undefined while unknown (still
   * loading), null when absent. Enables anchoring the view on flows.
   */
  locate?: (key: string) => number | null | undefined;
  /** Reports the flows the view is anchored on, top first (see `pin`). */
  onAnchor?: (keys: readonly string[]) => void;
  heights: ReadonlyMap<number, number>;
  renderLeading: (index: number, cell: CellAttributes) => ReactNode;
  /**
   * `rowHeight` is the height the row has in this commit. A height from
   * `heights` reaches the row one commit later (see the resize effect), so
   * a cell must size itself from this value, not from its summary (#87).
   */
  renderCell: (
    index: number,
    column: number,
    cell: CellAttributes,
    rowHeight: number,
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
  // Whether keyboard focus belongs to the grid: set on focus, cleared when
  // focus moves elsewhere or the user presses outside. If its focused cell
  // unmounts (focus falls to the body), focus returns to the active cell.
  const ownsFocus = useRef(false);
  useEffect(() => {
    const press = (event: PointerEvent) => {
      if (!scroller.current?.contains(event.target as Node))
        ownsFocus.current = false;
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, []);

  // Resolve the active cell by key first, so reordering or new rows never
  // move the tab stop onto a different process or flow.
  const columnIndex = useMemo(
    () => new Map(columns.map((column, index) => [column.key, index])),
    [columns],
  );
  let activeRow = Math.min(active.row, rowCount - 1);
  const located = active.rowKey === null ? undefined : locate?.(active.rowKey);
  if (typeof located === "number") activeRow = located;
  else if (active.rowKey !== null && located !== null)
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

  // Rows are keyed by index: rows keep their order within a comparison, and
  // a loading row and its loaded data share one DOM node, so focus is kept.
  // Sizes cached for an index are corrected (scroll-anchored) as soon as
  // the row's summary arrives, so a changed selection never resets them.
  // No React Compiler runs in this build; virtualizer methods are used only here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowWindow = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scroller.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    rangeExtractor: (range) =>
      withIndex(defaultRangeExtractor(range), activeRow),
  });
  // The grid anchors the view on flows itself (see `pin`).
  rowWindow.shouldAdjustScrollPositionOnItemSizeChange = () => false;
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
  // Applied in a microtask after commit (still before paint): resizing an
  // item notifies the virtualizer synchronously, and React forbids that
  // flushSync inside a lifecycle method.
  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      for (const [index, height] of heights)
        if (index < rowCount) rowWindow.resizeItem(index, height);
      pinView.current();
    });
    return () => {
      cancelled = true;
    };
  }, [heights, rowCount, rowWindow]);

  const rowItems = rowWindow.getVirtualItems();

  // View anchoring (#23 QA D2–D4), in place of the virtualizer's own size
  // adjustment: after every scroll, the loaded rows from the viewport top
  // are recorded with their layout starts. Whenever the layout changes (a
  // new row set, corrected heights), the first recorded flow still present
  // is found and the view scrolls by exactly how far its start moved, so
  // rows added, removed or resized above never shift what is read, and a
  // scroll in progress is never undone. The owner is told the anchor flows
  // (`onAnchor`), so on a selection change it can keep the previous rows
  // shown until one of them is loaded in the new ones.
  const pins = useRef<{ key: string; start: number }[]>([]);
  const layout = () => {
    rowWindow.getVirtualItems();
    return rowWindow.measurementsCache;
  };
  const record = () => {
    const element = scroller.current;
    if (!element || !locate) return;
    const items = layout();
    const top = element.scrollTop;
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (items[middle].end <= top) low = middle + 1;
      else high = middle;
    }
    const found: { key: string; start: number }[] = [];
    for (
      let index = low;
      index < items.length &&
      found.length < PIN_COUNT &&
      items[index].start < top + element.clientHeight;
      index += 1
    ) {
      const key = rowKey(index);
      if (locate(key) === index) found.push({ key, start: items[index].start });
    }
    // No loaded row in view (rows still loading): keep the previous pins.
    if (found.length > 0) {
      pins.current = found;
      onAnchor?.(found.map((pinned) => pinned.key));
    }
  };
  const pin = () => {
    const element = scroller.current;
    if (!element || !locate) return;
    if (pins.current.length === 0) return record();
    const items = layout();
    let pending = false;
    for (const candidate of pins.current) {
      const index = locate(candidate.key);
      if (index === undefined) pending = true;
      if (typeof index !== "number" || !items[index]) continue;
      const delta = items[index].start - candidate.start;
      if (Math.abs(delta) >= 0.5)
        element.scrollTo({ top: element.scrollTop + delta });
      pins.current = pins.current.map((pinned) => {
        const at = locate(pinned.key);
        return typeof at === "number" && items[at]
          ? { ...pinned, start: items[at].start }
          : pinned;
      });
      return record();
    }
    // Every anchor flow is gone: anchor on what is in view now.
    if (!pending) record();
  };
  const pinView = useRef(pin);
  useLayoutEffect(() => {
    pinView.current = pin;
    pin();
  });
  const columnItems = columnWindow.getVirtualItems();
  // The viewport plus overscan, excluding the always-mounted active cell,
  // so a far-away tab stop never widens the data window.
  const mountedRows = windowOf(rowWindow.range, ROW_OVERSCAN, rowCount);
  const mountedColumns = windowOf(
    columnWindow.range,
    COLUMN_OVERSCAN,
    columns.length,
  );
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
    record();
  }

  useEffect(() => {
    // While the grid owns focus, focus follows the active cell: when its
    // node unmounts (focus falls to the body) or now shows another flow or
    // process (a row set or column change), it moves back to the active cell.
    const focused = document.activeElement as HTMLElement | null;
    const lost =
      ownsFocus.current &&
      (focused === null ||
        focused === document.body ||
        (scroller.current?.contains(focused) === true &&
          (Number(focused.dataset.row) !== activeRow ||
            Number(focused.dataset.col) !== activeColumn)));
    if (!pendingFocus.current && !lost) return;
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
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next && !scroller.current?.contains(next)) ownsFocus.current = false;
  }
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    ownsFocus.current = true;
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
      aria-busy={busy || undefined}
      data-mounted-rows={rowItems.length}
      data-mounted-columns={columnItems.length}
      onScroll={onScroll}
      onFocus={onFocus}
      onBlur={onBlur}
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
                  row.size,
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
