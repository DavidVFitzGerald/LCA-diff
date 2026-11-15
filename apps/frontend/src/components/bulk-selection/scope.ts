import type { SelectedProcess } from "../../app/selection";
import type { ProcessHeader } from "../../services/contracts";

export type CheckState = "true" | "false" | "mixed";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Bulk append order (spec §6.3): process name, then geography, then ID. */
export function bulkOrder(a: ProcessHeader, b: ProcessHeader): number {
  return (
    compare(a.name.toLowerCase(), b.name.toLowerCase()) ||
    compare(a.geography.toLowerCase(), b.geography.toLowerCase()) ||
    compare(a.id, b.id)
  );
}

export const scopeKey = (release_id: string, path: readonly string[]) =>
  JSON.stringify([release_id, ...path]);

/**
 * Selected entries per (release, path prefix), optionally limited to entries
 * known to be in the current actionable scope (D5).
 */
export function selectedByScope(
  entries: readonly SelectedProcess[],
  inScope?: (entry: SelectedProcess) => boolean,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (inScope && !inScope(entry)) continue;
    for (let depth = 0; depth <= entry.path.length; depth += 1) {
      const key = scopeKey(entry.release_id, entry.path.slice(0, depth));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** Parent checkbox state relative to the exact actionable scope size. */
export function checkState(
  scopeSize: number | null,
  selected: number,
): CheckState {
  if (!scopeSize || selected === 0) return "false";
  return selected >= scopeSize ? "true" : "mixed";
}
