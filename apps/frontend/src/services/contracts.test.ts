import { describe, expect, expectTypeOf, it } from "vitest";
import { decimalString, flowRowKey } from "./contracts";
import type {
  AuthService,
  DataService,
  DecimalString,
  FlowValue,
  RequestOptions,
  ScoreValue,
  ServiceResult,
} from "./contracts";
import { createSyntheticFixtures, FIXTURE_IDS } from "./mock/fixtures";

describe("provisional precision boundary", () => {
  it.each([
    "0",
    "-0",
    "+0.000",
    "1e-1000",
    "123456789012345678901234567890.1234567890123456789",
    "0.000000000000000000000000000000123456789",
  ])("preserves %s exactly through JSON", (value) => {
    const dto = {
      present: true,
      amount: decimalString(value),
    } satisfies FlowValue;
    expect(JSON.parse(JSON.stringify(dto))).toEqual({
      present: true,
      amount: value,
    });
    expect(typeof dto.amount).toBe("string");
  });

  it.each(["", "NaN", "Infinity", " 1", "1 ", "1,2", "0x10", "1e", "--1"])(
    "rejects non-decimal %j without coercion",
    (value) => {
      expect(() => decimalString(value)).toThrow(TypeError);
    },
  );

  it("prevents number measurements and inconsistent missing states at compile time", () => {
    // @ts-expect-error JSON numbers must not enter a measurement DTO.
    const numeric: FlowValue = { present: true, amount: 0 };
    // @ts-expect-error Absent flow cannot have an amount.
    const absent: FlowValue = { present: false, amount: decimalString("0") };
    // @ts-expect-error Missing score cannot be coerced to zero.
    const missing: ScoreValue = {
      status: "missing",
      amount: decimalString("0"),
    };
    // @ts-expect-error Valid score must carry an amount.
    const valid: ScoreValue = { status: "valid", amount: null };
    expect([numeric, absent, missing, valid]).toHaveLength(4);
  });

  it("exposes asynchronous, cancellable services and an unsubscribe auth boundary", () => {
    expectTypeOf<Parameters<DataService["flowCells"]>[1]>().toEqualTypeOf<
      RequestOptions | undefined
    >();
    expectTypeOf<Parameters<AuthService["signIn"]>[1]>().toEqualTypeOf<
      RequestOptions | undefined
    >();
    expectTypeOf<ReturnType<AuthService["observe"]>>().toEqualTypeOf<
      () => void
    >();
    expectTypeOf<ReturnType<AuthService["signOut"]>>().toEqualTypeOf<
      Promise<ServiceResult<void>>
    >();
    expectTypeOf<DecimalString>().toExtend<string>();
  });
});

describe("synthetic scientific fixtures", () => {
  const fixtures = createSyntheticFixtures();

  it("is deterministic, explicitly synthetic and deeply immutable", () => {
    expect(createSyntheticFixtures()).toEqual(fixtures);
    expect(createSyntheticFixtures()).not.toBe(fixtures);
    expect(fixtures.provenance.kind).toBe("synthetic");
    function assertFrozen(value: unknown) {
      if (value !== null && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(assertFrozen);
      }
    }
    assertFrozen(fixtures);
    expect(() =>
      Object.assign(fixtures.revisions[0].flow_cells[0], { amount: "999" }),
    ).toThrow(TypeError);
    expect(fixtures.revisions[0].flow_cells[0].amount).toBe("1");
  });

  it("links every process/cell/indicator to its immutable revision and release", () => {
    expect(fixtures.revisions).toHaveLength(2);
    expect(
      new Set(fixtures.revisions.map((r) => r.revision.revision_id)).size,
    ).toBe(2);
    expect(fixtures.releases[0].revision_id).toBe(
      fixtures.revisions[1].revision.revision_id,
    );
    for (const revision of fixtures.revisions) {
      expect(revision.revision_snapshot).toEqual([revision.revision]);
      expect(revision.indicator_tree.revision_snapshot).toEqual(
        revision.revision_snapshot,
      );
      const processIds = new Set(revision.headers.map((header) => header.id));
      expect(processIds.size).toBe(revision.headers.length);
      revision.headers.forEach((header) => {
        expect(header.release_id).toBe(revision.revision.release_id);
        expect(header.revision_id).toBe(revision.revision.revision_id);
      });
      const rowIds = new Set(revision.flow_rows.map((row) => row.row_key));
      expect(rowIds.size).toBe(revision.flow_rows.length);
      revision.flow_rows.forEach((row) =>
        expect(row.row_key).toBe(flowRowKey(row.flow_id, row.flow_type)),
      );
      revision.flow_cells.forEach((cell) => {
        expect(processIds.has(cell.process_id)).toBe(true);
        expect(rowIds.has(cell.row_key)).toBe(true);
      });
      const indicators = revision.indicator_tree.methods.flatMap((method) => {
        expect(method.release_id).toBe(revision.revision.release_id);
        return [
          ...method.indicators,
          ...method.categories.flatMap((category) => category.indicators),
        ];
      });
      const indicatorIds = new Set(indicators.map((indicator) => indicator.id));
      revision.score_cells.forEach((cell) => {
        expect(processIds.has(cell.process_id)).toBe(true);
        expect(indicatorIds.has(cell.indicator_id)).toBe(true);
      });
    }
    expect(fixtures.revisions[0].headers.map((h) => h.id)).not.toEqual(
      fixtures.revisions[1].headers.map((h) => h.id),
    );
    expect(fixtures.revisions[0].flow_rows).toEqual(
      fixtures.revisions[1].flow_rows,
    );
    const emission = (revision: (typeof fixtures.revisions)[number]) =>
      revision.flow_cells.find(
        (c) => c.row_key === flowRowKey(FIXTURE_IDS.airLow, "Ecosphere Output"),
      )?.amount;
    expect(emission(fixtures.revisions[0])).not.toBe(
      emission(fixtures.revisions[1]),
    );
  });

  it("gives each process exactly one reference output matching its header basis", () => {
    for (const revision of fixtures.revisions) {
      for (const header of revision.headers) {
        const referenceCells = revision.flow_cells.filter(
          (cell) =>
            cell.process_id === header.id &&
            cell.present &&
            cell.row_key.endsWith("|Reference"),
        );
        expect(referenceCells).toHaveLength(1);
        const cell = referenceCells[0];
        const row = revision.flow_rows.find(
          (row) => row.row_key === cell.row_key,
        );
        expect(cell.amount).toBe(header.reference_amount);
        expect(row).toMatchObject({
          name: header.reference_flow_name,
          unit: header.reference_unit,
          location: header.geography,
          process_name: header.name,
        });
      }
    }
  });

  it("preserves signs, zero/absence and score states rather than normalizing them", () => {
    const revision = fixtures.revisions[0];
    expect(JSON.parse(JSON.stringify(revision))).toEqual(revision);
    expect(revision.flow_cells.some((c) => c.present && c.amount === "0")).toBe(
      true,
    );
    expect(
      revision.flow_cells.some((c) => c.present && c.amount === "-0"),
    ).toBe(true);
    expect(
      revision.flow_cells.some((c) => !c.present && c.amount === null),
    ).toBe(true);
    const technosphere = revision.flow_cells.filter((c) =>
      c.row_key.endsWith("|Technosphere"),
    );
    expect(technosphere.some((c) => c.amount?.startsWith("-80"))).toBe(true);
    expect(technosphere.some((c) => c.amount === "20")).toBe(true);
    expect(
      revision.score_cells.some(
        (c) => c.status === "valid" && c.amount === "0",
      ),
    ).toBe(true);
    for (const status of ["missing", "unresolved_basis"] as const) {
      expect(
        revision.score_cells.some(
          (c) => c.status === status && c.amount === null,
        ),
      ).toBe(true);
    }
    expect(new Set(revision.headers.map((h) => h.reference_amount)).size).toBe(
      2,
    );
    expect(new Set(revision.headers.map((h) => h.reference_unit)).size).toBe(2);
  });

  it("keeps equal source-like labels in distinct compartments and warnings scoped to one cell", () => {
    const [low, high] = fixtures.source_labels;
    expect(low.source_number).toBe(high.source_number);
    expect(low.compartment).not.toBe(high.compartment);
    expect(low.flow_id).not.toBe(high.flow_id);
    const cells = fixtures.revisions[0].flow_cells.filter((c) =>
      c.row_key.endsWith("|Technosphere"),
    );
    expect(cells.map((c) => c.warnings.length)).toEqual([1, 0, 0]);
  });

  it("includes nested process paths and optional indicator categories in source order", () => {
    const revision = fixtures.revisions[0];
    expect(revision.headers.some((h) => h.category_path.length === 4)).toBe(
      true,
    );
    expect(revision.headers[1].subcategory).toBe(
      "road\\operations\\infrastructure",
    );
    const tree = revision.indicator_tree;
    expect(tree.default_indicator_ids).toEqual([FIXTURE_IDS.gwp]);
    expect(tree.methods[0].name).toBe("IPCC 2021");
    expect(tree.methods[0].indicators[0]).toMatchObject({
      id: FIXTURE_IDS.gwp,
      name: "GWP 100",
      category: null,
      source_order: 0,
    });
    expect(tree.methods[1].categories[0].indicators[0]).toMatchObject({
      category: "Synthetic category",
      source_order: 1,
    });
    expect(tree.methods.map((m) => m.source_order)).toEqual([0, 1]);
  });

  it("orders flow rows by type and identifying fields with stable ties", () => {
    const rows = fixtures.revisions[0].flow_rows;
    expect(rows.map((row) => row.flow_id)).toEqual([
      FIXTURE_IDS.reference,
      FIXTURE_IDS.referenceGamma,
      FIXTURE_IDS.referenceBeta,
      FIXTURE_IDS.technosphere,
      FIXTURE_IDS.water,
      FIXTURE_IDS.airLow,
      FIXTURE_IDS.airHigh,
    ]);
  });
});
