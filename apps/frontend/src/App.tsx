import { memo, useEffect, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import type { SearchFields } from "./services/contracts";
import {
  useAuthState,
  useServiceContext,
  verifiedUid,
} from "./app/service-context";
import { AuthDialog } from "./auth/AuthDialog";
import { ProcessSearch } from "./components/process-search/ProcessSearch";
import { ProcessTree } from "./components/process-tree/ProcessTree";
import { SelectedProcesses } from "./components/selected-processes/SelectedProcesses";
import { SelectionProvider, useSelection } from "./app/selection";
import { AnnouncerProvider } from "./app/announcer";
import { ScoresGrid } from "./components/comparison/ScoresGrid";
import { scopedIndicatorIds, useIndicators } from "./app/indicator-context";
import { FlowsGrid } from "./components/comparison/FlowsGrid";
import { IndicatorProvider } from "./app/indicators";
import { DifferencesProvider } from "./app/differences";
import { IndicatorTree } from "./components/indicator-tree/IndicatorTree";
import "./app/shell.css";

const desktopQuery = "(min-width: 960px)";
function subscribeViewport(listener: () => void) {
  const query = window.matchMedia?.(desktopQuery);
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}
function isDesktop() {
  return window.matchMedia?.(desktopQuery).matches ?? true;
}

function EmptyComparison({ title }: { title: string }) {
  return (
    <div className="empty-comparison">
      {/* Focus target when the last column is removed (#25). */}
      <h2 tabIndex={-1} data-empty-focus>
        {title}
      </h2>
      <p>Select processes in the left sidebar to start your comparison.</p>
    </div>
  );
}

/** Flows: shared headers (#21) over the windowed flow grid (#23). */
const FlowsPanel = memo(function FlowsPanel() {
  const { entries } = useSelection();
  if (!entries.length) return <EmptyComparison title="Compare process flows" />;
  return (
    <>
      <h2 className="visually-hidden">Compare process flows</h2>
      <FlowsGrid />
    </>
  );
});

const ScoresPanel = memo(function ScoresPanel() {
  const { entries } = useSelection();
  const indicators = useIndicators();
  if (!entries.length) return <EmptyComparison title="Compare impact scores" />;
  const scoped = scopedIndicatorIds(
    indicators.tree,
    indicators.ids,
    new Set(entries.map((entry) => entry.release_id)),
  );
  if (!scoped.length)
    return (
      <div className="empty-comparison">
        <h2>Select an indicator</h2>
        <p>
          {indicators.ids.length
            ? "None of the chosen indicators belongs to the database version of the selected processes. Choose its indicators in the right sidebar."
            : "Choose indicators in the right sidebar to compare impact scores."}
        </p>
      </div>
    );
  return (
    <>
      <h2 className="visually-hidden">Compare impact scores</h2>
      <ScoresGrid />
    </>
  );
});

type Tab = "flows" | "scores";
function Workspace({ email, signOut }: { email: string; signOut: () => void }) {
  const [tab, setTab] = useState<Tab>("flows");
  const [processesOpen, setProcessesOpen] = useState(true);
  const [indicatorsOpen, setIndicatorsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // In-memory search fields; never persisted (#17, D6).
  const [searchFields, setSearchFields] = useState<SearchFields>({});
  function changeTab(event: KeyboardEvent<HTMLButtonElement>) {
    const next =
      event.key === "Home"
        ? "flows"
        : event.key === "End"
          ? "scores"
          : ["ArrowLeft", "ArrowRight"].includes(event.key)
            ? tab === "flows"
              ? "scores"
              : "flows"
            : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }
  return (
    <SelectionProvider>
      <IndicatorProvider>
        <DifferencesProvider>
          <AnnouncerProvider>
            <header className="app-header">
              <h1>LCA diff</h1>
              <div className="account-controls">
                <span>{email}</span>
                <button
                  type="button"
                  aria-expanded={settingsOpen}
                  aria-controls="settings"
                  onClick={() => setSettingsOpen(!settingsOpen)}
                >
                  Settings
                </button>
                <button type="button" onClick={signOut}>
                  Sign out
                </button>
              </div>
            </header>
            {settingsOpen && (
              <section id="settings" aria-label="Settings" className="settings">
                <p>Display settings use your browser defaults.</p>
              </section>
            )}
            <div className="workspace">
              <aside className="sidebar" aria-label="Process selection">
                <button
                  type="button"
                  aria-expanded={processesOpen}
                  aria-controls="process-sidebar"
                  onClick={() => setProcessesOpen(!processesOpen)}
                >
                  {processesOpen ? "Collapse processes" : "Expand processes"}
                </button>
                <section id="process-sidebar" hidden={!processesOpen}>
                  <h2 id="process-tree-heading">Processes</h2>
                  <ProcessSearch onChange={setSearchFields} />
                  <ProcessTree
                    labelledBy="process-tree-heading"
                    fields={searchFields}
                  />
                  <SelectedProcesses />
                </section>
              </aside>
              <main
                className="comparison"
                aria-label="Comparison workspace"
                tabIndex={-1}
              >
                <div role="tablist" aria-label="Comparison view">
                  {(["flows", "scores"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      id={`tab-${value}`}
                      aria-controls={`panel-${value}`}
                      aria-selected={tab === value}
                      tabIndex={tab === value ? 0 : -1}
                      onKeyDown={changeTab}
                      onClick={() => setTab(value)}
                    >
                      {value === "flows" ? "Flows" : "Scores"}
                    </button>
                  ))}
                </div>
                {(["flows", "scores"] as const).map((value) => (
                  <section
                    key={value}
                    role="tabpanel"
                    id={`panel-${value}`}
                    aria-labelledby={`tab-${value}`}
                    tabIndex={0}
                    hidden={tab !== value}
                  >
                    {value === "flows" ? (
                      <FlowsPanel />
                    ) : (
                      tab === "scores" && <ScoresPanel />
                    )}
                  </section>
                ))}
              </main>
              {tab === "scores" && (
                <aside className="sidebar" aria-label="Indicator selection">
                  <button
                    type="button"
                    aria-expanded={indicatorsOpen}
                    aria-controls="indicator-sidebar"
                    onClick={() => setIndicatorsOpen(!indicatorsOpen)}
                  >
                    {indicatorsOpen
                      ? "Collapse indicators"
                      : "Expand indicators"}
                  </button>
                  <section id="indicator-sidebar" hidden={!indicatorsOpen}>
                    <h2>Indicators</h2>
                    <IndicatorTree />
                  </section>
                </aside>
              )}
            </div>
          </AnnouncerProvider>
        </DifferencesProvider>
      </IndicatorProvider>
    </SelectionProvider>
  );
}

export function App() {
  const { mode, services, demo } = useServiceContext();
  const auth = useAuthState();
  const desktop = useSyncExternalStore(
    subscribeViewport,
    isDesktop,
    () => true,
  );
  const verified = verifiedUid(auth) !== null;
  const resolving = auth.status === "resolving";
  // Once login is required, keep the modal mounted through action-driven
  // resolving states so form focus and progress survive. Only the observed
  // verified state unmounts it; initial restoration never flashes it.
  const loginRequired = !verified && !resolving;
  const [loginShown, setLoginShown] = useState(false);
  if (loginRequired && !loginShown) setLoginShown(true);
  if (verified && loginShown) setLoginShown(false);
  const showLogin = !verified && (loginRequired || loginShown);
  useEffect(() => {
    if (verified && desktop)
      document.querySelector<HTMLElement>("main")?.focus();
  }, [verified, desktop]);
  // The guarded auth service locks protected UI and caches before the adapter
  // answers; a failed signout stays locked and is explained by the modal.
  function signOut() {
    void services.auth.signOut().catch(() => undefined);
  }
  return (
    <div className="app">
      {mode !== "real" && (
        <p role="status" className="demo-marker">
          {mode === "mock"
            ? `Local demo mode — synthetic services${
                demo?.scenario === "large"
                  ? " (large synthetic scenario: 220 processes, 2,000+ flows)"
                  : ""
              }`
            : "Injected test services"}
          . Auth: {auth.status}.
        </p>
      )}
      {!desktop ? (
        <main className="desktop-required">
          <h1>LCA diff</h1>
          <h2>A larger screen is required</h2>
          <p>
            Open LCA diff on a desktop or laptop with a window at least 960
            pixels wide to compare processes.
          </p>
        </main>
      ) : (
        <>
          <div className="shell" inert={!verified} aria-busy={resolving}>
            {verified && auth.status === "authenticated" ? (
              <Workspace
                key={auth.user.uid}
                email={auth.user.email}
                signOut={signOut}
              />
            ) : (
              <>
                <header className="app-header">
                  <h1>LCA diff</h1>
                </header>
                <div className="workspace locked-layout">
                  <aside className="sidebar">
                    <h2>Processes</h2>
                  </aside>
                  <main className="comparison">
                    <div className="locked-tabs">
                      Flows <span>Scores</span>
                    </div>
                    <div className="empty-comparison" />
                  </main>
                </div>
              </>
            )}
          </div>
          {resolving && !showLogin && (
            <p className="session-loading" aria-live="polite">
              Restoring your session…
            </p>
          )}
          {showLogin && <AuthDialog auth={auth} />}
        </>
      )}
    </div>
  );
}
