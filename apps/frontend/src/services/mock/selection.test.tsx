/**
 * Ordered process selection (#18) through the tree and selected list, with the
 * discovery mock injected (see test-harness.ts). Component-level evidence.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SELECTED_ROW_HEIGHT } from "../../components/selected-processes/SelectedProcesses";
import {
  catalog,
  focusTree,
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

const list = () => screen.queryByRole("list", { name: "Selected processes" });
const listed = () =>
  within(list()!)
    .queryAllByRole("listitem")
    .map((row) => row.textContent!.replace(/×$/, ""));
const heading = () =>
  screen.getByRole("button", { name: /^Selected processes \(\d+\)$/ });
const remove = (name: string | RegExp) => screen.getByRole("button", { name });

/** Expands the standard catalog's r1 › transport › road and water. */
async function openRoad() {
  await tree();
  const expand = async (row: RegExp | string, child: RegExp | string) => {
    act(() => item(row).focus());
    key("ArrowRight");
    await waitFor(() =>
      expect(
        screen.getAllByRole("treeitem", { name: child }).length,
      ).toBeGreaterThan(0),
    );
  };
  await expand(/^Alpha catalog 2026 v1/, /^transport, 4/);
  await expand(/^transport, 4/, "road, 3 processes");
  await expand("road, 3 processes", "Road A — DE");
  await expand("water, 1 process", "Ship — CH");
}

describe("selecting processes in the tree", () => {
  it("toggles process rows by Space, Enter and click and lists them in selection order", async () => {
    mount();
    await openRoad();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    expect(
      screen.getByText(/^No processes selected\. Use the checkboxes/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    const ch = item("Road A — CH");
    const de = item("Road A — DE");
    expect(ch).toHaveAttribute("aria-checked", "false");
    expect(item("road, 3 processes")).not.toHaveAttribute("aria-checked");
    act(() => de.focus());
    key(" ");
    expect(de).toHaveAttribute("aria-checked", "true");
    expect(de).toHaveFocus(); // Space toggles without moving focus
    fireEvent.click(ch);
    expect(ch).toHaveAttribute("aria-checked", "true");
    expect(ch).toHaveFocus();
    act(() => item("infra, 1 process").focus());
    key(" "); // Space on a branch is unbound until #19
    expect(item("infra, 1 process")).toHaveAttribute("aria-expanded", "false");
    key("Enter");
    await waitFor(() => expect(item("Infra — CH")).toBeVisible());
    act(() => item("Infra — CH").focus());
    key("Enter");
    expect(heading()).toHaveTextContent("Selected processes (3)");
    expect(listed()).toEqual([
      "1.Road A — DE Alpha catalog 2026 v1",
      "2.Road A — CH Alpha catalog 2026 v1",
      "3.Infra — CH Alpha catalog 2026 v1",
    ]);
    const rows = within(list()!).getAllByRole("listitem");
    expect(rows[1]).toHaveAttribute("aria-posinset", "2");
    expect(rows[1]).toHaveAttribute("aria-setsize", "3");
    // Repeated toggles leave a coherent state.
    act(() => ch.focus());
    for (let i = 0; i < 5; i += 1) key(" ");
    expect(ch).toHaveAttribute("aria-checked", "false");
    expect(heading()).toHaveTextContent("Selected processes (2)");
    key(" ");
    expect(listed().at(-1)).toBe("3.Road A — CH Alpha catalog 2026 v1");
  });

  it("removes from the list everywhere and reselection appends at the end", async () => {
    mount();
    await openRoad();
    fireEvent.click(item("Road A — CH"));
    fireEvent.click(item("Road A — DE"));
    fireEvent.click(item("Ship — CH"));
    fireEvent.click(remove("Remove Road A — CH from selection"));
    expect(item("Road A — CH")).toHaveAttribute("aria-checked", "false");
    expect(listed()).toEqual([
      "1.Road A — DE Alpha catalog 2026 v1",
      "2.Ship — CH Alpha catalog 2026 v1",
    ]);
    fireEvent.click(item("Road A — CH"));
    expect(listed().at(-1)).toBe("3.Road A — CH Alpha catalog 2026 v1");
  });

  it("keeps selections through collapse and paging and removes entries whose rows are hidden", async () => {
    geometry.tree = 32 * 200;
    mount({
      catalog: catalog([
        { id: "r1", name: "Big", version: "v", leaves: many(120, ["t"]) },
      ]),
    });
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^t, 120 processes/)).toBeVisible());
    key("ArrowDown");
    key("ArrowRight");
    await screen.findByRole("treeitem", { name: /^Load more in t / });
    fireEvent.click(item("Leaf 0003 — CH"));
    fireEvent.click(item("Load more in t (50 of 120 loaded)"));
    await waitFor(() => expect(item("Leaf 0070 — CH")).toBeVisible());
    fireEvent.click(item("Leaf 0070 — CH"));
    expect(item("Leaf 0003 — CH")).toHaveAttribute("aria-checked", "true");
    // Collapse the release root: no selected row is in the tree any more.
    act(() => item(/^Big v/).focus());
    key("ArrowLeft");
    expect(screen.queryByRole("treeitem", { name: /^Leaf/ })).toBeNull();
    expect(listed()).toEqual([
      "1.Leaf 0003 — CH Big v",
      "2.Leaf 0070 — CH Big v",
    ]);
    fireEvent.click(remove("Remove Leaf 0003 — CH from selection"));
    key("ArrowRight");
    await waitFor(() => expect(item(/^t, 120/)).toBeVisible());
    act(() => item(/^t, 120/).focus());
    key("ArrowRight");
    await waitFor(() => expect(item("Leaf 0003 — CH")).toBeVisible());
    expect(item("Leaf 0003 — CH")).toHaveAttribute("aria-checked", "false");
    await waitFor(() =>
      expect(item("Leaf 0070 — CH")).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("distinguishes duplicate display names in removal controls", async () => {
    mount();
    await openRoad();
    fireEvent.click(item("Road A — CH"));
    const open = async (row: RegExp | string, child: string, count = 1) => {
      act(() => item(row).focus());
      key("ArrowRight");
      await waitFor(() =>
        expect(screen.getAllByRole("treeitem", { name: child })).toHaveLength(
          count,
        ),
      );
    };
    await open(/^Alpha catalog 2026 v2/, "transport, 1 process");
    await open("transport, 1 process", "road, 1 process");
    await open("road, 1 process", "Road A — CH", 2);
    fireEvent.click(
      screen.getAllByRole("treeitem", { name: "Road A — CH" })[1],
    );
    expect(
      remove("Remove Road A — CH (Alpha catalog 2026 v2) from selection"),
    ).toBeVisible();
    expect(
      remove("Remove Road A — CH (Alpha catalog 2026 v1) from selection"),
    ).toBeVisible();
  });
});

describe("selected process list", () => {
  async function selectMany(count: number) {
    mount({
      catalog: catalog([
        { id: "r1", name: "Big", version: "v", leaves: many(count, ["t"]) },
      ]),
    });
    geometry.tree = 32 * (count + 10);
    await focusTree();
    key("ArrowRight");
    await waitFor(() => expect(item(/^t, /)).toBeVisible());
    key("ArrowDown");
    key("ArrowRight");
    for (let loaded = 50; loaded < count; loaded += 50) {
      const more = await screen.findByRole("treeitem", {
        name: `Load more in t (${loaded} of ${count} loaded)`,
      });
      fireEvent.click(more);
      await waitFor(() =>
        expect(
          screen.queryByRole("treeitem", {
            name: `Load more in t (${loaded} of ${count} loaded)`,
          }),
        ).toBeNull(),
      );
    }
    await waitFor(() =>
      expect(screen.getAllByRole("treeitem", { name: /^Leaf / })).toHaveLength(
        count,
      ),
    );
    for (const row of screen.getAllByRole("treeitem", { name: /^Leaf / }))
      fireEvent.click(row);
    await settle();
  }

  it("bounds mounted list items for 300 selections and keeps one tab stop with keyboard focus", async () => {
    await selectMany(300);
    expect(heading()).toHaveTextContent("Selected processes (300)");
    const limit = Math.ceil(geometry.list / SELECTED_ROW_HEIGHT) + 2 * 6 + 1;
    const mounted = () => within(list()!).getAllByRole("listitem");
    expect(mounted().length).toBeLessThanOrEqual(limit);
    expect(list()!.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    const first = remove("Remove Leaf 0000 — CH from selection");
    act(() => first.focus());
    key("End");
    await settle();
    const last = remove("Remove Leaf 0299 — CH from selection");
    expect(last).toHaveFocus();
    expect(list()!.scrollTop).toBeGreaterThan(
      300 * SELECTED_ROW_HEIGHT - geometry.list - SELECTED_ROW_HEIGHT,
    );
    expect(mounted().length).toBeLessThanOrEqual(limit + 1);
    key("ArrowUp");
    expect(remove("Remove Leaf 0298 — CH from selection")).toHaveFocus();
    // Removing moves focus to the next item, or the previous for the last one.
    // jsdom does not synthesize button clicks from keys; the browser test does.
    fireEvent.click(document.activeElement!);
    await settle();
    expect(remove("Remove Leaf 0299 — CH from selection")).toHaveFocus();
    fireEvent.click(remove("Remove Leaf 0299 — CH from selection"));
    await settle();
    expect(remove("Remove Leaf 0297 — CH from selection")).toHaveFocus();
    key("Home");
    await settle();
    // The first row was unmounted while scrolled away; it is a new element now.
    expect(remove("Remove Leaf 0000 — CH from selection")).toHaveFocus();
    expect(heading()).toHaveTextContent("Selected processes (298)");
    expect(document.activeElement).not.toBe(document.body);
  }, 30_000);

  it("clears all selections, keeps focus off the body and unchecks every tree row", async () => {
    mount();
    await openRoad();
    fireEvent.click(item("Road A — CH"));
    fireEvent.click(item("Ship — CH"));
    act(() => remove("Remove Ship — CH from selection").focus());
    fireEvent.click(document.activeElement!);
    await settle();
    expect(remove("Remove Road A — CH from selection")).toHaveFocus();
    fireEvent.click(document.activeElement!);
    await settle();
    const empty = screen.getByText(/^No processes selected\./);
    expect(empty).toHaveFocus();
    fireEvent.click(item("Road A — CH"));
    fireEvent.click(item("Road A — DE"));
    const clear = screen.getByRole("button", { name: "Clear all" });
    act(() => clear.focus());
    fireEvent.click(clear);
    await settle();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    expect(screen.getByText(/^No processes selected\./)).toHaveFocus();
    expect(
      screen.getByText("Cleared 2 selected processes."),
    ).toBeInTheDocument();
    expect(item("Road A — CH")).toHaveAttribute("aria-checked", "false");
    expect(item("Road A — DE")).toHaveAttribute("aria-checked", "false");
    // Tree state is untouched by clearing the selection.
    expect(item("road, 3 processes")).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses the list section without changing the selection", async () => {
    mount();
    await openRoad();
    fireEvent.click(item("Road A — CH"));
    fireEvent.click(heading());
    expect(heading()).toHaveAttribute("aria-expanded", "false");
    expect(list()).toBeNull();
    fireEvent.click(heading());
    expect(listed()).toEqual(["1.Road A — CH Alpha catalog 2026 v1"]);
  });

  it("keeps focus on the section toggle when Clear all runs with the list collapsed", async () => {
    mount();
    await openRoad();
    fireEvent.click(item("Road A — CH"));
    fireEvent.click(item("Road A — DE"));
    fireEvent.click(heading());
    expect(heading()).toHaveAttribute("aria-expanded", "false");
    const clear = screen.getByRole("button", { name: "Clear all" });
    act(() => clear.focus());
    fireEvent.click(clear);
    await settle();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    expect(heading()).toHaveFocus();
    expect(document.activeElement).not.toBe(document.body);
  });

  it("discards the selection on signout and account change without storage", async () => {
    const app = mount();
    await openRoad();
    fireEvent.click(item("Road A — CH"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await settle();
    expect(document.body).not.toHaveTextContent("Road A");
    app.emit(verified("account-a"));
    await tree();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    await openRoad();
    fireEvent.click(item("Road A — DE"));
    app.emit(verified("account-b"));
    await tree();
    expect(heading()).toHaveTextContent("Selected processes (0)");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
