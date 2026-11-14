/**
 * Windowed Flows grid (#23) over the large synthetic workload: 220 selected
 * processes × 2,000+ generated mixed-sign rows, through the comparison mock
 * with spied reads. jsdom has no layout, so element sizes are stubbed; the
 * browser journey is e2e/flows-grid.spec.ts.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createElement, Fragment, useEffect } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SelectionProvider, useSelectionStore } from "../../app/selection";
import type { SelectedProcess, SelectionStore } from "../../app/selection";
import { FlowsGrid } from "../../components/comparison/FlowsGrid";
import { STANDARD_ROW_HEIGHT } from "../../components/comparison/geometry";
import type {
  FlowCellsRequest,
  FlowSummariesRequest,
  ComparisonRowsRequest,
  RequestOptions,
} from "../contracts";
import { createMockComparison } from "./comparison";
import { createComparisonCatalog } from "./comparison-fixtures";
import { createDiscoveryCatalog } from "./discovery";
import { mount } from "./test-harness";

const PROCESSES = 220;
const GENERATED_ROWS = 2000;
const discovery = createDiscoveryCatalog(PROCESSES);
const comparisonCatalog = createComparisonCatalog(
  PROCESSES,
  GENERATED_ROWS,
  true,
);
const entries: SelectedProcess[] = discovery.revisions[0].headers.map(
  (header) => ({
    release_id: header.release_id,
    revision_id: header.revision_id,
    id: header.id,
    name: header.name,
    geography: header.geography,
    path: header.category_path,
  }),
);

/** Stubbed layout: a 1,400 × 600 grid; the header strip is what remains. */
const layout = { width: 1400, height: 600 };
const leading = 504; // leadingWidth(1400)
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains("process-header-scroller"))
        return layout.width - leading;
      if (
        this.classList.contains("comparison-frame") ||
        this.classList.contains("comparison-grid-scroller")
      )
        return layout.width;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("comparison-grid-scroller")
        ? layout.height
        : 0;
    },
  });
  // jsdom stores scroll offsets but has no scrollTo.
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
      // Browsers dispatch scroll asynchronously.
      setTimeout(() => this.dispatchEvent(new Event("scroll")));
    },
  });
});
afterAll(() => {
  for (const property of ["clientWidth", "clientHeight", "scrollTo"])
    Reflect.deleteProperty(HTMLElement.prototype, property);
});

let store!: SelectionStore;
function Probe() {
  const value = useSelectionStore();
  useEffect(() => {
    store = value;
  }, [value]);
  return null;
}

function render(latency = 0) {
  const comparison = createMockComparison({
    catalog: comparisonCatalog,
    scenario: { latency_ms: latency },
  });
  const signals: AbortSignal[] = [];
  const flowRows = vi.fn(
    (input: ComparisonRowsRequest, options?: RequestOptions) =>
      comparison.flowRows(input, options),
  );
  const flowSummaries = vi.fn(
    (input: FlowSummariesRequest, options?: RequestOptions) =>
      comparison.flowSummaries(input, options),
  );
  const flowCells = vi.fn(
    (input: FlowCellsRequest, options?: RequestOptions) => {
      if (options?.signal) signals.push(options.signal);
      return comparison.flowCells(input, options);
    },
  );
  const app = mount({
    catalog: discovery,
    wrap: () => ({ flowRows, flowSummaries, flowCells }),
    ui: createElement(
      SelectionProvider,
      null,
      createElement(
        Fragment,
        null,
        createElement(Probe),
        createElement(FlowsGrid),
      ),
    ),
  });
  return { ...app, flowRows, flowSummaries, flowCells, signals };
}

const grid = () => screen.getByRole("grid", { name: "Flows comparison" });
const scroller = () => grid();
const valueCells = () =>
  grid().querySelectorAll('[role="gridcell"][data-state]');
const at = (row: number, column: number) =>
  grid().querySelector<HTMLElement>(
    `[data-row="${row}"][data-col="${column}"]`,
  );
async function selectAll() {
  act(() => store.selectMany(entries));
  await waitFor(() => expect(valueCells().length).toBeGreaterThan(0), {
    timeout: 5000,
  });
}
function scrollTo(top: number, left = scroller().scrollLeft) {
  act(() => {
    scroller().scrollTop = top;
    scroller().scrollLeft = left;
    fireEvent.scroll(scroller());
  });
}

describe("windowed Flows grid (#23)", () => {
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
    await waitFor(() =>
      expect(
        [...grid().querySelectorAll<HTMLElement>('[role="row"]')].some(
          (row) => parseFloat(row.style.height) > STANDARD_ROW_HEIGHT,
        ),
      ).toBe(true),
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
