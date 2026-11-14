import { useAuthState, useServiceContext } from "./app/service-context";

export function App() {
  const { mode } = useServiceContext();
  const auth = useAuthState();
  return (
    <main>
      <h1>LCA diff</h1>
      <p>Development scaffold — product journeys are not available yet.</p>
      <p role="status">
        {mode === "mock"
          ? "Local demo mode — synthetic services"
          : "Injected test services"}
        . Auth: {auth.status}.
      </p>
    </main>
  );
}
