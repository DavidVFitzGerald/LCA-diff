import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "../../app/announcer";
import { DifferencesProvider } from "../../app/differences";
import { IndicatorProvider } from "../../app/indicators";
import { useIndicators } from "../../app/indicator-context";
import type { IndicatorSelection } from "../../app/indicator-context";
import {
  SelectionProvider,
  selectionKey,
  useSelection,
  useSelectionStore,
} from "../../app/selection";
import type { SelectionStore } from "../../app/selection";
import { ScoresGrid } from "../../components/comparison/ScoresGrid";
import { decimalString } from "../contracts";
import type { IndicatorTree } from "../contracts";
import { rowGeometry } from "../../components/comparison/geometry";
import { createMockComparison } from "./comparison";
import { createDiscoveryCatalog } from "./discovery";
import { failure, mount } from "./test-harness";
import { negative, PRECISE, scoresCatalog } from "./scores-test-fixtures";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("process-header-scroller") ? 896 : 1400;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
      setTimeout(() => this.dispatchEvent(new Event("scroll")));
    },
  });
});
afterAll(() => {
  for (const key of ["clientWidth", "clientHeight", "scrollTo"])
    Reflect.deleteProperty(HTMLElement.prototype, key);
});

let store: SelectionStore;
let indicators: IndicatorSelection;
function Probe() {
  const selection = useSelectionStore();
  const chosen = useIndicators();
  const { entries } = useSelection();
  useEffect(() => {
    store = selection;
    indicators = chosen;
  }, [selection, chosen]);
  return entries.length && chosen.ids.length ? <ScoresGrid /> : null;
}
/** A second release's method whose GWP 100 is also a default (#107). */
const FOREIGN_RELEASE = "99999999-0000-4000-8000-000000000001";
const FOREIGN = "99999999-0000-4000-8000-0000000000aa";
function withForeignRelease(tree: IndicatorTree): IndicatorTree {
  const indicator = {
    id: FOREIGN,
    release_id: FOREIGN_RELEASE,
    method_id: "foreign-ipcc",
    method_name: "IPCC 2021",
    method_version: "",
    category: null,
    name: "GWP 100",
    unit: "kg CO2-eq",
    source_order: 0,
  };
  return {
    ...tree,
    methods: [
      ...tree.methods,
      {
        id: "foreign-ipcc",
        release_id: FOREIGN_RELEASE,
        name: "IPCC 2021",
        version: "",
        source_order: 0,
        indicators: [indicator],
        categories: [],
      },
    ],
    default_indicator_ids: [...tree.default_indicator_ids, FOREIGN],
  };
}
function render(processes = 220, rowCount = 230, latency = 0, foreign = false) {
  const catalog = scoresCatalog(processes, rowCount);
  const discovery = createDiscoveryCatalog(processes);
  const comparison = createMockComparison({
    catalog,
    scenario: { latency_ms: latency },
  });
  const busyReads: string[] = [];
  const busy = (name: string) => {
    if (document.querySelector('[role="grid"][aria-busy="true"]'))
      busyReads.push(name);
  };
  const scoreRows = vi.fn(comparison.scoreRows);
  const scoreCells = vi.fn<typeof comparison.scoreCells>((input, options) => {
    busy("cells");
    return comparison.scoreCells(input, options);
  });
  const app = mount({
    catalog: discovery,
    wrap: () => ({
      ...comparison,
      scoreRows,
      scoreCells,
      ...(foreign
        ? {
            indicatorTree: async (
              ...args: Parameters<typeof comparison.indicatorTree>
            ) => {
              const result = await comparison.indicatorTree(...args);
              return result.ok
                ? { ...result, data: withForeignRelease(result.data) }
                : result;
            },
          }
        : {}),
    }),
    ui: createElement(
      SelectionProvider,
      null,
      createElement(
        IndicatorProvider,
        null,
        createElement(
          DifferencesProvider,
          null,
          createElement(AnnouncerProvider, null, createElement(Probe)),
        ),
      ),
    ),
  });
  const entries = discovery.revisions[1].headers.map((h) => ({
    release_id: h.release_id,
    revision_id: h.revision_id,
    id: h.id,
    name: h.name,
    geography: h.geography,
    path: h.category_path,
  }));
  const ids = catalog.revisions[1].indicator_tree.methods[0].indicators.map(
    ({ id }) => id,
  );
  return {
    ...app,
    comparison,
    scoreRows,
    scoreCells,
    busyReads,
    entries,
    ids,
  };
}
const grid = () => screen.getByRole("grid", { name: "Scores comparison" });
const at = (row: number, col: number) =>
  grid().querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;
const fields = (row: number) =>
  [...at(row, -1).querySelectorAll("span")].map((s) => s.textContent);
async function loaded(row = 0, col = 0) {
  await waitFor(
    () => {
      expect(grid()).not.toHaveAttribute("aria-busy");
      expect(at(row, col)).toHaveAttribute("data-state");
    },
    { timeout: 10000 },
  );
}
async function select(app: ReturnType<typeof render>, allRows = true) {
  await waitFor(() => expect(indicators.ids).toEqual([app.ids[0]]));
  act(() => {
    if (allRows) indicators.toggle(app.ids.slice(1));
    store.selectMany(app.entries);
  });
  await loaded();
}
function scroll(top: number, left: number) {
  act(() => {
    grid().scrollTop = top;
    grid().scrollLeft = left;
    fireEvent.scroll(grid());
  });
}

describe("Scores grid (#28)", { timeout: 20000 }, () => {
  it("requests only indicators of the selected processes' releases (#107)", async () => {
    const app = render(3, 2, 0, true);
    // Both releases' defaults are chosen; the mock, like the API, rejects
    // indicators outside the comparison's revision snapshot.
    await waitFor(() =>
      expect([...indicators.ids].sort()).toEqual([app.ids[0], FOREIGN].sort()),
    );
    act(() => store.selectMany(app.entries));
    await loaded();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(app.scoreRows).toHaveBeenCalled();
    for (const [input] of app.scoreRows.mock.calls)
      expect(input.indicator_ids).toEqual([app.ids[0]]);
    for (const [input] of app.scoreCells.mock.calls)
      expect(input.indicator_ids).not.toContain(FOREIGN);
  });

  it("renders source identity, valid zero and unavailable cells with whole-selection signed geometry", async () => {
    const app = render(6, 2);
    await select(app);
    await loaded(1, 5);
    expect(fields(0)).toEqual([
      "IPCC 2021 / 2021",
      "",
      "Z first source indicator",
      "kg CO2-eq",
    ]);
    expect(fields(1)[2]).toBe("A indicator 0001");
    expect(at(0, 0)).toHaveAttribute("data-state", "zero");
    expect(at(0, 0).querySelector(".signed-label")).toHaveTextContent(/^0$/);
    for (const col of [1, 2]) {
      expect(at(0, col)).toHaveAttribute("data-state", "unavailable");
      expect(at(0, col).querySelector(".signed-label")).toHaveTextContent(
        /^N\/A$/,
      );
      expect(at(0, col).querySelector(".signed-bar")).toBeNull();
    }
    expect(at(0, 2).querySelector('[role="tooltip"]')).toHaveTextContent(
      /basis has not been verified.*Synthetic basis unverified/,
    );
    expect(at(0, 4)).toHaveAccessibleName(
      new RegExp(`: ${PRECISE.replaceAll(".", "\\.")}, positive$`),
    );
    expect(at(0, 5).querySelector('[role="tooltip"]')).toHaveTextContent(
      negative,
    );
    const geometry = rowGeometry({
      max_positive: decimalString(PRECISE),
      max_negative_magnitude: decimalString(negative.slice(1)),
    });
    expect(at(0, 5).style.height).toBe(`${geometry.rowHeight}px`);
    expect(
      at(0, 5).querySelector<HTMLElement>(".signed-bar")!.style.height,
    ).toBe("40px");
    expect(
      at(0, 4).querySelector<HTMLElement>(".signed-bar")!.style.height,
    ).toBe("10px");
    expect(
      screen.getByText(/different reference amounts and units/),
    ).toBeVisible();
    const rowsBefore = app.scoreRows.mock.calls.length;
    const summaryBefore = app.scoreRows.mock.calls.length;
    act(() => store.move(selectionKey(app.entries[5]), 0));
    await loaded();
    expect(at(0, 0)).toHaveAccessibleName(
      new RegExp(`: ${negative.replaceAll(".", "\\.")}, negative$`),
    );
    expect(app.scoreRows).toHaveBeenCalledTimes(rowsBefore);
    expect(app.scoreRows).toHaveBeenCalledTimes(summaryBefore);
  });

  it("virtualizes both axes, pages and batches bounded windows, keeping offscreen extrema unchanged", async () => {
    const app = render();
    await select(app);
    expect(grid()).toHaveAttribute("aria-rowcount", "230");
    expect(grid()).toHaveAttribute("aria-colcount", "221");
    expect(grid().querySelectorAll('[role="row"]').length).toBeLessThan(30);
    expect(grid().querySelectorAll('[role="gridcell"]').length).toBeLessThan(
      500,
    );
    await loaded(0, 3);
    const height = at(0, 3).style.height;
    expect(
      at(0, 3).querySelector<HTMLElement>(".signed-bar")!.style.height,
    ).toBe("1px");
    expect(height).toBe("62px");
    expect(app.scoreRows).toHaveBeenCalledTimes(1);
    scroll(0, 219 * 110 - 400);
    await loaded(0, 219);
    expect(at(0, 219).style.height).toBe(height);
    expect(
      at(0, 219).querySelector<HTMLElement>(".signed-bar")!.style.height,
    ).toBe("40px");
    expect(app.scoreRows).toHaveBeenCalledTimes(1);
    scroll(180 * 62, 219 * 110 - 400);
    await waitFor(
      () => {
        const loadedDeep = [
          ...grid().querySelectorAll<HTMLElement>(
            "[role=rowheader]:not([aria-busy])",
          ),
        ].find(
          (header) =>
            Number(header.dataset.row) >= 100 &&
            at(Number(header.dataset.row), 219)?.hasAttribute("data-state"),
        );
        expect(loadedDeep).toBeDefined();
        const index = Number(loadedDeep!.dataset.row);
        expect(fields(index)[2]).toBe(
          `A indicator ${String(index).padStart(4, "0")}`,
        );
      },
      { timeout: 10000 },
    );
    for (const [request] of app.scoreRows.mock.calls)
      expect(request.limit).toBe(100);

    for (const [request] of app.scoreCells.mock.calls)
      expect(
        request.process_ids.length * request.indicator_ids.length,
      ).toBeLessThanOrEqual(1000);
    expect(app.busyReads).toEqual([]);
  });

  it("holds old rows without mixed reads during indicator changes, then retries a row error", async () => {
    const app = render(6, 3, 20);
    await select(app, false);
    app.scoreRows.mockImplementationOnce(async () =>
      failure("TEMPORARILY_UNAVAILABLE", true),
    );
    act(() => indicators.toggle(app.ids.slice(1)));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await loaded(2, 5);
    expect(fields(2)[2]).toBe("A indicator 0002");
    expect(app.busyReads).toEqual([]);
    expect(grid()).toHaveAttribute("aria-rowcount", "3");
  });
});
