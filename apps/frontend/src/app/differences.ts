import { createContext, createElement, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useSelection } from "./selection";

export type DifferencesTab = "flows" | "scores";
type Toggles = Readonly<Record<DifferencesTab, boolean>>;
const OFF: Toggles = Object.freeze({ flows: false, scores: false });

export interface DifferencesToggle {
  /** Two or more selected processes (spec §6.7). */
  readonly available: boolean;
  /** Effective state: never on while unavailable. */
  readonly on: boolean;
  set(on: boolean): void;
}
interface DifferencesState {
  readonly toggles: Toggles;
  readonly available: boolean;
  set(tab: DifferencesTab, on: boolean): void;
}
const DifferencesContext = createContext<DifferencesState | null>(null);

/**
 * Independent per-tab "Show differences only" toggles (#30, spec §6.7). They
 * start off, live above both tab panels so tab switches keep them, and reset
 * to off when fewer than two processes remain. In-memory only: browser
 * persistence is post-MVP (ADR 0006, #31); an account change remounts the
 * workspace and therefore starts them off again.
 */
export function DifferencesProvider({ children }: { children: ReactNode }) {
  const { entries } = useSelection();
  const available = entries.length >= 2;
  const [toggles, setToggles] = useState<Toggles>(OFF);
  // Reset during render (React's adjust-state pattern): no commit ever shows
  // an enabled toggle state for a selection below two processes.
  if (!available && toggles !== OFF) setToggles(OFF);
  const value: DifferencesState = {
    toggles,
    available,
    set: (tab, on) => {
      if (on && !available) return;
      setToggles((current) =>
        current[tab] === on ? current : { ...current, [tab]: on },
      );
    },
  };
  return createElement(DifferencesContext.Provider, { value }, children);
}

export function useDifferences(tab: DifferencesTab): DifferencesToggle {
  const context = useContext(DifferencesContext);
  if (!context) throw new Error("useDifferences requires DifferencesProvider");
  return {
    available: context.available,
    on: context.available && context.toggles[tab],
    set: (on) => context.set(tab, on),
  };
}
