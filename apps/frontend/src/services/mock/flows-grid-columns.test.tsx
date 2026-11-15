/**
 * Column operations on the windowed Flows grid (#25) over the large
 * synthetic workload (see flows-grid-harness.ts): order-only reads for UI
 * reorders, off-screen keyboard reorder, header × removal of the active and
 * a deep column, and × removal through the #69 error/hold path (#69 QA O1,
 * O2). Header-only behaviour is in comparison-headers.test.tsx; pointer
 * edge auto-scroll needs real layout and is in e2e/column-operations.spec.ts.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { selectionLabel } from "../../app/selection";
import type { SelectedProcess } from "../../app/selection";
import { STANDARD_ROW_HEIGHT } from "../../components/comparison/geometry";
import {
  PROCESSES,
  at,
  entries,
  grid,
  layout,
  loadError,
  render,
  rowNamed,
  rowOffset,
  scrollTo,
  scroller,
  selectAll,
  settled,
  settledAt,
  store,
  stubGridLayout,
  topRow,
  valueCells,
  watchView,
} from "./flows-grid-harness";

stubGridLayout();

/** Header strip geometry for pointer drags: right of the 504 px block. */
const STRIP = { left: 504, top: 0, right: layout.width, bottom: 116 };
const COLUMN = 120; // columnWidth(896, 220, Flows bounds)
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const rect = this.classList.contains("process-header-scroller")
        ? STRIP
        : { left: 0, top: 0, right: 0, bottom: 0 };
      return {
        ...rect,
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
        toJSON: () => rect,
      } as DOMRect;
    },
  );
  // Scrollable widths, so the virtualizers can scroll a column into view:
  // the strip's list and the grid's canvas set their full widths inline.
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) {
      const content = this.firstElementChild as HTMLElement | null;
      return this.classList.contains("process-header-scroller") ||
        this.classList.contains("comparison-grid-scroller")
        ? parseFloat(content?.style.width ?? "") || 0
        : 0;
    },
  });
});
afterAll(() => {
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
});

type App = ReturnType<typeof render>;
const strip = () =>
  document.querySelector<HTMLElement>(".process-header-scroller")!;
const header = (entry: SelectedProcess) =>
  document.querySelector<HTMLElement>(
    `.process-header[data-process-id="${entry.id}"]`,
  );
const press = (key: string) =>
  fireEvent.keyDown(document.activeElement!, { key, code: key });
const order = () => store.getSnapshot().map((entry) => entry.id);
/** Clicks a header's × as a pointer does (the press lands outside the grid). */
function removeColumn(entry: SelectedProcess) {
  const button = within(header(entry)!).getByRole("button", {
    name: `Remove column ${selectionLabel(entry)}`,
  });
  fireEvent.pointerDown(button, { isPrimary: true, button: 0 });
  fireEvent.click(button);
}
/** Drags a header from its column to a strip x, with dnd-kit pointer events. */
function dragHeader(entry: SelectedProcess, toX: number) {
  const pointer = { isPrimary: true, button: 0, pointerId: 1, clientY: 50 };
  const index = Number(header(entry)!.dataset.columnIndex);
  const fromX = STRIP.left + index * COLUMN + COLUMN / 2 - strip().scrollLeft;
  fireEvent.pointerDown(header(entry)!, { ...pointer, clientX: fromX });
  fireEvent.pointerMove(document, { ...pointer, clientX: fromX + 20 });
  fireEvent.pointerMove(document, { ...pointer, clientX: toX });
  fireEvent.pointerUp(document, { ...pointer, clientX: toX });
}
const stripX = (index: number) =>
  STRIP.left + index * COLUMN + COLUMN / 2 - strip().scrollLeft;
/** Mounted value-cell labels keyed by flow and process (from the header). */
function cellValues() {
  const values = new Map<string, string>();
  for (const cell of valueCells()) {
    const row = cell
      .closest('[role="row"]')!
      .querySelector('[role="rowheader"]')
      ?.getAttribute("aria-label");
    const process = document
      .querySelector(
        `.process-header[data-column-index="${(cell as HTMLElement).dataset.col}"]`,
      )
      ?.getAttribute("data-process-id");
    if (row && process)
      values.set(
        `${row}|${process}`,
        cell.getAttribute("aria-label") ?? cell.textContent ?? "",
      );
  }
  return values;
}
/** Records busy, updating or query-cache invalidation while watching. */
function watchQuiet(app: App) {
  const seen: string[] = [];
  const observer = new MutationObserver(() => {
    if (grid().getAttribute("aria-busy") === "true") seen.push("aria-busy");
    if (document.querySelector(".comparison-grid-status")?.textContent)
      seen.push("updating");
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  const unsubscribe = app
    .client()
    .getQueryCache()
    .subscribe((event) => {
      if (event.type === "removed") seen.push("removed query");
      if (event.type === "updated" && event.action.type === "invalidate")
        seen.push("invalidated query");
    });
  return {
    seen,
    stop: () => {
      observer.disconnect();
      unsubscribe();
    },
  };
}

describe("Flows grid column operations (#25)", { timeout: 20000 }, () => {
  it("reorders by keyboard and pointer without row, summary or header reads", async () => {
    const app = render();
    await selectAll();
    await settled();
    const reads = {
      rows: app.flowRows.mock.calls.length,
      summaries: app.flowSummaries.mock.calls.length,
      headers: app.headers.mock.calls.length,
      cells: app.flowCells.mock.calls.length,
    };
    const token = app.flowCells.mock.calls[0][0].comparison_token;
    const before = cellValues();
    const quiet = watchQuiet(app);
    const move = vi.spyOn(store, "move");
    // Keyboard: pick up the first column, move it three right, drop.
    act(() => header(entries[0])!.focus());
    press(" ");
    for (let step = 0; step < 3; step += 1) press("ArrowRight");
    press(" ");
    expect(order().indexOf(entries[0].id)).toBe(3);
    await waitFor(() => expect(header(entries[0])).toHaveFocus());
    // A pick-up cancelled, and one dropped in place, change nothing.
    press(" ");
    press("ArrowLeft");
    press("Escape");
    press("Enter");
    press("Enter");
    expect(order().indexOf(entries[0].id)).toBe(3);
    // Pointer: drag the second column onto the sixth.
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    move.mockClear();
    dragHeader(entries[1], stripX(5));
    expect(move).toHaveBeenCalledTimes(1);
    expect(order().indexOf(entries[1].id)).toBe(5);
    // Dropped on its own column, and outside the strip: no move.
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    dragHeader(entries[1], stripX(5) + 30);
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    dragHeader(entries[1], STRIP.right + 40);
    expect(move).toHaveBeenCalledTimes(1);
    await settled();
    quiet.stop();
    expect(quiet.seen).toEqual([]);
    expect(app.flowRows).toHaveBeenCalledTimes(reads.rows);
    expect(app.flowSummaries).toHaveBeenCalledTimes(reads.summaries);
    expect(app.headers).toHaveBeenCalledTimes(reads.headers);
    // Cell tiles are read only for column compositions not already cached
    // (a read aborted when its window was left caches nothing), same token.
    const calls = app.flowCells.mock.calls;
    const tile = ([input]: (typeof calls)[number]) =>
      JSON.stringify([input.row_keys, input.process_ids]);
    const cached = new Set<string>();
    calls.forEach((call, index) => {
      if (index >= reads.cells) {
        expect(cached.has(tile(call))).toBe(false);
        expect(call[0].comparison_token).toBe(token);
      }
      if (!call[1]?.signal?.aborted) cached.add(tile(call));
    });
    // Every cell shows the same value for its flow and process.
    const after = cellValues();
    let compared = 0;
    for (const [cell, value] of after)
      if (before.has(cell)) {
        expect(value).toBe(before.get(cell));
        compared += 1;
      }
    expect(compared).toBeGreaterThan(100);
    // Headers stay aligned with their cells; keys stay unique.
    for (const cell of valueCells()) {
      const column = Number((cell as HTMLElement).dataset.col);
      const process = store.getSnapshot()[column];
      expect(cell.getAttribute("aria-label") ?? cell.textContent).toMatch(
        new RegExp(`^${process.name}: `),
      );
    }
    expect(new Set(order()).size).toBe(PROCESSES);
    expect(grid()).toHaveAttribute("aria-colcount", String(PROCESSES + 1));
  });

  it("moves a column by keyboard to an off-screen end, scrolled into view with focus", async () => {
    render();
    await selectAll();
    act(() => header(entries[0])!.focus());
    press(" ");
    press("End");
    expect(order().at(-1)).toBe(entries[0].id);
    await waitFor(() => expect(header(entries[0])).toHaveFocus());
    expect(header(entries[0])).toHaveAttribute(
      "data-column-index",
      String(PROCESSES - 1),
    );
    // The strip scrolled the moved header into view; the cells follow.
    const end = PROCESSES * COLUMN - (layout.width - 504);
    await waitFor(() => expect(strip().scrollLeft).toBe(end));
    await waitFor(() => expect(scroller().scrollLeft).toBe(end));
    const mounted = () => strip().querySelectorAll("li").length;
    expect(mounted()).toBeLessThanOrEqual(20);
    press(" ");
    await settled();
    expect(header(entries[0])).toHaveFocus();
    expect(header(entries[0])).toHaveAttribute(
      "data-column-index",
      String(PROCESSES - 1),
    );
    expect(mounted()).toBeLessThanOrEqual(20);
    expect(Number(grid().dataset.mountedColumns)).toBeLessThanOrEqual(18);
  });

  it("moves the grid's single tab stop to the same flow in the next column when its column is removed", async () => {
    render(30);
    await selectAll();
    await settledAt(1300);
    act(() => at(1312, 5)!.focus());
    const flow = at(1312, -1)!.getAttribute("aria-label")!;
    removeColumn(entries[5]);
    await settled();
    expect(order()).not.toContain(entries[5].id);
    // Focus moved to the next header; the grid keeps one tab stop.
    expect(header(entries[6])).toHaveFocus();
    const stops = grid().querySelectorAll<HTMLElement>('[tabindex="0"]');
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute("data-col", "5");
    expect(stops[0]).toHaveAccessibleName(new RegExp(`^${entries[6].name}: `));
    expect(
      stops[0].closest('[role="row"]')!.querySelector('[role="rowheader"]'),
    ).toHaveAttribute("aria-label", flow);
  }, 40000);

  it("keeps the top flow at its offset when a column is removed with its × while deep", async () => {
    const app = render(30);
    await selectAll();
    await settledAt(1300);
    const anchor = topRow()!;
    const view = watchView();
    removeColumn(entries[5]);
    await settled();
    view.stop();
    const after = topRow()!;
    expect(after.name).toBe(anchor.name);
    expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
    expect([...view.names]).toEqual([anchor.name]);
    expect(app.busyReads).toEqual([]);
  }, 40000);
});

describe(
  "header × removal through the #69 error and hold path",
  { timeout: 20000 },
  () => {
    const retry = (alert: HTMLElement) =>
      fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    /** 220 processes, deep at row 1150, then one column removed by its ×. */
    async function deepRemoval(fault: { page: number; times: number }) {
      const app = render(30);
      await selectAll();
      await settledAt(1150);
      const anchor = topRow()!;
      app.faults.push({ processes: PROCESSES - 1, ...fault });
      const view = watchView();
      removeColumn(entries[5]);
      expect(order()).toHaveLength(PROCESSES - 1);
      return { app, anchor, view };
    }

    it("reads nothing while paused, even when scrolled, and keeps the scroll after Retry (O2)", async () => {
      const { app, anchor, view } = await deepRemoval({ page: 2, times: 1 });
      const alert = await loadError();
      view.stop();
      const summaries = app.flowSummaries.mock.calls.length;
      const cells = app.flowCells.mock.calls.length;
      // At least five rows down and one column window (a 20-process tile) right.
      scrollTo(
        scroller().scrollTop + 6 * STANDARD_ROW_HEIGHT,
        scroller().scrollLeft + 20 * COLUMN,
      );
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      expect(app.flowSummaries).toHaveBeenCalledTimes(summaries);
      expect(app.flowCells).toHaveBeenCalledTimes(cells);
      expect(app.busyReads).toEqual([]);
      expect(grid()).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByText("Updating the comparison…")).toBeNull();
      retry(alert);
      await settled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(app.busyReads).toEqual([]);
      // D4: the user's scroll is not undone; the old anchor is not snapped
      // back to the top but stays about six rows above it.
      expect(topRow()!.name).not.toBe(anchor.name);
      const old = rowNamed(anchor.name);
      expect(old).toBeDefined();
      expect(rowOffset(old!)).toBeLessThan(-3 * STANDARD_ROW_HEIGHT);
    }, 40000);

    it("treats unfetched flows as unknown, not absent, after a first-page error (O1)", async () => {
      const { app, anchor, view } = await deepRemoval({ page: 0, times: 1 });
      retry(await loadError());
      await settled();
      view.stop();
      const after = topRow()!;
      expect(after.name).toBe(anchor.name);
      expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
      expect([...view.names]).toEqual([anchor.name]);
      expect(app.busyReads).toEqual([]);
      expect(order()).not.toContain(entries[5].id);
    }, 40000);
  },
);
