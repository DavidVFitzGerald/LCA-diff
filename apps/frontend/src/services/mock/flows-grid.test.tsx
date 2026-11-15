/**
 * Windowed Flows grid (#23) over the large synthetic workload: 220 selected
 * processes × 2,000+ generated mixed-sign rows, through the comparison mock
 * with spied reads. jsdom has no layout, so element sizes are stubbed; the
 * browser journey is e2e/flows-grid.spec.ts.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectionKey } from "../../app/selection";
import { STANDARD_ROW_HEIGHT } from "../../components/comparison/geometry";
import {
  GENERATED_ROWS,
  PROCESSES,
  at,
  entries,
  grid,
  layout,
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
} from "./flows-grid-harness";

stubGridLayout();

// Explicit budget: under a full parallel run the first mount of the large
// workload can exceed the 5 s default (#24 observed 4.6–5.9 s; ~2.5 s alone).
describe("windowed Flows grid (#23)", { timeout: 20000 }, () => {
  it("mounts only the viewport window of 220 × 2,000+ and reads bounded windows", async () => {
    const app = render();
    await selectAll();
    const total = (await app.flowRows.mock.results[0].value).data.total_count;
    expect(total).toBeGreaterThanOrEqual(GENERATED_ROWS);
    expect(grid()).toHaveAttribute("aria-rowcount", String(total));
    expect(grid()).toHaveAttribute("aria-colcount", String(PROCESSES + 1));
    // 600px / 52px rows plus overscan; (1400 - 504)px / 120px columns plus
    // overscan. Never the 440,000-cell matrix.
    const rows = grid().querySelectorAll('[role="row"]').length;
    const cells = grid().querySelectorAll('[role="gridcell"]').length;
    expect(rows).toBeLessThanOrEqual(26);
    expect(cells).toBeLessThanOrEqual(26 * 17);
    expect(grid().dataset.mountedColumns).toBeDefined();
    expect(Number(grid().dataset.mountedColumns)).toBeLessThanOrEqual(17);
    // Bounded reads: 100-row pages only as far as the window needs, one
    // whole-selection summary window, and ≤ 1,000-cell tiles.
    expect(app.flowRows.mock.calls.map(([input]) => input.limit)).toEqual([
      100,
    ]);
    for (const [input] of app.flowSummaries.mock.calls) {
      expect(input.row_keys.length).toBeLessThanOrEqual(100);
      expect(input.process_ids).toHaveLength(PROCESSES);
    }
    expect(app.flowSummaries).toHaveBeenCalledTimes(1);
    expect(app.flowCells.mock.calls.length).toBeLessThanOrEqual(2);
    for (const [input] of app.flowCells.mock.calls)
      expect(
        input.row_keys.length * input.process_ids.length,
      ).toBeLessThanOrEqual(1000);
  });

  it("deep scrolling pages rows in bounded steps and cancels windows left behind", async () => {
    const app = render(20);
    await selectAll();
    const first = app.flowCells.mock.calls.length;
    // Leave the first windows before later tiles resolve, then jump deep.
    scrollTo(60 * STANDARD_ROW_HEIGHT, 3000);
    scrollTo(1500 * STANDARD_ROW_HEIGHT, 3000);
    await waitFor(
      () => {
        const header = grid().querySelector<HTMLElement>(
          '[role="rowheader"][data-row="1500"]',
        );
        expect(header).not.toBeNull();
        expect(header).not.toHaveAttribute("aria-busy");
        expect(
          grid().querySelector(
            '[data-row="1500"][role="gridcell"][data-state]',
          ),
        ).not.toBeNull();
      },
      { timeout: 10000 },
    );
    const pages = app.flowRows.mock.calls.map(([input]) => input.limit);
    expect(pages.every((limit) => limit === 100)).toBe(true);
    expect(pages.length).toBeLessThanOrEqual(17);
    // Summaries only for pages that were in a window, not every page passed.
    expect(app.flowSummaries.mock.calls.length).toBeLessThanOrEqual(4);
    expect(app.flowCells.mock.calls.length - first).toBeLessThanOrEqual(8);
    expect(app.signals.some((signal) => signal.aborted)).toBe(true);
    expect(grid().querySelectorAll('[role="row"]').length).toBeLessThanOrEqual(
      26,
    );
  }, 20000);

  it("sizes mixed-sign rows from summaries and stripes by row index", async () => {
    render();
    await selectAll();
    scrollTo(300 * STANDARD_ROW_HEIGHT);
    // Paging to row 300 takes four row pages and their summaries. Like the
    // file's other deep-scroll waits, allow 10 s: the 1 s default timed out
    // when another large-workload file ran in parallel (#25).
    await waitFor(
      () =>
        expect(
          [...grid().querySelectorAll<HTMLElement>('[role="row"]')].some(
            (row) => parseFloat(row.style.height) > STANDARD_ROW_HEIGHT,
          ),
        ).toBe(true),
      { timeout: 10000 },
    );
    for (const row of grid().querySelectorAll<HTMLElement>('[role="row"]')) {
      const index = Number(row.getAttribute("aria-rowindex")) - 1;
      expect(row).toHaveClass(index % 2 ? "odd" : "even");
      // Every value cell fills the row height computed for the whole row.
      for (const cell of row.querySelectorAll<HTMLElement>(
        '[role="gridcell"][data-state]',
      ))
        expect(cell.style.height).toBe(row.style.height);
    }
    // Rows below a taller row start exactly where it ends.
    const rows = [...grid().querySelectorAll<HTMLElement>('[role="row"]')];
    const start = (row: HTMLElement) =>
      Number(/translateY\((.+)px\)/.exec(row.style.transform)![1]);
    for (let index = 1; index < rows.length; index += 1)
      if (
        Number(rows[index].getAttribute("aria-rowindex")) ===
        Number(rows[index - 1].getAttribute("aria-rowindex")) + 1
      )
        expect(start(rows[index])).toBeCloseTo(
          start(rows[index - 1]) + parseFloat(rows[index - 1].style.height),
        );
  }, 20000);

  it("names rows by all seven identifying fields and cells by process", async () => {
    render();
    await selectAll();
    const header = at(0, -1)!;
    expect(header).toHaveAttribute("role", "rowheader");
    expect(header.getAttribute("aria-label")).toMatch(
      /^Type: .+; Flow Name: .+; Location: .+; Process Name: .+; Category: .+; Subcategory: .+; Unit: .+$/,
    );
    expect(header.children).toHaveLength(7);
    const cell = grid().querySelector<HTMLElement>(
      '[role="gridcell"][data-state]',
    )!;
    const column = Number(cell.dataset.col);
    expect(cell.getAttribute("aria-label")).toMatch(
      new RegExp(`^${entries[column].name}: `),
    );
    expect(cell).toHaveAttribute("aria-colindex", String(column + 2));
  });

  it("keeps one tab stop and moves focus only to mounted, correct cells", async () => {
    render();
    await selectAll();
    const tabbable = () => grid().querySelectorAll('[tabindex="0"]');
    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toBe(at(0, -1));
    act(() => at(0, -1)!.focus());
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(at(0, 0)));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(at(1, 0)));
    const total = Number(grid().getAttribute("aria-rowcount"));
    fireEvent.keyDown(document.activeElement!, { key: "End", ctrlKey: true });
    await waitFor(
      () => expect(document.activeElement).toBe(at(total - 1, PROCESSES - 1)),
      { timeout: 10000 },
    );
    expect(tabbable()).toHaveLength(1);
    expect(grid()).toContainElement(document.activeElement as HTMLElement);
    fireEvent.keyDown(document.activeElement!, { key: "Home", ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(at(0, -1)));
    expect(tabbable()).toHaveLength(1);
  }, 20000);

  it("keeps focus on a loading cell and its row when their data arrives", async () => {
    const app = render(40);
    await selectAll();
    act(() => at(0, -1)!.focus());
    const total = Number(grid().getAttribute("aria-rowcount"));
    fireEvent.keyDown(document.activeElement!, { key: "End", ctrlKey: true });
    // The far row and cell are mounted before their page and tile arrive.
    await waitFor(() =>
      expect(document.activeElement).toBe(at(total - 1, PROCESSES - 1)),
    );
    const focused = document.activeElement as HTMLElement;
    expect(focused).toHaveAttribute("aria-busy", "true");
    // jsdom does not perform the virtualizer's scrollToIndex (Chromium
    // does: e2e/flows-grid.spec.ts), so scroll to the far window here.
    const canvas = grid().querySelector<HTMLElement>(
      ".comparison-grid-canvas",
    )!;
    scrollTo(
      parseFloat(canvas.style.height) - layout.height,
      parseFloat(canvas.style.width) - layout.width,
    );
    await waitFor(() => expect(focused).toHaveAttribute("data-state"), {
      timeout: 15000,
    });
    // Same DOM node, still focused, now with its value.
    expect(document.activeElement).toBe(focused);
    expect(focused).not.toHaveAttribute("aria-busy");
    expect(app.flowRows.mock.calls.length).toBeGreaterThan(1);
  }, 30000);

  it("keeps the same flows in view and focused when processes are removed or added while deep (QA D1, D2)", async () => {
    const app = render(30);
    await selectAll();
    const before = Number(grid().getAttribute("aria-rowcount"));
    scrollTo(1300 * STANDARD_ROW_HEIGHT + 20);
    await waitFor(
      () =>
        expect(
          grid().querySelector(
            '[role="rowheader"][data-row="1310"]:not([aria-busy])',
          ),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    act(() => at(1310, -1)!.focus());
    const flow = at(1310, -1)!.getAttribute("aria-label")!;
    // Where a flow's row sits relative to the viewport top.
    const rowOf = (name: string) =>
      [...grid().querySelectorAll<HTMLElement>('[role="rowheader"]')]
        .find((header) => header.getAttribute("aria-label") === name)
        ?.closest<HTMLElement>('[role="row"]');
    const offset = (name: string) => {
      const row = rowOf(name)!;
      return (
        Number(/translateY\((.+)px\)/.exec(row.style.transform)![1]) -
        scroller().scrollTop
      );
    };
    // The first visible flow is the anchor; the focused flow must stay in
    // view (rows between them may legitimately change height).
    // The row containing the viewport top: offset ≤ 0 < offset + height.
    const anchorFlow = [
      ...grid().querySelectorAll<HTMLElement>('[role="rowheader"]'),
    ]
      .map((header) => header.getAttribute("aria-label")!)
      .find((name) => {
        const height = parseFloat(rowOf(name)!.style.height);
        return offset(name) <= 0 && offset(name) + height > 0;
      })!;
    expect(anchorFlow).toBeDefined();
    // Still the row at the viewport top (its own height may change).
    const firstVisible = (name: string) =>
      !!rowOf(name) &&
      offset(name) <= 0 &&
      offset(name) + parseFloat(rowOf(name)!.style.height) > 0;
    const inView = (name: string) =>
      offset(name) >= -1 && offset(name) < layout.height;
    expect(inView(flow)).toBe(true);
    // Remove 110 processes: their reference rows above the view disappear.
    act(() =>
      store.deselectMany(
        entries.slice(3, 113).map((entry) => selectionKey(entry)),
      ),
    );
    // The previous comparison stays shown while the new one loads (D1).
    expect(Number(grid().getAttribute("aria-rowcount"))).toBe(before);
    expect(grid()).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Updating the comparison…")).toBeInTheDocument();
    await waitFor(() => expect(grid()).not.toHaveAttribute("aria-busy"), {
      timeout: 10000,
    });
    // The same flow is at the same place and still focused (D2).
    await waitFor(
      () => {
        expect(Number(grid().getAttribute("aria-rowcount"))).toBeLessThan(
          before,
        );
        expect(rowOf(anchorFlow)).toBeDefined();
        expect(firstVisible(anchorFlow)).toBe(true);
        expect(inView(flow)).toBe(true);
        expect(document.activeElement).toHaveAttribute("aria-label", flow);
        expect(document.activeElement).toHaveAttribute("tabindex", "0");
      },
      { timeout: 10000 },
    );
    expect(grid().getAttribute("aria-colcount")).toBe(String(PROCESSES - 109));
    await waitFor(
      () =>
        expect(
          rowOf(flow)!.querySelector('[role="gridcell"][data-state]'),
        ).not.toBeNull(),
      { timeout: 10000 },
    );
    // Re-adding appends columns immediately and again keeps the flow in view.
    act(() => store.selectMany(entries.slice(3, 113)));
    expect(grid().getAttribute("aria-colcount")).toBe(String(PROCESSES + 1));
    await waitFor(
      () => {
        expect(grid()).not.toHaveAttribute("aria-busy");
        expect(Number(grid().getAttribute("aria-rowcount"))).toBe(before);
        expect(firstVisible(anchorFlow)).toBe(true);
        expect(inView(flow)).toBe(true);
        expect(document.activeElement).toHaveAttribute("aria-label", flow);
      },
      { timeout: 10000 },
    );
    expect(app.flowRows).toHaveBeenCalled();
    // Nothing was read with the previous token for the new columns (O6).
    expect(app.busyReads).toEqual([]);
  }, 40000);

  it("adds processes above the view without ever showing other flows (QA D2, D3)", async () => {
    render(30);
    act(() => store.selectMany(entries.slice(0, 110)));
    await settledAt(1150);
    const anchor = topRow()!;
    // Sample the row at the viewport top on every DOM change.
    const seen = new Set<string>();
    const observer = new MutationObserver(() => {
      const row = topRow();
      if (row) seen.add(row.name);
    });
    observer.observe(grid(), {
      subtree: true,
      childList: true,
      attributes: true,
    });
    act(() => store.selectMany(entries.slice(110)));
    await settled();
    observer.disconnect();
    const after = topRow()!;
    expect(after.name).toBe(anchor.name);
    expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
    expect([...seen]).toEqual([anchor.name]);
  }, 40000);

  it("keeps the flow in place after a single removal once heights settle (QA D3)", async () => {
    render(30);
    await selectAll();
    await settledAt(1300);
    const anchor = topRow()!;
    act(() => store.deselectMany([selectionKey(entries[5])]));
    await settled();
    const after = topRow()!;
    expect(after.name).toBe(anchor.name);
    expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
  }, 40000);

  it("does not undo a scroll made while the comparison updates (QA D4)", async () => {
    render(300);
    await selectAll();
    await settledAt(1300);
    const anchor = topRow()!;
    act(() =>
      store.deselectMany(
        entries.slice(3, 113).map((entry) => selectionKey(entry)),
      ),
    );
    expect(grid()).toHaveAttribute("aria-busy", "true");
    scrollTo(scroller().scrollTop + 5 * STANDARD_ROW_HEIGHT);
    await settled();
    // The view stays about five rows below the old anchor, not snapped back.
    expect(topRow()!.name).not.toBe(anchor.name);
    // Five rows above the view is within the overscan, so it is mounted.
    const old = rowNamed(anchor.name);
    expect(old).toBeDefined();
    expect(rowOffset(old!)).toBeLessThan(-3 * STANDARD_ROW_HEIGHT);
  }, 40000);
  it("reorders columns without re-reading rows or losing focus (QA D1)", async () => {
    const app = render();
    await selectAll();
    act(() => at(0, -1)!.focus());
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(at(0, 0)));
    const rowReads = app.flowRows.mock.calls.length;
    const summaryReads = app.flowSummaries.mock.calls.length;
    act(() => store.move(selectionKey(entries[0]), 3));
    await act(async () => {});
    expect(Number(grid().getAttribute("aria-rowcount"))).toBeGreaterThan(0);
    expect(grid()).not.toHaveAttribute("aria-busy");
    expect(app.flowRows).toHaveBeenCalledTimes(rowReads);
    expect(app.flowSummaries).toHaveBeenCalledTimes(summaryReads);
    // The tab stop follows its process to the new column.
    await waitFor(() => expect(document.activeElement).toBe(at(0, 3)));
    expect(document.activeElement).toHaveAccessibleName(
      new RegExp(`^${entries[0].name}: `),
    );
  });

  it("keeps the header strip horizontally aligned with the cells", async () => {
    render();
    await selectAll();
    const strip = document.querySelector<HTMLElement>(
      ".process-header-scroller",
    )!;
    scrollTo(0, 1234);
    expect(strip.scrollLeft).toBe(1234);
    act(() => {
      strip.scrollLeft = 480;
      fireEvent.scroll(strip);
    });
    expect(scroller().scrollLeft).toBe(480);
  });
});
