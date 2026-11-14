import { useEffect, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent } from "react";
import {
  useAuthState,
  useServiceContext,
  verifiedUid,
} from "./app/service-context";
import { AuthDialog } from "./auth/AuthDialog";
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

type Tab = "flows" | "scores";
function Workspace({ email, signOut }: { email: string; signOut: () => void }) {
  const [tab, setTab] = useState<Tab>("flows");
  const [processesOpen, setProcessesOpen] = useState(true);
  const [indicatorsOpen, setIndicatorsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    <>
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
            <h2>Processes</h2>
            <p>Choose processes here to begin a comparison.</p>
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
              className="empty-comparison"
            >
              <h2>
                {value === "flows"
                  ? "Compare process flows"
                  : "Compare impact scores"}
              </h2>
              <p>
                Select processes in the left sidebar to start your comparison.
              </p>
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
              {indicatorsOpen ? "Collapse indicators" : "Expand indicators"}
            </button>
            <section id="indicator-sidebar" hidden={!indicatorsOpen}>
              <h2>Indicators</h2>
              <p>Choose impact indicators here.</p>
            </section>
          </aside>
        )}
      </div>
    </>
  );
}

export function App() {
  const { mode, services } = useServiceContext();
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
      <p role="status" className="demo-marker">
        {mode === "mock"
          ? "Local demo mode — synthetic services"
          : "Injected test services"}
        . Auth: {auth.status}.
      </p>
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
