import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  Indicator,
  IndicatorId,
  IndicatorTree,
} from "../services/contracts";
import { useServiceQueries } from "./queries";

/** Workbook order is metadata, independent of hierarchy labels or click order. */
function orderedIndicators(tree: IndicatorTree): readonly Indicator[] {
  return tree.methods
    .flatMap((method) => [
      ...method.indicators,
      ...method.categories.flatMap((category) => category.indicators),
    ])
    .sort((a, b) => a.source_order - b.source_order);
}

import { IndicatorContext } from "./indicator-context";

/** Mounted in the UID-keyed workspace, including while Flows is active. */
export function IndicatorProvider({ children }: { children: ReactNode }) {
  const queries = useServiceQueries();
  const releases = useQuery(queries.releases());
  const snapshot = (releases.data?.items ?? []).map((release) => ({
    release_id: release.release_id,
    revision_id: release.revision_id,
  }));
  const options = queries.indicatorTree({ revision_snapshot: snapshot });
  const query = useQuery({
    ...options,
    enabled: options.enabled && snapshot.length > 0,
  });
  // A successful empty response or a failed refresh must not erase choices.
  // Publication/stale-ID reconciliation is deliberately reserved for #32.
  const [selection, setSelection] = useState<{
    initialized: boolean;
    ids: readonly IndicatorId[];
    order: readonly IndicatorId[];
    observed: IndicatorTree | undefined;
  }>({ initialized: false, ids: [], order: [], observed: undefined });
  const tree = query.data;
  if (tree && tree !== selection.observed) {
    const order = orderedIndicators(tree).map(({ id }) => id);
    setSelection({
      initialized: selection.initialized || order.length > 0,
      ids: selection.initialized
        ? selection.ids
        : order.filter((id) => tree.default_indicator_ids.includes(id)),
      order: order.length ? order : selection.order,
      observed: tree,
    });
    // Do not discard IDs during transient empty responses. Reconciliation is #32.
  }
  function toggle(ids: readonly IndicatorId[]) {
    setSelection((previous) => {
      const chosen = new Set(previous.ids);
      const remove = ids.every((id) => chosen.has(id));
      ids.forEach((id) => (remove ? chosen.delete(id) : chosen.add(id)));
      return {
        ...previous,
        ids: previous.order.filter((id) => chosen.has(id)),
      };
    });
  }
  return (
    <IndicatorContext.Provider
      value={{
        ids: selection.ids,
        tree,
        loading: releases.isFetching || query.isFetching,
        error: releases.isError || query.isError,
        retry() {
          if (releases.isError || !snapshot.length) void releases.refetch();
          else void query.refetch();
        },
        toggle,
      }}
    >
      {children}
    </IndicatorContext.Provider>
  );
}
