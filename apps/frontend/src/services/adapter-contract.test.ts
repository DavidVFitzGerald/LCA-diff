import { describe, it, expect, vi } from "vitest";
import { createMockComparison } from "./mock/comparison";
import { createComparisonCatalog } from "./mock/comparison-fixtures";
import { createHttpData } from "./http-adapter";
import { decimalString } from "./contracts";
import type { ServiceResult, WireSchemas } from "./contracts";
import { deriveSummary } from "./summary";
import { compareDecimal } from "./decimal";
const precise = "1.234567890123456789012345678901234";
const tiny = "1.2345E-33";
const preciseScore = "12.3456789012345678901234567890123";
const tinyScore = "1.000000000000000000000000000000001E-40";
function data<T>(result: ServiceResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}
function fixture(
  values: readonly (string | null)[] = [precise, "0", null],
  scores: readonly (string | null)[] = [preciseScore, null, null],
) {
  const catalog = createComparisonCatalog();
  const revision = catalog.revisions[1];
  const row = revision.flow_rows.find(
    (item) => item.flow_type === "Technosphere",
  )!;
  const indicators = revision.indicator_tree.methods.flatMap((method) => [
    ...method.indicators,
    ...method.categories.flatMap((category) => category.indicators),
  ]);
  const tinyRow = revision.flow_rows.find(
    (item) => item.flow_type === "Ecosphere Input",
  )!;
  const modified = {
    ...catalog,
    revisions: catalog.revisions.map((item) =>
      item === revision
        ? {
            ...item,
            processes: item.processes.map((process, index) => ({
              ...process,
              flows: {
                ...process.flows,
                [tinyRow.row_key]: {
                  present: true as const,
                  amount: decimalString(tiny),
                  warnings: [],
                },
                [row.row_key]:
                  values[index] == null
                    ? { present: false as const, amount: null, warnings: [] }
                    : {
                        present: true as const,
                        amount: decimalString(values[index]!),
                        warnings: [],
                      },
              },
              scores: {
                ...process.scores,
                [indicators[1].id]: {
                  status: "valid" as const,
                  amount: decimalString(index === 0 ? tinyScore : "0"),
                  warnings: [],
                },
                [indicators[0].id]:
                  scores[index] != null
                    ? {
                        status: "valid" as const,
                        amount: decimalString(scores[index]!),
                        warnings: [],
                      }
                    : {
                        status:
                          index === 1
                            ? ("missing" as const)
                            : ("unresolved_basis" as const),
                        amount: null,
                        warnings: [],
                      },
              },
            })),
          }
        : item,
    ),
  };
  return {
    catalog: modified,
    row,
    indicators,
    input: {
      revision_snapshot: [revision.revision],
      process_ids: revision.processes.map((process) => process.header.id),
      limit: 100,
    },
  };
}
/** A typed wire fixture bridge: uses the same catalog but carries API NumericSummary. */
function setup(
  mode: "mock" | "http",
  values?: readonly (string | null)[],
  scores?: readonly (string | null)[],
) {
  const f = fixture(values, scores);
  const mock = createMockComparison({
    catalog: f.catalog,
    scenario: { latency_ms: 0 },
  });
  const tokens = { token: vi.fn(async () => "private-test-token") };
  function numericSummary(
    key: string,
    tab: "flows" | "scores",
    ids: readonly string[],
  ): WireSchemas["NumericSummary"] {
    const revision = f.catalog.revisions[1];
    const amounts = revision.processes
      .filter((process) => ids.includes(process.header.id))
      .flatMap((process) => {
        const value =
          tab === "flows"
            ? (process.flows[key] ?? revision.shared_flows[key])
            : process.scores[key];
        return value &&
          (("present" in value && value.present) ||
            ("status" in value && value.status === "valid"))
          ? [value.amount!]
          : [];
      })
      .sort(compareDecimal);
    return {
      minimum: amounts[0] ?? null,
      maximum: amounts.at(-1) ?? null,
      present_count: amounts.length,
      selected_count: ids.length,
    };
  }

  const transport = vi.fn<typeof fetch>(async (url, init) => {
    const body = JSON.parse(String(init?.body));
    const route = String(url).split("/").slice(-2).join("/");
    if (route === "flows/rows") {
      const page = data(await mock.flowRows(body));
      const items: WireSchemas["FlowRow"][] = page.items.map((item) => ({
        ...item,
        sort_key: [...item.sort_key],
        summary: numericSummary(item.row_key, "flows", body.process_ids),
      }));
      return Response.json({
        ...page,
        items,
        revision_snapshot: [...page.revision_snapshot],
      } satisfies WireSchemas["ComparisonPage_FlowRow_"]);
    }
    if (route === "scores/rows") {
      const page = data(await mock.scoreRows(body));
      const items: WireSchemas["Indicator"][] = page.items.map((item) => ({
        ...item,
        summary: numericSummary(item.id, "scores", body.process_ids),
      }));
      return Response.json({
        ...page,
        revision_snapshot: [...page.revision_snapshot],
        items,
      } satisfies WireSchemas["ComparisonPage_Indicator_"]);
    }
    if (route === "flows/cells")
      return Response.json(data(await mock.flowCells(body)));
    if (route === "scores/cells")
      return Response.json(data(await mock.scoreCells(body)));
    throw new Error("Unexpected route");
  });
  return {
    ...f,
    service:
      mode === "mock" ? mock : createHttpData("/api/v1", tokens, transport),
    tokens,
    transport,
  };
}
for (const mode of ["mock", "http"] as const)
  describe(`${mode} adapter contract`, () => {
    it("keeps equal-value extrema stable when process order changes", async () => {
      const app = setup(mode, ["20", "20.0", null]);
      const first = data(await app.service.flowRows(app.input));
      const reordered = data(
        await app.service.flowRows({
          ...app.input,
          process_ids: [...app.input.process_ids].reverse(),
        }),
      );
      expect(
        reordered.items.find((row) => row.row_key === app.row.row_key)?.summary,
      ).toEqual(
        first.items.find((row) => row.row_key === app.row.row_key)?.summary,
      );
    });
    it.each([
      [["5", "20", null], "20", "0", 1],
      [["-80", "-20", null], "0", "80", 1],
      [["-80", "20", "0"], "20", "80", 0],
      [["0", "0", null], "0", "0", 1],
      [[null, null, null], "0", "0", 3],
    ] as const)(
      "keeps whole-selection score P/N for %j",
      async (scores, p, n, absent) => {
        const app = setup(mode, undefined, scores);
        const rows = data(
          await app.service.scoreRows({
            ...app.input,
            indicator_ids: [app.indicators[0].id],
          }),
        );
        expect(rows.items[0].summary).toEqual({
          max_positive: p,
          max_negative_magnitude: n,
          absent_count: absent,
        });
      },
    );
    it.each([
      [["5", "20", null], "20", "0"],
      [["-80", "-20", null], "0", "80"],
      [["-80", "20", "0"], "20", "80"],
      [["0", "0", null], "0", "0"],
    ] as const)("keeps whole-selection P/N for %j", async (values, p, n) => {
      const app = setup(mode, values);
      const rows = data(await app.service.flowRows(app.input));
      expect(
        rows.items.find((row) => row.row_key === app.row.row_key)?.summary,
      ).toMatchObject({ max_positive: p, max_negative_magnitude: n });
    });
    it("preserves precision, zero/absent, score missingness, snapshot and opaque token reuse", async () => {
      const app = setup(mode);
      const rows = data(await app.service.flowRows(app.input));
      expect(rows.revision_snapshot).toEqual(app.input.revision_snapshot);
      const row = rows.items.find((item) => item.row_key === app.row.row_key)!;
      expect(row.summary).toMatchObject({
        max_positive: precise,
        max_negative_magnitude: "0",
        absent_count: 1,
      });
      const cells = data(
        await app.service.flowCells({
          ...app.input,
          row_keys: [row.row_key],
          comparison_token: rows.comparison_token,
        }),
      );
      expect(cells.comparison_token).toBe(rows.comparison_token);
      const tinyRow = rows.items.find(
        (item) => item.flow_type === "Ecosphere Input",
      )!;
      const tinyCells = data(
        await app.service.flowCells({
          ...app.input,
          row_keys: [tinyRow.row_key],
          comparison_token: rows.comparison_token,
        }),
      );
      expect(tinyCells.cells[0].amount).toBe(tiny);
      const tinyScoreRows = data(
        await app.service.scoreRows({
          ...app.input,
          indicator_ids: [app.indicators[1].id],
        }),
      );
      const tinyScores = data(
        await app.service.scoreCells({
          ...app.input,
          indicator_ids: [app.indicators[1].id],
          comparison_token: tinyScoreRows.comparison_token,
        }),
      );
      expect(tinyScores.cells.map((item) => item.amount)).toEqual([
        tinyScore,
        "0",
        "0",
      ]);

      expect(cells.cells.map((item) => [item.present, item.amount])).toEqual([
        [true, precise],
        [true, "0"],
        [false, null],
      ]);
      const scoreRows = data(
        await app.service.scoreRows({
          ...app.input,
          indicator_ids: [app.indicators[0].id],
        }),
      );
      const scores = data(
        await app.service.scoreCells({
          ...app.input,
          indicator_ids: [app.indicators[0].id],
          comparison_token: scoreRows.comparison_token,
        }),
      );
      expect(scores.cells.map((item) => [item.status, item.amount])).toEqual([
        ["valid", preciseScore],
        ["missing", null],
        ["unresolved_basis", null],
      ]);
    });
    it("continues cursors with stable tokens and rejects cancelled reads without stale success", async () => {
      const app = setup(mode);
      const first = data(
        await app.service.flowRows({ ...app.input, limit: 1 }),
      );
      expect(first.next_cursor).not.toBeNull();
      const next = data(
        await app.service.flowRows({
          ...app.input,
          limit: 1,
          cursor: first.next_cursor!,
        }),
      );
      expect(next.comparison_token).toBe(first.comparison_token);
      expect(next.items[0].row_key).not.toBe(first.items[0].row_key);
      const controller = new AbortController();
      controller.abort();
      await expect(
        app.service.flowRows(app.input, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
    });
  });
describe("API NumericSummary derivation", () => {
  it.each([
    ["0", precise, precise, "0"],
    ["-80", "-20", "0", "80"],
    ["-80", "20", "20", "80"],
    ["0", "0", "0", "0"],
    [tiny, tiny, tiny, "0"],
    [tinyScore, tinyScore, tinyScore, "0"],
  ])("derives extrema %s %s exactly", (minimum, maximum, p, n) => {
    expect(
      deriveSummary({ minimum, maximum, present_count: 2, selected_count: 3 }),
    ).toEqual({ max_positive: p, max_negative_magnitude: n, absent_count: 1 });
  });
  it("represents all absent values and rejects invalid summary shapes", () => {
    expect(
      deriveSummary({
        minimum: null,
        maximum: null,
        present_count: 0,
        selected_count: 3,
      }),
    ).toEqual({
      max_positive: "0",
      max_negative_magnitude: "0",
      absent_count: 3,
    });
    expect(() =>
      deriveSummary({
        minimum: null,
        maximum: "1",
        present_count: 1,
        selected_count: 3,
      }),
    ).toThrow();
  });
});
describe("HTTP failures and refresh", () => {
  const input = fixture().input;
  it.each([
    [401, "AUTH_REQUIRED"],
    [403, "EMAIL_NOT_VERIFIED"],
    [404, "UNKNOWN_PROCESS"],
    [404, "RELEASE_UNAVAILABLE"],
    [409, "STALE_SNAPSHOT"],
    [422, "INVALID_FILTER"],
    [422, "REQUEST_WINDOW_TOO_LARGE"],
    [429, "TEMPORARILY_UNAVAILABLE"],
    [503, "TEMPORARILY_UNAVAILABLE"],
  ] as const)("maps %s %s with request id", async (status, code) => {
    const tokens = { token: vi.fn(async () => "secret") };
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: {
            code,
            message: "Safe error",
            request_id: "body",
            retryable: status >= 429,
          },
        },
        { status, headers: { "X-Request-ID": "header" } },
      ),
    );
    const service = createHttpData("/api/v1", tokens, transport);
    expect(await service.flowRows(input)).toMatchObject({
      ok: false,
      error: { code, request_id: "header" },
    });
    expect(transport).toHaveBeenCalledTimes(status === 401 ? 2 : 1);
    expect(tokens.token.mock.calls).toEqual(
      status === 401 ? [[false], [true]] : [[false]],
    );
  });
  it.each([
    "network",
    "html",
    "unknown",
    "shape",
    "invariant",
    "extra-error",
    "extra-envelope",
  ])("safely maps %s", async (kind) => {
    const transport = vi.fn<typeof fetch>(async () => {
      if (kind === "network") throw new Error("private");
      if (kind === "html") return new Response("<html>private</html>");
      if (kind === "unknown")
        return Response.json({ error: { code: "PRIVATE" } }, { status: 500 });
      if (kind === "extra-error" || kind === "extra-envelope")
        return Response.json(
          {
            error: {
              code: "INVALID_FILTER",
              message: "Safe",
              request_id: "body",
              retryable: false,
              ...(kind === "extra-error" ? { private: "payload" } : {}),
            },
            ...(kind === "extra-envelope" ? { private: "payload" } : {}),
          },
          { status: 422 },
        );
      if (kind === "invariant")
        return Response.json({
          cells: [
            {
              process_id: "id",
              row_key: "id|Reference",
              present: false,
              amount: "1",
              warnings: [],
            },
          ],
          revision_snapshot: input.revision_snapshot,
          comparison_token: "token",
          request_id: "safe",
        });
      return Response.json({ private: "payload" });
    });
    const service = createHttpData(
      "/api/v1",
      { token: async () => "secret" },
      transport,
    );
    const result =
      kind === "invariant"
        ? await service.flowCells({
            ...input,
            row_keys: [],
            comparison_token: "token",
          })
        : await service.flowRows(input);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "TEMPORARILY_UNAVAILABLE" },
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("locks after failed forced refresh and rejects a delayed success after abort", async () => {
    const tokens = {
      token: vi.fn(async (force: boolean) => {
        if (force) throw new Error("disabled");
        return "token";
      }),
    };
    const service = createHttpData("/api/v1", tokens, async () =>
      Response.json({}, { status: 401 }),
    );
    expect(await service.flowRows(input)).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
    const controller = new AbortController();
    const delayed = createHttpData(
      "/api/v1",
      { token: async () => null },
      async () => {
        controller.abort();
        return Response.json({});
      },
    );
    await expect(
      delayed.flowRows(input, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
