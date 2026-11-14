/**
 * Shared process headers and comparability warnings (#21) through the
 * discovery mock, mounted on their own with the shared selection store.
 * Component-level evidence; the browser journey is e2e/process-headers.spec.ts.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createElement, Fragment, useEffect } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SelectionProvider, useSelectionStore } from "../../app/selection";
import type { SelectedProcess, SelectionStore } from "../../app/selection";
import { ComparisonHeader } from "../../components/comparison/ComparisonHeader";
import { decimalString } from "../contracts";
import type { HeadersRequest, ProcessHeader } from "../contracts";
import type { DiscoveryCatalog } from "./discovery";
import { catalog, failure, many, mount, settle } from "./test-harness";

const LONG =
  "Électricité, moyenne tension, réseau 🇨🇭 — 長い名前のテスト process with an exceptionally long descriptive name";

/** r1 with varied reference bases plus 300 plain leaves; r2 with one `1e0`. */
function bases(): DiscoveryCatalog {
  const base = catalog([
    {
      id: "r1",
      name: "Alpha catalog",
      version: "2026 v1",
      leaves: [
        { name: "Alpha", path: ["t", "a"] },
        { name: "Beta", geography: "", path: ["t", "a"] },
        { name: "Gamma", path: ["t", "a"] },
        { name: "Delta", path: ["t", "a"] },
        { name: LONG, path: ["t", "a"] },
        ...many(300, ["t", "bulk"]),
      ],
    },
    {
      id: "r2",
      name: "Alpha catalog",
      version: "2026 v2",
      leaves: [{ name: "Alpha", path: ["t", "a"] }],
    },
  ]);
  const patch: Record<string, Partial<ProcessHeader>> = {
    "r1:p1": { reference_amount: decimalString("1.0") },
    "r1:p2": { reference_amount: decimalString("2") },
    "r1:p3": { reference_unit: "MJ" },
    "r1:p4": {
      reference_amount: decimalString("0.000000000000000000012345678901234567"),
      reference_flow_name: "",
    },
    "r2:p0": { reference_amount: decimalString("1e0") },
  };
  return {
    releases: base.releases,
    revisions: base.revisions.map(({ revision, headers }) => ({
      revision,
      headers: headers.map((header) => ({ ...header, ...patch[header.id] })),
    })),
  };
}
const entry = (header: ProcessHeader): SelectedProcess => ({
  release_id: header.release_id,
  revision_id: header.revision_id,
  id: header.id,
  name: header.name,
  geography: header.geography,
  path: header.category_path,
});

let store!: SelectionStore;
function Probe() {
  const value = useSelectionStore();
  useEffect(() => {
    store = value;
  }, [value]);
  return null;
}
function render(options: Parameters<typeof mount>[0] = {}) {
  const fixture = options.catalog ?? bases();
  const all = new Map(
    fixture.revisions.flatMap(({ headers }) =>
      headers.map((header) => [header.id, entry(header)] as const),
    ),
  );
  const app = mount({
    ...options,
    catalog: fixture,
    ui: createElement(
      SelectionProvider,
      null,
      createElement(
        Fragment,
        null,
        createElement(Probe),
        createElement(ComparisonHeader, { tab: "flows" }),
      ),
    ),
  });
  const pick = (...ids: string[]) =>
    act(() => store.selectMany(ids.map((id) => all.get(id)!)));
  const requested = () =>
    app.headers.mock.calls.map(
      ([input]) => (input as HeadersRequest).process_ids,
    );
  return { ...app, pick, requested };
}
const columns = () => screen.queryAllByRole("group");
const column = (name: string) => screen.getByRole("group", { name });
const warning = () => document.querySelector(".comparability-status")!;
const loaded = () =>
  waitFor(() =>
    expect(document.querySelector('[aria-busy="true"]')).toBeNull(),
  );

/** jsdom has no layout: give the header scroller a measurable width. */
const viewport = { width: 1000 };
beforeAll(() => {
  for (const property of ["clientWidth", "offsetWidth"])
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("process-header-scroller")
          ? viewport.width
          : 0;
      },
    });
});
afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
});

describe("shared process headers", () => {
  it("shows the five metadata fields in selection order with exact amounts and safe blanks", async () => {
    const app = render();
    await settle();
    expect(columns()).toHaveLength(0);
    expect(app.headers).not.toHaveBeenCalled();
    app.pick("r1:p2", "r1:p0", "r1:p1", "r1:p4");
    await loaded();
    // Accessible names follow the canonical selection order.
    expect(
      columns().map((group) => group.textContent?.split("Location")[0]),
    ).toEqual(["Gamma", "Alpha", "Beta", LONG]);
    const alpha = within(column("Alpha"));
    for (const [term, value] of [
      ["Location", "CH"],
      ["Reference flow", "Synthetic output"],
      ["Amount", "1"],
      ["Unit", "kg"],
    ])
      expect(alpha.getByText(term).nextElementSibling).toHaveTextContent(value);
    expect(within(column("Beta")).getByText("1.0")).toBeVisible();
    // Missing geography and reference-flow name are never invented.
    expect(
      within(column("Beta")).getByText("Location").nextElementSibling,
    ).toContainElement(within(column("Beta")).getByLabelText("not specified"));
    const long = column(LONG);
    expect(
      within(long).getByText("Reference flow").nextElementSibling,
    ).toHaveTextContent("—");
    // Full identity, exact tiny amount and release/revision are in the
    // accessible description even when the visible text is ellipsized.
    expect(long).toHaveAccessibleDescription(
      `Process: ${LONG}; Location: CH; Reference flow: not specified; Reference amount: 0.000000000000000000012345678901234567; Reference unit: kg; Release: Alpha catalog 2026 v1; Revision: r1-rev; Process ID: r1:p4`,
    );
    expect(column("Beta")).toHaveAccessibleDescription(
      /^Process: Beta; Location: not specified; /,
    );
  });

  it("warns only when exact amounts or units differ and never alters values", async () => {
    const app = render();
    // `1`, `1.0` and `1e0` (another release) are the same quantity.
    app.pick("r1:p0", "r1:p1", "r2:p0");
    await loaded();
    expect(columns()).toHaveLength(3);
    expect(warning()).toBeEmptyDOMElement();
    app.pick("r1:p3");
    await waitFor(() =>
      expect(warning()).toHaveTextContent(
        "Different reference quantities. Selected processes have different reference units. No normalization has been applied.",
      ),
    );
    // Non-blocking: no dialog or confirmation, and amounts stay exact.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(column("Beta")).getByText("1.0")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Why?" }),
    ).toHaveAccessibleDescription(/does not rescale or convert them/);
    act(() => store.deselect(JSON.stringify(["r1", "r1:p3"])));
    await waitFor(() => expect(warning()).toBeEmptyDOMElement());
    app.pick("r1:p2");
    await waitFor(() =>
      expect(warning()).toHaveTextContent("different reference amounts."),
    );
    app.pick("r1:p3");
    await waitFor(() =>
      expect(warning()).toHaveTextContent(
        "different reference amounts and units.",
      ),
    );
    act(() => store.clear());
    await waitFor(() => expect(warning()).toBeEmptyDOMElement());
    expect(columns()).toHaveLength(0);
  });

  it("fetches bounded batches of uncached IDs only and never refetches on reorder", async () => {
    const app = render();
    const bulk = Array.from({ length: 250 }, (_, index) => `r1:p${index + 5}`);
    app.pick(...bulk);
    await loaded();
    expect(app.requested().map((ids) => ids.length)).toEqual([100, 100, 50]);
    act(() => store.move(JSON.stringify(["r1", bulk[0]]), 200));
    await settle();
    expect(app.headers).toHaveBeenCalledTimes(3);
    app.pick("r1:p0");
    await loaded();
    expect(app.requested().slice(3)).toEqual([["r1:p0"]]);
    act(() => store.deselect(JSON.stringify(["r1", bulk[1]])));
    await settle();
    expect(app.headers).toHaveBeenCalledTimes(4);
  });

  it("keeps the normal maximum width for few columns and windows many at the minimum", async () => {
    const app = render();
    app.pick("r1:p0", "r1:p2");
    await loaded();
    const scroller = () =>
      document.querySelector<HTMLElement>(".process-header-scroller")!;
    expect(scroller()).toHaveAttribute("data-column-width", "240");
    app.pick(...Array.from({ length: 298 }, (_, index) => `r1:p${index + 5}`));
    await loaded();
    expect(scroller()).toHaveAttribute("data-column-width", "120");
    const mounted = screen.getAllByRole("listitem");
    // 1000px / 120px ≈ 9 visible plus overscan, never all 300 columns.
    expect(mounted.length).toBeGreaterThan(5);
    expect(mounted.length).toBeLessThan(20);
    expect(mounted[0]).toHaveAttribute("aria-setsize", "300");
    expect(mounted[0]).toHaveAttribute("aria-posinset", "1");
    expect(mounted[0]).toHaveStyle({ width: "120px" });
  });

  it("has one tab stop, moves by keyboard and reveals full identity on focus and hover", async () => {
    const app = render();
    app.pick(
      "r1:p0",
      "r1:p1",
      ...Array.from({ length: 60 }, (_, i) => `r1:p${i + 5}`),
    );
    await loaded();
    const tabbable = () => columns().filter((group) => group.tabIndex === 0);
    expect(tabbable()).toEqual([column("Alpha")]);
    const panel = screen.getByTestId("process-header-panel");
    expect(panel).toBeEmptyDOMElement();
    act(() => column("Alpha").focus());
    expect(panel).toHaveTextContent("Process ID: r1:p0");
    fireEvent.keyDown(column("Alpha"), { key: "ArrowRight" });
    await waitFor(() => expect(column("Beta")).toHaveFocus());
    expect(tabbable()).toEqual([column("Beta")]);
    expect(panel).toHaveTextContent("Location: not specified");
    // End reaches a column that was not mounted and focuses it.
    fireEvent.keyDown(column("Beta"), { key: "End" });
    await waitFor(() => expect(column("Leaf 0059")).toHaveFocus());
    expect(panel).toHaveTextContent("Process: Leaf 0059");
    fireEvent.keyDown(column("Leaf 0059"), { key: "ArrowRight" });
    expect(column("Leaf 0059")).toHaveFocus();
    fireEvent.keyDown(column("Leaf 0059"), { key: "Home" });
    await waitFor(() => expect(column("Alpha")).toHaveFocus());
    act(() => column("Alpha").blur());
    expect(panel).toBeEmptyDOMElement();
    fireEvent.mouseEnter(column("Beta"));
    expect(panel).toHaveTextContent("Reference amount: 1.0");
    fireEvent.mouseLeave(column("Beta"));
    expect(panel).toBeEmptyDOMElement();
    expect(app.headers.mock.calls.length).toBeGreaterThan(0);
  });

  it("rejects responses for another revision or other processes and retries", async () => {
    let mode: "revision" | "missing" | "ok" = "revision";
    const app = render({
      wrap: (discovery) => ({
        headers: async (input, ...rest) => {
          const result = await discovery.headers(input, ...rest);
          if (!result.ok || mode === "ok") return result;
          return mode === "missing"
            ? { ok: true, data: { ...result.data, items: [] } }
            : {
                ok: true,
                data: {
                  ...result.data,
                  items: result.data.items.map((header) => ({
                    ...header,
                    revision_id: "other-rev",
                  })),
                },
              };
        },
      }),
    });
    app.pick("r1:p0");
    const alert = () => screen.findByRole("alert");
    expect(await alert()).toHaveTextContent("(STALE_SNAPSHOT)");
    expect(column("Alpha")).toHaveAttribute("aria-busy", "true");
    mode = "missing";
    fireEvent.click(
      within(await alert()).getByRole("button", { name: "Retry" }),
    );
    await waitFor(async () =>
      expect(await alert()).toHaveTextContent("(UNKNOWN_PROCESS)"),
    );
    mode = "ok";
    fireEvent.click(
      within(await alert()).getByRole("button", { name: "Retry" }),
    );
    await loaded();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("explains a failed header read without clearing the selection", async () => {
    const app = render({
      wrap: () => ({
        headers: async () => failure("TEMPORARILY_UNAVAILABLE", true),
      }),
    });
    app.pick("r1:p0", "r1:p2");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Process details could not be loaded (TEMPORARILY_UNAVAILABLE).",
    );
    expect(columns()).toHaveLength(2);
    expect(store.getSnapshot()).toHaveLength(2);
    // Unknown bases never claim the processes are comparable or not.
    expect(warning()).toBeEmptyDOMElement();
  });
});
