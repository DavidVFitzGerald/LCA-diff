import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { flushSync } from "react-dom";
import {
  AutoScrollActivator,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useAnnounce } from "../../app/announcer";
import {
  selectionKey,
  selectionLabel,
  uniqueSelectionLabels,
  useSelectionStore,
} from "../../app/selection";
import type { SelectedProcess } from "../../app/selection";
import type { ProcessHeader } from "../../services/contracts";
import { comparability, shown } from "./model";
import "./comparison.css";

const NOT_SPECIFIED = "not specified";

/** Full identity lines for hover/focus; never truncated. */
function details(
  entry: SelectedProcess,
  header: ProcessHeader | undefined,
  release: string,
): string[] {
  const location = shown(header?.geography ?? entry.geography);
  return [
    `Process: ${header?.name ?? entry.name}`,
    `Location: ${location ?? NOT_SPECIFIED}`,
    ...(header
      ? [
          `Reference flow: ${shown(header.reference_flow_name) ?? NOT_SPECIFIED}`,
          `Reference amount: ${header.reference_amount}`,
          `Reference unit: ${shown(header.reference_unit) ?? NOT_SPECIFIED}`,
        ]
      : ["Reference details loading"]),
    `Release: ${release}`,
    `Revision: ${entry.revision_id}`,
    `Process ID: ${entry.id}`,
  ];
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={value ?? undefined}>
        {value ?? <span aria-label={NOT_SPECIFIED}>—</span>}
      </dd>
    </div>
  );
}

/** Keyboard and pointer reorder instructions, part of every header's description. */
const INSTRUCTIONS =
  "To move this column, press Space or Enter, then the Left or Right arrow key, Home or End, then Space or Enter to drop it or Escape to cancel. You can also drag the header. Tab reaches its remove button.";

interface CellProps {
  readonly index: number;
  readonly count: number;
  /** Horizontal offset in px within the full column strip. */
  readonly start: number;
  readonly entry: SelectedProcess;
  readonly header: ProcessHeader | undefined;
  readonly release: string;
  readonly width: number;
  readonly tabbable: boolean;
  /** Accessible name of the column's remove button. */
  readonly removeName: string;
  readonly instructionsId: string;
  /** Picked up for keyboard reorder. */
  readonly lifted: boolean;
  readonly onFocusKey: (key: string | null) => void;
  readonly onHoverKey: (key: string | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onRemove: (key: string) => void;
}

/** Memoized so unrelated workspace state never re-renders every column. */
const HeaderCell = memo(function HeaderCell({
  index,
  count,
  start,
  entry,
  header,
  release,
  width,
  tabbable,
  removeName,
  instructionsId,
  lifted,
  onFocusKey,
  onHoverKey,
  onKeyDown,
  onRemove,
}: CellProps) {
  const id = useId();
  const key = selectionKey(entry);
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: key });
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // The remove button is a click target, never a drag handle.
    if ((event.target as Element).closest("button")) return;
    listeners?.onPointerDown?.(event);
  };
  const state = `${lifted ? " lifted" : ""}${isDragging ? " dragging" : ""}`;
  return (
    <li
      style={{ width, transform: `translateX(${start}px)` }}
      aria-posinset={index + 1}
      aria-setsize={count}
    >
      <div
        ref={setNodeRef}
        data-column-index={index}
        role="group"
        className={`process-header${state}`}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-detail ${instructionsId}`}
        aria-busy={!header}
        tabIndex={tabbable ? 0 : -1}
        onFocus={() => onFocusKey(key)}
        onBlur={() => onFocusKey(null)}
        onMouseEnter={() => onHoverKey(key)}
        onMouseLeave={() => onHoverKey(null)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        data-process-id={entry.id}
      >
        <p id={`${id}-name`} className="process-header-name">
          {header?.name ?? entry.name}
        </p>
        <dl>
          <Field
            label="Location"
            value={shown(header?.geography ?? entry.geography)}
          />
          {header ? (
            <>
              <Field
                label="Reference flow"
                value={shown(header.reference_flow_name)}
              />
              <Field label="Amount" value={header.reference_amount} />
              <Field label="Unit" value={shown(header.reference_unit)} />
            </>
          ) : (
            <div>
              <dt>Reference</dt>
              <dd>Loading…</dd>
            </div>
          )}
        </dl>
        <span id={`${id}-detail`} className="visually-hidden">
          {details(entry, header, release).join("; ")}
        </span>
        <button
          type="button"
          className="process-header-remove"
          aria-label={removeName}
          tabIndex={tabbable ? 0 : -1}
          onClick={() => onRemove(key)}
        >
          ×
        </button>
      </div>
    </li>
  );
});

/** Columns rendered beyond each side of the viewport. */
const OVERSCAN = 4;
/** Pointer travel (px) before a press becomes a drag; clicks stay clicks. */
const DRAG_DISTANCE = 8;
/** dnd-kit's own (assertive) live region stays silent; ours is polite. */
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

/**
 * Process metadata headers in canonical selection order (#21, spec §6.3),
 * shared by the Flows and Scores tabs. Columns are windowed horizontally, so
 * hundreds of selections mount only the visible headers plus overscan; the
 * active column always stays mounted as the single roving tab stop. Arrows,
 * Home and End move between columns. Each header's accessible description is
 * its complete identity, and hover/focus shows it in a panel below the
 * scroller, so horizontal overflow never clips it.
 *
 * Column operations (#25) change only the shared selection store, so both
 * tabs see one order: drag a header (dnd-kit pointer sensor with an
 * activation distance, edge auto-scroll, Escape cancels), pick it up with
 * Space/Enter and move it with the arrows, Home and End, or remove it with
 * its × button. Operations are announced in the workspace's polite region.
 */
export function ProcessHeaders({
  entries,
  headers,
  width,
  releaseName,
  scrollerRef,
}: {
  entries: readonly SelectedProcess[];
  headers: ReadonlyMap<string, ProcessHeader>;
  width: number;
  releaseName: (releaseId: string) => string;
  scrollerRef: RefObject<HTMLDivElement | null>;
}) {
  const store = useSelectionStore();
  const announce = useAnnounce();
  const instructionsId = useId();
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Keyboard reorder: the picked-up column and its original index.
  const [lifted, setLifted] = useState<{ key: string; from: number } | null>(
    null,
  );
  // Pointer reorder: the dragged column and the index it would drop at.
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const keys = useMemo(() => entries.map(selectionKey), [entries]);
  const labels = uniqueSelectionLabels(entries, (entry) =>
    releaseName(entry.release_id),
  );
  const found = active === null ? -1 : keys.indexOf(active);
  const activeIndex = found < 0 ? (keys.length ? 0 : -1) : found;
  const draggingIndex = dragging === null ? -1 : keys.indexOf(dragging);
  const revealedIndex = keys.indexOf(hovered ?? focused ?? "");
  const revealed = revealedIndex < 0 ? null : entries[revealedIndex];
  // Current values for stable event handlers, so memoized cells keep them.
  const latest = useRef({ keys, entries, labels, lifted, width });
  useEffect(() => {
    latest.current = { keys, entries, labels, lifted, width };
  });

  // No React Compiler runs in this build; virtualizer methods are used only here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: entries.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => width,
    overscan: OVERSCAN,
    getItemKey: (index) => keys[index],
    // The tab stop and a dragged column stay mounted.
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      const kept = new Set(visible);
      for (const index of [activeIndex, draggingIndex])
        if (index >= 0) kept.add(index);
      return kept.size === visible.length
        ? visible
        : [...kept].sort((a, b) => a - b);
    },
  });
  useEffect(() => virtualizer.measure(), [virtualizer, width]);

  // Focus follows the active column after keyboard moves, reorders and
  // removals (a moved node may lose DOM focus), scrolled into view.
  useEffect(() => {
    if (!pendingFocus.current || activeIndex < 0) return;
    pendingFocus.current = false;
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    list.current
      ?.querySelector<HTMLElement>(
        `.process-header[data-column-index="${activeIndex}"]`,
      )
      ?.focus({ preventScroll: true });
  });

  const onFocusKey = useCallback(
    (key: string | null) => {
      if (key !== null) setActive(key);
      setFocused(key);
      if (key !== null) return;
      // Leaving a picked-up column (Tab, a click elsewhere) drops it where
      // it is. A reorder's own transient focus loss is refocused first.
      setTimeout(() => {
        const { keys: now, labels: names, lifted: picked } = latest.current;
        if (!picked) return;
        const header = (
          document.activeElement as HTMLElement | null
        )?.closest?.<HTMLElement>(".process-header");
        if (header && now[Number(header.dataset.columnIndex)] === picked.key)
          return;
        const index = now.indexOf(picked.key);
        setLifted(null);
        if (index >= 0)
          announce(
            `${names[index]} dropped at position ${index + 1} of ${now.length}.`,
          );
      });
    },
    [announce],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      // Keys on the remove button are the button's own.
      if (event.target !== event.currentTarget) return;
      const { keys: now, labels: names, lifted: picked } = latest.current;
      const index = Number(event.currentTarget.dataset.columnIndex);
      const key = now[index];
      const at = (position: number) =>
        `position ${position + 1} of ${now.length}`;
      const destination =
        event.key === "ArrowRight"
          ? index + 1
          : event.key === "ArrowLeft"
            ? index - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? now.length - 1
                : null;
      const toggle = event.key === " " || event.key === "Enter";
      if (picked?.key === key) {
        if (toggle) {
          event.preventDefault();
          setLifted(null);
          announce(`${names[index]} dropped at ${at(index)}.`);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setLifted(null);
          const from = Math.min(picked.from, now.length - 1);
          if (from !== index) {
            pendingFocus.current = true;
            store.move(key, from);
          }
          announce(`Move cancelled. ${names[index]} is back at ${at(from)}.`);
          return;
        }
        if (destination === null) return;
        event.preventDefault();
        const to = Math.max(0, Math.min(destination, now.length - 1));
        if (to === index) {
          announce(`${names[index]} is already at ${at(index)}.`);
          return;
        }
        pendingFocus.current = true;
        store.move(key, to);
        announce(`${names[index]} moved to ${at(to)}.`);
        return;
      }
      if (toggle) {
        event.preventDefault();
        setLifted({ key, from: index });
        announce(
          `Picked up ${names[index]} at ${at(index)}. Use the Left and Right arrow keys, Home or End to move it, Space or Enter to drop it, or Escape to cancel.`,
        );
        return;
      }
      if (destination === null || destination < 0 || destination >= now.length)
        return;
      event.preventDefault();
      pendingFocus.current = true;
      setActive(now[destination]);
    },
    [announce, store],
  );

  const onRemove = useCallback(
    (key: string) => {
      const { keys: now, entries: current } = latest.current;
      const position = now.indexOf(key);
      if (position < 0) return;
      const neighbour = now[position + 1] ?? now[position - 1];
      const panel =
        list.current?.closest<HTMLElement>('[role="tabpanel"]') ?? null;
      setLifted((value) => (value?.key === key ? null : value));
      announce(`Removed ${selectionLabel(current[position])} from selection`);
      if (neighbour === undefined) {
        // The headers unmount with the last column: focus the tab's empty
        // state (its `data-empty-focus` element), never the body.
        flushSync(() => store.deselect(key));
        (
          panel?.querySelector<HTMLElement>("[data-empty-focus]") ?? panel
        )?.focus();
        return;
      }
      pendingFocus.current = true;
      setActive(neighbour);
      store.deselect(key);
    },
    [announce, store],
  );

  // Pointer drag: the drop index is the column under the pointer, from the
  // strip's geometry, so it is defined for columns that are not mounted.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_DISTANCE },
    }),
  );
  const targetOf = useCallback(() => {
    const scroller = scrollerRef.current;
    const at = pointer.current;
    const { keys: now, width: size } = latest.current;
    if (!scroller || !at || size <= 0 || now.length === 0) return null;
    const rect = scroller.getBoundingClientRect();
    if (
      at.x < rect.left ||
      at.x > rect.right ||
      at.y < rect.top ||
      at.y > rect.bottom
    )
      return null;
    const index = Math.floor((at.x - rect.left + scroller.scrollLeft) / size);
    return Math.max(0, Math.min(now.length - 1, index));
  }, [scrollerRef]);
  useEffect(() => {
    if (dragging === null) return;
    const scroller = scrollerRef.current;
    const update = () => setDropIndex(targetOf());
    const move = (event: globalThis.PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
      update();
    };
    document.addEventListener("pointermove", move, { passive: true });
    // Edge auto-scroll moves the strip under a still pointer.
    scroller?.addEventListener("scroll", update, { passive: true });
    return () => {
      document.removeEventListener("pointermove", move);
      scroller?.removeEventListener("scroll", update);
    };
  }, [dragging, scrollerRef, targetOf]);
  const onDragStart = ({ active: item, activatorEvent }: DragStartEvent) => {
    const key = String(item.id);
    const index = keys.indexOf(key);
    if (index < 0) return;
    const start = activatorEvent as globalThis.PointerEvent;
    pointer.current = { x: start.clientX, y: start.clientY };
    setLifted(null);
    setDragging(key);
    setDropIndex(targetOf());
    announce(
      `Picked up ${labels[index]} at position ${index + 1} of ${keys.length}. Release it over a column to move it there, or press Escape to cancel.`,
    );
  };
  const finishDrag = () => {
    setDragging(null);
    setDropIndex(null);
    pointer.current = null;
  };
  const onDragEnd = ({ active: item }: DragEndEvent) => {
    const key = String(item.id);
    const target = targetOf();
    finishDrag();
    const from = keys.indexOf(key);
    if (from < 0) return;
    const at = (position: number) =>
      `position ${position + 1} of ${keys.length}`;
    if (target === null)
      announce(
        `${labels[from]} was dropped outside the columns and stays at ${at(from)}.`,
      );
    else if (target === from)
      announce(`${labels[from]} dropped at ${at(from)}.`);
    else {
      // Exactly one reorder per drop; focus stays on the moved header.
      pendingFocus.current = true;
      setActive(key);
      store.move(key, target);
      announce(`${labels[from]} moved to ${at(target)}.`);
    }
  };
  const onDragCancel = () => {
    const from = dragging === null ? -1 : keys.indexOf(dragging);
    finishDrag();
    if (from >= 0)
      announce(
        `Move cancelled. ${labels[from]} stays at position ${from + 1} of ${keys.length}.`,
      );
  };

  return (
    <DndContext
      sensors={sensors}
      autoScroll={{
        activator: AutoScrollActivator.Pointer,
        threshold: { x: 0.12, y: 0 },
        canScroll: (element) => element === scrollerRef.current,
      }}
      accessibility={{
        announcements: SILENT,
        screenReaderInstructions: { draggable: "" },
        restoreFocus: false,
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="process-header-anchor">
        <div
          ref={scrollerRef}
          className="process-header-scroller"
          data-column-width={width}
        >
          <ol
            ref={list}
            className="process-headers"
            aria-label="Process columns"
            style={{ width: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((item) => (
              <HeaderCell
                key={item.key}
                index={item.index}
                count={entries.length}
                start={item.start}
                entry={entries[item.index]}
                header={headers.get(keys[item.index])}
                release={releaseName(entries[item.index].release_id)}
                width={width}
                tabbable={item.index === activeIndex}
                removeName={`Remove column ${labels[item.index]}`}
                instructionsId={instructionsId}
                lifted={lifted?.key === keys[item.index]}
                onFocusKey={onFocusKey}
                onHoverKey={setHovered}
                onKeyDown={onKeyDown}
                onRemove={onRemove}
              />
            ))}
          </ol>
          {dragging !== null && dropIndex !== null && (
            <div
              className="process-header-drop"
              aria-hidden="true"
              data-drop-index={dropIndex}
              style={{ width, transform: `translateX(${dropIndex * width}px)` }}
            />
          )}
        </div>
        <span id={instructionsId} className="visually-hidden">
          {INSTRUCTIONS}
        </span>
        <div
          className="process-header-panel"
          aria-hidden="true"
          data-testid="process-header-panel"
        >
          {revealed &&
            details(
              revealed,
              headers.get(keys[revealedIndex]),
              releaseName(revealed.release_id),
            ).map((line) => <span key={line}>{line}</span>)}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {draggingIndex >= 0 ? (
          <div
            className="process-header-overlay"
            aria-hidden="true"
            style={{ width }}
          >
            {headers.get(keys[draggingIndex])?.name ??
              entries[draggingIndex].name}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Non-blocking notice when selected reference amounts or units differ
 * (spec §6.3). It never changes values and needs no confirmation. While
 * headers load it only reports differences already known, never "equal".
 */
export function ComparabilityWarning({
  headers,
}: {
  headers: readonly ProcessHeader[];
}) {
  const tipId = useId();
  const { amounts, units } = comparability(headers);
  const what =
    amounts && units
      ? "reference amounts and units"
      : amounts
        ? "reference amounts"
        : "reference units";
  return (
    <div role="status" className="comparability-status">
      {(amounts || units) && (
        <p className="comparability-warning">
          <span aria-hidden="true" className="warning-icon">
            ⚠
          </span>{" "}
          <strong>Different reference quantities.</strong> Selected processes
          have different {what}. No normalization has been applied.{" "}
          <span className="tooltip-anchor">
            <button
              type="button"
              className="info-button"
              aria-describedby={tipId}
            >
              Why?
            </button>
            <span id={tipId} role="tooltip" className="comparability-tip">
              Values are shown exactly as published for each process&apos;s own
              reference amount and unit, so they may be based on different
              quantities or units. LCA diff does not rescale or convert them.
            </span>
          </span>
        </p>
      )}
    </div>
  );
}
