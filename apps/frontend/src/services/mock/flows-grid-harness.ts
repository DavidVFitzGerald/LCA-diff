/**
 * Shared harness for the windowed Flows grid tests (#23, #69): the large
 * synthetic workload (220 processes × 2,000+ generated mixed-sign rows)
 * through the comparison mock with spied reads, a stubbed jsdom layout and
 * view helpers. Split across test files because each test of this workload
 * adds ~100 MB to the worker heap.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterAll, beforeAll, expect, vi } from "vitest";
import { AnnouncerProvider } from "../../app/announcer";
import { SelectionProvider, useSelectionStore } from "../../app/selection";
import type { SelectedProcess, SelectionStore } from "../../app/selection";
import { FlowsGrid } from "../../components/comparison/FlowsGrid";
import { STANDARD_ROW_HEIGHT } from "../../components/comparison/geometry";
import type {
  FlowCellsRequest,
  ComparisonRowsRequest,
  RequestOptions,
} from "../contracts";
import { createMockComparison, freezeComparisonCatalog } from "./comparison";
import { createComparisonCatalog } from "./comparison-fixtures";
import { createDiscoveryCatalog } from "./discovery";
import { failure, mount } from "./test-harness";

export const PROCESSES = 220;
export const GENERATED_ROWS = 2000;
const discovery = createDiscoveryCatalog(PROCESSES);
// Frozen once per file, so each test's mock reads it without a ~2 s
// defensive copy (#76); every test still gets its own mock instance.
const comparisonCatalog = freezeComparisonCatalog(
  createComparisonCatalog(PROCESSES, GENERATED_ROWS, true),
);
export const entries: SelectedProcess[] = discovery.revisions[0].headers.map(
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
export const layout = { width: 1400, height: 600 };
const leading = 504; // leadingWidth(1400)
/** Registers the stubbed jsdom layout for the calling test file. */
export function stubGridLayout() {
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
}

export let store!: SelectionStore;
function Probe() {
  const value = useSelectionStore();
  useEffect(() => {
    store = value;
  }, [value]);
  return null;
}

export function render(latency = 0) {
  const comparison = createMockComparison({
    catalog: comparisonCatalog,
    scenario: { latency_ms: latency },
  });
  const signals: AbortSignal[] = [];
  // Reads issued while the previous comparison is shown (must be none).
  const busyReads: string[] = [];
  const busy = (name: string) => {
    if (document.querySelector('[role="grid"][aria-busy="true"]'))
      busyReads.push(name);
  };
  // Row-page fault injection (#69): `faults` lists row pages, by process
  // count and page index, that fail with TEMPORARILY_UNAVAILABLE (`times`
  // attempts each). Page indexes are tracked through the returned cursors.
  const faults: { processes: number; page: number; times: number }[] = [];
  const cursorPage = new Map<string, number>();
  const pageReads: { processes: number; page: number; ok: boolean }[] = [];
  const flowRows = vi.fn(
    async (input: ComparisonRowsRequest, options?: RequestOptions) => {
      const processes = input.process_ids.length;
      const page =
        input.cursor === undefined
          ? 0
          : (cursorPage.get(JSON.stringify([processes, input.cursor])) ?? -1);
      const fault = faults.find(
        (entry) =>
          entry.processes === processes && entry.page === page && entry.times,
      );
      if (fault) {
        fault.times -= 1;
        pageReads.push({ processes, page, ok: false });
        await new Promise((resolve) => setTimeout(resolve, latency));
        return failure("TEMPORARILY_UNAVAILABLE", true);
      }
      const result = await comparison.flowRows(input, options);
      if (result.ok && result.data.next_cursor !== null)
        cursorPage.set(
          JSON.stringify([processes, result.data.next_cursor]),
          page + 1,
        );
      pageReads.push({ processes, page, ok: result.ok });
      return result;
    },
  );
  const flowCells = vi.fn(
    (input: FlowCellsRequest, options?: RequestOptions) => {
      busy("flowCells");
      if (options?.signal) signals.push(options.signal);
      return comparison.flowCells(input, options);
    },
  );
  const app = mount({
    catalog: discovery,
    wrap: () => ({ flowRows, flowCells }),
    ui: createElement(
      SelectionProvider,
      null,
      createElement(
        AnnouncerProvider,
        null,
        createElement(Probe),
        createElement(FlowsGrid),
      ),
    ),
  });
  return {
    ...app,
    flowRows,
    flowCells,
    signals,
    busyReads,
    faults,
    pageReads,
  };
}

export const grid = () =>
  screen.getByRole("grid", { name: "Flows comparison" });
export const scroller = () => grid();
export const valueCells = () =>
  grid().querySelectorAll('[role="gridcell"][data-state]');
export const at = (row: number, column: number) =>
  grid().querySelector<HTMLElement>(
    `[data-row="${row}"][data-col="${column}"]`,
  );
export async function selectAll() {
  act(() => store.selectMany(entries));
  await waitFor(() => expect(valueCells().length).toBeGreaterThan(0), {
    timeout: 5000,
  });
}
export function scrollTo(top: number, left = scroller().scrollLeft) {
  act(() => {
    scroller().scrollTop = top;
    scroller().scrollLeft = left;
    fireEvent.scroll(scroller());
  });
}

/** A mounted row's top relative to the viewport top, in px. */
export function rowOffset(row: HTMLElement) {
  return (
    Number(/translateY\((.+)px\)/.exec(row.style.transform)![1]) -
    scroller().scrollTop
  );
}
export function rowNamed(name: string) {
  return [...grid().querySelectorAll<HTMLElement>('[role="rowheader"]')]
    .find((header) => header.getAttribute("aria-label") === name)
    ?.closest<HTMLElement>('[role="row"]');
}
/** The loaded row containing the viewport top, with its offset and index. */
export function topRow() {
  for (const row of grid().querySelectorAll<HTMLElement>('[role="row"]')) {
    const offset = rowOffset(row);
    if (offset > 0 || offset + parseFloat(row.style.height) <= 0) continue;
    const name = row
      .querySelector('[role="rowheader"]:not([aria-busy])')
      ?.getAttribute("aria-label");
    return name ? { name, offset, index: Number(row.dataset.index) } : null;
  }
  return null;
}
/** Loaded rows intersecting the viewport, top first. */
export function rowsInView() {
  return [...grid().querySelectorAll<HTMLElement>('[role="row"]')]
    .map((row) => ({
      row,
      offset: rowOffset(row),
      name: row
        .querySelector('[role="rowheader"]:not([aria-busy])')
        ?.getAttribute("aria-label"),
    }))
    .filter(
      ({ row, offset, name }) =>
        name &&
        offset < layout.height &&
        offset + parseFloat(row.style.height) > 0,
    )
    .sort((a, b) => a.offset - b.offset)
    .map(({ name, offset }) => ({ name: name!, offset }));
}
/** The selected process whose reference flow a row label names. */
export function processOf(label: string) {
  const entry = entries.find((candidate) =>
    label.includes(`Process Name: ${candidate.name};`),
  );
  expect(entry).toBeDefined();
  return entry!;
}
/** Samples the flow at the viewport top and the row count on DOM changes. */
export function watchView() {
  const names = new Set<string>();
  const counts = new Set<number>();
  const observer = new MutationObserver(() => {
    const row = topRow();
    if (row) names.add(row.name);
    counts.add(Number(grid().getAttribute("aria-rowcount")));
  });
  observer.observe(grid(), {
    subtree: true,
    childList: true,
    attributes: true,
  });
  return { names, counts, stop: () => observer.disconnect() };
}
export const loadError = () =>
  screen.findByRole("alert", {}, { timeout: 10000 }).then((alert) => {
    expect(alert).toHaveTextContent("Flow values could not be loaded.");
    return alert;
  });
/** Idle, every mounted row summarized, and nothing moving any more. */
export async function settled() {
  await waitFor(
    () => {
      expect(grid()).not.toHaveAttribute("aria-busy");
      expect(grid().querySelector('[role="rowheader"][aria-busy]')).toBeNull();
    },
    { timeout: 15000 },
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
}
export async function settledAt(row: number) {
  scrollTo(row * STANDARD_ROW_HEIGHT + 20);
  await waitFor(
    () =>
      expect(
        grid().querySelector(
          `[role="rowheader"][data-row="${row + 5}"]:not([aria-busy])`,
        ),
      ).not.toBeNull(),
    { timeout: 15000 },
  );
  await settled();
}
