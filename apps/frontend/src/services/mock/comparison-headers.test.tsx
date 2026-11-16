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
import { QueryClient } from "@tanstack/react-query";
import { createElement, Fragment, useEffect } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AnnouncerProvider } from "../../app/announcer";
import { DifferencesProvider } from "../../app/differences";
import {
  SelectionProvider,
  selectionKey,
  useSelection,
  useSelectionStore,
} from "../../app/selection";
import type { SelectedProcess, SelectionStore } from "../../app/selection";
import { ComparisonHeader } from "../../components/comparison/ComparisonHeader";
import { decimalString } from "../contracts";
import type {
  DataService,
  HeadersRequest,
  Page,
  ProcessHeader,
} from "../contracts";
import { createServiceQueries, ServiceQueryError } from "../../app/queries";
import { createMockDiscovery } from "./discovery";
import type { DiscoveryCatalog } from "./discovery";
import { bulkOrder } from "../../components/bulk-selection/scope";
import { catalog, failure, many, mount, settle } from "./test-harness";

const LONG =
  "Électricité, moyenne tension, réseau 🇨🇭 — 長い名前のテスト process with an exceptionally long descriptive name";
/** Column-operation instructions in every header's description (#25). */
const INSTRUCTIONS =
  "To move this column, press Space or Enter, then the Left or Right arrow key, Home or End, then Space or Enter to drop it or Escape to cancel. You can also drag the header. Tab reaches its remove button.";

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
/**
 * Both tabs as the workspace mounts them (#25): each tab panel shows the
 * shared headers, or its empty state (with its `data-empty-focus` heading)
 * when nothing is selected.
 */
function Tabs() {
  const { entries } = useSelection();
  return createElement(
    Fragment,
    null,
    ...(["flows", "scores"] as const).map((tab) =>
      createElement(
        "section",
        { key: tab, role: "tabpanel", "aria-label": tab, tabIndex: 0 },
        entries.length
          ? createElement(ComparisonHeader, { tab })
          : createElement(
              "h2",
              { tabIndex: -1, "data-empty-focus": "" },
              `Empty ${tab}`,
            ),
      ),
    ),
  );
}
function render(options: Parameters<typeof mount>[0] = {}, tabs = false) {
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
        DifferencesProvider,
        null,
        createElement(
          AnnouncerProvider,
          null,
          createElement(Probe),
          tabs
            ? createElement(Tabs)
            : createElement(ComparisonHeader, { tab: "flows" }),
        ),
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
      `Process: ${LONG}; Location: CH; Reference flow: not specified; Reference amount: 0.000000000000000000012345678901234567; Reference unit: kg; Release: Alpha catalog 2026 v1; Revision: r1-rev; Process ID: r1:p4 ${INSTRUCTIONS}`,
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

  it("keeps them after the default cache lifetime has passed (QA D2)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let failing = false;
      const app = render({
        wrap: (discovery) => ({
          headers: async (...args) =>
            failing
              ? failure("TEMPORARILY_UNAVAILABLE", true)
              : discovery.headers(...args),
        }),
      });
      app.pick("r1:p0", "r1:p3");
      await loaded();
      expect(warning()).toHaveTextContent("different reference units.");
      // Well past TanStack's default 5-minute gcTime.
      await act(async () => {
        vi.advanceTimersByTime(30 * 60 * 1000);
      });
      failing = true;
      app.pick("r1:p2");
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "(TEMPORARILY_UNAVAILABLE)",
      );
      expect(warning()).toHaveTextContent("different reference units.");
      expect(column("Alpha")).toHaveAttribute("aria-busy", "false");
      expect(column("Delta")).toHaveAttribute("aria-busy", "false");
      expect(column("Gamma")).toHaveAttribute("aria-busy", "true");
      // Only the unread process was requested.
      expect(app.requested().slice(-1)).toEqual([["r1:p2"]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the session-long header cache on signout", async () => {
    const app = render();
    app.pick("r1:p0");
    await loaded();
    const headerEntries = () =>
      app
        .client()
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey.includes("header"));
    expect(headerEntries().length).toBeGreaterThan(0);
    app.emit({ status: "unauthenticated" });
    await waitFor(() => expect(headerEntries()).toEqual([]));
  });

  it("keeps loaded headers and known differences when a later read fails (QA D1)", async () => {
    let failing = false;
    const app = render({
      wrap: (discovery) => ({
        headers: async (...args) =>
          failing
            ? failure("TEMPORARILY_UNAVAILABLE", true)
            : discovery.headers(...args),
      }),
    });
    app.pick("r1:p0", "r1:p3");
    await loaded();
    expect(warning()).toHaveTextContent("different reference units.");
    failing = true;
    app.pick("r1:p2");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "(TEMPORARILY_UNAVAILABLE)",
    );
    // Validated headers stay; only the unread column is pending.
    expect(warning()).toHaveTextContent("different reference units.");
    expect(column("Alpha")).toHaveAttribute("aria-busy", "false");
    expect(column("Delta")).toHaveAttribute("aria-busy", "false");
    expect(within(column("Delta")).getByText("MJ")).toBeVisible();
    expect(column("Gamma")).toHaveAttribute("aria-busy", "true");
    failing = false;
    fireEvent.click(
      within(screen.getByRole("alert")).getByRole("button", { name: "Retry" }),
    );
    await loaded();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(warning()).toHaveTextContent(
      "different reference amounts and units.",
    );
    expect(app.requested().slice(-1)).toEqual([["r1:p2"]]);
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

describe("column operations (#25)", () => {
  const announcer = () => screen.getByTestId("workspace-announcer");
  const names = (container: HTMLElement = document.body) =>
    within(container)
      .queryAllByRole("group")
      .map((group) => group.querySelector(".process-header-name")!.textContent);
  const order = () => store.getSnapshot().map((selected) => selected.name);
  const press = (key: string) =>
    fireEvent.keyDown(document.activeElement!, { key, code: key });
  const panel = (tab: string) => screen.getByRole("tabpanel", { name: tab });
  const removeIn = (container: HTMLElement, name: string) =>
    within(container).getByRole("button", { name: `Remove column ${name}` });
  const headerIn = (container: HTMLElement, name: string) =>
    within(container).getByRole("group", { name });
  /** Unique keys, and exactly one header per selected process, in order. */
  const consistent = () => {
    const keys = store.getSnapshot().map(selectionKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(names()).toEqual(order());
  };

  // jsdom has no layout: the header strip is 1000 × 116 px at the origin,
  // so with four columns of 240 px, column i spans [240i, 240i + 240).
  const strip = { left: 0, top: 0, right: 1000, bottom: 116 };
  const middle = (index: number) => index * 240 + 120;
  beforeAll(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const rect = this.classList.contains("process-header-scroller")
          ? strip
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
  });
  afterAll(() => {
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore();
  });
  const POINTER = { isPrimary: true, button: 0, pointerId: 1 };
  /** Presses a header at x, moves through `path`, then releases unless told not to. */
  function drag(
    header: HTMLElement,
    x: number,
    path: readonly { x: number; y: number }[],
    release = true,
  ) {
    fireEvent.pointerDown(header, { ...POINTER, clientX: x, clientY: 50 });
    for (const point of path)
      fireEvent.pointerMove(document, {
        ...POINTER,
        clientX: point.x,
        clientY: point.y,
      });
    if (!release) return;
    const end = path.at(-1) ?? { x, y: 50 };
    fireEvent.pointerUp(document, {
      ...POINTER,
      clientX: end.x,
      clientY: end.y,
    });
  }

  it("gives each header a remove button named after its process, with one extra tab stop", async () => {
    const app = render();
    // Alpha in two releases, and Beta with no geography.
    app.pick("r1:p0", "r2:p0", "r1:p1");
    await loaded();
    const removes = () =>
      screen.getAllByRole("button", { name: /^Remove column / });
    // Disambiguated like the Selected list's buttons, never equal to them.
    await waitFor(() =>
      expect(
        removes().map((button) => button.getAttribute("aria-label")),
      ).toEqual([
        "Remove column Alpha — CH (Alpha catalog 2026 v1)",
        "Remove column Alpha — CH (Alpha catalog 2026 v2)",
        "Remove column Beta — ",
      ]),
    );
    for (const [index, group] of columns().entries()) {
      // A real button inside its own header, which keeps its description.
      expect(within(group).getByRole("button")).toBe(removes()[index]);
      expect(removes()[index].tagName).toBe("BUTTON");
      expect(removes()[index]).toHaveAttribute("type", "button");
    }
    // Only the active header's button is tabbable: one extra stop, not N.
    const tabbable = () =>
      [...document.querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
        (element) =>
          element.getAttribute("aria-label") ?? element.dataset.processId,
      );
    expect(tabbable()).toEqual([
      "r1:p0",
      "Remove column Alpha — CH (Alpha catalog 2026 v1)",
    ]);
    act(() => columns()[0].focus());
    press("End");
    await waitFor(() => expect(column("Beta")).toHaveFocus());
    expect(tabbable()).toEqual(["r1:p1", "Remove column Beta — "]);
    // Keys on the button are its own: they never pick up or move the column.
    act(() => removes()[2].focus());
    for (const key of [" ", "Enter", "ArrowLeft", "Home"]) press(key);
    expect(order()).toEqual(["Alpha", "Alpha", "Beta"]);
    expect(announcer()).toBeEmptyDOMElement();
    expect(removes()[2]).toHaveFocus();
  });

  it("removes a process everywhere from its header ×, moving focus to the next, the previous, then the empty state", async () => {
    const app = render({}, true);
    app.pick("r1:p0", "r1:p2", "r1:p3");
    await loaded();
    const flows = panel("flows");
    const scores = panel("scores");
    act(() => headerIn(flows, "Gamma").focus());
    fireEvent.click(removeIn(flows, "Gamma — CH"));
    expect(order()).toEqual(["Alpha", "Delta"]);
    expect(names(flows)).toEqual(["Alpha", "Delta"]);
    expect(names(scores)).toEqual(["Alpha", "Delta"]);
    await waitFor(() => expect(headerIn(flows, "Delta")).toHaveFocus());
    expect(announcer()).toHaveTextContent("Removed Gamma — CH from selection");
    // The last column: focus moves to the previous one.
    fireEvent.click(removeIn(flows, "Delta — CH"));
    await waitFor(() => expect(headerIn(flows, "Alpha")).toHaveFocus());
    expect(announcer()).toHaveTextContent("Removed Delta — CH from selection");
    // The only column: focus moves to the tab's empty state, not the body.
    fireEvent.click(removeIn(flows, "Alpha — CH"));
    expect(store.getSnapshot()).toEqual([]);
    expect(
      within(flows).getByRole("heading", { name: "Empty flows" }),
    ).toHaveFocus();
    expect(announcer()).toHaveTextContent("Removed Alpha — CH from selection");
    expect(app.requested()).toHaveLength(1);
  });

  it("reorders by keyboard: pick up, move, drop and cancel, announced, with focus kept", async () => {
    const app = render();
    app.pick("r1:p0", "r1:p2", "r1:p3", "r1:p1");
    await loaded();
    const reads = app.headers.mock.calls.length;
    act(() => column("Alpha").focus());
    press(" ");
    expect(announcer()).toHaveTextContent(
      "Picked up Alpha — CH at position 1 of 4. Use the Left and Right arrow keys, Home or End to move it, Space or Enter to drop it, or Escape to cancel.",
    );
    expect(column("Alpha")).toHaveClass("lifted");
    press("ArrowLeft");
    expect(announcer()).toHaveTextContent(
      "Alpha — CH is already at position 1 of 4.",
    );
    press("ArrowRight");
    expect(order()).toEqual(["Gamma", "Alpha", "Delta", "Beta"]);
    await waitFor(() => expect(column("Alpha")).toHaveFocus());
    expect(announcer()).toHaveTextContent(
      "Alpha — CH moved to position 2 of 4.",
    );
    press("End");
    expect(order()).toEqual(["Gamma", "Delta", "Beta", "Alpha"]);
    await waitFor(() => expect(column("Alpha")).toHaveFocus());
    expect(announcer()).toHaveTextContent(
      "Alpha — CH moved to position 4 of 4.",
    );
    // Escape restores the order from before the pick-up.
    press("Escape");
    expect(order()).toEqual(["Alpha", "Gamma", "Delta", "Beta"]);
    await waitFor(() => expect(column("Alpha")).toHaveFocus());
    expect(announcer()).toHaveTextContent(
      "Move cancelled. Alpha — CH is back at position 1 of 4.",
    );
    expect(column("Alpha")).not.toHaveClass("lifted");
    // Enter works like Space; dropping keeps the new order.
    press("Enter");
    press("ArrowRight");
    press("ArrowRight");
    press("Enter");
    expect(order()).toEqual(["Gamma", "Delta", "Alpha", "Beta"]);
    expect(announcer()).toHaveTextContent(
      "Alpha — CH dropped at position 3 of 4.",
    );
    await waitFor(() => expect(column("Alpha")).toHaveFocus());
    // Once dropped, arrows move focus again, not the column.
    press("ArrowRight");
    await waitFor(() => expect(column("Beta")).toHaveFocus());
    expect(order()).toEqual(["Gamma", "Delta", "Alpha", "Beta"]);
    // Leaving a picked-up column drops it where it is.
    press(" ");
    press("ArrowLeft");
    await waitFor(() => expect(column("Beta")).toHaveFocus());
    act(() => column("Beta").blur());
    await waitFor(() =>
      expect(announcer()).toHaveTextContent(
        "Beta — dropped at position 3 of 4.",
      ),
    );
    expect(column("Beta")).not.toHaveClass("lifted");
    expect(order()).toEqual(["Gamma", "Delta", "Beta", "Alpha"]);
    // Order changes never read headers again.
    expect(app.headers).toHaveBeenCalledTimes(reads);
    consistent();
  });

  it("drags a header: one move on drop, while clicks, Escape and drops outside or in place change nothing", async () => {
    const app = render();
    app.pick("r1:p0", "r1:p2", "r1:p3", "r1:p1");
    await loaded();
    const reads = app.headers.mock.calls.length;
    const move = vi.spyOn(store, "move");
    // A click and a press that travels less than the threshold are not drags.
    act(() => column("Alpha").focus());
    drag(column("Alpha"), middle(0), []);
    drag(column("Alpha"), middle(0), [{ x: middle(0) + 5, y: 52 }]);
    expect(document.querySelector(".process-header-drop")).toBeNull();
    expect(announcer()).toBeEmptyDOMElement();
    expect(column("Alpha")).toHaveFocus();
    // Over the third column, the indicator shows where it will land.
    drag(
      column("Alpha"),
      middle(0),
      [
        { x: middle(0) + 20, y: 50 },
        { x: middle(2), y: 60 },
      ],
      false,
    );
    expect(document.querySelector(".process-header-drop")).toHaveAttribute(
      "data-drop-index",
      "2",
    );
    expect(announcer()).toHaveTextContent(
      "Picked up Alpha — CH at position 1 of 4.",
    );
    expect(move).not.toHaveBeenCalled();
    fireEvent.pointerUp(document, {
      ...POINTER,
      clientX: middle(2),
      clientY: 60,
    });
    expect(move).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledWith(JSON.stringify(["r1", "r1:p0"]), 2);
    expect(order()).toEqual(["Gamma", "Delta", "Alpha", "Beta"]);
    await waitFor(() => expect(column("Alpha")).toHaveFocus());
    expect(announcer()).toHaveTextContent(
      "Alpha — CH moved to position 3 of 4.",
    );
    expect(document.querySelector(".process-header-drop")).toBeNull();
    const activate = { x: middle(3) - 20, y: 50 };
    // Escape cancels the drag.
    drag(column("Beta"), middle(3), [activate, { x: middle(0), y: 50 }], false);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    fireEvent.pointerUp(document, { ...POINTER, clientX: middle(0) });
    expect(announcer()).toHaveTextContent(
      "Move cancelled. Beta — stays at position 4 of 4.",
    );
    // Released outside the header strip.
    drag(column("Beta"), middle(3), [activate, { x: middle(0), y: 400 }]);
    expect(announcer()).toHaveTextContent(
      "Beta — was dropped outside the columns and stays at position 4 of 4.",
    );
    // Released over its own column.
    drag(column("Beta"), middle(3), [activate, { x: middle(3) + 30, y: 50 }]);
    expect(announcer()).toHaveTextContent("Beta — dropped at position 4 of 4.");
    expect(move).toHaveBeenCalledTimes(1);
    expect(order()).toEqual(["Gamma", "Delta", "Alpha", "Beta"]);
    expect(app.headers).toHaveBeenCalledTimes(reads);
    consistent();
  });

  it("keeps one shared order in both tabs after drag, keyboard reorder and removal", async () => {
    const app = render({}, true);
    app.pick("r1:p0", "r1:p2", "r1:p3");
    await loaded();
    const flows = panel("flows");
    const scores = panel("scores");
    const same = (expected: string[]) => {
      expect(order()).toEqual(expected);
      expect(names(flows)).toEqual(expected);
      expect(names(scores)).toEqual(expected);
    };
    // Keyboard reorder in Flows.
    act(() => headerIn(flows, "Delta").focus());
    press(" ");
    press("Home");
    press(" ");
    same(["Delta", "Alpha", "Gamma"]);
    // Pointer drag in Scores.
    drag(headerIn(scores, "Gamma"), middle(2), [
      { x: middle(2) - 20, y: 50 },
      { x: middle(0), y: 50 },
    ]);
    same(["Gamma", "Delta", "Alpha"]);
    // Removal in Scores, after dnd-kit stops swallowing the post-drag
    // click (50 ms).
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    fireEvent.click(removeIn(scores, "Delta — CH"));
    same(["Gamma", "Alpha"]);
  });

  it("keeps the F3 append rules after a manual reorder and a removal", async () => {
    const fixture = bases();
    const app = render({ catalog: fixture });
    app.pick("r1:p0", "r1:p2", "r1:p3", "r1:p1");
    await loaded();
    act(() => column("Beta").focus());
    press(" ");
    press("Home");
    press(" ");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove column Gamma — CH" }),
    );
    expect(order()).toEqual(["Beta", "Alpha", "Delta"]);
    // Single selects append at the end, the removed process included.
    app.pick("r1:p4");
    app.pick("r1:p2");
    expect(order()).toEqual(["Beta", "Alpha", "Delta", LONG, "Gamma"]);
    // A bulk add appends only its new processes, in bulk order, after the
    // unchanged manual order.
    const byId = new Map(
      fixture.revisions[0].headers.map((header) => [header.id, header]),
    );
    const bulk = ["r1:p7", "r1:p0", "r1:p5", "r1:p6", "r1:p1"].map((id) =>
      byId.get(id)!,
    );
    act(() => store.selectMany([...bulk].sort(bulkOrder).map(entry)));
    expect(order()).toEqual([
      "Beta",
      "Alpha",
      "Delta",
      LONG,
      "Gamma",
      "Leaf 0000",
      "Leaf 0001",
      "Leaf 0002",
    ]);
    await loaded();
    consistent();
  });
});

describe("bulk header reads seed only validated headers (QA O1)", () => {
  const ref = { release_id: "r1", revision_id: "r1-rev" };
  function setup(tamper: (page: Page<ProcessHeader>) => Page<ProcessHeader>) {
    const discovery = createMockDiscovery({ catalog: bases() });
    const data = {
      ...discovery,
      headers: async (...args: Parameters<DataService["headers"]>) => {
        const result = await discovery.headers(...args);
        return result.ok ? { ...result, data: tamper(result.data) } : result;
      },
    } as unknown as DataService;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queries = createServiceQueries(data, { namespace: "t", uid: "u1" });
    return { client, queries };
  }
  const read = ({ client, queries }: ReturnType<typeof setup>) =>
    client.fetchQuery(queries.headersFor(ref, ["r1:p0", "r1:p1"]));
  const code = (error: unknown) => (error as ServiceQueryError).detail.code;

  it.each([
    [
      "another revision",
      (page: Page<ProcessHeader>) => ({
        ...page,
        items: page.items.map((h) => ({ ...h, revision_id: "other-rev" })),
      }),
      "STALE_SNAPSHOT",
    ],
    [
      "a missing ID",
      (page: Page<ProcessHeader>) => ({ ...page, items: page.items.slice(1) }),
      "UNKNOWN_PROCESS",
    ],
    [
      "a duplicated ID",
      (page: Page<ProcessHeader>) => ({
        ...page,
        items: [page.items[0], page.items[0]],
      }),
      "UNKNOWN_PROCESS",
    ],
  ])(
    "rejects %s before anything can be cached",
    async (_, tamper, expected) => {
      const app = setup(tamper);
      const error = await read(app).catch((caught: unknown) => caught);
      expect(code(error)).toBe(expected);
      expect(
        app.queries.cachedHeaders(app.client, ref, ["r1:p0", "r1:p1"]),
      ).toEqual([]);
    },
  );

  it("returns valid headers that the selection header query can reuse", async () => {
    const app = setup((page) => page);
    const headers = await read(app);
    app.queries.rememberHeaders(app.client, headers);
    expect(
      app.queries
        .cachedHeaders(app.client, ref, ["r1:p1", "r1:p0"])
        .map(({ id }) => id),
    ).toEqual(["r1:p1", "r1:p0"]);
  });
});
