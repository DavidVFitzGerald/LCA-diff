import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type {
  Page,
  Release,
  SearchFields,
  SearchNode,
  ServiceError,
} from "../../services/contracts";
import { ServiceQueryError, useServiceQueries } from "../../app/queries";
import { selectionKey, useSelection } from "../../app/selection";
import type { SelectionStore } from "../../app/selection";
import { BulkStatusArea } from "../bulk-selection/BulkStatusArea";
import { checkState, scopeKey, selectedByScope } from "../bulk-selection/scope";
import type { CheckState } from "../bulk-selection/scope";
import { useBulkSelection } from "../bulk-selection/useBulkSelection";
import type { BulkAction } from "../bulk-selection/useBulkSelection";
import { loadedLeaves, mergeTree, rootKey, TREE_PAGE_LIMIT } from "./model";
import type {
  BranchPages,
  TreeBranch,
  TreeModel,
  TreeNode,
  TreeProcess,
} from "./model";
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
  fieldsJson,
  onChange,
  actions,
}: {
  branchKey: string;
  release: Release;
  /** Serialized so a rebuilt model never changes the loader inputs. */
  pathJson: string;
  /** Serialized normalized search fields; "{}" is the unfiltered tree. */
  fieldsJson: string;
  onChange: (key: string, load: BranchLoad | null) => void;
  actions: Map<string, BranchActions>;
}) {
  const queries = useServiceQueries();
  const path = useMemo(
    () => JSON.parse(pathJson) as readonly string[],
    [pathJson],
  );
  const fields = useMemo(
    () => JSON.parse(fieldsJson) as SearchFields,
    [fieldsJson],
  );
  const query = useInfiniteQuery(
    queries.searchPages({
      fields,
      // Filtered searches are root-scoped per release (#17, D4).
      ...(path.length || fieldsJson === "{}" ? { branch_path: path } : {}),
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
  isOpen: (key: string) => boolean,
  loads: ReadonlyMap<string, BranchLoad>,
  filtered: boolean,
): Row[] {
  const rows: Row[] = [];
  const complete = (load: BranchLoad | undefined) =>
    load?.status === "success" && !load.hasNext;
  const walk = (keys: readonly string[], level: number, setsize: number) => {
    keys.forEach((key, index) => {
      const node = model.nodes.get(key)!;
      const open = node.kind === "branch" && isOpen(key);
      // Filtered nested branches are filled by their release's root search.
      const derived =
        filtered && node.kind === "branch" && node.parent !== null;
      const load = loads.get(key);
      rows.push({
        kind: "node",
        key,
        node,
        level,
        posinset: index + 1,
        setsize,
        expanded: open,
        busy: open && !derived && (load?.fetching ?? true),
      });
      if (!open) return;
      const children = model.children.get(key) ?? [];
      if (derived) {
        const root = loads.get(rootKey(node.release_id));
        walk(children, level + 1, complete(root) ? children.length : -1);
        return;
      }
      walk(children, level + 1, complete(load) ? children.length : -1);
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

/** Stable select function, so a cached ID list maps to one Set (#19). */
const toIdSet = (ids: readonly string[]): ReadonlySet<string> => new Set(ids);
const NO_FILTER = "{}";
const scopedKey = (filter: string, key: string) => `${filter}\n${key}`;

export function ProcessTree({
  labelledBy,
  fields = {},
}: {
  labelledBy: string;
  /** Normalized search fields (#17); empty shows the full lazy tree. */
  fields?: SearchFields;
}) {
  const filter = JSON.stringify(fields);
  const filtering = filter !== NO_FILTER;
  const queries = useServiceQueries();
  const releasesQuery = useQuery(queries.releases());
  const releases = useMemo(
    () => releasesQuery.data?.items ?? [],
    [releasesQuery.data],
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Loads keyed by (filter, branch); unfiltered pages survive a search. */
  const [allLoads, setLoads] = useState<ReadonlyMap<string, BranchLoad>>(
    () => new Map(),
  );
  // Branches the user collapsed in the current filtered view (D4).
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [shownFilter, setShownFilter] = useState(filter);
  if (shownFilter !== filter) {
    setShownFilter(filter);
    setCollapsed(new Set());
  }
  const loads = useMemo(() => {
    const view = new Map<string, BranchLoad>();
    const prefix = scopedKey(filter, "");
    for (const [key, load] of allLoads)
      if (key.startsWith(prefix)) view.set(key.slice(prefix.length), load);
    return view;
  }, [allLoads, filter]);
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
  const { entries: selected, store: selection } = useSelection();
  const selectedKeys = useMemo(
    () => new Set(selected.map(selectionKey)),
    [selected],
  );
  const bulk = useBulkSelection();
  const bulkRunning = bulk.status.state === "running";

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

  const loadsRef = useRef<ReadonlyMap<string, BranchLoad>>(allLoads);
  useEffect(() => {
    // Drop pages of superseded filters; unfiltered pages are kept (D4).
    const next = new Map(
      [...loadsRef.current].filter(
        ([key]) =>
          key.startsWith(scopedKey(NO_FILTER, "")) ||
          key.startsWith(scopedKey(filter, "")),
      ),
    );
    if (next.size !== loadsRef.current.size) {
      loadsRef.current = next;
      setLoads(next);
    }
  }, [filter]);
  const onLoad = useCallback((scoped: string, load: BranchLoad | null) => {
    const key = scoped.slice(scoped.indexOf("\n") + 1);
    const before = loadsRef.current.get(scoped);
    const next = new Map(loadsRef.current);
    if (load) next.set(scoped, load);
    // A collapsed branch keeps its loaded pages (for stable names and counts)
    // for this component's lifetime, which ends on signout or account change.
    // Only mounted loaders report, so every report belongs to a live scope;
    // superseded filter scopes are purged when the filter changes.
    else if (before?.pages.length)
      next.set(scoped, {
        ...before,
        status: "success",
        fetching: false,
        fetchingNext: false,
        nextFailed: false,
        error: null,
      });
    else next.delete(scoped);
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

  const isOpen = (key: string) =>
    filtering
      ? model.nodes.get(key)?.kind === "branch" && !collapsed.has(key)
      : expanded.has(key);
  /** Loaders exist only for expanded branches whose ancestors are all expanded. */
  const loaders: { key: string; node: TreeBranch; release: Release }[] = [];
  const visibleOpen = (key: string): boolean => {
    const node = model.nodes.get(key);
    if (!node || node.kind !== "branch" || !isOpen(key)) return false;
    return node.parent === null || visibleOpen(node.parent);
  };
  // Filtered: one root-scoped search per expanded release (D4).
  for (const key of filtering ? model.roots : expanded)
    if (visibleOpen(key)) {
      const node = model.nodes.get(key) as TreeBranch;
      const release = releases.find((r) => r.release_id === node.release_id);
      if (release) loaders.push({ key, node, release });
    }

  const rows = useMemo(
    () =>
      buildRows(
        model,
        filtering
          ? (key) =>
              model.nodes.get(key)?.kind === "branch" && !collapsed.has(key)
          : (key) => expanded.has(key),
        loads,
        filtering,
      ),
    [model, expanded, collapsed, loads, filtering],
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

  // D5: summary of the current filter once every release root has answered.
  const rootLoads = model.roots.map((key) => loads.get(key));
  const settled =
    filtering &&
    rootLoads.length > 0 &&
    rootLoads.every((load) => load?.status === "success");
  const matches = rootLoads.reduce(
    (sum, load) => sum + (load?.pages.at(-1)?.total_count ?? 0),
    0,
  );
  const noResults = settled && matches === 0;
  const liveText = settled
    ? `${plural(matches)} ${matches === 1 ? "matches" : "match"} your search.`
    : announcement;

  // D5: parent checkbox state relative to the current actionable scope. While
  // filtering, a release's matching-ID set is resolved only when that release
  // has selected entries; until it arrives, loaded matching leaves are used.
  const selectedReleases = useMemo(
    () => [...new Set(selected.map((entry) => entry.release_id))].sort(),
    [selected],
  );
  const matchSets = useQueries({
    queries: (filtering ? selectedReleases : []).flatMap((release_id) => {
      const release = releases.find((r) => r.release_id === release_id);
      if (!release) return [];
      return [
        {
          ...queries.resolveAll({
            fields,
            scope: "all_matching",
            revision_snapshot: [
              {
                release_id: release.release_id,
                revision_id: release.revision_id,
              },
            ],
          }),
          select: toIdSet,
        },
      ];
    }),
  });
  const matchSetFor = new Map<string, ReadonlySet<string> | undefined>(
    (filtering ? selectedReleases : []).map((release_id, position) => [
      release_id,
      matchSets[position]?.data,
    ]),
  );
  const scopeCounts = useMemo(
    () =>
      selectedByScope(
        selected,
        filtering
          ? (entry) =>
              matchSetFor.get(entry.release_id)?.has(entry.id) ??
              model.nodes.has(
                JSON.stringify(["process", entry.release_id, entry.id]),
              )
          : undefined,
      ),
    // matchSetFor is rebuilt each render; its contents are captured by matchSets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, filtering, model, matchSets],
  );
  const branchState = (node: TreeBranch) => ({
    state: checkState(
      node.count,
      scopeCounts.get(scopeKey(node.release_id, node.path)) ?? 0,
    ),
    busy:
      filtering &&
      selectedReleases.includes(node.release_id) &&
      matchSetFor.get(node.release_id) === undefined,
  });
  const releaseLabel = (release: Release) =>
    `${release.display_name} ${release.version}`;
  function runBulk(action: BulkAction) {
    if (!bulkRunning) void bulk.run(action);
  }
  function toggleBranch(node: TreeBranch) {
    const release = releases.find((r) => r.release_id === node.release_id);
    if (!release || !node.count) return;
    runBulk({
      kind: branchState(node).state === "true" ? "deselect" : "select",
      label: node.parent === null ? releaseLabel(release) : node.label,
      fields,
      scopes: [{ release, scope: "branch", branch_path: node.path }],
    });
  }
  const allMatches = (kind: BulkAction["kind"]) =>
    runBulk({
      kind,
      label: "all matches",
      fields,
      scopes: releases.map((release) => ({
        release,
        scope: "all_matching" as const,
      })),
    });

  const toggle = (key: string, open?: boolean) => {
    if (filtering)
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (open ?? next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    else
      setExpanded((previous) => {
        const next = new Set(previous);
        if (open ?? !next.has(key)) next.add(key);
        else next.delete(key);
        return next;
      });
  };
  const activate = (row: Row) => {
    if (row.kind === "node") {
      if (row.node.kind === "branch") toggle(row.key);
      else toggleSelection(selection, row.node, releases);
    } else if (row.kind === "more" && !row.load?.fetchingNext) {
      pendingMore.current = {
        branch: row.branch,
        before: new Set(model.children.get(row.branch) ?? []),
      };
      actions.get(scopedKey(filter, row.branch))?.next();
    } else if (row.kind === "error" && row.load?.error?.retryable)
      actions.get(scopedKey(filter, row.branch))?.retry();
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
      case " ":
        // Space toggles a process, or bulk-toggles a branch's scope (#19).
        if (row.kind !== "node") return;
        if (row.node.kind === "process") activate(row);
        else toggleBranch(row.node);
        break;
      default:
        return;
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
      {filtering && (
        <div className="bulk-matches">
          <button
            type="button"
            disabled={bulkRunning || noResults}
            onClick={() => allMatches("select")}
          >
            Select all matches
          </button>
          <button
            type="button"
            disabled={bulkRunning || noResults}
            onClick={() => allMatches("deselect")}
          >
            Deselect all matches
          </button>
        </div>
      )}
      <BulkStatusArea
        status={bulk.status}
        onCancel={bulk.cancel}
        onRetry={() => {
          if (bulk.status.state !== "failed") return;
          const action = bulk.status.action;
          bulk.dismiss();
          void bulk.run(action);
        }}
        onDismiss={bulk.dismiss}
      />
      {noResults && (
        <p className="tree-no-results">No processes match your search.</p>
      )}
      {loaders.map(({ key, node, release }) => (
        <BranchLoader
          key={scopedKey(filter, key)}
          branchKey={scopedKey(filter, key)}
          release={release}
          pathJson={JSON.stringify(node.path)}
          fieldsJson={filter}
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
        onFocus={(event) => {
          treeFocused.current = true;
          // Focus arriving by any route (pointer, script, assistive technology)
          // makes that row the active one, so Enter acts on the focused row.
          const key = (event.target as HTMLElement).dataset.rowKey;
          if (key !== undefined && key !== active) setActive(key);
        }}
        onBlur={(event) => {
          const tree = event.currentTarget;
          const left = event.target as Element;
          const next = event.relatedTarget;
          if (next instanceof Node) {
            if (!tree.contains(next)) treeFocused.current = false;
            return;
          }
          // No next target: the user blurred to a non-focusable area (row still
          // mounted) or the focused row unmounted (collapse/virtualization), in
          // which case focus is restored to the effective row.
          queueMicrotask(() => {
            if (left.isConnected && !tree.contains(document.activeElement))
              treeFocused.current = false;
          });
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
                filtering={filtering}
                active={row.key === effective}
                checked={
                  row.kind !== "node"
                    ? undefined
                    : row.node.kind === "process"
                      ? selectedKeys.has(selectionKey(row.node))
                        ? "true"
                        : "false"
                      : branchState(row.node).state
                }
                checkBusy={
                  row.kind === "node" &&
                  row.node.kind === "branch" &&
                  branchState(row.node).busy
                }
                onCheck={
                  row.kind === "node" && row.node.kind === "branch"
                    ? () => {
                        const node = row.node as TreeBranch;
                        setActive(row.key);
                        toggleBranch(node);
                      }
                    : undefined
                }
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
        {liveText}
      </p>
    </>
  );
}

function TreeRow({
  row,
  model,
  filtering,
  active,
  checked,
  checkBusy,
  onCheck,
  top,
  register,
  onClick,
}: {
  row: Row;
  model: TreeModel;
  filtering: boolean;
  active: boolean;
  checked: CheckState | undefined;
  checkBusy: boolean;
  onCheck: (() => void) | undefined;
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
        aria-busy={(branch && row.busy) || checkBusy ? true : undefined}
        aria-checked={checked}
        title={nodeName(node)}
      >
        <span className="tree-chevron" aria-hidden="true">
          {branch ? (row.expanded ? "▾" : "▸") : ""}
        </span>
        {checked !== undefined && (
          <span
            className={`tree-check${checked === "true" ? " checked" : checked === "mixed" ? " mixed" : ""}`}
            aria-hidden="true"
            onClick={
              onCheck
                ? (event) => {
                    // The checkbox bulk-toggles; the rest of the row expands.
                    event.stopPropagation();
                    onCheck();
                  }
                : undefined
            }
          />
        )}
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
      <div
        {...common}
        aria-label={`No ${filtering ? "matching " : ""}processes in ${label}`}
      >
        {filtering ? "No matching processes" : "No processes"}
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

function toggleSelection(
  selection: SelectionStore,
  node: TreeProcess,
  releases: readonly Release[],
) {
  const release = releases.find((r) => r.release_id === node.release_id);
  if (!release) return;
  selection.toggle({
    release_id: node.release_id,
    revision_id: release.revision_id,
    id: node.id,
    name: node.label,
    geography: node.geography,
    path: node.path,
  });
}
