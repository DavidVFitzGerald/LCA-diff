import { describe, expect, it } from "vitest";
import type { Page, Release, SearchNode } from "../../services/contracts";
import { loadedLeaves, mergeTree, rootKey } from "./model";
import type { BranchPages, TreeModel } from "./model";

const release = (id: string, name = `Release ${id}`): Release => ({
  release_id: id,
  revision_id: `${id}-rev`,
  database_code: "TEST",
  version: "v1",
  display_name: name,
  published_at: null,
});
interface Leaf {
  id: string;
  name: string;
  geography?: string;
  path: string[];
}
/** Builds a page shaped like the discovery contract: roots with ancestor chains. */
function page(
  release_id: string,
  leaves: Leaf[],
  counts: Record<string, number> = {},
  branchIds: Record<string, string> = {},
): Page<SearchNode> {
  type Branch = Extract<SearchNode, { kind: "branch" }> & {
    children: SearchNode[];
  };
  const roots: Branch[] = [];
  const known = new Map<string, Branch>();
  for (const leaf of leaves) {
    let siblings: SearchNode[] = roots;
    for (let depth = 0; depth <= leaf.path.length; depth += 1) {
      const path = leaf.path.slice(0, depth);
      const at = path.join("/");
      let branch = known.get(at);
      if (!branch) {
        branch = {
          kind: "branch",
          id: branchIds[at] ?? `opaque:${release_id}:${at}`,
          release_id,
          label: path.at(-1) ?? release_id,
          path,
          matching_descendant_count: counts[at] ?? 0,
          children: [],
        };
        known.set(at, branch);
        siblings.push(branch);
      }
      siblings = branch.children as SearchNode[];
    }
    siblings.push({
      kind: "process",
      id: leaf.id,
      release_id,
      label: leaf.name,
      geography: leaf.geography ?? "CH",
      path: leaf.path,
    });
  }
  return {
    items: roots,
    revision_snapshot: [{ release_id, revision_id: `${release_id}-rev` }],
    next_cursor: null,
    total_count: leaves.length,
    request_id: "model-test",
  };
}
const scope = (
  release_id: string,
  branch_path: string[],
  pages: Page<SearchNode>[],
): BranchPages => ({
  release_id,
  revision_id: `${release_id}-rev`,
  branch_path,
  pages,
});
/** Depth-first labels, for order assertions. */
function outline(model: TreeModel, key = model.roots[0], depth = 0): string[] {
  const node = model.nodes.get(key)!;
  const self = `${"  ".repeat(depth)}${node.label}`;
  return [
    self,
    ...(model.children.get(key) ?? []).flatMap((child) =>
      outline(model, child, depth + 1),
    ),
  ];
}

const deep = [
  " Energy & Fuels ",
  "Heat/Steam",
  "district HEAT",
  "a",
  "B",
  "c / d",
];

describe("process tree model", () => {
  it("renders six-segment paths verbatim and keeps identical paths in two releases distinct", () => {
    const releases = [release("r1"), release("r2")];
    const model = mergeTree(releases, [
      scope("r1", [], [page("r1", [{ id: "p", name: " Plant ", path: deep }])]),
      scope("r2", [], [page("r2", [{ id: "p", name: " Plant ", path: deep }])]),
    ]);
    expect(outline(model)).toEqual([
      "Release r1",
      ...deep.map((segment, index) => `${"  ".repeat(index + 1)}${segment}`),
      `${"  ".repeat(7)} Plant `,
    ]);
    const leafKeys = [...model.nodes.values()]
      .filter((node) => node.kind === "process")
      .map((node) => node.key);
    expect(new Set(leafKeys).size).toBe(2);
    expect(model.branchAt("r1", deep)).not.toBe(model.branchAt("r2", deep));
    expect(model.roots).toEqual([rootKey("r1"), rootKey("r2")]);
  });

  it("keeps duplicate labels as distinct nodes", () => {
    const model = mergeTree(
      [release("r1")],
      [
        scope(
          "r1",
          [],
          [
            page("r1", [
              {
                id: "x1",
                name: "Same",
                geography: "CH",
                path: ["a", "operations"],
              },
              {
                id: "x2",
                name: "Same",
                geography: "CH",
                path: ["a", "operations"],
              },
              { id: "y1", name: "Other", path: ["b", "operations"] },
            ]),
          ],
        ),
      ],
    );
    const operations = [...model.nodes.values()].filter(
      (node) => node.label === "operations",
    );
    expect(operations).toHaveLength(2);
    expect(new Set(operations.map((node) => node.parent)).size).toBe(2);
    const same = [...model.nodes.values()].filter(
      (node) => node.label === "Same",
    );
    expect(same.map((node) => node.kind === "process" && node.id)).toEqual([
      "x1",
      "x2",
    ]);
  });

  it("deduplicates across pages and scopes without changing identity or order, ignoring out-of-scope counts", () => {
    const releases = [release("r1")];
    const first = page(
      "r1",
      [
        { id: "a1", name: "Alpha", path: ["t", "road"] },
        { id: "b1", name: "Beta", path: ["t", "road", "infra"] },
      ],
      { "": 4, t: 4, "t/road": 4, "t/road/infra": 2 },
    );
    const second = page(
      "r1",
      [
        { id: "c1", name: "Charlie", path: ["t", "road"] },
        { id: "d1", name: "Delta", path: ["t", "rail"] },
      ],
      { "": 4, t: 4, "t/road": 4, "t/rail": 1 },
    );
    // A deeper-scoped query reports partial ancestor counts (only 2 below infra).
    const deeper = page(
      "r1",
      [
        { id: "b1", name: "Beta", path: ["t", "road", "infra"] },
        { id: "e1", name: "Echo", path: ["t", "road", "infra"] },
      ],
      { "": 2, t: 2, "t/road": 2, "t/road/infra": 2 },
    );
    const one = mergeTree(releases, [scope("r1", [], [first])]);
    const all = mergeTree(releases, [
      scope("r1", ["t", "road", "infra"], [deeper]),
      scope("r1", [], [first, second]),
    ]);
    const reordered = mergeTree(releases, [
      scope("r1", [], [second, first]),
      scope("r1", ["t", "road", "infra"], [deeper]),
    ]);
    for (const key of one.nodes.keys()) expect(all.nodes.has(key)).toBe(true);
    expect(all.nodes.size).toBe(new Set(all.nodes.keys()).size);
    expect(outline(all)).toEqual(outline(reordered));
    expect(outline(all)).toEqual([
      "Release r1",
      "  t",
      "    rail",
      "      Delta",
      "    road",
      "      infra",
      "        Beta",
      "        Echo",
      "      Alpha",
      "      Charlie",
    ]);
    const count = (path: string[]) => {
      const node = all.nodes.get(all.branchAt("r1", path)!);
      return node?.kind === "branch" ? node.count : undefined;
    };
    expect(count([])).toBe(4);
    expect(count(["t", "road"])).toBe(4);
    expect(count(["t", "road", "infra"])).toBe(2);
    const deepOnly = mergeTree(releases, [
      scope("r1", ["t", "road", "infra"], [deeper]),
    ]);
    // No branch above the deeper scope accepts its partial count.
    expect(deepOnly.nodes.get(rootKey("r1"))).toMatchObject({ count: null });
    expect(loadedLeaves([first, second])).toBe(4);
  });

  it("ignores pages from another revision of the release", () => {
    const stale = {
      ...scope("r1", [], [page("r1", [{ id: "p", name: "P", path: ["x"] }])]),
      revision_id: "old",
    };
    const model = mergeTree([release("r1")], [stale]);
    expect(model.nodes.size).toBe(1);
  });
});
