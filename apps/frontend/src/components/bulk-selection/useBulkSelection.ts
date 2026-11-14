import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryKey } from "@tanstack/react-query";
import { isCancelledError, useQueryClient } from "@tanstack/react-query";
import { ServiceQueryError, useServiceQueries } from "../../app/queries";
import { selectionKey, useSelectionStore } from "../../app/selection";
import type { SelectedProcess } from "../../app/selection";
import type {
  ProcessId,
  Release,
  ResolveSelectionRequest,
  SearchFields,
} from "../../services/contracts";
import { bulkOrder } from "./scope";

export interface BulkScope {
  readonly release: Release;
  readonly scope: "branch" | "all_matching";
  readonly branch_path?: readonly string[];
}
export interface BulkAction {
  /** `toggle` deselects when every resolved ID is selected, else selects. */
  readonly kind: "select" | "deselect" | "toggle";
  /** Human-readable scope, e.g. "road" or "all matches". */
  readonly label: string;
  readonly fields: SearchFields;
  readonly scopes: readonly BulkScope[];
}
export type BulkStatus =
  | { readonly state: "idle" }
  | {
      readonly state: "running";
      readonly action: BulkAction;
      readonly resolved: number;
      readonly phase: "resolving" | "details";
    }
  | { readonly state: "done"; readonly message: string }
  | {
      readonly state: "failed";
      readonly action: BulkAction;
      readonly message: string;
      readonly retryable: boolean;
    };

const plural = (count: number) =>
  `${count} ${count === 1 ? "process" : "processes"}`;

/**
 * One bulk select/deselect at a time (#19, D7). Selection changes only when
 * every resolve/header read succeeds, atomically; cancel, failure or unmount
 * (signout, account change) leave it unchanged.
 */
export function useBulkSelection() {
  const client = useQueryClient();
  const queries = useServiceQueries();
  const store = useSelectionStore();
  const [status, setStatus] = useState<BulkStatus>({ state: "idle" });
  const current = useRef<{ cancelled: boolean; keys: QueryKey[] } | null>(null);

  const cancel = useCallback(() => {
    const run = current.current;
    if (!run) return;
    run.cancelled = true;
    current.current = null;
    // A tri-state matching-set query may share a key: let active observers
    // refetch what the cancelled bulk read aborted.
    for (const queryKey of run.keys)
      void client
        .cancelQueries({ queryKey })
        .then(() => client.refetchQueries({ queryKey, type: "active" }));
  }, [client]);
  useEffect(() => cancel, [cancel]);

  const run = useCallback(
    async (action: BulkAction) => {
      if (current.current) return;
      const token = { cancelled: false, keys: [] as QueryKey[] };
      current.current = token;
      const track = <T extends { queryKey: QueryKey }>(options: T) => {
        token.keys.push(options.queryKey);
        return options;
      };
      let resolved = 0;
      setStatus({ state: "running", action, resolved, phase: "resolving" });
      try {
        const perRelease: { release: Release; ids: ProcessId[] }[] = [];
        for (const scope of action.scopes) {
          const dto: Omit<ResolveSelectionRequest, "cursor" | "limit"> = {
            fields: action.fields,
            scope: scope.scope,
            revision_snapshot: [
              {
                release_id: scope.release.release_id,
                revision_id: scope.release.revision_id,
              },
            ],
            ...(scope.branch_path ? { branch_path: scope.branch_path } : {}),
          };
          const ids: ProcessId[] = await client.fetchQuery(
            track(queries.resolveAll(dto)),
          );
          if (token.cancelled) return;
          perRelease.push({ release: scope.release, ids });
          resolved += ids.length;
          setStatus({ state: "running", action, resolved, phase: "resolving" });
        }
        const deselect =
          action.kind === "deselect" ||
          (action.kind === "toggle" &&
            resolved > 0 &&
            perRelease.every(({ release, ids }) =>
              ids.every((id) =>
                store.isSelected(
                  selectionKey({ release_id: release.release_id, id }),
                ),
              ),
            ));
        if (deselect) {
          const keys = perRelease.flatMap(({ release, ids }) =>
            ids.map((id) =>
              selectionKey({ release_id: release.release_id, id }),
            ),
          );
          const before = store.getSnapshot().length;
          store.deselectMany(keys);
          const removed = before - store.getSnapshot().length;
          setStatus({
            state: "done",
            message: `Deselected ${plural(removed)} in ${action.label}.`,
          });
          return;
        }
        setStatus({ state: "running", action, resolved, phase: "details" });
        const added: SelectedProcess[] = [];
        for (const { release, ids } of perRelease) {
          const fresh = ids.filter(
            (id) =>
              !store.isSelected(
                selectionKey({ release_id: release.release_id, id }),
              ),
          );
          if (!fresh.length) continue;
          const headers = await client.fetchQuery(
            track(
              queries.headersFor(
                {
                  release_id: release.release_id,
                  revision_id: release.revision_id,
                },
                fresh,
              ),
            ),
          );
          if (token.cancelled) return;
          added.push(
            ...[...headers].sort(bulkOrder).map((header) => ({
              release_id: header.release_id,
              revision_id: header.revision_id,
              id: header.id,
              name: header.name,
              geography: header.geography,
              path: header.category_path,
            })),
          );
        }
        if (token.cancelled) return;
        const before = store.getSnapshot().length;
        store.selectMany(added);
        const count = store.getSnapshot().length - before;
        setStatus({
          state: "done",
          message: `Selected ${plural(count)} in ${action.label}.`,
        });
      } catch (error) {
        if (token.cancelled || isCancelledError(error)) return;
        const detail =
          error instanceof ServiceQueryError ? error.detail : undefined;
        setStatus({
          state: "failed",
          action,
          message: detail?.message ?? "The selection could not be resolved",
          retryable: detail?.retryable ?? true,
        });
      } finally {
        if (current.current === token) current.current = null;
      }
    },
    [client, queries, store],
  );

  const cancelRun = useCallback(() => {
    if (status.state !== "running") return;
    const action = status.action;
    cancel();
    setStatus({
      state: "done",
      message: `Cancelled: selection unchanged for ${action.label}.`,
    });
  }, [cancel, status]);
  const dismiss = useCallback(() => setStatus({ state: "idle" }), []);

  return { status, run, cancel: cancelRun, dismiss };
}
