import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServiceQueries } from "../../app/queries";
import { selectionKey, useSelection } from "../../app/selection";
import type { SelectedProcess } from "../../app/selection";
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

export interface ComparisonLayout {
  readonly entries: readonly SelectedProcess[];
  readonly headers: ReadonlyMap<string, ProcessHeader>;
  /** Process column width for this tab (spec §6.3 bounds). */
  readonly width: number;
  /** The header strip's scroller, kept in horizontal sync by the grid. */
  readonly headerScroller: RefObject<HTMLDivElement | null>;
}

/**
 * Comparability warning plus process metadata headers for one tab (#21).
 * Reads the shared ordered selection; column widths use the tab's bounds.
 * With `children` it frames a windowed grid (#23): `leading` labels the
 * sticky identifying block of `leadingWidth` px left of the header strip.
 */
export function ComparisonHeader({
  tab,
  leading,
  leadingWidth = 0,
  children,
}: {
  tab: ComparisonTab;
  leading?: ReactNode;
  leadingWidth?: number;
  children?: (layout: ComparisonLayout) => ReactNode;
}) {
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
  const strip = (
    <ProcessHeaders
      entries={entries}
      headers={headers}
      width={width}
      releaseName={releaseName}
      scrollerRef={ref}
    />
  );
  return (
    <div className={children ? "comparison-frame" : undefined}>
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
        {children ? (
          <div className="comparison-header-row">
            <div className="comparison-corner" style={{ width: leadingWidth }}>
              {leading}
            </div>
            {strip}
          </div>
        ) : (
          strip
        )}
      </div>
      {children?.({ entries, headers, width, headerScroller: ref })}
    </div>
  );
}
