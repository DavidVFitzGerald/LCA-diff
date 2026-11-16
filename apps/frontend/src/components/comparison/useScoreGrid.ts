import { useEffect, useMemo, useState } from "react";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueries,
} from "@tanstack/react-query";
import { SERVICE_WINDOW, useServiceQueries } from "../../app/queries";
import type { SelectedProcess } from "../../app/selection";
import type {
  ComparisonPage,
  ScoreCell,
  Indicator,
  ScoreRowSummary,
} from "../../services/contracts";
import { rowGeometry } from "./geometry";
import type { RowGeometry } from "./geometry";
import { tilesFor } from "./grid-model";
import type { IndexRange, Tile } from "./grid-model";

/** Rows fetched ahead of the mounted range before the next page is needed. */
const ROW_LOOKAHEAD = 25;

import { selectionSnapshot } from "./useFlowGrid";

export interface ScoreGridData {
  /** The comparison token: rows keep their order within one token. */
  readonly token: string | undefined;
  /** Total rows of the comparison; 0 while the first page loads. */
  readonly rowCount: number;
  readonly loading: boolean;
  /** A changed selection is loading; the previous comparison is shown. */
  readonly updating: boolean;
  /**
   * The previous comparison is shown in place of the selected one: while it
   * loads (`updating`) or while the hold is paused by a row-page error.
   */
  readonly busy: boolean;
  readonly error: Error | null;
  row(index: number): Indicator | undefined;
  /**
   * Index of an indicator in the shown comparison: undefined while it may still
   * be in an unloaded page or a changed selection is loading, null if absent.
   */
  locate(key: string): number | null | undefined;
  /** Whole-selection geometry once the row's summary has arrived. */
  geometry(index: number): RowGeometry | undefined;
  /** Row heights known from summaries, by row index. */
  readonly heights: ReadonlyMap<number, number>;
  /** Cell for a row and process id, once its tile has arrived. */
  cell(index: number, processId: string): ScoreCell | undefined;
  /** Cell tiles currently observed (bounded by the mounted window). */
  readonly tiles: readonly Tile[];
  retry(): void;
}

/**
 * Windowed Scores data for the mounted grid range (#28, spec §6.5): cursor
 * row pages are loaded only up to the mounted rows, chart extrema per loaded
 * row page cover the whole selection, and cells are read as fixed tiles of
 * the mounted rows × columns. Tiles and summaries that leave the window lose
 * their observers, so in-flight reads are aborted by TanStack Query.
 */
export function useScoreGrid(
  entries: readonly SelectedProcess[],
  indicatorIds: readonly string[],
  rows: IndexRange,
  columns: IndexRange,
  /**
   * The indicators the view is anchored on (read when a selection changes): the
   * previous comparison stays shown until one is loaded in the new one.
   */
  anchorKeys: () => readonly string[] = () => [],
): ScoreGridData {
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
    ...queries.scoreRowPages({
      revision_snapshot: snapshot,
      process_ids: canonicalIds,
      indicator_ids: [...indicatorIds].sort(),
      limit: SERVICE_WINDOW,
    }),
    enabled: processIds.length > 0 && indicatorIds.length > 0,
    // Keep showing the previous comparison while a changed selection loads:
    // no empty grid, no scroll reset, no lost focus (#23 QA D1).
    placeholderData: keepPreviousData,
  });
  const placeholder = pages.isPlaceholderData;
  const freshPages = useMemo(() => pages.data?.pages ?? [], [pages.data]);
  const freshRows = useMemo(
    () => freshPages.flatMap((page) => page.items),
    [freshPages],
  );
  const freshIndex = useMemo(() => indexRows(freshRows), [freshRows]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage, isError } = pages;

  // View anchoring (#23 QA D2): when the selection changes, the previous
  // comparison stays shown (busy, reading nothing) until one of the anchor
  // indicators is loaded in the new one, or no pages remain. The grid then puts
  // that indicator back in place in the same layout pass, so the new rows never
  // appear at a stale scroll position. A row-page error pauses the hold
  // rather than ending it (#69): the partial new comparison is never shown,
  // and once Retry succeeds the seek resumes.
  const [previous, setPrevious] = useState<Shown | null>(null);
  const anchors = previous && !placeholder ? anchorKeys() : [];
  const holding =
    !placeholder &&
    previous !== null &&
    freshPages[0]?.comparison_token !== previous.token &&
    anchors.some((key) => previous.index.has(key)) &&
    !anchors.some((key) => freshIndex.has(key)) &&
    hasNextPage;
  const seeking = holding && !isError;
  const updating = placeholder || seeking;
  const busy = placeholder || holding;
  const fresh = useMemo<Shown>(
    () => ({
      token: freshPages[0]?.comparison_token,
      rowCount: freshPages[0]?.total_count ?? 0,
      pages: freshPages,
      rows: freshRows,
      index: freshIndex,
    }),
    [freshPages, freshRows, freshIndex],
  );
  // Remember the shown comparison (React's "previous render" pattern).
  if (!busy && fresh.token !== undefined && previous !== fresh)
    setPrevious(fresh);
  const shown = busy && previous ? previous : fresh;
  const { token, rowCount, rows: loadedRows, index: keyIndex } = shown;
  const loadedPages = shown.pages;
  const wantedEnd = rows ? rows[1] + ROW_LOOKAHEAD : 0;
  useEffect(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      !isError &&
      !placeholder &&
      (seeking || freshRows.length <= wantedEnd)
    )
      void fetchNextPage();
  }, [
    hasNextPage,
    isFetchingNextPage,
    isError,
    placeholder,
    freshRows.length,
    wantedEnd,
    seeking,
    fetchNextPage,
  ]);

  // Summaries: one request per loaded row page that intersects the window.
  const summaryPages = useMemo(() => {
    if (!rows || !token || busy) return [];
    const result: number[] = [];
    for (let page = 0; page < loadedPages.length; page += 1) {
      const start = page * SERVICE_WINDOW;
      const end = start + loadedPages[page].items.length - 1;
      if (end >= rows[0] && start <= rows[1]) result.push(page);
    }
    return result;
  }, [rows, token, busy, loadedPages]);
  const summaries = useQueries({
    queries: summaryPages.map((page) =>
      queries.scoreSummaries({
        revision_snapshot: snapshot,
        comparison_token: token!,
        process_ids: canonicalIds,
        indicator_ids: loadedPages[page].items.map((row) => row.id),
      }),
    ),
    combine: combineSummaries,
  });
  const summaryByKey = summaries.map;

  const tiles = useMemo(
    () =>
      token && !busy
        ? tilesFor(rows, columns, loadedRows.length, entries.length)
        : [],
    [token, busy, rows, columns, loadedRows.length, entries.length],
  );
  const cellResults = useQueries({
    queries: tiles.map((tile) =>
      queries.scoreCellWindow({
        revision_snapshot: snapshot,
        comparison_token: token!,
        process_ids: processIds.slice(tile.columnStart, tile.columnEnd),
        indicator_ids: loadedRows
          .slice(tile.rowStart, tile.rowEnd)
          .map((row) => row.id),
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
      const summary = summaryByKey.get(row.id);
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
    busy,
    error: failed,
    row: (index) => loadedRows[index],
    // A failed page is still unfetched: its indicators are unknown, not absent,
    // so the grid keeps its anchors through the error (#69).
    locate: (key) =>
      keyIndex.get(key) ?? (busy || hasNextPage ? undefined : null),
    geometry: (index) => geometries.get(index),
    heights,
    cell: (index, processId) => {
      const row = loadedRows[index];
      return row && cells.get(JSON.stringify([row.id, processId]));
    },
    tiles,
    retry: () => {
      if (pages.error) void pages.refetch();
      summaries.retry();
      cellResults.retry();
    },
  };
}

interface Shown {
  readonly token: string | undefined;
  readonly rowCount: number;
  readonly pages: readonly ComparisonPage<Indicator>[];
  readonly rows: readonly Indicator[];
  readonly index: ReadonlyMap<string, number>;
}
function indexRows(rows: readonly Indicator[]): ReadonlyMap<string, number> {
  return new Map<string, number>(rows.map((row, index) => [row.id, index]));
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
  results: Results<{ readonly summaries: readonly ScoreRowSummary[] }>,
): Combined<ScoreRowSummary> {
  const map = new Map<string, ScoreRowSummary>();
  for (const result of results)
    for (const summary of result.data?.summaries ?? [])
      map.set(summary.indicator_id, summary);
  return combined(results, map);
}
function combineCells(
  results: Results<{ readonly cells: readonly ScoreCell[] }>,
): Combined<ScoreCell> {
  const map = new Map<string, ScoreCell>();
  for (const result of results)
    for (const cell of result.data?.cells ?? [])
      map.set(JSON.stringify([cell.indicator_id, cell.process_id]), cell);
  return combined(results, map);
}
