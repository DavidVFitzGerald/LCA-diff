import { createContext, useContext } from "react";
import type { IndicatorId, IndicatorTree } from "../services/contracts";

export interface IndicatorSelection {
  readonly ids: readonly IndicatorId[];
  readonly tree: IndicatorTree | undefined;
  readonly loading: boolean;
  readonly error: boolean;
  retry(): void;
  toggle(ids: readonly IndicatorId[]): void;
}
export const IndicatorContext = createContext<IndicatorSelection | null>(null);

export function useIndicators() {
  const context = useContext(IndicatorContext);
  if (!context) throw new Error("useIndicators requires IndicatorProvider");
  return context;
}

/**
 * Selected indicators of the selected processes' releases, in selection
 * order (#107). Indicators are release-native (spec §6.5); the API scopes
 * them to the comparison's revision snapshot, and cross-release mapping is
 * post-MVP (§10.3). IDs not in the tree are kept for #32's reconciliation.
 */
export function scopedIndicatorIds(
  tree: IndicatorTree | undefined,
  ids: readonly IndicatorId[],
  releaseIds: ReadonlySet<string>,
): readonly IndicatorId[] {
  if (!tree) return ids;
  const release = new Map(
    tree.methods
      .flatMap((method) => [
        ...method.indicators,
        ...method.categories.flatMap((category) => category.indicators),
      ])
      .map((indicator) => [indicator.id, indicator.release_id]),
  );
  return ids.filter((id) => {
    const owner = release.get(id);
    return owner === undefined || releaseIds.has(owner);
  });
}
