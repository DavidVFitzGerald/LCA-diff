import type {
  Page,
  Release,
  ReleaseId,
  SearchNode,
} from "../../services/contracts";

/** Leaves per tree page request; tests size synthetic catalogs against it. */
export const TREE_PAGE_LIMIT = 50;

export interface TreeBranch {
  readonly kind: "branch";
  readonly key: string;
  readonly release_id: ReleaseId;
  readonly label: string;
  /** Release roots carry their version separately from the display name. */
  readonly version: string | null;
  readonly path: readonly string[];
  readonly count: number | null;
  readonly parent: string | null;
}
export interface TreeProcess {
  readonly kind: "process";
  readonly key: string;
  readonly id: string;
  readonly release_id: ReleaseId;
  readonly label: string;
  readonly geography: string;
  readonly path: readonly string[];
  readonly parent: string;
}
export type TreeNode = TreeBranch | TreeProcess;

/** Pages returned for one branch-scoped search. */
export interface BranchPages {
  readonly release_id: ReleaseId;
  readonly revision_id: string;
  readonly branch_path: readonly string[];
  readonly pages: readonly Page<SearchNode>[];
}
export interface TreeModel {
  readonly nodes: ReadonlyMap<string, TreeNode>;
  readonly children: ReadonlyMap<string, readonly string[]>;
  readonly roots: readonly string[];
  /** Branch key for a release path; the empty path is the release root. */
  branchAt(release_id: ReleaseId, path: readonly string[]): string | undefined;
}

export const rootKey = (release_id: ReleaseId) =>
  JSON.stringify(["root", release_id]);
const pathKey = (release_id: ReleaseId, path: readonly string[]) =>
  JSON.stringify([release_id, ...path]);
const nodeKey = (kind: "branch" | "process", release_id: string, id: string) =>
  JSON.stringify([kind, release_id, id]);
const isPrefix = (prefix: readonly string[], path: readonly string[]) =>
  prefix.length <= path.length &&
  prefix.every((segment, index) => path[index] === segment);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pure merge of loaded pages into a stable tree. Parents are linked by release
 * and path prefix (service IDs stay opaque), nodes are deduplicated by release
 * and ID, labels are verbatim, and sibling order is independent of load order.
 * Pages from a revision other than the release's current one are ignored.
 */
export function mergeTree(
  releases: readonly Release[],
  loaded: readonly BranchPages[],
): TreeModel {
  const nodes = new Map<string, TreeNode>();
  const byPath = new Map<string, string>();
  const roots = releases.map((release) => {
    const key = rootKey(release.release_id);
    nodes.set(key, {
      kind: "branch",
      key,
      release_id: release.release_id,
      label: release.display_name,
      version: release.version,
      path: [],
      count: null,
      parent: null,
    });
    byPath.set(pathKey(release.release_id, []), key);
    return key;
  });
  const current = new Map(
    releases.map((release) => [release.release_id, release.revision_id]),
  );
  const counted = new Set<string>();

  function visit(node: SearchNode, scope: readonly string[]) {
    if (node.kind === "branch") {
      const at = pathKey(node.release_id, node.path);
      let key = byPath.get(at);
      if (!key) {
        const parent = byPath.get(
          pathKey(node.release_id, node.path.slice(0, -1)),
        );
        if (!parent) return; // Orphaned outside a known release: never render.
        key = nodeKey("branch", node.release_id, node.id);
        if (!nodes.has(key)) {
          nodes.set(key, {
            kind: "branch",
            key,
            release_id: node.release_id,
            label: node.label,
            version: null,
            path: [...node.path],
            count: null,
            parent,
          });
          byPath.set(at, key);
        }
      }
      // Counts are exact only at or below the request's branch scope.
      if (!counted.has(key) && isPrefix(scope, node.path)) {
        counted.add(key);
        nodes.set(key, {
          ...(nodes.get(key) as TreeBranch),
          count: node.matching_descendant_count,
        });
      }
      node.children.forEach((child) => visit(child, scope));
      return;
    }
    const parent = byPath.get(pathKey(node.release_id, node.path));
    const key = nodeKey("process", node.release_id, node.id);
    if (!parent || nodes.has(key)) return;
    nodes.set(key, {
      kind: "process",
      key,
      id: node.id,
      release_id: node.release_id,
      label: node.label,
      geography: node.geography,
      path: [...node.path],
      parent,
    });
  }
  // Shallow scopes first, so branches exist before deeper-scoped descendants.
  const ordered = [...loaded]
    .filter((entry) => current.get(entry.release_id) === entry.revision_id)
    .sort((a, b) => a.branch_path.length - b.branch_path.length);
  for (const entry of ordered)
    for (const page of entry.pages)
      for (const node of page.items)
        if (node.release_id === entry.release_id)
          visit(node, entry.branch_path);
  // A release-scoped result is exact for the root even with zero matches.
  for (const entry of ordered) {
    const key = rootKey(entry.release_id);
    const root = nodes.get(key) as TreeBranch | undefined;
    const total = entry.pages.at(-1)?.total_count;
    if (
      root &&
      root.count === null &&
      !entry.branch_path.length &&
      total !== undefined
    )
      nodes.set(key, { ...root, count: total });
  }

  const children = new Map<string, string[]>();
  for (const node of nodes.values())
    if (node.parent !== null) {
      const list = children.get(node.parent) ?? [];
      list.push(node.key);
      children.set(node.parent, list);
    }
  for (const list of children.values())
    list.sort((a, b) => {
      const x = nodes.get(a)!;
      const y = nodes.get(b)!;
      if (x.kind !== y.kind) return x.kind === "branch" ? -1 : 1;
      if (x.kind === "branch")
        return (
          compare(x.label.toLowerCase(), y.label.toLowerCase()) ||
          compare(x.key, y.key)
        );
      const p = y as TreeProcess;
      return (
        compare(x.label.toLowerCase(), p.label.toLowerCase()) ||
        compare(x.geography.toLowerCase(), p.geography.toLowerCase()) ||
        compare(x.id, p.id)
      );
    });
  return {
    nodes,
    children,
    roots,
    branchAt: (release_id, path) => byPath.get(pathKey(release_id, path)),
  };
}

/** Number of process leaves contained in loaded pages (for continuation labels). */
export function loadedLeaves(pages: readonly Page<SearchNode>[]): number {
  const count = (node: SearchNode): number =>
    node.kind === "process"
      ? 1
      : node.children.reduce((sum, child) => sum + count(child), 0);
  return pages.reduce(
    (sum, page) => sum + page.items.reduce((s, node) => s + count(node), 0),
    0,
  );
}
