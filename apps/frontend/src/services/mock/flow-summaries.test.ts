/**
 * Whole-selection flow row summaries (#20) through the comparison mock:
 * chart extrema independent of the column window, exact lexemes, present-zero
 * versus absence, and strict token/snapshot/process-set validation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decimalString, flowRowKey } from "../contracts";
import type { FlowRowKey, ServiceResult } from "../contracts";
import { createMockComparison } from "./comparison";
import { createComparisonCatalog } from "./comparison-fixtures";
import type {
  ComparisonCatalog,
  FixtureFlowValue,
} from "./comparison-fixtures";

function data<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
function code<T>(result: ServiceResult<T>) {
  return result.ok ? "ok" : result.error.code;
}
async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const extra = (index: number): FlowRowKey =>
  flowRowKey(`synthetic-extra-flow:${index}`, "Ecosphere Output");
const ROW = extra(2); // shared tiny positive value for every process
const NEGATIVE = extra(1); // shared "-100000000000000000000.0000001"
const present = (amount: string, warnings: FixtureFlowValue["warnings"] = []) =>
  ({ present: true, amount: decimalString(amount), warnings }) as const;

/** 250 processes; ROW overrides put both extremes far beyond any first window. */
function catalogWithExtremes(): ComparisonCatalog {
  const base = createComparisonCatalog(250, 3);
  const overrides: Record<number, FixtureFlowValue> = {
    3: present("0"),
    4: { present: false, amount: null, warnings: [] },
    5: present("-0"),
    6: present("20.0"),
    180: present("20"),
    220: present("-80", [{ code: "FALLBACK_LINK", message: "Synthetic" }]),
  };
  return {
    ...base,
    revisions: base.revisions.map((revision, revisionIndex) =>
      revisionIndex === 0
        ? revision
        : {
            ...revision,
            processes: revision.processes.map((process, index) =>
              overrides[index]
                ? {
                    ...process,
                    flows: { ...process.flows, [ROW]: overrides[index] },
                  }
                : process,
            ),
          },
    ),
  };
}

async function session(options: { token_limit?: number } = {}) {
  const catalog = catalogWithExtremes();
  const service = createMockComparison({ catalog, ...options });
  const current = catalog.releases.map(({ release_id, revision_id }) => ({
    release_id,
    revision_id,
  }));
  const ids = catalog.revisions[1].processes.map((p) => p.header.id);
  const rows = data(
    await finish(
      service.flowRows({
        revision_snapshot: current,
        process_ids: ids,
        limit: 100,
      }),
    ),
  );
  const summaries = (
    input: Partial<Parameters<typeof service.flowSummaries>[0]> = {},
  ) =>
    finish(
      service.flowSummaries({
        revision_snapshot: current,
        comparison_token: rows.comparison_token,
        process_ids: ids,
        row_keys: [ROW],
        ...input,
      }),
    );
  return { catalog, service, current, ids, rows, summaries };
}

describe("flow row summaries", () => {
  it("summarizes every selected process, independent of the column window", async () => {
    const { service, current, ids, rows, summaries } = await session();
    expect(ids).toHaveLength(250);
    const [summary] = data(await summaries()).summaries;
    expect(summary).toEqual({
      row_key: ROW,
      // "20" (process 180) and "20.0" (process 6) tie; the first ID in
      // canonical order wins, so the stored lexeme is deterministic.
      max_positive: "20",
      max_negative_magnitude: "80",
      positive_count: 246,
      negative_count: 1,
      zero_count: 2,
      absent_count: 1,
    });
    // The visible column windows never contain both extremes, yet every
    // summary read is identical: it has no column-window parameter.
    for (const window of [
      ids.slice(0, 100),
      ids.slice(100, 200),
      ids.slice(200),
    ]) {
      const cells = data(
        await finish(
          service.flowCells({
            revision_snapshot: current,
            comparison_token: rows.comparison_token,
            process_ids: window,
            row_keys: [ROW],
          }),
        ),
      ).cells;
      expect(cells.some((cell) => cell.amount === "-80")).toBe(
        window.includes(ids[220]),
      );
      expect(data(await summaries()).summaries[0]).toEqual(summary);
    }
    // Reordering the selected columns or the row window changes nothing.
    expect(
      data(await summaries({ process_ids: [...ids].reverse() })).summaries[0],
    ).toEqual(summary);
    const two = data(await summaries({ row_keys: [NEGATIVE, ROW] })).summaries;
    expect(two.map((s) => s.row_key)).toEqual([NEGATIVE, ROW]);
    expect(two[1]).toEqual(summary);
  });

  it("keeps exact lexemes, present zeros, absences and cell-scoped warnings", async () => {
    const { service, current, ids, rows, summaries } = await session();
    expect(
      data(await summaries({ row_keys: [NEGATIVE] })).summaries[0],
    ).toEqual({
      row_key: NEGATIVE,
      max_positive: "0",
      max_negative_magnitude: "100000000000000000000.0000001",
      positive_count: 0,
      negative_count: 250,
      zero_count: 0,
      absent_count: 0,
    });
    const tiny = data(await summaries({ row_keys: [extra(0)] })).summaries[0];
    expect(tiny.max_positive).toBe("0.000000000000000000000123456789");
    const cells = data(
      await finish(
        service.flowCells({
          revision_snapshot: current,
          comparison_token: rows.comparison_token,
          process_ids: [ids[3], ids[4], ids[5], ids[220], ids[221]],
          row_keys: [ROW],
        }),
      ),
    ).cells;
    expect(cells.map((cell) => [cell.present, cell.amount])).toEqual([
      [true, "0"],
      [false, null],
      [true, "-0"],
      [true, "-80"],
      [true, "0.000000000000000000000123456789"],
    ]);
    expect(cells.map((cell) => cell.warnings.length)).toEqual([0, 0, 0, 1, 0]);
    expect(Object.keys(data(await summaries()).summaries[0])).not.toContain(
      "warnings",
    );
  });

  it("rejects stale, evicted or mismatched tokens, snapshots, sets and windows", async () => {
    const { catalog, service, current, ids, rows, summaries } = await session();
    // Process IDs are revision-bound: the older snapshot cannot serve them.
    expect(
      code(
        await summaries({ revision_snapshot: [catalog.revisions[0].revision] }),
      ),
    ).toBe("UNKNOWN_PROCESS");
    expect(
      code(
        await summaries({
          revision_snapshot: [{ ...current[0], revision_id: "unpublished" }],
        }),
      ),
    ).toBe("STALE_SNAPSHOT");
    expect(code(await summaries({ comparison_token: "unknown" }))).toBe(
      "STALE_SNAPSHOT",
    );
    // A subset or superset is not the token's selection.
    expect(code(await summaries({ process_ids: ids.slice(0, 249) }))).toBe(
      "INVALID_FILTER",
    );
    expect(code(await summaries({ process_ids: [...ids, "unknown"] }))).toBe(
      "UNKNOWN_PROCESS",
    );
    expect(
      code(await summaries({ row_keys: [flowRowKey("nope", "Reference")] })),
    ).toBe("INVALID_FILTER");
    const tooMany = rows.items.map((row) => row.row_key);
    expect(tooMany.length).toBe(100);
    expect(code(await summaries({ row_keys: tooMany }))).toBe("ok");
    expect(
      code(await summaries({ row_keys: [...tooMany, NEGATIVE, extra(0)] })),
    ).toBe("REQUEST_WINDOW_TOO_LARGE");
    // A scores token cannot summarize flow rows.
    const scores = data(
      await finish(
        service.scoreRows({
          revision_snapshot: current,
          process_ids: ids,
          indicator_ids: [],
          limit: 10,
        }),
      ),
    );
    expect(
      code(await summaries({ comparison_token: scores.comparison_token })),
    ).toBe("INVALID_FILTER");
    // Evicted contexts fail explicitly instead of reusing stale data.
    const small = await session({ token_limit: 1 });
    await finish(
      small.service.flowRows({
        revision_snapshot: small.current,
        process_ids: small.ids.slice(0, 2),
        limit: 10,
      }),
    );
    expect(code(await small.summaries())).toBe("STALE_SNAPSHOT");
  });

  it("serves an earlier immutable revision with its own values", async () => {
    const { catalog, service } = await session();
    const old = catalog.revisions[0];
    const snapshot = [old.revision];
    const ids = old.processes.slice(0, 3).map((p) => p.header.id);
    const rows = data(
      await finish(
        service.flowRows({
          revision_snapshot: snapshot,
          process_ids: ids,
          limit: 100,
        }),
      ),
    );
    const summary = data(
      await finish(
        service.flowSummaries({
          revision_snapshot: snapshot,
          comparison_token: rows.comparison_token,
          process_ids: ids,
          row_keys: [ROW],
        }),
      ),
    );
    expect(summary.revision_snapshot).toEqual(snapshot);
    // The newer revision's overrides never leak into the old snapshot.
    expect(summary.summaries[0]).toMatchObject({
      max_positive: "0.000000000000000000000123456789",
      max_negative_magnitude: "0",
      positive_count: 3,
    });
  });
});
