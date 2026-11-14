import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useServiceQueries } from "../../app/queries";
import { selectionKey, useSelection } from "../../app/selection";
import type { SelectedProcess } from "../../app/selection";
import "./selected-processes.css";

export const SELECTED_ROW_HEIGHT = 36;
const OVERSCAN = 6;

const label = (entry: SelectedProcess) => `${entry.name} — ${entry.geography}`;

/** Accessible remove-button names, disambiguated for duplicate labels (D4). */
function removeNames(
  entries: readonly SelectedProcess[],
  releaseName: (entry: SelectedProcess) => string,
): string[] {
  const count = (values: string[]) => {
    const totals = new Map<string, number>();
    values.forEach((v) => totals.set(v, (totals.get(v) ?? 0) + 1));
    return totals;
  };
  const base = entries.map(label);
  const baseCount = count(base);
  const withRelease = entries.map((entry, index) =>
    baseCount.get(base[index])! > 1
      ? `${base[index]} (${releaseName(entry)})`
      : base[index],
  );
  const releaseCount = count(withRelease);
  return withRelease.map((name, index) => {
    const unique =
      releaseCount.get(name)! > 1 ? `${name} (item ${index + 1})` : name;
    return `Remove ${unique} from selection`;
  });
}

export function SelectedProcesses() {
  const { entries, store } = useSelection();
  const queries = useServiceQueries();
  const releases = useQuery(queries.releases()).data?.items;
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>()).current;
  const listFocused = useRef(false);
  const scrollTarget = useRef<string | null>(null);
  const focusEmpty = useRef(false);

  const keys = useMemo(() => entries.map(selectionKey), [entries]);
  const index = useMemo(
    () => new Map(keys.map((key, position) => [key, position])),
    [keys],
  );
  const releaseName = (entry: SelectedProcess) => {
    const release = releases?.find((r) => r.release_id === entry.release_id);
    return release
      ? `${release.display_name} ${release.version}`
      : entry.release_id;
  };
  const names = removeNames(entries, releaseName);
  const effective =
    active !== null && index.has(active) ? active : (keys[0] ?? null);
  const activeIndex = effective === null ? -1 : index.get(effective)!;

  // No React Compiler runs in this build; virtualizer methods are used only here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => SELECTED_ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (position) => keys[position],
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !visible.includes(activeIndex))
        return [...visible, activeIndex].sort((a, b) => a - b);
      return visible;
    },
  });

  useEffect(() => {
    if (focusEmpty.current && entries.length === 0) {
      focusEmpty.current = false;
      listFocused.current = false;
      emptyRef.current?.focus();
      return;
    }
    if (effective === null) return;
    const container = scroller.current;
    if (scrollTarget.current === effective && container) {
      scrollTarget.current = null;
      const top = index.get(effective)! * SELECTED_ROW_HEIGHT;
      const view = container.clientHeight;
      if (top < container.scrollTop) container.scrollTop = top;
      else if (top + SELECTED_ROW_HEIGHT > container.scrollTop + view)
        container.scrollTop = top + SELECTED_ROW_HEIGHT - view;
    }
    const button = buttons.get(effective);
    if (listFocused.current && button && document.activeElement !== button)
      button.focus({ preventScroll: true });
  }, [effective, entries.length, index, buttons]);

  const move = (key: string | undefined) => {
    if (key === undefined) return;
    scrollTarget.current = key;
    setActive(key);
  };
  function remove(key: string) {
    const position = index.get(key);
    if (position === undefined) return;
    const entry = entries[position];
    const neighbour = keys[position + 1] ?? keys[position - 1];
    if (neighbour === undefined) focusEmpty.current = listFocused.current;
    else move(neighbour);
    store.deselect(key);
    setAnnouncement(`Removed ${label(entry)} from selection`);
  }
  function clearAll() {
    const total = entries.length;
    if (!total) return;
    focusEmpty.current = true;
    store.clear();
    setAnnouncement(
      `Cleared ${total} selected ${total === 1 ? "process" : "processes"}`,
    );
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (activeIndex < 0) return;
    const next =
      event.key === "ArrowDown"
        ? keys[activeIndex + 1]
        : event.key === "ArrowUp"
          ? keys[activeIndex - 1]
          : event.key === "Home"
            ? keys[0]
            : event.key === "End"
              ? keys.at(-1)
              : null;
    if (next === null) return;
    event.preventDefault();
    move(next);
  }

  return (
    <section className="selected-processes" aria-labelledby="selected-heading">
      <div className="selected-header">
        <h3 id="selected-heading">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="selected-body"
            onClick={() => setOpen(!open)}
          >
            Selected processes ({entries.length})
          </button>
        </h3>
        <button
          type="button"
          className="selected-clear"
          disabled={!entries.length}
          onClick={clearAll}
        >
          Clear all
        </button>
      </div>
      <div id="selected-body" hidden={!open}>
        {entries.length === 0 ? (
          <p ref={emptyRef} className="selected-empty" tabIndex={-1}>
            No processes selected. Use the checkboxes in the process tree to add
            processes.
          </p>
        ) : (
          <div
            ref={scroller}
            className="selected-list"
            role="list"
            aria-label="Selected processes"
            onKeyDown={onKeyDown}
            onFocus={(event) => {
              listFocused.current = true;
              const key = (event.target as HTMLElement).dataset.selectedKey;
              if (key !== undefined && key !== active) setActive(key);
            }}
            onBlur={(event) => {
              const list = event.currentTarget;
              const left = event.target as Element;
              const next = event.relatedTarget;
              if (next instanceof Node) {
                if (!list.contains(next)) listFocused.current = false;
                return;
              }
              queueMicrotask(() => {
                if (left.isConnected && !list.contains(document.activeElement))
                  listFocused.current = false;
              });
            }}
          >
            <div
              className="selected-sizer"
              style={{ height: entries.length * SELECTED_ROW_HEIGHT }}
            >
              {virtualizer.getVirtualItems().map((item) => {
                const entry = entries[item.index];
                const key = keys[item.index];
                return (
                  <div
                    key={key}
                    role="listitem"
                    className="selected-row"
                    aria-posinset={item.index + 1}
                    aria-setsize={entries.length}
                    style={{
                      transform: `translateY(${item.index * SELECTED_ROW_HEIGHT}px)`,
                      height: SELECTED_ROW_HEIGHT,
                    }}
                    title={`${label(entry)} · ${releaseName(entry)}`}
                  >
                    <span className="selected-position" aria-hidden="true">
                      {item.index + 1}.
                    </span>
                    <span className="selected-label">
                      {label(entry)}
                      <span className="selected-release">
                        {" "}
                        {releaseName(entry)}
                      </span>
                    </span>
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) buttons.set(key, element);
                        else buttons.delete(key);
                      }}
                      data-selected-key={key}
                      tabIndex={key === effective ? 0 : -1}
                      aria-label={names[item.index]}
                      onClick={() => remove(key)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
