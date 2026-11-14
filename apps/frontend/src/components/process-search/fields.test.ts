import { describe, expect, it } from "vitest";
import { emptyDraft, isFiltering, normalizeFields } from "./fields";

const draft = (values: Partial<ReturnType<typeof emptyDraft>>) => ({
  ...emptyDraft(),
  ...values,
});

describe("search field normalization", () => {
  it("trims and collapses whitespace and omits empty fields", () => {
    expect(
      normalizeFields(
        draft({
          process_name: "  Road \t  Beta\n ",
          geography: "   ",
          category: "",
        }),
      ),
    ).toEqual({ process_name: "Road Beta" });
    expect(isFiltering(normalizeFields(draft({ geography: " \t " })))).toBe(
      false,
    );
  });

  it("sends case, punctuation and token order literally", () => {
    expect(
      normalizeFields(
        draft({
          process_name: "Alpha OR beta",
          subcategory: "road\\operations",
          reference_flow_name: ".* a(b [c]",
          geography: "ch",
        }),
      ),
    ).toEqual({
      process_name: "Alpha OR beta",
      subcategory: "road\\operations",
      reference_flow_name: ".* a(b [c]",
      geography: "ch",
    });
  });

  it("keeps every populated field so fields combine with AND", () => {
    const fields = normalizeFields(
      draft({
        process_name: "a",
        geography: "b",
        category: "c",
        subcategory: "d",
        reference_flow_name: "e",
      }),
    );
    expect(Object.keys(fields)).toEqual([
      "process_name",
      "geography",
      "category",
      "subcategory",
      "reference_flow_name",
    ]);
    expect(isFiltering(fields)).toBe(true);
  });
});
