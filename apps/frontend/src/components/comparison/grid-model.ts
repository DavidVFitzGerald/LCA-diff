/**
 * Pure bookkeeping for the windowed comparison grid (#23, spec §§6.3–6.4):
 * cell tiles, the bounded sticky identifying block and keyboard targets.
 */

/**
 * Cell windows are requested as fixed tiles of rows × process columns, so a
 * scroll position maps to a few stable, cacheable windows and windows that
 * leave the viewport lose their observers and are cancelled.
 */
export const CELL_TILE = { rows: 50, columns: 20 } as const;

export interface Tile {
  readonly rowStart: number;
  /** Exclusive. */
  readonly rowEnd: number;
  readonly columnStart: number;
  /** Exclusive. */
  readonly columnEnd: number;
}

/** Inclusive index range; `null` when nothing is mounted on that axis. */
export type IndexRange = readonly [number, number] | null;

/** Tiles covering the mounted rows × columns, clipped to the loaded rows. */
export function tilesFor(
  rows: IndexRange,
  columns: IndexRange,
  loadedRows: number,
  columnCount: number,
  tile: { readonly rows: number; readonly columns: number } = CELL_TILE,
): Tile[] {
  if (!rows || !columns || loadedRows <= 0 || columnCount <= 0) return [];
  const lastRow = Math.min(rows[1], loadedRows - 1);
  const lastColumn = Math.min(columns[1], columnCount - 1);
  if (rows[0] > lastRow || columns[0] > lastColumn) return [];
  const result: Tile[] = [];
  for (
    let row = Math.floor(rows[0] / tile.rows) * tile.rows;
    row <= lastRow;
    row += tile.rows
  )
    for (
      let column = Math.floor(columns[0] / tile.columns) * tile.columns;
      column <= lastColumn;
      column += tile.columns
    )
      result.push({
        rowStart: row,
        rowEnd: Math.min(row + tile.rows, loadedRows),
        columnStart: column,
        columnEnd: Math.min(column + tile.columns, columnCount),
      });
  return result;
}

/** Bounds of the sticky identifying block: a share of the grid, clamped. */
export const LEADING_BOUNDS = { min: 300, max: 560, share: 0.36 } as const;

/**
 * Width of the bounded sticky identifying block (spec §6.3): never seven
 * unconstrained columns, never the whole grid when sidebars are open.
 */
export function leadingWidth(
  available: number,
  bounds: { min: number; max: number; share: number } = LEADING_BOUNDS,
): number {
  if (!(available > 0)) return bounds.min;
  return Math.round(
    Math.min(bounds.max, Math.max(bounds.min, available * bounds.share)),
  );
}

/** Active grid position; column -1 is the row's identifying header. */
export interface GridPosition {
  readonly row: number;
  readonly column: number;
}

/**
 * Target of a navigation key, or null when the key is not a grid key or the
 * move would leave the grid. Arrows move one cell; Home/End go to the row's
 * first/last cell (with Ctrl, the first/last row); PageUp/PageDown move by
 * `page` rows.
 */
export function moveTarget(
  key: string,
  ctrl: boolean,
  from: GridPosition,
  size: { rows: number; columns: number; page: number },
): GridPosition | null {
  if (size.rows <= 0) return null;
  const lastRow = size.rows - 1;
  const lastColumn = size.columns - 1;
  const clampRow = (row: number) => Math.min(lastRow, Math.max(0, row));
  let target: GridPosition;
  switch (key) {
    case "ArrowUp":
      target = { ...from, row: from.row - 1 };
      break;
    case "ArrowDown":
      target = { ...from, row: from.row + 1 };
      break;
    case "ArrowLeft":
      target = { ...from, column: from.column - 1 };
      break;
    case "ArrowRight":
      target = { ...from, column: from.column + 1 };
      break;
    case "Home":
      target = ctrl ? { row: 0, column: -1 } : { ...from, column: -1 };
      break;
    case "End":
      target = ctrl
        ? { row: lastRow, column: lastColumn }
        : { ...from, column: lastColumn };
      break;
    case "PageUp":
      target = { ...from, row: clampRow(from.row - Math.max(1, size.page)) };
      break;
    case "PageDown":
      target = { ...from, row: clampRow(from.row + Math.max(1, size.page)) };
      break;
    default:
      return null;
  }
  if (
    target.row < 0 ||
    target.row > lastRow ||
    target.column < -1 ||
    target.column > lastColumn
  )
    return null;
  return target;
}

/** Add an always-mounted index (the active cell) to a sorted window. */
export function withIndex(indexes: number[], keep: number): number[] {
  if (keep < 0 || indexes.includes(keep)) return indexes;
  return [...indexes, keep].sort((a, b) => a - b);
}
