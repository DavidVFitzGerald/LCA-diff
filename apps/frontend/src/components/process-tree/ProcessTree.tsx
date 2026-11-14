import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type {
  Page,
  Release,
  SearchNode,
  ServiceError,
} from "../../services/contracts";
import { ServiceQueryError, useServiceQueries } from "../../app/queries";
import { loadedLeaves, mergeTree, TREE_PAGE_LIMIT } from "./model";
import type { BranchPages, TreeBranch, TreeModel, TreeNode } from "./model";
import "./process-tree.css";

export const TREE_ROW_HEIGHT = 32;
const OVERSCAN = 6;

interface BranchLoad {
  readonly release_id: string;
  readonly revision_id: string;
  readonly branch_path: readonly string[];
  readonly pages: readonly Page<SearchNode>[];
  readonly status: "pending" | "error" | "success";
  readonly fetching: boolean;
  readonly fetchingNext: boolean;
  readonly hasNext: boolean;
  readonly nextFailed: boolean;
  readonly error: ServiceError | null;
}
interface BranchActions {
  next(): void;
  retry(): void;
}
type Row =
  | {
      readonly kind: "node";
      readonly key: string;
      readonly node: TreeNode;
      readonly level: number;
      readonly posinset: number;
      readonly setsize: number;
      readonly expanded: boolean;
      readonly busy: boolean;
    }
  | {
      readonly kind: "more" | "loading" | "empty" | "error";
      readonly key: string;
      readonly branch: string;
      readonly level: number;
      readonly load: BranchLoad | undefined;
    };

function toServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceQueryError) return error.detail;
  return {
    code: "TEMPORARILY_UNAVAILABLE",
    message: "The process catalog could not be loaded",
    request_id: "process-tree",
    retryable: true,
  };
}
const plural = (count: number) =>
  `${count} ${count === 1 ? "process" : "processes"}`;
function branchName(node: TreeBranch) {
  const label = node.version ? `${node.label} ${node.version}` : node.label;
  return node.count === null ? label : `${label}, ${plural(node.count)}`;
}
function nodeName(node: TreeNode) {
  return node.kind === "branch"
    ? branchName(node)
    : `${node.label} — ${node.geography}`;
}
const pseudoKey = (kind: string, branch: string) => `${kind}|${branch}`;

/** Owns one expanded branch's paged search; unmounting cancels in-flight work. */
function BranchLoader({
  branchKey,
  release,
  pathJson,
  onChange,
  actions,
}: {
  branchKey: string;
  release: Release;
  /** Serialized so a rebuilt model never changes the loader inputs. */
  pathJson: string;
  onChange: (key: string, load: BranchLoad | null) => void;
  actions: Map<string, BranchActions>;
}) {
  const queries = useServiceQueries();
  const path = useMemo(
    () => JSON.parse(pathJson) as readonly string[],
    [pathJson],
  );
  const query = useInfiniteQuery(
    queries.searchPages({
      fields: {},
      branch_path: path,
      revision_snapshot: [
        { release_id: release.release_id, revision_id: release.revision_id },
      ],
      limit: TREE_PAGE_LIMIT,
    }),
  );
  const { fetchNextPage, refetch, isFetchNextPageError } = query;
  useEffect(() => {
    actions.set(branchKey, {
      next: () => void fetchNextPage(),
      retry: () => void (isFetchNextPageError ? fetchNextPage() : refetch()),
    });
  }, [actions, branchKey, fetchNextPage, refetch, isFetchNextPageError]);
  const pages = query.data?.pages;
  const error = query.error;
  useEffect(() => {
    onChange(branchKey, {
      release_id: release.release_id,
      revision_id: release.revision_id,
      branch_path: path,
      pages: pages ?? [],
      status: query.status,
      fetching: query.isFetching,
      fetchingNext: query.isFetchingNextPage,
      hasNext: query.hasNextPage,
      nextFailed: query.isFetchNextPageError,
      error: error ? toServiceError(error) : null,
    });
  }, [
    onChange,
    branchKey,
    release.release_id,
    release.revision_id,
    path,
    pages,
    error,
    query.status,
    query.isFetching,
    query.isFetchingNextPage,
    query.hasNextPage,
    query.isFetchNextPageError,
  ]);
  useEffect(
    () => () => {
      onChange(branchKey, null);
      actions.delete(branchKey);
    },
    [onChange, actions, branchKey],
  );
  return null;
}

function buildRows(
  model: TreeModel,
  expanded: ReadonlySet<string>,
  loads: ReadonlyMap<string, BranchLoad>,
): Row[] {
  const rows: Row[] = [];
  const walk = (keys: readonly string[], level: number, setsize: number) => {
    keys.forEach((key, index) => {
      const node = model.nodes.get(key)!;
      const open = node.kind === "branch" && expanded.has(key);
      const load = loads.get(key);
      rows.push({
        kind: "node",
        key,
        node,
        level,
        posinset: index + 1,
        setsize,
        expanded: open,
        busy: open && (load?.fetching ?? true),
      });
      if (!open) return;
      const children = model.children.get(key) ?? [];
      const complete = load?.status === "success" && !load.hasNext;
      walk(children, level + 1, complete ? children.length : -1);
      const pseudo = (kind: "more" | "loading" | "empty" | "error") =>
        rows.push({
          kind,
          key: pseudoKey(kind, key),
          branch: key,
          level: level + 1,
          load,
        });
      if (!load || (load.status === "pending" && !load.pages.length))
        pseudo("loading");
      else if (
        load.status === "error" &&
        (!load.pages.length || load.nextFailed)
      )
        pseudo("error");
      else if (load.hasNext) pseudo("more");
      else if (load.status === "success" && children.length === 0)
        pseudo("empty");
    });
  };
  walk(model.roots, 1, model.roots.length);
  return rows;
}

function parentOf(row: Row): string | null {
  return row.kind === "node" ? row.node.parent : row.branch;
}

export function ProcessTree({ labelledBy }: { labelledBy: string }) {
  const queries = useServiceQueries();
  const releasesQuery = useQuery(queries.releases());
  const releases = useMemo(
    () => releasesQuery.data?.items ?? [],
    [releasesQuery.data],
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [loads, setLoads] = useState<ReadonlyMap<string, BranchLoad>>(
    () => new Map(),
  );
  const [active, setActive] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const actions = useRef(new Map<string, BranchActions>()).current;
  const pendingMore = useRef<{ branch: string; before: Set<string> } | null>(
    null,
  );
  const treeFocused = useRef(false);
  /** Keyboard target awaiting scroll; bound to its key so no other render consumes it. */
  const scrollTarget = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLDivElement>()).current;

  const model = useMemo(() => {
    const loaded: BranchPages[] = [...loads.values()].map((load) => ({
      release_id: load.release_id,
      revision_id: load.revision_id,
      branch_path: load.branch_path,
      pages: load.pages,
    }));
    return mergeTree(releases, loaded);
  }, [releases, loads]);
  const modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const loadsRef = useRef<ReadonlyMap<string, BranchLoad>>(loads);
  const onLoad = useCallback((key: string, load: BranchLoad | null) => {
    const before = loadsRef.current.get(key);
    const next = new Map(loadsRef.current);
    if (load) next.set(key, load);
    // A collapsed branch keeps its loaded pages (for stable names and counts)
    // for this component's lifetime, which ends on signout or account change.
    else if (before?.pages.length)
      next.set(key, {
        ...before,
        status: "success",
        fetching: false,
        fetchingNext: false,
        nextFailed: false,
        error: null,
      });
    else next.delete(key);
    loadsRef.current = next;
    setLoads(next);
    if (!load) return;
    const node = modelRef.current.nodes.get(key);
    const label = node ? nodeName(node) : "branch";
    if (load.error && !before?.error)
      setAnnouncement(`Could not load ${label}: ${load.error.message}`);
    else if (load.status === "success" && !load.fetching && before?.fetching)
      setAnnouncement(
        `Loaded ${loadedLeaves(load.pages)} of ${load.pages.at(-1)?.total_count ?? 0} processes in ${label}`,
      );
  }, []);

  /** Loaders exist only for expanded branches whose ancestors are all expanded. */
  const loaders: { key: string; node: TreeBranch; release: Release }[] = [];
  const visibleOpen = (key: string): boolean => {
    const node = model.nodes.get(key);
    if (!node || node.kind !== "branch" || !expanded.has(key)) return false;
    return node.parent === null || visibleOpen(node.parent);
  };
  for (const key of expanded)
    if (visibleOpen(key)) {
      const node = model.nodes.get(key) as TreeBranch;
      const release = releases.find((r) => r.release_id === node.release_id);
      if (release) loaders.push({ key, node, release });
    }

  const rows = useMemo(
    () => buildRows(model, expanded, loads),
    [model, expanded, loads],
  );
  const index = useMemo(
    () => new Map(rows.map((row, position) => [row.key, position])),
    [rows],
  );

  // D5: keep the active item stable by identity; fall back predictably.
  const effective = useMemo(() => {
    if (!rows.length) return null;
    if (active !== null && index.has(active)) return active;
    if (active === null) return rows[0].key;
    const [kind, ...rest] = active.split("|");
    const branch = rest.join("|");
    if (["more", "loading", "error"].includes(kind) && branch) {
      if (index.has(pseudoKey("error", branch)))
        return pseudoKey("error", branch);
      const before =
        pendingMore.current?.branch === branch
          ? pendingMore.current.before
          : null;
      const fresh = (model.children.get(branch) ?? []).find(
        (key) => index.has(key) && !before?.has(key),
      );
      if (fresh) return fresh;
      if (index.has(branch)) return branch;
    }
    let cursor = model.nodes.get(active)?.parent ?? null;
    while (cursor !== null && !index.has(cursor))
      cursor = model.nodes.get(cursor)?.parent ?? null;
    return cursor ?? rows[0].key;
  }, [active, index, rows, model]);
  const activeIndex = effective === null ? -1 : index.get(effective)!;

  // No React Compiler runs in this build; virtualizer methods are used only here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => TREE_ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (position) => rows[position].key,
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      if (activeIndex >= 0 && !visible.includes(activeIndex))
        return [...visible, activeIndex].sort((a, b) => a - b);
      return visible;
    },
  });

  useEffect(() => {
    if (effective !== active) setActive(effective);
    if (effective === null) return;
    const element = items.get(effective);
    // Fixed-height rows: scroll the active row to the nearest edge directly;
    // the virtualizer follows the scroll event.
    const container = scroller.current;
    if (scrollTarget.current === effective && container) {
      scrollTarget.current = null;
      const top = index.get(effective)! * TREE_ROW_HEIGHT;
      const view = container.clientHeight;
      if (top < container.scrollTop) container.scrollTop = top;
      else if (top + TREE_ROW_HEIGHT > container.scrollTop + view)
        container.scrollTop = top + TREE_ROW_HEIGHT - view;
    }
    if (treeFocused.current && element && document.activeElement !== element)
      element.focus({ preventScroll: true });
  }, [effective, active, index, items]);

  const toggle = (key: string, open?: boolean) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open ?? !next.has(key)) next.add(key);
      else next.delete(key);
      return next;
    });
  const activate = (row: Row) => {
    if (row.kind === "node") {
      if (row.node.kind === "branch") toggle(row.key);
    } else if (row.kind === "more" && !row.load?.fetchingNext) {
      pendingMore.current = {
        branch: row.branch,
        before: new Set(model.children.get(row.branch) ?? []),
      };
      actions.get(row.branch)?.next();
    } else if (row.kind === "error" && row.load?.error?.retryable)
      actions.get(row.branch)?.retry();
  };
  const move = (key: string | undefined) => {
    if (key === undefined) return;
    scrollTarget.current = key;
    setActive(key);
  };
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (activeIndex < 0) return;
    const row = rows[activeIndex];
    const branch = row.kind === "node" && row.node.kind === "branch";
    switch (event.key) {
      case "ArrowDown":
        move(rows[activeIndex + 1]?.key);
        break;
      case "ArrowUp":
        move(rows[activeIndex - 1]?.key);
        break;
      case "Home":
        move(rows[0].key);
        break;
      case "End":
        move(rows.at(-1)!.key);
        break;
      case "ArrowRight":
        if (branch && !row.expanded) toggle(row.key, true);
        else if (branch) move(rows[activeIndex + 1]?.key);
        else return;
        break;
      case "ArrowLeft":
        if (branch && row.expanded) toggle(row.key, false);
        else {
          const parent = parentOf(row);
          if (parent === null) return;
          move(parent);
        }
        break;
      case "Enter":
        activate(row);
        break;
      default:
        return; // Space stays unbound for selection (#18/#19).
    }
    event.preventDefault();
  }

  if (releasesQuery.isPending)
    return (
      <p className="tree-status" aria-live="polite">
        Loading releases…
      </p>
    );
  if (releasesQuery.isError) {
    const error = toServiceError(releasesQuery.error);
    return (
      <div className="tree-status error">
        <p role="alert">{error.message}</p>
        {error.retryable && (
          <button type="button" onClick={() => void releasesQuery.refetch()}>
            Retry
          </button>
        )}
      </div>
    );
  }
  if (!releases.length)
    return <p className="tree-status">No published releases are available.</p>;

  return (
    <>
      {loaders.map(({ key, node, release }) => (
        <BranchLoader
          key={key}
          branchKey={key}
          release={release}
          pathJson={JSON.stringify(node.path)}
          onChange={onLoad}
          actions={actions}
        />
      ))}
      <div
        ref={scroller}
        className="process-tree"
        role="tree"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        onFocus={() => {
          treeFocused.current = true;
        }}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && !event.currentTarget.contains(next))
            treeFocused.current = false;
        }}
      >
        <div
          role="none"
          className="process-tree-sizer"
          style={{ height: rows.length * TREE_ROW_HEIGHT }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <TreeRow
                key={row.key}
                row={row}
                model={model}
                active={row.key === effective}
                top={item.index * TREE_ROW_HEIGHT}
                register={(element) => {
                  if (element) items.set(row.key, element);
                  else items.delete(row.key);
                }}
                onClick={() => {
                  setActive(row.key);
                  activate(row);
                }}
              />
            );
          })}
        </div>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}

function TreeRow({
  row,
  model,
  active,
  top,
  register,
  onClick,
}: {
  row: Row;
  model: TreeModel;
  active: boolean;
  top: number;
  register: (element: HTMLDivElement | null) => void;
  onClick: () => void;
}) {
  const common = {
    ref: register,
    role: "treeitem",
    "aria-level": row.level,
    tabIndex: active ? 0 : -1,
    "data-row-key": row.key,
    className: `tree-row tree-${row.kind}`,
    style: {
      transform: `translateY(${top}px)`,
      height: TREE_ROW_HEIGHT,
      paddingInlineStart: `${(row.level - 1) * 0.9 + 0.4}rem`,
    },
    onClick,
  } as const;
  if (row.kind === "node") {
    const { node } = row;
    const branch = node.kind === "branch";
    return (
      <div
        {...common}
        aria-label={nodeName(node)}
        aria-posinset={row.posinset}
        aria-setsize={row.setsize}
        aria-expanded={branch ? row.expanded : undefined}
        aria-busy={branch && row.busy ? true : undefined}
        title={nodeName(node)}
      >
        <span className="tree-chevron" aria-hidden="true">
          {branch ? (row.expanded ? "▾" : "▸") : ""}
        </span>
        <span className="tree-label">
          {node.label}
          {branch && node.version && (
            <span className="tree-meta"> {node.version}</span>
          )}
          {!branch && <span className="tree-meta"> — {node.geography}</span>}
        </span>
        {branch && node.count !== null && (
          <span className="tree-count" aria-hidden="true">
            {node.count}
          </span>
        )}
      </div>
    );
  }
  const parent = model.nodes.get(row.branch);
  const label = parent?.label ?? "this branch";
  const load = row.load;
  if (row.kind === "loading")
    return (
      <div {...common} aria-label={`Loading ${label}…`}>
        Loading…
      </div>
    );
  if (row.kind === "empty")
    return (
      <div {...common} aria-label={`No processes in ${label}`}>
        No processes
      </div>
    );
  if (row.kind === "error") {
    const error = load?.error;
    const retry = error?.retryable;
    const text = `Could not load ${label}. ${error?.message ?? ""}${retry ? " Retry" : ""}`;
    return (
      <div {...common} aria-label={text}>
        <span className="tree-error">{error?.message}</span>
        {retry && <span className="tree-action">Retry</span>}
      </div>
    );
  }
  const known = load ? loadedLeaves(load.pages) : 0;
  const total = load?.pages.at(-1)?.total_count ?? 0;
  return (
    <div
      {...common}
      aria-label={`Load more in ${label} (${known} of ${total} loaded)`}
      aria-busy={load?.fetchingNext ? true : undefined}
    >
      <span className="tree-action">
        {load?.fetchingNext ? "Loading more…" : "Load more"}
      </span>
      <span className="tree-meta">
        {" "}
        {known} of {total}
      </span>
    </div>
  );
}
