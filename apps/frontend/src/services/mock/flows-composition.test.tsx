/**
 * Flows composition (#24) through the composed App: the default synthetic
 * catalog is selected in the process tree and the comparison mock answers
 * the grid. Covers the row union and its removal, service row order,
 * identifying fields, exact values and missingness, cell warnings, empty and
 * single-process states and empty-selection transitions. jsdom has no
 * layout, so element sizes are stubbed; the browser journey is
 * e2e/flows-composition.spec.ts.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  ComparisonRowsRequest,
  FlowRow,
  RequestOptions,
} from "../contracts";
import { createMockComparison } from "./comparison";
import { createDiscoveryCatalog } from "./discovery";
import { installScrollGeometry, item, key, mount, tree } from "./test-harness";

installScrollGeometry();
/** Stubbed layout: a 1,400 × 600 grid next to the tree and selected list. */
const layout = { width: 1400, height: 600 };
const leading = 504; // the Flows block at 1,400 px
beforeAll(() => {
  const inherited = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  )!;
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("comparison-grid-scroller")
        ? layout.height
        : (inherited.get!.call(this) as number);
    },
  });
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
});
afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
});

const ALPHA = "Synthetic road service Alpha";
const BETA = "Synthetic road service Beta";
const GAMMA = "Synthetic road service Gamma";
const LABEL = { [ALPHA]: "CH", [BETA]: "DE", [GAMMA]: "CH" } as const;
type Process = keyof typeof LABEL;

function render() {
  const comparison = createMockComparison();
  const responses: FlowRow[][] = [];
  const flowRows = vi.fn(
    async (input: ComparisonRowsRequest, options?: RequestOptions) => {
      const result = await comparison.flowRows(input, options);
      if (result.ok) responses.push([...result.data.items]);
      return result;
    },
  );
  const app = mount({
    catalog: createDiscoveryCatalog(3),
    wrap: () => ({
      flowRows,
      flowSummaries: comparison.flowSummaries,
      flowCells: comparison.flowCells,
    }),
  });
  return { ...app, flowRows, responses };
}

/** Expands release › transport systems › road › operations › infrastructure. */
async function openTree() {
  await tree();
  const expand = async (row: HTMLElement, child: RegExp | string) => {
    act(() => row.focus());
    key("ArrowRight");
    await waitFor(() =>
      expect(
        screen.getAllByRole("treeitem", { name: child }).length,
      ).toBeGreaterThan(0),
    );
  };
  const [release] = screen
    .getAllByRole("treeitem")
    .filter((row) => row.getAttribute("aria-level") === "1");
  await expand(release, "transport systems, 3 processes");
  await expand(item("transport systems, 3 processes"), "road, 3 processes");
  await expand(item("road, 3 processes"), "operations, 3 processes");
  await expand(item("operations, 3 processes"), "infrastructure, 1 process");
  await expand(item("infrastructure, 1 process"), `${BETA} — DE`);
}
const node = (name: Process) => item(`${name} — ${LABEL[name]}`);
const toggle = (name: Process) => act(() => fireEvent.click(node(name)));
const removeFromList = (name: Process) =>
  act(() =>
    fireEvent.click(
      screen.getByRole("button", {
        name: `Remove ${name} — ${LABEL[name]} from selection`,
      }),
    ),
  );

const flowsPanel = () => screen.getByRole("tabpanel", { name: "Flows" });
const queryGrid = () =>
  screen.queryByRole("grid", { name: "Flows comparison" });
const grid = () => screen.getByRole("grid", { name: "Flows comparison" });
const rowHeaders = () =>
  [...grid().querySelectorAll<HTMLElement>('[role="rowheader"]')].sort(
    (a, b) => Number(a.dataset.row) - Number(b.dataset.row),
  );
const rowNames = () => rowHeaders().map((h) => h.getAttribute("aria-label")!);
const columnNames = () =>
  [
    ...screen
      .getByRole("list", { name: "Process columns" })
      .querySelectorAll<HTMLElement>('[role="group"]'),
  ]
    .sort(
      (a, b) => Number(a.dataset.columnIndex) - Number(b.dataset.columnIndex),
    )
    .map((group) => group.querySelector(".process-header-name")!.textContent);
/** Accessible name of a rowheader for a fixture row. */
const identity = (
  type: string,
  name: string,
  location: string | null,
  process: string | null,
  category: string,
  subcategory: string,
  unit: string,
) =>
  [
    `Type: ${type}`,
    `Flow Name: ${name}`,
    `Location: ${location ?? "not specified"}`,
    `Process Name: ${process ?? "not specified"}`,
    `Category: ${category}`,
    `Subcategory: ${subcategory}`,
    `Unit: ${unit}`,
  ].join("; ");
const ROWS = {
  alphaReference: identity(
    "Reference",
    "Synthetic transport service",
    "CH",
    ALPHA,
    "transport systems",
    "road\\operations",
    "km",
  ),
  gammaReference: identity(
    "Reference",
    "Synthetic transport service",
    "CH",
    GAMMA,
    "transport systems",
    "road\\operations",
    "m",
  ),
  betaReference: identity(
    "Reference",
    "Synthetic transport service",
    "DE",
    BETA,
    "transport systems",
    "road\\operations\\infrastructure",
    "km",
  ),
  recovered: identity(
    "Technosphere",
    "Synthetic recovered material",
    "CH",
    "Synthetic supplier",
    "materials",
    "recovered",
    "kg",
  ),
  alphaInput: identity(
    "Technosphere",
    "Synthetic transport service",
    "CH",
    ALPHA,
    "transport systems",
    "road\\operations",
    "km",
  ),
  water: identity(
    "Ecosphere Input",
    "Synthetic water",
    null,
    null,
    "water",
    "river",
    "kg",
  ),
  airLow: identity(
    "Ecosphere Output",
    "Synthetic trace emission",
    null,
    null,
    "air",
    "lower atmosphere",
    "kg",
  ),
  airHigh: identity(
    "Ecosphere Output",
    "Synthetic trace emission",
    null,
    null,
    "air",
    "Upper atmosphere",
    "kg",
  ),
};
const rowOf = (name: string) => {
  const header = rowHeaders().find(
    (h) => h.getAttribute("aria-label") === name,
  );
  if (!header) throw new Error(`No row ${name}`);
  return Number(header.dataset.row);
};
/** The value cell of a fixture row in a process column. */
const cellAt = (name: string, process: Process) => {
  const column = columnNames().indexOf(process);
  return grid().querySelector<HTMLElement>(
    `[data-row="${rowOf(name)}"][data-col="${column}"]`,
  )!;
};
const status = () =>
  flowsPanel().querySelector(".comparison-grid-status")?.textContent ?? "";

/** Idle with every row and cell loaded and exactly `count` rows. */
async function loaded(count: number) {
  await waitFor(
    () => {
      expect(grid()).toHaveAttribute("aria-rowcount", String(count));
      expect(grid()).not.toHaveAttribute("aria-busy");
      expect(rowHeaders()).toHaveLength(count);
      expect(
        grid().querySelectorAll('[aria-busy="true"], [data-pending]'),
      ).toHaveLength(0);
      expect(status()).toBe("");
    },
    { timeout: 5000 },
  );
}
async function selectAll() {
  await openTree();
  toggle(ALPHA);
  toggle(GAMMA);
  toggle(BETA);
  await loaded(8);
}

describe("Flows composition (#24)", { timeout: 20000 }, () => {
  it("lists the union once per (flow, type) and removes rows with their last contributor (AC1)", async () => {
    render();
    await selectAll();
    expect(columnNames()).toEqual([ALPHA, GAMMA, BETA]);
    // The same flow ID as Alpha's reference and as Gamma's input: two rows
    // with distinct keys and their own cells.
    const reference = rowOf(ROWS.alphaReference);
    const input = rowOf(ROWS.alphaInput);
    expect(reference).not.toBe(input);
    expect(cellAt(ROWS.alphaReference, ALPHA)).toHaveAttribute(
      "data-state",
      "positive",
    );
    expect(cellAt(ROWS.alphaReference, GAMMA)).toHaveAttribute(
      "data-state",
      "absent",
    );
    expect(cellAt(ROWS.alphaInput, ALPHA)).toHaveAttribute(
      "data-state",
      "absent",
    );
    expect(cellAt(ROWS.alphaInput, GAMMA)).toHaveAccessibleName(
      `${GAMMA}: 3.5, positive`,
    );

    // Deselect Gamma in the Selected list: its reference row and the input
    // only it contributes go; rows others contribute stay; order is kept.
    removeFromList(GAMMA);
    await loaded(6);
    expect(columnNames()).toEqual([ALPHA, BETA]);
    expect(rowNames()).toEqual([
      ROWS.alphaReference,
      ROWS.betaReference,
      ROWS.recovered,
      ROWS.water,
      ROWS.airLow,
      ROWS.airHigh,
    ]);

    // Deselect Alpha in the tree: the airHigh row stays only while someone
    // present contributes it (Beta's airHigh is absent), so it goes too.
    toggle(ALPHA);
    await loaded(4);
    expect(columnNames()).toEqual([BETA]);
    expect(rowNames()).toEqual([
      ROWS.betaReference,
      ROWS.recovered,
      ROWS.water,
      ROWS.airLow,
    ]);
  });

  it("renders rows in the service's order without re-sorting (AC2)", async () => {
    const app = render();
    await selectAll();
    const served = app.responses.at(-1)!;
    expect(rowNames()).toHaveLength(served.length);
    expect(
      rowHeaders().map((header) =>
        header
          .getAttribute("aria-label")!
          .match(/^Type: ([^;]+); Flow Name: ([^;]+);/)!
          .slice(1),
      ),
    ).toEqual(served.map((row) => [row.flow_type, row.name]));
    expect(rowNames()).toEqual([
      ROWS.alphaReference,
      ROWS.gammaReference,
      ROWS.betaReference,
      ROWS.recovered,
      ROWS.alphaInput,
      ROWS.water,
      ROWS.airLow,
      // Case-insensitive: "Upper" after "lower" (code point order differs).
      ROWS.airHigh,
    ]);
  });

  it("shows service-supplied identifying fields, never inventing ecosphere locations (AC3)", async () => {
    render();
    await selectAll();
    const fields = (name: string) =>
      [
        ...grid().querySelectorAll(
          `[role="rowheader"][data-row="${rowOf(name)}"] > span`,
        ),
      ].map((span) => [span.textContent, span.getAttribute("title")]);
    expect(fields(ROWS.recovered)).toEqual([
      ["Tech", "Technosphere"],
      ["Synthetic recovered material", "Synthetic recovered material"],
      ["CH", "CH"],
      ["Synthetic supplier", "Synthetic supplier"],
      ["materials", "materials"],
      ["recovered", "recovered"],
      ["kg", "kg"],
    ]);
    for (const name of [ROWS.water, ROWS.airLow, ROWS.airHigh]) {
      const [, , location, process] = fields(name);
      expect(location).toEqual(["—", null]);
      expect(process).toEqual(["—", null]);
      expect(name).toContain(
        "Location: not specified; Process Name: not specified",
      );
    }
    // Compact Type labels keep the full type in title and accessible name.
    expect(fields(ROWS.water)[0]).toEqual(["Eco in", "Ecosphere Input"]);
    expect(fields(ROWS.airHigh)[0]).toEqual(["Eco out", "Ecosphere Output"]);
    expect(fields(ROWS.alphaReference)[0]).toEqual(["Ref", "Reference"]);
  });

  it("shows present zero as 0, absence as blank and full lexemes on hover/focus (AC4)", async () => {
    render();
    await selectAll();
    for (const process of [ALPHA, GAMMA, BETA] as const) {
      const water = cellAt(ROWS.water, process);
      expect(water).toHaveAttribute("data-state", "zero");
      expect(water.querySelector(".signed-label")).toHaveTextContent(/^0$/);
    }
    const absent = cellAt(ROWS.airHigh, BETA);
    expect(absent).toHaveAttribute("data-state", "absent");
    expect(absent.querySelector(".signed-label, .signed-bar")).toBeNull();
    expect(absent).toHaveTextContent(`${BETA}: No flow`, {
      normalizeWhitespace: true,
    });
    for (const cell of grid().querySelectorAll('[data-state="absent"]')) {
      expect(cell.querySelector(".signed-label, .signed-bar")).toBeNull();
      expect(cell.textContent).not.toMatch(/\b0\b/);
    }
    const alpha = cellAt(ROWS.recovered, ALPHA);
    const beta = cellAt(ROWS.recovered, BETA);
    expect(alpha.querySelector(".signed-label")).toHaveTextContent(/^-80$/);
    expect(alpha.querySelector(".signed-tooltip-value")).toHaveTextContent(
      /^-80\.000000000000000000000001$/,
    );
    expect(alpha).toHaveAccessibleName(
      /^Synthetic road service Alpha: -80\.000000000000000000000001, negative/,
    );
    expect(beta.querySelector(".signed-tooltip-value")).toHaveTextContent(
      /^20$/,
    );
    act(() => alpha.focus());
    expect(alpha).toHaveFocus();
  });

  it("renders each cell's own warnings, generically, without touching others (AC5)", async () => {
    render();
    await selectAll();
    const icon = (cell: HTMLElement) =>
      cell.querySelector('[data-testid="cell-warning"]');
    const beta = cellAt(ROWS.recovered, BETA);
    const gamma = cellAt(ROWS.recovered, GAMMA);
    const alpha = cellAt(ROWS.recovered, ALPHA);
    // The synthetic unresolved-reference fallback, on Beta's cell only.
    expect(icon(beta)).toHaveTextContent("!");
    expect(beta).toHaveAccessibleName(
      /^Synthetic road service Beta: 20, positive\. Warning: Unresolved reference: .*not verified.*fallback/,
    );
    expect(
      beta.querySelector('[data-code="UNRESOLVED_REFERENCE_FALLBACK"]'),
    ).toBeInTheDocument();
    act(() => beta.focus());
    expect(beta).toHaveFocus();
    expect(beta.querySelector('[role="tooltip"]')).toHaveTextContent(
      /^20 Warning: Unresolved reference: .*fallback flow is used$/,
    );
    // Aggregated duplicates render the same way on Alpha's own cell.
    expect(icon(alpha)).toHaveTextContent("!");
    expect(alpha).toHaveAccessibleName(
      /Warning: Synthetic duplicate exchanges aggregated during ingestion\.$/,
    );
    expect(alpha.querySelector("[data-code]")).toHaveAttribute(
      "data-code",
      "AGGREGATED_DUPLICATES",
    );
    // Same value, no warning: identical geometry and label, no marker.
    expect(icon(gamma)).toBeNull();
    expect(gamma).toHaveAccessibleName(`${GAMMA}: 20, positive`);
    for (const selector of [".signed-bar", ".zero-axis", ".signed-label"])
      expect(beta.querySelector<HTMLElement>(selector)!.style.cssText).toBe(
        gamma.querySelector<HTMLElement>(selector)!.style.cssText,
      );
    expect(beta.style.height).toBe(gamma.style.height);
    expect(beta.querySelector(".signed-label")).toHaveTextContent(/^20$/);
    // No other cell, rowheader or header carries a warning.
    expect(
      grid().querySelectorAll('[data-testid="cell-warning"]'),
    ).toHaveLength(2);
    const header = grid().querySelector(
      `[role="rowheader"][data-row="${rowOf(ROWS.recovered)}"]`,
    )!;
    expect(header.getAttribute("aria-label")).not.toMatch(/warning/i);
    expect(
      screen.getByRole("list", { name: "Process columns" }).textContent,
    ).not.toMatch(/warning/i);
  });

  it("shows the empty state first and after the last removal, then a clean single comparison (AC6, AC8)", async () => {
    const app = render();
    await openTree();
    const empty = () =>
      within(flowsPanel()).getByRole("heading", {
        name: "Compare process flows",
      });
    expect(empty()).toBeVisible();
    expect(
      within(flowsPanel()).getByText(
        "Select processes in the left sidebar to start your comparison.",
      ),
    ).toBeVisible();
    expect(queryGrid()).toBeNull();
    expect(app.flowRows).not.toHaveBeenCalled();

    toggle(ALPHA);
    toggle(GAMMA);
    toggle(BETA);
    await loaded(8);
    // N → 0: the empty state, with no stale status or grid.
    for (const name of [BETA, ALPHA, GAMMA] as const) removeFromList(name);
    expect(empty()).toBeVisible();
    expect(queryGrid()).toBeNull();
    expect(
      within(flowsPanel()).queryByText(/Updating the comparison/),
    ).toBeNull();

    // 0 → 1: exactly Beta's represented rows, not the previous 8.
    toggle(BETA);
    await waitFor(() => expect(grid()).toBeInTheDocument());
    expect(Number(grid().getAttribute("aria-rowcount"))).not.toBe(8);
    await loaded(4);
    expect(rowNames()).toEqual([
      ROWS.betaReference,
      ROWS.recovered,
      ROWS.water,
      ROWS.airLow,
    ]);
    expect(grid()).toHaveAttribute("aria-colcount", "2");
  });

  it("keeps the comparability warning above unnormalized values (AC6)", async () => {
    render();
    await openTree();
    toggle(ALPHA);
    toggle(GAMMA);
    await loaded(7);
    const warning = flowsPanel().querySelector(".comparability-warning")!;
    expect(warning).toHaveTextContent(/different reference units/);
    expect(
      warning.compareDocumentPosition(grid()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(columnNames()).toEqual([ALPHA, GAMMA]);
    // Each reference stays its stored lexeme (1 km and 1 m), not rescaled.
    expect(cellAt(ROWS.alphaReference, ALPHA)).toHaveAccessibleName(
      `${ALPHA}: 1, positive`,
    );
    expect(cellAt(ROWS.gammaReference, GAMMA)).toHaveAccessibleName(
      `${GAMMA}: 1, positive`,
    );

    toggle(BETA);
    await loaded(8);
    expect(
      flowsPanel().querySelector(".comparability-warning"),
    ).toHaveTextContent(/different reference amounts and units/);
    const beta = cellAt(ROWS.betaReference, BETA);
    expect(beta).toHaveAccessibleName(
      `${BETA}: 2.0000000000000000000000001, positive`,
    );
    expect(cellAt(ROWS.recovered, ALPHA)).toHaveAccessibleName(
      /: -80\.000000000000000000000001, negative/,
    );
  });
});
