/**
 * Hold measurement (#26 AC5, maintainer decision O11): when every anchored
 * flow in view is removed while deep, the previous comparison stays shown
 * while the new comparison's row pages are read, until one of the anchors
 * is found or no pages remain. None of the anchors exists in the new
 * comparison, so the hold reads every row page. This records the
 * deterministic page count at 100 ms mock latency; the elapsed time is
 * logged as an observation, not asserted. Its own file because each
 * large-workload test adds ~100 MB to the worker heap (#69 O6).
 */
import { act, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectionKey } from "../../app/selection";
import {
  PROCESSES,
  grid,
  processOf,
  render,
  rowsInView,
  scroller,
  selectAll,
  settled,
  settledAt,
  store,
  stubGridLayout,
  topRow,
} from "./flows-grid-harness";

stubGridLayout();

const LATENCY = 100;
const PAGE = 100;

describe("Flows grid hold measurement (#26 O11)", { timeout: 20000 }, () => {
  it("keeps the previous comparison shown while the hold reads every row page", async () => {
    const app = render(LATENCY);
    await selectAll();
    await settledAt(150);
    const before = Number(grid().getAttribute("aria-rowcount"));
    const anchor = topRow()!;
    const top = scroller().scrollTop;
    // Every flow in view is a reference flow of one selected process.
    const removed = rowsInView().map(({ name }) => processOf(name));
    expect(removed).toHaveLength(12);
    const remaining = PROCESSES - removed.length;

    const start = performance.now();
    act(() => store.deselectMany(removed.map((entry) => selectionKey(entry))));
    // Sampled on every DOM change and poll while the hold lasts.
    const shown = new Set<string>();
    const counts = new Set<number>();
    await waitFor(
      () => {
        if (grid().getAttribute("aria-busy") === "true") {
          counts.add(Number(grid().getAttribute("aria-rowcount")));
          const top = topRow();
          if (top) shown.add(top.name);
        }
        expect(grid()).not.toHaveAttribute("aria-busy");
      },
      // The hold's cost is 23 × 100 ms latency plus rendering; the mock
      // builds the 208-process row union once, not per page (#76; it was
      // ~125 ms per page). Before that: 6.3–6.8 s alone, 8.9–15.1 s in full
      // parallel runs, where a 15 s budget timed out in 4 of 6 QA runs
      // (#26). The budget is unchanged; measured headroom is in
      // docs/engineering/unit-headroom-verification.md. The elapsed time
      // is logged below.
      { timeout: 25000 },
    );
    const elapsed = performance.now() - start;
    const pages = app.pageReads.filter((read) => read.processes === remaining);
    const after = Number(grid().getAttribute("aria-rowcount"));
    console.info(
      `[#26 O11] hold: ${pages.length} row pages at ${LATENCY} ms in ` +
        `${Math.round(elapsed)} ms; ${removed.length} processes removed; ` +
        `${before} -> ${after} rows`,
    );

    // During the hold only the previous comparison was shown, at the
    // previous top flow, and nothing but row pages was read for it.
    expect([...counts]).toEqual([before]);
    expect([...shown]).toEqual([anchor.name]);
    expect(app.busyReads).toEqual([]);
    // Every page of the new comparison was read, in order, once each.
    expect(after).toBe(before - removed.length);
    expect(pages.map((read) => read.page)).toEqual(
      Array.from({ length: Math.ceil(after / PAGE) }, (_, page) => page),
    );
    expect(pages).toHaveLength(23);
    expect(pages.every((read) => read.ok)).toBe(true);
    // Once settled, the view keeps its deep position (#23 O8).
    await settled();
    expect(Math.abs(scroller().scrollTop - top)).toBeLessThanOrEqual(1);
    expect(topRow()!.index).toBe(anchor.index);
  }, 40000);
});
