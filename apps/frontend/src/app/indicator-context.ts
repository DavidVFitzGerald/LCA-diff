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
