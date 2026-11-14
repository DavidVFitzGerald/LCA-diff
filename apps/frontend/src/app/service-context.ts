import { createContext, useContext, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AuthService,
  AuthState,
  DataService,
  Services,
} from "../services/contracts";

export interface ApplicationRuntime {
  readonly mode: "mock" | "test";
  readonly services: Services;
}
export function verifiedUid(state: AuthState): string | null {
  return state.status === "authenticated" && state.user.email_verified
    ? state.user.uid
    : null;
}
export function createSessionStore(auth: AuthService, client: QueryClient) {
  let state: AuthState = { status: "resolving" };
  let epoch = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    getEpoch: () => epoch,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      const unsubscribe = auth.observe((next) => {
        const previousUid = verifiedUid(state);
        state = next;
        if (previousUid !== verifiedUid(next) || verifiedUid(next) === null) {
          epoch += 1;
          client.clear();
        }
        listeners.forEach((listener) => listener());
      });
      return () => {
        unsubscribe();
        epoch += 1;
        state = { status: "resolving" };
        client.clear();
      };
    },
  };
}
type SessionStore = ReturnType<typeof createSessionStore>;
export function guardDataService(
  data: DataService,
  session: SessionStore,
): DataService {
  const operations = [
    "identity",
    "releases",
    "search",
    "resolveSelection",
    "headers",
    "indicatorTree",
    "flowRows",
    "flowCells",
    "scoreRows",
    "scoreCells",
    "health",
  ] as const satisfies readonly (keyof DataService)[];
  return Object.fromEntries(
    operations.map((operation) => [
      operation,
      (...args: unknown[]) =>
        Promise.resolve().then(async () => {
          const state = session.getSnapshot();
          const epoch = session.getEpoch();
          if (operation !== "health" && verifiedUid(state) === null)
            return {
              ok: false,
              error: {
                code:
                  state.status === "authenticated"
                    ? "EMAIL_NOT_VERIFIED"
                    : "AUTH_REQUIRED",
                message: "Verified authentication is required",
                request_id: "service-auth-guard",
                retryable: false,
              },
            };
          const result = await Reflect.apply(data[operation], data, args);
          if (operation !== "health" && session.getEpoch() !== epoch)
            return {
              ok: false,
              error: {
                code: "AUTH_REQUIRED",
                message: "Authentication context changed",
                request_id: "service-auth-guard",
                retryable: false,
              },
            };
          return result;
        }),
    ]),
  ) as unknown as DataService;
}
export const ServiceContext = createContext<{
  readonly services: Services;
  readonly mode: ApplicationRuntime["mode"];
  readonly namespace: string;
  readonly session: SessionStore;
} | null>(null);
export function useServiceContext() {
  const context = useContext(ServiceContext);
  if (!context) throw new Error("Application services are not mounted");
  return context;
}
export function useServices(): Services {
  return useServiceContext().services;
}
export function useAuthState(): AuthState {
  const { session } = useServiceContext();
  return useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
}
