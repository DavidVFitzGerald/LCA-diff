/**
 * Split one visible (rows × processes) window into transport batches (#20,
 * spec §7.1). Batches bound each request, never the number of selected
 * processes: every requested pair appears in exactly one batch.
 */
export interface CellBatch<Row extends string> {
  readonly row_keys: readonly Row[];
  readonly process_ids: readonly string[];
}
export function cellBatches<Row extends string>(
  rowKeys: readonly Row[],
  processIds: readonly string[],
  limits: { readonly window: number; readonly cells: number },
): CellBatch<Row>[] {
  const { window, cells } = limits;
  if (
    ![window, cells].every((value) => Number.isSafeInteger(value) && value > 0)
  )
    throw new TypeError("Invalid transport limits");
  const rows = [...new Set(rowKeys)];
  const processes = [...new Set(processIds)];
  if (!rows.length || !processes.length) return [];
  const rowSize = Math.min(rows.length, window, cells);
  const processSize = Math.min(
    window,
    Math.max(1, Math.floor(cells / rowSize)),
  );
  const batches: CellBatch<Row>[] = [];
  for (let r = 0; r < rows.length; r += rowSize)
    for (let p = 0; p < processes.length; p += processSize)
      batches.push({
        row_keys: rows.slice(r, r + rowSize),
        process_ids: processes.slice(p, p + processSize),
      });
  return batches;
}
