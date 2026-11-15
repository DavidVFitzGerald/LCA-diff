import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent, RefObject } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { selectionKey } from "../../app/selection";
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
  readonly onFocusKey: (key: string | null) => void;
  readonly onHoverKey: (key: string | null) => void;
  readonly onMove: (event: KeyboardEvent<HTMLDivElement>) => void;
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
  onFocusKey,
  onHoverKey,
  onMove,
}: CellProps) {
  const id = useId();
  const key = selectionKey(entry);
  return (
    <li
      style={{ width, transform: `translateX(${start}px)` }}
      aria-posinset={index + 1}
      aria-setsize={count}
    >
      <div
        data-column-index={index}
        role="group"
        className="process-header"
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-detail`}
        aria-busy={!header}
        tabIndex={tabbable ? 0 : -1}
        onFocus={() => onFocusKey(key)}
        onBlur={() => onFocusKey(null)}
        onMouseEnter={() => onHoverKey(key)}
        onMouseLeave={() => onHoverKey(null)}
        onKeyDown={onMove}
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
      </div>
    </li>
  );
});

/** Columns rendered beyond each side of the viewport. */
const OVERSCAN = 4;

/**
 * Process metadata headers in canonical selection order (#21, spec §6.3),
 * shared by the Flows and Scores tabs. Columns are windowed horizontally, so
 * hundreds of selections mount only the visible headers plus overscan; the
 * active column always stays mounted as the single roving tab stop. Arrows,
 * Home and End move between columns. Each header's accessible description is
 * its complete identity, and hover/focus shows it in a panel below the
 * scroller, so horizontal overflow never clips it.
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
  const [active, setActive] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const pendingFocus = useRef(false);
  const keys = useMemo(() => entries.map(selectionKey), [entries]);
  const found = active === null ? -1 : keys.indexOf(active);
  const activeIndex = found < 0 ? (keys.length ? 0 : -1) : found;
  const revealedIndex = keys.indexOf(hovered ?? focused ?? "");
  const revealed = revealedIndex < 0 ? null : entries[revealedIndex];

  // No React Compiler runs in this build; virtualizer methods are used only here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: entries.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => width,
    overscan: OVERSCAN,
    getItemKey: (index) => keys[index],
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !visible.includes(activeIndex))
        return [...visible, activeIndex].sort((a, b) => a - b);
      return visible;
    },
  });
  useEffect(() => virtualizer.measure(), [virtualizer, width]);

  useEffect(() => {
    if (!pendingFocus.current || activeIndex < 0) return;
    pendingFocus.current = false;
    virtualizer.scrollToIndex(activeIndex, { align: "auto" });
    list.current
      ?.querySelector<HTMLElement>(
        `.process-header[data-column-index="${activeIndex}"]`,
      )
      ?.focus({ preventScroll: true });
  }, [activeIndex, virtualizer]);

  const onFocusKey = useCallback((key: string | null) => {
    if (key !== null) setActive(key);
    setFocused(key);
  }, []);
  const onMove = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const index = Number(event.currentTarget.dataset.columnIndex);
      const target =
        event.key === "ArrowRight"
          ? index + 1
          : event.key === "ArrowLeft"
            ? index - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? keys.length - 1
                : null;
      if (target === null || target < 0 || target >= keys.length) return;
      event.preventDefault();
      pendingFocus.current = true;
      setActive(keys[target]);
    },
    [keys],
  );
  return (
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
              onFocusKey={onFocusKey}
              onHoverKey={setHovered}
              onMove={onMove}
            />
          ))}
        </ol>
      </div>
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
