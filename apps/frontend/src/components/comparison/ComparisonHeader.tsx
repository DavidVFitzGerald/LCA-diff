import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServiceQueries } from "../../app/queries";
import { selectionKey, useSelection } from "../../app/selection";
import type { ProcessHeader } from "../../services/contracts";
import { COLUMN_BOUNDS, columnWidth } from "./model";
import type { ComparisonTab } from "./model";
import { ComparabilityWarning, ProcessHeaders } from "./ProcessHeaders";
import { useSelectionHeaders } from "./useSelectionHeaders";

/** Width of an element's content box, tracked through resizes. */
function useContentWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Comparability warning plus process metadata headers for one tab (#21).
 * Reads the shared ordered selection; column widths use the tab's bounds.
 */
export function ComparisonHeader({ tab }: { tab: ComparisonTab }) {
  const { entries } = useSelection();
  const { headers, error, retry } = useSelectionHeaders(entries);
  const releases = useQuery(useServiceQueries().releases()).data?.items;
  const { ref, width: available } = useContentWidth();
  const width = columnWidth(available, entries.length, COLUMN_BOUNDS[tab]);
  const loaded = entries.flatMap((entry): ProcessHeader[] => {
    const header = headers.get(selectionKey(entry));
    return header ? [header] : [];
  });
  const releaseName = (releaseId: string) => {
    const release = releases?.find((item) => item.release_id === releaseId);
    return release ? `${release.display_name} ${release.version}` : releaseId;
  };
  return (
    <div className="comparison-header" data-tab={tab}>
      <ComparabilityWarning headers={loaded} />
      {error && (
        <p role="alert" className="comparison-header-error">
          Process details could not be loaded ({error.detail.code}).{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      <ProcessHeaders
        entries={entries}
        headers={headers}
        width={width}
        releaseName={releaseName}
        scrollerRef={ref}
      />
    </div>
  );
}
