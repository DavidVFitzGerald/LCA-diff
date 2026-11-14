import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ServiceQueryError, useServiceQueries } from "../../app/queries";
import { selectionKey } from "../../app/selection";
import type { SelectedProcess } from "../../app/selection";
import type { ProcessHeader, RevisionRef } from "../../services/contracts";

export interface SelectionHeaders {
  /** Loaded headers by selection key; may lag new selections while loading. */
  readonly headers: ReadonlyMap<string, ProcessHeader>;
  /** Every selected process has its current header. */
  readonly complete: boolean;
  readonly error: ServiceQueryError | null;
  retry(): void;
}

/**
 * Bulk headers for the canonical ordered selection (#21). It owns no order:
 * callers render `entries` in selection order and look headers up by key.
 * One order-independent query per selected revision.
 */
export function useSelectionHeaders(
  entries: readonly SelectedProcess[],
): SelectionHeaders {
  const queries = useServiceQueries();
  const client = useQueryClient();
  const groups = useMemo(() => {
    const byRevision = new Map<
      string,
      { revision: RevisionRef; ids: string[] }
    >();
    for (const entry of entries) {
      const key = JSON.stringify([entry.release_id, entry.revision_id]);
      let group = byRevision.get(key);
      if (!group) {
        group = {
          revision: {
            release_id: entry.release_id,
            revision_id: entry.revision_id,
          },
          ids: [],
        };
        byRevision.set(key, group);
      }
      group.ids.push(entry.id);
    }
    return [...byRevision.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, group]) => group);
  }, [entries]);
  return useQueries({
    queries: groups.map(({ revision, ids }) =>
      queries.selectionHeaders(revision, ids, client),
    ),
    combine: (results) => {
      const headers = new Map<string, ProcessHeader>();
      results.forEach((result, index) => {
        // A failed read has no data and no placeholder (placeholders apply
        // only while pending), so keep the validated headers already cached:
        // loaded columns and known differences survive the failure (#21 D1).
        const { revision, ids } = groups[index];
        for (const header of result.data ??
          queries.cachedHeaders(client, revision, ids))
          headers.set(selectionKey(header), header);
      });
      const failed = results.find((result) => result.error)?.error;
      return {
        headers,
        complete: results.every(
          (result) => result.isSuccess && !result.isPlaceholderData,
        ),
        error:
          failed instanceof ServiceQueryError
            ? failed
            : failed
              ? new ServiceQueryError({
                  code: "TEMPORARILY_UNAVAILABLE",
                  message: "Process details could not be loaded",
                  request_id: "selection-headers",
                  retryable: true,
                })
              : null,
        retry: () => {
          for (const result of results) if (result.error) void result.refetch();
        },
      };
    },
  });
}
