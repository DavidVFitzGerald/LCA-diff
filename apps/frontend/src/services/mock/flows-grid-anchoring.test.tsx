/**
 * Flows grid view-anchoring edge cases (#23 QA O8–O10) and row-page errors
 * during the selection-change hold (#69), over the large synthetic workload
 * (see flows-grid-harness.tsx). Each removal test kills one #23 QA mutant.
 */
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectionKey } from "../../app/selection";
import {
  PROCESSES,
  at,
  entries,
  grid,
  layout,
  loadError,
  processOf,
  render,
  rowNamed,
  rowOffset,
  rowsInView,
  scrollTo,
  scroller,
  selectAll,
  settled,
  settledAt,
  store,
  stubGridLayout,
  topRow,
  watchView,
} from "./flows-grid-harness";

stubGridLayout();

// Explicit budget, as in flows-grid.test.tsx.
describe(
  "Flows grid anchoring edge cases (#23 O8, O9)",
  { timeout: 20000 },
  () => {
    it("moves focus to the tab stop on the same flow when the focused column is removed (O9)", async () => {
      render(30);
      await selectAll();
      await settledAt(1300);
      act(() => at(1312, 5)!.focus());
      const flow = at(1312, -1)!.getAttribute("aria-label")!;
      // Its reference row sorts above, so the focused flow moves up one row
      // while the node at 1312/5 stays mounted, showing another flow.
      act(() => store.deselectMany([selectionKey(entries[5])]));
      await settled();
      const focused = document.activeElement as HTMLElement;
      expect(grid()).toContainElement(focused);
      expect(focused).toHaveAttribute("tabindex", "0");
      expect(focused).toHaveAttribute("data-row", "1311");
      expect(
        focused.closest('[role="row"]')!.querySelector('[role="rowheader"]'),
      ).toHaveAttribute("aria-label", flow);
      expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    }, 40000);

    it("anchors on a later recorded flow when the first one is removed (O8)", async () => {
      render(30);
      await selectAll();
      await settledAt(60);
      const [first, second] = rowsInView();
      act(() => store.deselectMany([selectionKey(processOf(first.name))]));
      await settled();
      expect(rowNamed(first.name)).toBeUndefined();
      // The second recorded flow stays where it was read (the row above it
      // moves up into the gap), rather than taking the removed flow's place.
      const after = rowNamed(second.name)!;
      expect(Math.abs(rowOffset(after) - second.offset)).toBeLessThanOrEqual(1);
    }, 40000);

    it("re-anchors on the flows in view when every recorded flow is removed (O8)", async () => {
      render(30);
      await selectAll();
      await settledAt(60);
      const top = scroller().scrollTop;
      const index = topRow()!.index;
      // Every flow in view (at least the 12 recorded) is a reference flow.
      const removed = rowsInView().map(({ name }) => processOf(name));
      expect(removed.length).toBeGreaterThanOrEqual(12);
      act(() =>
        store.deselectMany(removed.map((entry) => selectionKey(entry))),
      );
      await settled();
      // The view keeps its position, now on the flows that moved up into it.
      expect(Math.abs(scroller().scrollTop - top)).toBeLessThanOrEqual(1);
      const anchor = topRow()!;
      expect(anchor.index).toBe(index);
      // Those flows are the new anchors: re-adding the removed processes
      // inserts rows above them without moving them.
      act(() => store.selectMany(removed));
      await settled();
      const after = topRow()!;
      expect(after.name).toBe(anchor.name);
      expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
    }, 40000);
  },
);

describe(
  "Flows grid row-page errors and the hold (#69)",
  { timeout: 20000 },
  () => {
    type App = ReturnType<typeof render>;
    const retry = (alert: HTMLElement) => {
      const button = within(alert).getByRole("button", { name: "Retry" });
      // Keyboard-reachable: a native, focusable button.
      act(() => button.focus());
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
    };
    /**
     * While the error is shown during a hold: the previous rows stay, with the
     * anchor in place; nothing but row pages is read and no update is claimed.
     */
    async function expectPaused(
      app: App,
      anchor: { name: string; offset: number },
      rowCount: number,
    ) {
      const summaries = app.flowSummaries.mock.calls.length;
      const cells = app.flowCells.mock.calls.length;
      const rows = app.flowRows.mock.calls.length;
      await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
      expect(app.flowSummaries).toHaveBeenCalledTimes(summaries);
      expect(app.flowCells).toHaveBeenCalledTimes(cells);
      expect(app.flowRows).toHaveBeenCalledTimes(rows);
      expect(Number(grid().getAttribute("aria-rowcount"))).toBe(rowCount);
      const top = topRow()!;
      expect(top.name).toBe(anchor.name);
      expect(Math.abs(top.offset - anchor.offset)).toBeLessThanOrEqual(1);
      expect(screen.queryByText("Updating the comparison…")).toBeNull();
      // The shown rows are still the previous selection's (README).
      expect(grid()).toHaveAttribute("aria-busy", "true");
    }
    /** 110 processes, deep at row 1150, then the other 110 are added. */
    async function deepThenAdd(fault?: { page: number; times: number }) {
      const app = render(30);
      act(() => store.selectMany(entries.slice(0, 110)));
      await settledAt(1150);
      const anchor = topRow()!;
      const before = Number(grid().getAttribute("aria-rowcount"));
      if (fault) app.faults.push({ processes: PROCESSES, ...fault });
      const view = watchView();
      act(() => store.selectMany(entries.slice(110)));
      return { app, anchor, before, view };
    }
    async function expectRestored(
      app: App,
      anchor: { name: string; offset: number },
      view: ReturnType<typeof watchView>,
    ) {
      await settled();
      view.stop();
      const after = topRow()!;
      expect(after.name).toBe(anchor.name);
      expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
      // No other flow was ever shown at the top, before or after the error.
      expect([...view.names]).toEqual([anchor.name]);
      expect(app.busyReads).toEqual([]);
      expect(screen.queryByRole("alert")).toBeNull();
    }

    it("keeps the previous comparison through an error during the hold and restores the anchor on Retry", async () => {
      const { app, anchor, before, view } = await deepThenAdd({
        page: 2,
        times: 1,
      });
      // The issue's worked example: row 1150 at -20 px, then row 1260.
      expect(anchor.index).toBe(1150);
      expect(anchor.offset).toBe(-20);
      const alert = await loadError();
      await expectPaused(app, anchor, before);
      retry(alert);
      // The hold resumes: busy and updating, reading row pages only.
      await waitFor(() =>
        expect(
          screen.getByText("Updating the comparison…"),
        ).toBeInTheDocument(),
      );
      expect(grid()).toHaveAttribute("aria-busy", "true");
      await expectRestored(app, anchor, view);
      expect(rowNamed(anchor.name)!.dataset.index).toBe("1260");
      expect(Number(grid().getAttribute("aria-rowcount"))).toBeGreaterThan(
        before,
      );
    }, 40000);

    it("keeps the same guarantees when the page fails again after Retry", async () => {
      const { app, anchor, before, view } = await deepThenAdd({
        page: 2,
        times: 2,
      });
      retry(await loadError());
      await waitFor(
        () => expect(app.pageReads.filter((read) => !read.ok)).toHaveLength(2),
        { timeout: 10000 },
      );
      const alert = await loadError();
      await expectPaused(app, anchor, before);
      retry(alert);
      await expectRestored(app, anchor, view);
    }, 40000);

    it("starts a new hold from the shown comparison when the selection changes during the error", async () => {
      const { app, anchor, before, view } = await deepThenAdd({
        page: 2,
        times: 1,
      });
      await loadError();
      await expectPaused(app, anchor, before);
      // Drop 10 of the added processes: a new comparison, no Retry.
      act(() =>
        store.deselectMany(
          entries.slice(210).map((entry) => selectionKey(entry)),
        ),
      );
      await expectRestored(app, anchor, view);
      const now = Number(grid().getAttribute("aria-rowcount"));
      // Only the previous and the new comparison were ever shown.
      expect([...view.counts].sort()).toEqual([before, now].sort());
      expect(app.pageReads.at(-1)!.processes).toBe(210);
    }, 40000);

    it("shows no rows after a first-page error and restores the anchor on Retry (O12)", async () => {
      const { app, anchor, view } = await deepThenAdd({ page: 0, times: 1 });
      const alert = await loadError();
      expect(grid()).toHaveAttribute("aria-rowcount", "0");
      retry(alert);
      await settled();
      view.stop();
      const after = topRow()!;
      expect(after.name).toBe(anchor.name);
      expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(1);
      expect(app.busyReads).toEqual([]);
    }, 40000);

    it("keeps the loaded rows after an error outside a hold, and Retry continues paging", async () => {
      const app = render(30);
      await selectAll();
      await settledAt(500);
      const loaded = Math.max(
        ...app.pageReads
          .filter((read) => read.processes === PROCESSES && read.ok)
          .map((read) => read.page),
      );
      const boundary = (loaded + 1) * 100;
      const rowCount = Number(grid().getAttribute("aria-rowcount"));
      app.faults.push({ processes: PROCESSES, page: loaded + 1, times: 1 });
      // Scroll down until the failing page is wanted, then on until rows on
      // both sides of the page boundary are mounted (rows vary in height).
      const header = (row: number) =>
        grid().querySelector(`[role="rowheader"][data-row="${row}"]`);
      const scrollUntil = async (done: () => boolean) => {
        for (let step = 0; step < 200 && !done(); step += 1) {
          scrollTo(scroller().scrollTop + layout.height / 2);
          await act(() => new Promise((resolve) => setTimeout(resolve, 40)));
        }
        expect(done()).toBe(true);
      };
      await scrollUntil(() => screen.queryByRole("alert") !== null);
      await scrollUntil(() => header(boundary + 1) !== null);
      const alert = await loadError();
      expect(grid()).not.toHaveAttribute("aria-busy");
      expect(Number(grid().getAttribute("aria-rowcount"))).toBe(rowCount);
      const lastLoaded = `[role="rowheader"][data-row="${boundary - 1}"]`;
      expect(grid().querySelector(lastLoaded)).not.toHaveAttribute("aria-busy");
      expect(
        grid().querySelector(`[role="rowheader"][data-row="${boundary + 1}"]`),
      ).toHaveAttribute("aria-busy", "true");
      retry(alert);
      await waitFor(
        () =>
          expect(
            grid().querySelector(
              `[role="rowheader"][data-row="${boundary + 1}"]`,
            ),
          ).not.toHaveAttribute("aria-busy"),
        { timeout: 10000 },
      );
      expect(grid().querySelector(lastLoaded)).not.toHaveAttribute("aria-busy");
      expect(screen.queryByRole("alert")).toBeNull();
    }, 40000);
  },
);
