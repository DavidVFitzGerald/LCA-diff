/**
 * Reactive process search (#17) through the injected discovery mock (see
 * test-harness.ts). Component-level evidence; matching is the mock service's.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEARCH_DEBOUNCE_MS } from "../../components/process-search/fields";
import type { SearchRequest } from "../contracts";
import {
  catalog,
  failure,
  focusTree,
  installScrollGeometry,
  item,
  items,
  key,
  mount,
  settle,
  tree,
} from "./test-harness";

installScrollGeometry();

const field = (name: string) => screen.getByRole("textbox", { name });
const type = (name: string, value: string) =>
  fireEvent.change(field(name), { target: { value } });
const labels = () => items().map((row) => row.getAttribute("aria-label"));
const listed = () =>
  within(screen.getByRole("list", { name: "Selected processes" }))
    .queryAllByRole("listitem")
    .map((row) => row.textContent!.replace(/×$/, ""));
const fieldsOf = (call: unknown[]) => (call[0] as SearchRequest).fields;
const filteredCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter((call) => Object.keys(fieldsOf(call)).length > 0);

/** Two releases with mixed-case names, punctuation and several fields. */
const searchable = () =>
  catalog([
    {
      id: "r1",
      name: "Alpha catalog",
      version: "v1",
      leaves: [
        { name: "Road Transport, lorry", path: ["transport", "road"] },
        {
          name: "road transport (diesel)",
          geography: "DE",
          path: ["transport", "road", "freight"],
        },
        { name: "Rail transport", path: ["transport", "rail"] },
        { name: "Steel.*plate", geography: "FR", path: ["metals"] },
      ],
    },
    {
      id: "r2",
      name: "Beta catalog",
      version: "v2",
      leaves: [{ name: "Ship transport", path: ["transport", "water"] }],
    },
  ]);

describe("process search fields", () => {
  it("exposes Process Name by default and labelled advanced fields", async () => {
    mount({ catalog: searchable() });
    await tree();
    expect(
      screen.getByRole("search", { name: "Process search" }),
    ).toBeVisible();
    expect(field("Process Name")).toBeVisible();
    const advanced = screen.getByRole("button", { name: "Advanced search" });
    expect(advanced).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Geography" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    fireEvent.click(advanced);
    for (const name of [
      "Geography",
      "Category",
      "Subcategory",
      "Reference Flow Name",
    ])
      expect(field(name)).toBeVisible();
    expect(
      screen.getAllByRole("textbox", { name: "Process Name" }),
    ).toHaveLength(1);
  });

  it("combines every populated field and token with AND", async () => {
    const app = mount({ catalog: searchable() });
    await tree();
    fireEvent.click(screen.getByRole("button", { name: "Advanced search" }));
    type("Process Name", "  TRANSPORT   road ");
    type("Geography", "de");
    await waitFor(() => expect(filteredCalls(app.search)).toHaveLength(2));
    expect(fieldsOf(filteredCalls(app.search)[0])).toEqual({
      process_name: "TRANSPORT road",
      geography: "de",
    });
    // One root-scoped request per release, no branch scope.
    for (const call of filteredCalls(app.search)) {
      const request = call[0] as SearchRequest;
      expect(request.branch_path).toBeUndefined();
      expect(request.revision_snapshot).toHaveLength(1);
    }
    await waitFor(() =>
      expect(item("road transport (diesel) — DE")).toBeVisible(),
    );
    expect(screen.queryByRole("treeitem", { name: /lorry/ })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: /^Rail/ })).toBeNull();
    expect(labels()).toEqual([
      "Alpha catalog v1, 1 process",
      "transport, 1 process",
      "road, 1 process",
      "freight, 1 process",
      "road transport (diesel) — DE",
      "Beta catalog v2, 0 processes",
      "No matching processes in Beta catalog",
    ]);
    for (const name of [/^Alpha/, /^transport/, /^road,/, /^freight/])
      expect(item(name)).toHaveAttribute("aria-expanded", "true");
  });
});

describe("process search results", () => {
  it("matches mixed case and literal punctuation and reports no results", async () => {
    mount({ catalog: searchable() });
    await tree();
    type("Process Name", "STEEL.*");
    await waitFor(() => expect(item("Steel.*plate — FR")).toBeVisible());
    type("Process Name", "steel.+");
    await waitFor(() =>
      expect(screen.getByText("No processes match your search.")).toBeVisible(),
    );
    expect(screen.queryByRole("treeitem", { name: /^Steel/ })).toBeNull();
    expect(
      screen.getByText("0 processes match your search."),
    ).toBeInTheDocument();
    type("Process Name", "(diesel)");
    await waitFor(() =>
      expect(item("road transport (diesel) — DE")).toBeVisible(),
    );
    expect(screen.queryByText("No processes match your search.")).toBeNull();
    // Whitespace only is no filter: the full collapsed tree returns.
    type("Process Name", "   ");
    await waitFor(() =>
      expect(labels()).toEqual(["Alpha catalog v1", "Beta catalog v2"]),
    );
  });

  it("debounces bursts and never lets a slower earlier response replace newer results", async () => {
    let slow = true;
    const signals: AbortSignal[] = [];
    const app = mount({
      catalog: searchable(),
      wrap: (discovery) => ({
        search: async (input, options) => {
          if (input.fields.process_name === "rail" && slow) {
            signals.push(options!.signal!);
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          return discovery.search(input, options);
        },
      }),
    });
    await tree();
    for (const value of ["r", "ra", "rai", "rail"]) type("Process Name", value);
    await waitFor(() => expect(filteredCalls(app.search)).toHaveLength(2));
    await new Promise((resolve) =>
      setTimeout(resolve, SEARCH_DEBOUNCE_MS + 50),
    );
    expect(
      filteredCalls(app.search).map((c) => fieldsOf(c).process_name),
    ).toEqual(["rail", "rail"]);
    slow = false;
    type("Process Name", "ship");
    await waitFor(() => expect(item("Ship transport — CH")).toBeVisible());
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await act(() => new Promise((resolve) => setTimeout(resolve, 1600)));
    expect(item("Ship transport — CH")).toBeVisible();
    expect(screen.queryByRole("treeitem", { name: /^Rail/ })).toBeNull();
  });

  it("shows loading, recovers from an error with Retry and keeps selections throughout", async () => {
    let fail = true;
    mount({
      catalog: searchable(),
      scenario: { latency_ms: (op) => (op === "search" ? 30 : 0) },
      wrap: (discovery) => ({
        search: async (input, options) => {
          if (
            input.fields.process_name === "ship" &&
            input.revision_snapshot[0].release_id === "r2" &&
            fail
          ) {
            fail = false;
            return failure("TEMPORARILY_UNAVAILABLE", true);
          }
          return discovery.search(input, options);
        },
      }),
    });
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^metals,/)).toBeVisible());
    act(() => item(/^metals,/).focus());
    key("ArrowRight");
    await waitFor(() => expect(item("Steel.*plate — FR")).toBeVisible());
    fireEvent.click(item("Steel.*plate — FR"));
    type("Process Name", "ship");
    await waitFor(() => expect(item("Loading Alpha catalog…")).toBeVisible());
    const error = await screen.findByRole("treeitem", {
      name: "Could not load Beta catalog. Synthetic TEMPORARILY_UNAVAILABLE Retry",
    });
    expect(listed()).toEqual(["1.Steel.*plate — FR Alpha catalog v1"]);
    fireEvent.click(error);
    await waitFor(() => expect(item("Ship transport — CH")).toBeVisible());
    fireEvent.click(item("Ship transport — CH"));
    expect(listed()).toEqual([
      "1.Steel.*plate — FR Alpha catalog v1",
      "2.Ship transport — CH Beta catalog v2",
    ]);
  });
});

describe("clearing the search", () => {
  it("resets every field, restores the prior full tree and keeps the selection", async () => {
    mount({ catalog: searchable() });
    await focusTree();
    key("ArrowRight"); // expand Alpha in the unfiltered tree
    await waitFor(() => expect(item(/^metals, 1 process/)).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Advanced search" }));
    type("Process Name", "transport");
    type("Geography", "ch");
    type("Reference Flow Name", "synthetic");
    await waitFor(() => expect(item("Ship transport — CH")).toBeVisible());
    fireEvent.click(item("Ship transport — CH"));
    // A user collapse inside the filtered view.
    act(() => item(/^Beta catalog/).focus());
    key("ArrowLeft");
    expect(item(/^Beta catalog/)).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    for (const name of [
      "Process Name",
      "Geography",
      "Category",
      "Subcategory",
      "Reference Flow Name",
    ])
      expect(field(name)).toHaveValue("");
    expect(field("Process Name")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    await waitFor(() =>
      expect(labels()).toEqual([
        "Alpha catalog v1, 4 processes",
        "metals, 1 process",
        "transport, 3 processes",
        "Beta catalog v2",
      ]),
    );
    expect(item(/^Alpha catalog/)).toHaveAttribute("aria-expanded", "true");
    expect(listed()).toEqual(["1.Ship transport — CH Beta catalog v2"]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    await settle();
  });

  it("does not move focus while typing or when results arrive", async () => {
    mount({ catalog: searchable() });
    await focusTree();
    const input = field("Process Name");
    act(() => input.focus());
    type("Process Name", "road");
    await waitFor(() => expect(item(/^road transport/)).toBeVisible());
    expect(input).toHaveFocus();
  });
});

describe("repeated and collapsed filters", () => {
  it("renders a filter reused from the query cache", async () => {
    const app = mount({ catalog: searchable() });
    await tree();
    type("Process Name", "ship");
    await waitFor(() => expect(item("Ship transport — CH")).toBeVisible());
    type("Process Name", "rail");
    await waitFor(() => expect(item("Rail transport — CH")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() =>
      expect(labels()).toEqual(["Alpha catalog v1", "Beta catalog v2"]),
    );
    const calls = filteredCalls(app.search).length;
    for (const [value, leaf] of [
      ["ship", "Ship transport — CH"],
      ["rail", "Rail transport — CH"],
    ] as const) {
      type("Process Name", value);
      await waitFor(() => expect(item(leaf)).toBeVisible());
      expect(screen.queryByRole("treeitem", { name: /^Loading/ })).toBeNull();
      expect(
        screen.getByText(/^1 process matches your search\.$/),
      ).toBeInTheDocument();
    }
    // Fresh cache entries answered without new requests.
    expect(filteredCalls(app.search)).toHaveLength(calls);
  });

  it("keeps a collapsed filtered release's count and the summary", async () => {
    mount({ catalog: searchable() });
    await tree();
    type("Process Name", "transport");
    await waitFor(() => expect(item("Ship transport — CH")).toBeVisible());
    expect(
      screen.getByText("4 processes match your search."),
    ).toBeInTheDocument();
    act(() => item(/^Beta catalog/).focus());
    key("ArrowLeft");
    expect(item("Beta catalog v2, 1 process")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.getByText("4 processes match your search."),
    ).toBeInTheDocument();
    key("ArrowRight");
    await waitFor(() => expect(item("Ship transport — CH")).toBeVisible());
  });
});
