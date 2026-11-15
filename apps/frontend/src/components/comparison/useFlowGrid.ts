import { useEffect, useMemo } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
} from "@tanstack/react-query";
import { SERVICE_WINDOW, useServiceQueries } from "../../app/queries";
import type { SelectedProcess } from "../../app/selection";
import type {
  FlowCell,
  FlowRow,
  FlowRowSummary,
  RevisionSnapshot,
} from "../../services/contracts";
import { rowGeometry } from "./geometry";
import type { RowGeometry } from "./geometry";
import { tilesFor } from "./grid-model";
import type { IndexRange, Tile } from "./grid-model";

/** Rows fetched ahead of the mounted range before the next page is needed. */
const ROW_LOOKAHEAD = 25;

/** One revision per release, in release order, for the comparison snapshot. */
export function selectionSnapshot(
  entries: readonly SelectedProcess[],
): RevisionSnapshot {
  const byRelease = new Map<string, string>();
  for (const entry of entries)
    if (!byRelease.has(entry.release_id))
      byRelease.set(entry.release_id, entry.revision_id);
  return [...byRelease.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([release_id, revision_id]) => ({ release_id, revision_id }));
}

export interface FlowGridData {
  /** The comparison token: rows keep their order within one token. */
  readonly token: string | undefined;
  /** Total rows of the comparison; 0 while the first page loads. */
  readonly rowCount: number;
  readonly loading: boolean;
  /** A changed selection is loading; the previous comparison is shown. */
  readonly updating: boolean;
  readonly error: Error | null;
  row(index: number): FlowRow | undefined;
  /**
   * Index of a flow in the shown comparison: undefined while it may still
   * be in an unloaded page (pass it as `seekKey` to load on), null if absent.
   */
  locate(key: string): number | null | undefined;
  /** Whole-selection geometry once the row's summary has arrived. */
  geometry(index: number): RowGeometry | undefined;
  /** Row heights known from summaries, by row index. */
  readonly heights: ReadonlyMap<number, number>;
  /** Cell for a row and process id, once its tile has arrived. */
  cell(index: number, processId: string): FlowCell | undefined;
  /** Cell tiles currently observed (bounded by the mounted window). */
  readonly tiles: readonly Tile[];
  retry(): void;
}

/**
 * Windowed Flows data for the mounted grid range (#23, spec §6.4): cursor
 * row pages are loaded only up to the mounted rows, chart extrema per loaded
 * row page cover the whole selection, and cells are read as fixed tiles of
 * the mounted rows × columns. Tiles and summaries that leave the window lose
 * their observers, so in-flight reads are aborted by TanStack Query.
 */
export function useFlowGrid(
  entries: readonly SelectedProcess[],
  rows: IndexRange,
  columns: IndexRange,
  /** A flow to keep loading row pages for until found (view anchoring). */
  seekKey: string | null = null,
): FlowGridData {
  const queries = useServiceQueries();
  const snapshot = useMemo(() => selectionSnapshot(entries), [entries]);
  const processIds = useMemo(() => entries.map((entry) => entry.id), [entries]);
  // Rows and their extrema do not depend on column order: a canonical sorted
  // set keeps the comparison (and its token) across reorders (spec §9.1).
  const canonicalIds = useMemo(
    () => [...processIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    [processIds],
  );
  const pages = useInfiniteQuery({
    ...queries.flowRowPages({
      revision_snapshot: snapshot,
      process_ids: canonicalIds,
      limit: SERVICE_WINDOW,
    }),
    enabled: processIds.length > 0,
    // Keep showing the previous comparison while a changed selection loads:
    // no empty grid, no scroll reset, no lost focus (#23 QA D1).
    placeholderData: keepPreviousData,
  });
  // While the previous comparison is shown, read nothing with its token.
  const updating = pages.isPlaceholderData;
  const loadedPages = useMemo(() => pages.data?.pages ?? [], [pages.data]);
  const token = loadedPages[0]?.comparison_token;
  const rowCount = loadedPages[0]?.total_count ?? 0;
  const loadedRows = useMemo(
    () => loadedPages.flatMap((page) => page.items),
    [loadedPages],
  );

  const keyIndex = useMemo(
    () =>
      new Map<string, number>(
        loadedRows.map((row, index) => [row.row_key, index]),
      ),
    [loadedRows],
  );
  const seeking = seekKey !== null && !keyIndex.has(seekKey);
  const wantedEnd = rows ? rows[1] + ROW_LOOKAHEAD : 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = pages;
  useEffect(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isError &&
      !updating &&
      (loadedRows.length <= wantedEnd || seeking)
    )
      void fetchNextPage();
  }, [
    hasNextPage,
    isFetchingNextPage,
    isError,
    updating,
    loadedRows.length,
    wantedEnd,
    seeking,
    fetchNextPage,
  ]);

  // Summaries: one request per loaded row page that intersects the window.
  const summaryPages = useMemo(() => {
    if (!rows || !token || updating) return [];
    const result: number[] = [];
    for (let page = 0; page < loadedPages.length; page += 1) {
      const start = page * SERVICE_WINDOW;
      const end = start + loadedPages[page].items.length - 1;
      if (end >= rows[0] && start <= rows[1]) result.push(page);
    }
    return result;
  }, [rows, token, updating, loadedPages]);
  const summaries = useQueries({
    queries: summaryPages.map((page) =>
      queries.flowSummaries({
        revision_snapshot: snapshot,
        comparison_token: token!,
        process_ids: canonicalIds,
        row_keys: loadedPages[page].items.map((row) => row.row_key),
      }),
    ),
    combine: combineSummaries,
  });
  const summaryByKey = summaries.map;

  const tiles = useMemo(
    () =>
      token && !updating
        ? tilesFor(rows, columns, loadedRows.length, entries.length)
        : [],
    [token, updating, rows, columns, loadedRows.length, entries.length],
  );
  const cellResults = useQueries({
    queries: tiles.map((tile) =>
      queries.flowCellWindow({
        revision_snapshot: snapshot,
        comparison_token: token!,
        process_ids: processIds.slice(tile.columnStart, tile.columnEnd),
        row_keys: loadedRows
          .slice(tile.rowStart, tile.rowEnd)
          .map((row) => row.row_key),
      }),
    ),
    combine: combineCells,
  });
  const cells = cellResults.map;

  // Geometry and heights for every summarized loaded row.
  const { geometries, heights } = useMemo(() => {
    const geometries = new Map<number, RowGeometry>();
    const heights = new Map<number, number>();
    loadedRows.forEach((row, index) => {
      const summary = summaryByKey.get(row.row_key);
      if (!summary) return;
      const geometry = rowGeometry(summary);
      geometries.set(index, geometry);
      heights.set(index, geometry.rowHeight);
    });
    return { geometries, heights };
  }, [loadedRows, summaryByKey]);

  const failed = pages.error ?? summaries.error ?? cellResults.error ?? null;
  return {
    token,
    rowCount,
    loading: pages.isPending && processIds.length > 0,
    updating,
    error: failed,
    row: (index) => loadedRows[index],
    locate: (key) =>
      keyIndex.get(key) ??
      (updating || (hasNextPage && !isError) ? undefined : null),
    geometry: (index) => geometries.get(index),
    heights,
    cell: (index, processId) => {
      const row = loadedRows[index];
      return row && cells.get(JSON.stringify([row.row_key, processId]));
    },
    tiles,
    retry: () => {
      if (pages.error) void pages.refetch();
      summaries.retry();
      cellResults.retry();
    },
  };
}

interface Combined<T> {
  readonly map: ReadonlyMap<string, T>;
  readonly error: Error | null;
  retry(): void;
}
type Results<T> = readonly {
  readonly data?: T;
  readonly error: Error | null;
  refetch(): unknown;
}[];
function combined<T>(
  results: Results<unknown>,
  map: Map<string, T>,
): Combined<T> {
  return {
    map,
    error: results.find((result) => result.error)?.error ?? null,
    retry: () => {
      for (const result of results) if (result.error) void result.refetch();
    },
  };
}
/** Stable combiners, so maps are rebuilt only when query results change. */
function combineSummaries(
  results: Results<{ readonly summaries: readonly FlowRowSummary[] }>,
): Combined<FlowRowSummary> {
  const map = new Map<string, FlowRowSummary>();
  for (const result of results)
    for (const summary of result.data?.summaries ?? [])
      map.set(summary.row_key, summary);
  return combined(results, map);
}
function combineCells(
  results: Results<{ readonly cells: readonly FlowCell[] }>,
): Combined<FlowCell> {
  const map = new Map<string, FlowCell>();
  for (const result of results)
    for (const cell of result.data?.cells ?? [])
      map.set(JSON.stringify([cell.row_key, cell.process_id]), cell);
  return combined(results, map);
}
