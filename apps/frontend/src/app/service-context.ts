import { createContext, useContext, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AuthService,
  AuthState,
  DataService,
  ServiceError,
  ServiceResult,
  Services,
} from "../services/contracts";

/** Local simulation instructions, supplied only by the composition root in mock mode. */
export interface DemoGuidance {
  readonly password: string;
  readonly verified_email: string;
  readonly unverified_email: string;
  readonly registration_example: string;
}
export interface ApplicationRuntime {
  readonly mode: "mock" | "test";
  readonly services: Services;
  readonly demo?: DemoGuidance;
}
export function verifiedUid(state: AuthState): string | null {
  return state.status === "authenticated" && state.user.email_verified
    ? state.user.uid
    : null;
}
const contextChanged = (): ServiceError => ({
  code: "AUTH_REQUIRED",
  message: "Authentication context changed",
  request_id: "service-auth-guard",
  retryable: false,
});
const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";
/** Codes from a protected read meaning the session is no longer usable (401/403). */
const SESSION_LOSS = new Set<ServiceError["code"]>([
  "AUTH_REQUIRED",
  "EMAIL_NOT_VERIFIED",
]);

/**
 * Application session controller. It mirrors the observed auth state, but can
 * lock locally (signout, protected 401/403) until the adapter reports a newer
 * state. Every loss or change of verified identity advances the epoch, clears
 * the query cache (aborting in-flight queries) and invalidates pending reads.
 */
export function createSessionStore(auth: AuthService, client: QueryClient) {
  let observed: AuthState = { status: "resolving" };
  let override: AuthState | null = null;
  let epoch = 0;
  const listeners = new Set<() => void>();
  const snapshot = () => override ?? observed;
  const lock = (state: AuthState) =>
    transition(() => {
      override = state;
    });
  function transition(update: () => void) {
    const previousUid = verifiedUid(snapshot());
    update();
    const nextUid = verifiedUid(snapshot());
    if (previousUid !== nextUid || nextUid === null) {
      epoch += 1;
      client.clear();
    }
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: snapshot,
    getEpoch: () => epoch,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Lock locally until the adapter next reports state. */
    lock,
    /**
     * A protected read reported session loss. Ignored unless the read began in
     * the current epoch, so a late failure cannot expire a newer account.
     */
    invalidate(captured: number, error: ServiceError) {
      if (captured !== epoch || verifiedUid(snapshot()) === null) return;
      lock({ status: "error", error });
    },
    start() {
      const unsubscribe = auth.observe((next) =>
        transition(() => {
          observed = next;
          override = null;
        }),
      );
      return () => {
        unsubscribe();
        epoch += 1;
        observed = { status: "resolving" };
        override = null;
        client.clear();
      };
    },
  };
}
type SessionStore = ReturnType<typeof createSessionStore>;

/**
 * Signout locks protected UI and caches before the adapter answers, so neither
 * a slow nor a failed signout leaves prior account content exposed.
 */
export function guardAuthService(
  auth: AuthService,
  session: SessionStore,
): AuthService {
  return {
    observe: (listener) => auth.observe(listener),
    signIn: (input, options) => auth.signIn(input, options),
    register: (input, options) => auth.register(input, options),
    sendVerification: (options) => auth.sendVerification(options),
    resetPassword: (email, options) => auth.resetPassword(email, options),
    refreshSession: (options) => auth.refreshSession(options),
    async signOut(options) {
      const before = session.getSnapshot();
      const uid = verifiedUid(before);
      session.lock({ status: "unauthenticated" });
      const captured = session.getEpoch();
      let result: ServiceResult<void>;
      try {
        result = await auth.signOut(options);
      } catch (error) {
        if (!isAbort(error)) throw error;
        result = {
          ok: false,
          error: {
            code: "AUTH_FAILED",
            message: "Sign out was cancelled",
            request_id: "service-auth-guard",
            retryable: true,
          },
        };
      }
      if (!result.ok && uid !== null && session.getEpoch() === captured)
        session.lock({ status: "error", error: result.error });
      return result;
    },
  };
}

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
          if (operation === "health")
            return Reflect.apply(data[operation], data, args);
          const state = session.getSnapshot();
          const epoch = session.getEpoch();
          if (verifiedUid(state) === null)
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
          let result: ServiceResult<unknown>;
          try {
            result = await Reflect.apply(data[operation], data, args);
          } catch (error) {
            // Stale failures are replaced like stale successes; own aborts pass through.
            if (session.getEpoch() !== epoch && !isAbort(error))
              return { ok: false, error: contextChanged() };
            throw error;
          }
          if (session.getEpoch() !== epoch)
            return { ok: false, error: contextChanged() };
          if (!result.ok && SESSION_LOSS.has(result.error.code))
            session.invalidate(epoch, result.error);
          return result;
        }),
    ]),
  ) as unknown as DataService;
}
export const ServiceContext = createContext<{
  readonly services: Services;
  readonly mode: ApplicationRuntime["mode"];
  readonly demo?: DemoGuidance;
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
