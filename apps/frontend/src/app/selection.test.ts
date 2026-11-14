import { describe, expect, it, vi } from "vitest";
import { createSelectionStore, selectionKey } from "./selection";
import type { SelectedProcess } from "./selection";

const entry = (
  id: string,
  name = `Process ${id}`,
  release_id = "r1",
): SelectedProcess => ({
  release_id,
  revision_id: `${release_id}-rev`,
  id,
  name,
  geography: "CH",
});
const ids = (entries: readonly SelectedProcess[]) =>
  entries.map((e) => `${e.release_id}/${e.id}`);

describe("ordered selection store", () => {
  it("appends in selection order, ignores repeats and reappends after removal", () => {
    const store = createSelectionStore();
    store.select(entry("c"));
    store.select(entry("a"));
    store.select(entry("b"));
    store.select(entry("a"));
    expect(ids(store.getSnapshot())).toEqual(["r1/c", "r1/a", "r1/b"]);
    store.deselect(selectionKey(entry("a")));
    expect(store.isSelected(selectionKey(entry("a")))).toBe(false);
    store.select(entry("a"));
    expect(ids(store.getSnapshot())).toEqual(["r1/c", "r1/b", "r1/a"]);
  });

  it("keeps rapid toggles consistent and treats the same ID in two releases as distinct", () => {
    const store = createSelectionStore();
    for (let i = 0; i < 101; i += 1) store.toggle(entry("x"));
    expect(ids(store.getSnapshot())).toEqual(["r1/x"]);
    store.toggle(entry("x", "Same", "r2"));
    store.toggle(entry("y", "Same"));
    expect(ids(store.getSnapshot())).toEqual(["r1/x", "r2/x", "r1/y"]);
    store.toggle(entry("x"));
    expect(ids(store.getSnapshot())).toEqual(["r2/x", "r1/y"]);
  });

  it("publishes immutable snapshots whose identity changes only on change", () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const empty = store.getSnapshot();
    store.clear();
    store.deselect("missing");
    store.move("missing", 0);
    expect(store.getSnapshot()).toBe(empty);
    expect(listener).not.toHaveBeenCalled();
    const source = entry("a");
    store.select(source);
    const one = store.getSnapshot();
    expect(one).not.toBe(empty);
    expect(Object.isFrozen(one)).toBe(true);
    expect(Object.isFrozen(one[0])).toBe(true);
    (source as { name: string }).name = "mutated";
    expect(one[0].name).toBe("Process a");
    store.select(entry("a"));
    expect(store.getSnapshot()).toBe(one);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("moves an entry within the order for later column reordering", () => {
    const store = createSelectionStore();
    ["a", "b", "c", "d"].forEach((id) => store.select(entry(id)));
    store.move(selectionKey(entry("a")), 2);
    expect(ids(store.getSnapshot())).toEqual(["r1/b", "r1/c", "r1/a", "r1/d"]);
    store.move(selectionKey(entry("d")), -5);
    expect(ids(store.getSnapshot())).toEqual(["r1/d", "r1/b", "r1/c", "r1/a"]);
    store.move(selectionKey(entry("d")), 99);
    expect(ids(store.getSnapshot())).toEqual(["r1/b", "r1/c", "r1/a", "r1/d"]);
  });

  it("clears every entry and has no selection cap", () => {
    const store = createSelectionStore();
    for (let i = 0; i < 5000; i += 1) store.select(entry(`p${i}`));
    expect(store.getSnapshot()).toHaveLength(5000);
    store.clear();
    expect(store.getSnapshot()).toEqual([]);
    expect(store.isSelected(selectionKey(entry("p1")))).toBe(false);
  });
});
