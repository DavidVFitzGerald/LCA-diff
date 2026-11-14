import {
  createContext,
  createElement,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { ProcessId, ReleaseId, RevisionId } from "../services/contracts";

/**
 * One selected process (#18, D1). Name and geography are in-memory display
 * data captured where the process was selected, so entries outside the loaded
 * or visible tree still render; F5 restore will fill them from `headers`.
 */
export interface SelectedProcess {
  readonly release_id: ReleaseId;
  readonly revision_id: RevisionId;
  readonly id: ProcessId;
  readonly name: string;
  readonly geography: string;
  /** Category path, for scope-relative parent checkbox state (#19). */
  readonly path: readonly string[];
}
export const selectionKey = (entry: {
  readonly release_id: ReleaseId;
  readonly id: ProcessId;
}) => JSON.stringify([entry.release_id, entry.id]);

export interface SelectionStore {
  /** Ordered, immutable snapshot; its identity changes only on change. */
  getSnapshot(): readonly SelectedProcess[];
  subscribe(listener: () => void): () => void;
  isSelected(key: string): boolean;
  /** Appends when absent; selecting again is a no-op. */
  select(entry: SelectedProcess): void;
  deselect(key: string): void;
  /** Appends absent entries in the given order with one notification. */
  selectMany(entries: readonly SelectedProcess[]): void;
  /** Removes every listed key with one notification. */
  deselectMany(keys: Iterable<string>): void;
  toggle(entry: SelectedProcess): void;
  clear(): void;
  /** Moves an entry to an index of the current order (F4 column reorder). */
  move(key: string, toIndex: number): void;
}

/** In-memory ordered selection with no product cap and no persistence (D7). */
const freeze = (entry: SelectedProcess): SelectedProcess =>
  Object.freeze({ ...entry, path: Object.freeze([...entry.path]) });

export function createSelectionStore(): SelectionStore {
  let entries: readonly SelectedProcess[] = [];
  let keys = new Set<string>();
  const listeners = new Set<() => void>();
  const commit = (
    next: readonly SelectedProcess[],
    nextKeys = new Set(next.map(selectionKey)),
  ) => {
    entries = Object.freeze(next);
    keys = nextKeys;
    listeners.forEach((listener) => listener());
  };
  const store: SelectionStore = {
    getSnapshot: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    isSelected: (key) => keys.has(key),
    select(entry) {
      const key = selectionKey(entry);
      if (keys.has(key)) return;
      // Appends reuse the key set: O(1) per key instead of re-deriving all keys.
      keys.add(key);
      commit([...entries, freeze(entry)], keys);
    },
    selectMany(added) {
      const fresh: SelectedProcess[] = [];
      for (const entry of added) {
        const key = selectionKey(entry);
        if (keys.has(key)) continue;
        keys.add(key);
        fresh.push(freeze(entry));
      }
      if (fresh.length) commit([...entries, ...fresh], keys);
    },
    deselectMany(removed) {
      const drop = new Set([...removed].filter((key) => keys.has(key)));
      if (drop.size)
        commit(entries.filter((entry) => !drop.has(selectionKey(entry))));
    },
    deselect(key) {
      if (!keys.has(key)) return;
      commit(entries.filter((entry) => selectionKey(entry) !== key));
    },
    toggle(entry) {
      const key = selectionKey(entry);
      if (keys.has(key)) store.deselect(key);
      else store.select(entry);
    },
    clear() {
      if (entries.length) commit([]);
    },
    move(key, toIndex) {
      const from = entries.findIndex((entry) => selectionKey(entry) === key);
      if (from < 0) return;
      const to = Math.max(0, Math.min(toIndex, entries.length - 1));
      if (from === to) return;
      const next = [...entries];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      commit(next);
    },
  };
  return store;
}

const SelectionContext = createContext<SelectionStore | null>(null);

/** Mounted inside the UID-keyed workspace, so signout or account change discards it. */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSelectionStore);
  return createElement(SelectionContext.Provider, { value: store }, children);
}

export function useSelectionStore(): SelectionStore {
  const store = useContext(SelectionContext);
  if (!store) throw new Error("useSelection requires a SelectionProvider");
  return store;
}
/** The shared ordered selection and its controller. */
export function useSelection() {
  const store = useSelectionStore();
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { entries, store };
}
