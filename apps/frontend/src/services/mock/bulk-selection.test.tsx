/**
 * Filter-scoped bulk selection and tri-state parents (#19) through the injected
 * discovery mock (see test-harness.ts). Component-level evidence.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResolveSelectionRequest } from "../contracts";
import {
  catalog,
  failure,
  geometry,
  installScrollGeometry,
  item,
  key,
  many,
  mount,
  settle,
  tree,
  verified,
} from "./test-harness";

installScrollGeometry();

const field = (name: string) => screen.getByRole("textbox", { name });
const type = (name: string, value: string) =>
  fireEvent.change(field(name), { target: { value } });
const heading = () =>
  screen.getByRole("button", { name: /^Selected processes \(\d+\)$/ });
const listed = () =>
  within(screen.getByRole("list", { name: "Selected processes" }))
    .queryAllByRole("listitem")
    .map((row) => row.textContent!.replace(/×$/, "").replace(/^\d+\./, ""));
const check = (name: string | RegExp) =>
  fireEvent.click(item(name).querySelector(".tree-check")!);
const requests = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((call) => call[0] as ResolveSelectionRequest);

/** r1: 260 road leaves (six tree pages, three resolve windows) and rail. */
const big = () =>
  catalog([
    {
      id: "r1",
      name: "Big",
      version: "v1",
      leaves: [
        ...many(260, ["t", "road"], "Road"),
        ...many(10, ["t", "rail"], "Rail"),
      ],
    },
    {
      id: "r2",
      name: "Other",
      version: "v2",
      leaves: [{ name: "Ship", path: ["t", "water"] }],
    },
  ]);
async function open(path: (string | RegExp)[]) {
  await tree();
  for (const name of path) {
    await waitFor(() => expect(item(name)).toBeVisible());
    act(() => item(name).focus());
    key("ArrowRight");
    await waitFor(() =>
      expect(item(name)).toHaveAttribute("aria-expanded", "true"),
    );
  }
  await settle();
}
const status = () => document.querySelector(".bulk-status")!;

describe("bulk branch selection", () => {
  it("selects every eligible ID across cursors from a partly loaded branch", async () => {
    geometry.tree = 32 * 80;
    const app = mount({ catalog: big() });
    await open([/^Big v1/, /^t, 270/, /^road, 260/]);
    expect(
      await screen.findByRole("treeitem", {
        name: "Load more in road (50 of 260 loaded)",
      }),
    ).toBeVisible();
    check(/^road, 260/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (260)"),
    );
    const resolves = requests(app.resolveSelection);
    expect(resolves).toHaveLength(3);
    for (const request of resolves)
      expect(request).toMatchObject({
        scope: "branch",
        branch_path: ["t", "road"],
        fields: {},
        limit: 100,
        revision_snapshot: [{ release_id: "r1", revision_id: "r1-rev" }],
      });
    expect(app.headers).toHaveBeenCalledTimes(3);
    expect(item(/^road, 260/)).toHaveAttribute("aria-checked", "true");
    expect(item(/^t, 270/)).toHaveAttribute("aria-checked", "mixed");
    expect(item(/^Big v1/)).toHaveAttribute("aria-checked", "mixed");
    expect(item(/^rail, 10/)).toHaveAttribute("aria-checked", "false");
    expect(item("Road 0003 — CH")).toHaveAttribute("aria-checked", "true");
    expect(status()).toHaveTextContent("Selected 260 processes in road.");
    // Deselect from the checked branch by keyboard.
    act(() => item(/^road, 260/).focus());
    key(" ");
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (0)"),
    );
    expect(item(/^Big v1/)).toHaveAttribute("aria-checked", "false");
  });

  it("keeps existing order and appends new IDs by name, geography and ID", async () => {
    mount({
      catalog: catalog([
        {
          id: "r1",
          name: "Order",
          version: "v",
          leaves: [
            { name: "Beta", path: ["x"] },
            { name: "alpha", geography: "DE", path: ["x"] },
            { name: "Alpha", path: ["x"] },
            { name: "alpha", path: ["x"] },
            { name: "Zulu", path: ["y"] },
          ],
        },
      ]),
    });
    await open([/^Order v/, /^x, 4/, /^y, 1/]);
    fireEvent.click(item("Zulu — CH"));
    fireEvent.click(item("Beta — CH"));
    act(() => item(/^x, 4/).focus());
    key(" ");
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (5)"),
    );
    expect(listed()).toEqual([
      "Zulu — CH Order v",
      "Beta — CH Order v",
      "Alpha — CH Order v",
      "alpha — CH Order v",
      "alpha — DE Order v",
    ]);
    expect(item(/^Order v/)).toHaveAttribute("aria-checked", "true");
    // Enter still expands and collapses branches; it never bulk-selects.
    act(() => item(/^y, 1/).focus());
    key("Enter");
    expect(item(/^y, 1/)).toHaveAttribute("aria-expanded", "false");
    expect(heading()).toHaveTextContent("Selected processes (5)");
  });
});

describe("filter-scoped bulk selection", () => {
  const vehicles = () =>
    catalog([
      {
        id: "r1",
        name: "Fleet",
        version: "v1",
        leaves: [
          { name: "diesel lorry", path: ["road"] },
          { name: "electric lorry", path: ["road"] },
          { name: "diesel van", path: ["road"] },
          { name: "diesel train", path: ["rail"] },
        ],
      },
      {
        id: "r2",
        name: "Fleet",
        version: "v2",
        leaves: [{ name: "diesel ship", path: ["water"] }],
      },
    ]);

  it("acts only on matching descendants and never removes hidden selections", async () => {
    const app = mount({ catalog: vehicles() });
    await open([/^Fleet v1/, /^road, 3/]);
    fireEvent.click(item("electric lorry — CH"));
    type("Process Name", "diesel");
    await waitFor(() => expect(item("diesel van — CH")).toBeVisible());
    await waitFor(() =>
      expect(item(/^road, 2/)).not.toHaveAttribute("aria-busy"),
    );
    // The hidden electric lorry is outside the filtered scope.
    expect(item(/^road, 2/)).toHaveAttribute("aria-checked", "false");
    check(/^road, 2/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (3)"),
    );
    expect(requests(app.resolveSelection).at(-1)).toMatchObject({
      scope: "branch",
      branch_path: ["road"],
      fields: { process_name: "diesel" },
    });
    expect(item(/^road, 2/)).toHaveAttribute("aria-checked", "true");
    expect(item(/^Fleet v1, 3/)).toHaveAttribute("aria-checked", "mixed");
    check(/^road, 2/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (1)"),
    );
    expect(listed()).toEqual(["electric lorry — CH Fleet v1"]);
    check(/^road, 2/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (3)"),
    );
    // Clearing changes the actionable scope, not the selection.
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(item(/^road, 3/)).toBeVisible());
    expect(item(/^road, 3/)).toHaveAttribute("aria-checked", "true");
    expect(heading()).toHaveTextContent("Selected processes (3)");
    fireEvent.click(item("electric lorry — CH"));
    expect(item(/^road, 3/)).toHaveAttribute("aria-checked", "mixed");
  });

  it("selects and deselects all matches across releases", async () => {
    const app = mount({ catalog: vehicles() });
    await tree();
    type("Process Name", "diesel");
    await waitFor(() => expect(item("diesel ship — CH")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Select all matches" }));
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (4)"),
    );
    expect(
      requests(app.resolveSelection).map((r) => [
        r.scope,
        r.revision_snapshot[0].release_id,
      ]),
    ).toEqual([
      ["all_matching", "r1"],
      ["all_matching", "r2"],
    ]);
    expect(listed()).toEqual([
      "diesel lorry — CH Fleet v1",
      "diesel train — CH Fleet v1",
      "diesel van — CH Fleet v1",
      "diesel ship — CH Fleet v2",
    ]);
    expect(status()).toHaveTextContent("Selected 4 processes in all matches.");
    await waitFor(() =>
      expect(item(/^Fleet v1, 3/)).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Deselect all matches" }),
    );
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (0)"),
    );
  });
});

describe("bulk action states", () => {
  it("shows progress, disables other bulk actions and cancels without changing the selection", async () => {
    const app = mount({
      catalog: big(),
      scenario: {
        latency_ms: (op) => (op === "resolveSelection" ? 10_000 : 0),
      },
    });
    await open([/^Big v1/, /^t, 270/]);
    check(/^road, 260/);
    await waitFor(() =>
      expect(status()).toHaveTextContent("Updating processes in road…"),
    );
    const signal = app.resolveSelection.mock.calls[0][1]!.signal!;
    check(/^rail, 10/); // a second bulk action is ignored while one runs
    expect(app.resolveSelection).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(status() as HTMLElement).getByRole("button", { name: "Cancel" }),
    );
    await settle();
    expect(signal.aborted).toBe(true);
    expect(status()).toHaveTextContent(
      "Cancelled: selection unchanged for road.",
    );
    expect(heading()).toHaveTextContent("Selected processes (0)");
  });

  it("explains failed resolve and header reads, keeps the selection and retries", async () => {
    let resolveFails = 1;
    let headerFails = 1;
    mount({
      catalog: big(),
      wrap: (discovery) => ({
        resolveSelection: async (...args) =>
          resolveFails-- > 0
            ? failure("TEMPORARILY_UNAVAILABLE", true)
            : discovery.resolveSelection(...args),
        headers: async (...args) =>
          headerFails-- > 0
            ? failure("RELEASE_UNAVAILABLE", true)
            : discovery.headers(...args),
      }),
    });
    await open([/^Big v1/, /^t, 270/, /^rail, 10/]);
    fireEvent.click(item("Rail 0002 — CH"));
    check(/^rail, 10/);
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Selection unchanged: could not update processes in rail. Synthetic TEMPORARILY_UNAVAILABLE",
      ),
    );
    expect(heading()).toHaveTextContent("Selected processes (1)");
    fireEvent.click(
      within(status() as HTMLElement).getByRole("button", { name: "Retry" }),
    );
    await waitFor(() =>
      expect(status()).toHaveTextContent(
        "Selection unchanged: could not update processes in rail. Synthetic RELEASE_UNAVAILABLE",
      ),
    );
    expect(heading()).toHaveTextContent("Selected processes (1)");
    fireEvent.click(
      within(status() as HTMLElement).getByRole("button", { name: "Retry" }),
    );
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (10)"),
    );
    expect(listed()[0]).toBe("Rail 0002 — CH Big v1");
  });

  it("recovers a shared tri-state matching set after Cancel", async () => {
    mount({
      catalog: big(),
      scenario: {
        latency_ms: (op) => (op === "resolveSelection" ? 300 : 0),
      },
    });
    await open([/^Big v1/, /^t, 270/, /^rail, 10/]);
    fireEvent.click(item("Rail 0001 — CH"));
    type("Process Name", "rail");
    await waitFor(() =>
      expect(item(/^Big v1, 10/)).toHaveAttribute("aria-busy"),
    );
    // The all-matches resolve shares the in-flight matching-set read.
    fireEvent.click(screen.getByRole("button", { name: "Select all matches" }));
    fireEvent.click(
      within(status() as HTMLElement).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(
      () => expect(item(/^Big v1, 10/)).not.toHaveAttribute("aria-busy"),
      { timeout: 2000 },
    );
    expect(item(/^rail, 10/)).toHaveAttribute("aria-checked", "mixed");
    expect(heading()).toHaveTextContent("Selected processes (1)");
  });

  it("hides Retry for non-retryable failures", async () => {
    mount({
      catalog: big(),
      scenario: { failures: { resolveSelection: "STALE_SNAPSHOT" } },
    });
    await open([/^Big v1/, /^t, 270/]);
    check(/^rail, 10/);
    await waitFor(() =>
      expect(status()).toHaveTextContent("Selection unchanged"),
    );
    expect(
      within(status() as HTMLElement).queryByRole("button", { name: "Retry" }),
    ).toBeNull();
    fireEvent.click(
      within(status() as HTMLElement).getByRole("button", { name: "Dismiss" }),
    );
    expect(status()).toBeEmptyDOMElement();
  });

  it("applies nothing when signout interrupts a bulk action", async () => {
    const app = mount({
      catalog: big(),
      scenario: {
        latency_ms: (op) => (op === "resolveSelection" ? 10_000 : 0),
      },
    });
    await open([/^Big v1/, /^t, 270/]);
    check(/^road, 260/);
    await waitFor(() => expect(app.resolveSelection).toHaveBeenCalled());
    const signal = app.resolveSelection.mock.calls[0][1]!.signal!;
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await settle();
    expect(signal.aborted).toBe(true);
    app.emit(verified("account-a"));
    await tree();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    expect(status()).toBeEmptyDOMElement();
  });
});

/** 300 road leaves: "Road even" (150) and "Aodd road" (150). */
const mixed = () =>
  catalog([
    {
      id: "r1",
      name: "Big",
      version: "v1",
      leaves: [
        ...many(150, ["t", "road"], "Road even"),
        ...many(150, ["t", "road"], "Aodd road"),
      ],
    },
  ]);

describe("bulk selection regressions (QA F-1–F-3)", () => {
  it("bulk-selects a filtered branch beyond the loaded page and keeps hidden selections", async () => {
    geometry.tree = 32 * 10;
    const app = mount({ catalog: mixed() });
    await open([/^Big v1/, /^t, 300/, /^road, 300/]);
    fireEvent.click(item("Aodd road 0003 — CH"));
    type("Process Name", "even");
    await waitFor(() => expect(item(/^road, 150/)).toBeVisible());
    await settle();
    expect(screen.queryAllByRole("treeitem").length).toBeLessThan(40);
    check(/^road, 150/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (151)"),
    );
    const resolves = requests(app.resolveSelection).filter(
      (r) => r.scope === "branch",
    );
    expect(resolves).toHaveLength(2);
    for (const request of resolves)
      expect(request).toMatchObject({ fields: { process_name: "even" } });
    expect(listed().slice(0, 3)).toEqual([
      "Aodd road 0003 — CH Big v1",
      "Road even 0000 — CH Big v1",
      "Road even 0001 — CH Big v1",
    ]);
    await waitFor(() =>
      expect(item(/^road, 150/)).toHaveAttribute("aria-checked", "true"),
    );
    check(/^road, 150/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (1)"),
    );
    expect(listed()).toEqual(["Aodd road 0003 — CH Big v1"]);
  });

  it("explains a failed matching-set read, never stays busy and still toggles correctly", async () => {
    let fail = false;
    mount({
      catalog: mixed(),
      wrap: (discovery) => ({
        resolveSelection: async (...args) =>
          fail && args[0].scope === "all_matching"
            ? failure("TEMPORARILY_UNAVAILABLE", true)
            : discovery.resolveSelection(...args),
      }),
    });
    await open([/^Big v1/, /^t, 300/]);
    check(/^road, 300/);
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (300)"),
    );
    fail = true;
    type("Process Name", "road");
    await waitFor(() =>
      expect(
        screen.getByText(
          /^Could not check which selected processes match the search in Big v1/,
        ),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(item(/^Big v1/)).not.toHaveAttribute("aria-busy"),
    );
    await settle();
    expect(item(/^Big v1/)).not.toHaveAttribute("aria-busy");
    // The toggle resolves its own scope: all 300 are selected, so it deselects.
    act(() => item(/^road, 300/).focus());
    key(" ");
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (0)"),
    );
    expect(status()).toHaveTextContent("Deselected 300 processes in road.");
    key(" ");
    await waitFor(() =>
      expect(heading()).toHaveTextContent("Selected processes (300)"),
    );
    // Retry recovers the exact scope-relative state.
    fail = false;
    fireEvent.click(
      screen
        .getByText(/^Could not check which selected processes match/)
        .closest("p")!
        .querySelector("button")!,
    );
    await waitFor(() =>
      expect(item(/^road, 300/)).toHaveAttribute("aria-checked", "true"),
    );
    expect(
      screen.queryByText(/^Could not check which selected processes match/),
    ).toBeNull();
  });

  it("keeps the starting scope when the filter changes during a run", async () => {
    const app = mount({
      catalog: mixed(),
      scenario: { latency_ms: (op) => (op === "resolveSelection" ? 200 : 0) },
    });
    await tree();
    type("Process Name", "even");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Select all matches" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Select all matches" }));
    await waitFor(() => expect(app.resolveSelection).toHaveBeenCalled());
    type("Process Name", "odd");
    await waitFor(
      () => expect(heading()).toHaveTextContent("Selected processes (150)"),
      { timeout: 5000 },
    );
    expect(listed().every((text) => text.startsWith("Road even"))).toBe(true);
  });

  it("applies nothing when the account changes mid-action", async () => {
    const app = mount({
      catalog: mixed(),
      scenario: { latency_ms: (op) => (op === "resolveSelection" ? 300 : 0) },
    });
    await open([/^Big v1/, /^t, 300/]);
    check(/^road, 300/);
    await waitFor(() => expect(app.resolveSelection).toHaveBeenCalled());
    const signal = app.resolveSelection.mock.calls[0][1]!.signal!;
    app.emit(verified("account-b"));
    await tree();
    await waitFor(() => expect(signal.aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 600));
    await settle();
    expect(heading()).toHaveTextContent("Selected processes (0)");
  });

  it("cancels during the details phase, marks branch checkboxes busy and allows a new action", async () => {
    mount({
      catalog: mixed(),
      scenario: { latency_ms: (op) => (op === "headers" ? 10_000 : 0) },
    });
    await open([/^Big v1/, /^t, 300/]);
    check(/^road, 300/);
    await waitFor(() =>
      expect(status()).toHaveTextContent("loading details for 300 found"),
    );
    expect(item(/^road, 300/).querySelector(".tree-check")).toHaveClass(
      "disabled",
    );
    fireEvent.click(
      within(status() as HTMLElement).getByRole("button", { name: "Cancel" }),
    );
    await settle();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    expect(item(/^road, 300/).querySelector(".tree-check")).not.toHaveClass(
      "disabled",
    );
    check(/^road, 300/);
    await waitFor(() =>
      expect(status()).toHaveTextContent("Updating processes in road"),
    );
  });
});
