import type { BulkStatus } from "./useBulkSelection";
import "./bulk-selection.css";

/** Progress, cancellation and outcome of the current bulk action (#19, D7). */
export function BulkStatusArea({
  status,
  onCancel,
  onRetry,
  onDismiss,
}: {
  status: BulkStatus;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="bulk-status" aria-live="polite">
      {status.state === "running" && (
        <p className="bulk-running">
          <span>
            {status.action.kind === "select" ? "Selecting" : "Deselecting"}{" "}
            processes in {status.action.label}…{" "}
            {status.phase === "details"
              ? `loading details for ${status.resolved} found`
              : `${status.resolved} found`}
          </span>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </p>
      )}
      {status.state === "failed" && (
        <p className="bulk-failed">
          <span>
            Selection unchanged: could not{" "}
            {status.action.kind === "select" ? "select" : "deselect"} processes
            in {status.action.label}. {status.message}
          </span>
          {status.retryable && (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          )}
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
        </p>
      )}
      {status.state === "done" && <p className="bulk-done">{status.message}</p>}
    </div>
  );
}
