import { describe, expect, it } from "vitest";
import type { SelectedProcess } from "../../app/selection";
import { decimalString } from "../../services/contracts";
import type { ProcessHeader } from "../../services/contracts";
import { bulkOrder, checkState, scopeKey, selectedByScope } from "./scope";

const header = (
  id: string,
  name: string,
  geography: string,
): ProcessHeader => ({
  release_id: "r1",
  revision_id: "r1-rev",
  id,
  name,
  geography,
  category: "c",
  subcategory: "",
  category_path: ["c"],
  reference_flow_name: "f",
  reference_amount: decimalString("1"),
  reference_unit: "kg",
  warnings: [],
});
const entry = (
  id: string,
  path: string[],
  release_id = "r1",
): SelectedProcess => ({
  release_id,
  revision_id: `${release_id}-rev`,
  id,
  name: id,
  geography: "CH",
  path,
});

describe("bulk scope helpers", () => {
  it("orders bulk additions by name, then geography, then ID, case-insensitively", () => {
    const sorted = [
      header("3", "beta", "CH"),
      header("2", "Alpha", "de"),
      header("1", "alpha", "DE"),
      header("4", "Alpha", "CH"),
    ].sort(bulkOrder);
    expect(sorted.map((h) => h.id)).toEqual(["4", "1", "2", "3"]);
  });

  it("counts selected entries per release path prefix within the scope", () => {
    const entries = [
      entry("a", ["t", "road"]),
      entry("b", ["t", "road", "infra"]),
      entry("c", ["t", "rail"]),
      entry("d", ["t", "road"], "r2"),
    ];
    const all = selectedByScope(entries);
    expect(all.get(scopeKey("r1", []))).toBe(3);
    expect(all.get(scopeKey("r1", ["t", "road"]))).toBe(2);
    expect(all.get(scopeKey("r1", ["t", "road", "infra"]))).toBe(1);
    expect(all.get(scopeKey("r2", ["t", "road"]))).toBe(1);
    const filtered = selectedByScope(entries, (e) => e.id !== "a");
    expect(filtered.get(scopeKey("r1", ["t", "road"]))).toBe(1);
  });

  it("derives checked, unchecked and mixed states from the exact scope size", () => {
    expect(checkState(4, 4)).toBe("true");
    expect(checkState(4, 1)).toBe("mixed");
    expect(checkState(4, 0)).toBe("false");
    expect(checkState(0, 0)).toBe("false");
    expect(checkState(null, 2)).toBe("false");
  });
});
