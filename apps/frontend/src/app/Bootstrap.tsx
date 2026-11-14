import { useMemo } from "react";
import { App } from "../App";
import { ApplicationProviders } from "./ApplicationProviders";
import { CONFIGURATION_ERROR, createApplication } from "./composition";

export function Bootstrap({
  mode,
  scenario = null,
}: {
  mode: unknown;
  /** The `mock-scenario` URL parameter; null when absent. */
  scenario?: unknown;
}) {
  const runtime = useMemo(() => {
    try {
      return createApplication(mode, scenario);
    } catch {
      return null;
    }
  }, [mode, scenario]);
  if (!runtime)
    return (
      <main>
        <h1>LCA diff</h1>
        <p role="alert">{CONFIGURATION_ERROR}</p>
      </main>
    );
  return (
    <ApplicationProviders runtime={runtime}>
      <App />
    </ApplicationProviders>
  );
}
