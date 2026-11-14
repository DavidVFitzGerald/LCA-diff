import type {
  AuthService,
  AuthState,
  AuthUser,
  Credentials,
  RequestOptions,
  ServiceError,
  ServiceResult,
} from "../contracts";
import { copy, createMockRequest, MockFailure } from "./runtime";
import type { MockScenario } from "./runtime";

export const DEMO_PASSWORD = "demo-password";
export const MOCK_SESSION_KEY = "lca-diff:mock-session:v1";
export const MOCK_ACCOUNTS = Object.freeze([
  Object.freeze({
    uid: "mock:verified@example.invalid",
    email: "verified@example.invalid",
    email_verified: true,
  }),
  Object.freeze({
    uid: "mock:other@example.invalid",
    email: "other@example.invalid",
    email_verified: true,
  }),
  Object.freeze({
    uid: "mock:unverified@example.invalid",
    email: "unverified@example.invalid",
    email_verified: false,
  }),
]);
export type AuthOperation =
  | "restore"
  | "signIn"
  | "register"
  | "signOut"
  | "sendVerification"
  | "resetPassword"
  | "refreshSession";
export interface MockSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface MockAuthOptions {
  readonly storage?: MockSessionStorage;
  readonly scenario?: MockScenario<AuthOperation>;
  readonly refresh_failure?: "expired" | "revoked" | "failed";
}
const emailOf = (value: string) => value.trim().toLowerCase();
const syntheticEmail = (value: string) =>
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.invalid$/.test(value);
const authError = (message: string): ServiceError => ({
  code: "AUTH_FAILED",
  message,
  request_id: "synthetic-auth-lifecycle",
  retryable: false,
});

/** Local simulation only. No password database, provider tokens or email delivery. */
export function createMockAuth(options: MockAuthOptions = {}) {
  const request = createMockRequest<AuthOperation>(options.scenario);
  const accounts = new Map<string, AuthUser>(
    MOCK_ACCOUNTS.map((user) => [user.email, copy(user)]),
  );
  const listeners = new Set<(state: AuthState) => void>();
  let state: AuthState = { status: "resolving" };
  let started = false;
  let epoch = 0;
  let verificationRequested = false;
  const emit = (next: AuthState) => {
    state = copy(next);
    listeners.forEach((listener) => listener(copy(state)));
  };
  const clearMarker = () => {
    try {
      options.storage?.removeItem(MOCK_SESSION_KEY);
    } catch {
      /* Storage is optional in the demo. */
    }
  };
  const persist = (user: AuthUser) => {
    try {
      options.storage?.setItem(
        MOCK_SESSION_KEY,
        JSON.stringify({ version: 1, user, verificationRequested }),
      );
    } catch {
      /* Session remains usable without persistence. */
    }
  };
  const publishUser = (user: AuthUser) => {
    accounts.set(user.email, copy(user));
    persist(user);
    emit({ status: "authenticated", user });
  };
  const currentUser = () =>
    state.status === "authenticated" ? copy(state.user) : null;
  const checkEpoch = (captured: number) => {
    if (captured !== epoch)
      throw new DOMException(
        "Authentication operation superseded",
        "AbortError",
      );
  };
  const action = async (
    operation: AuthOperation,
    input: RequestOptions | undefined,
    run: () => void,
    captured = epoch,
  ): Promise<ServiceResult<void>> =>
    request(operation, input?.signal, () => {
      checkEpoch(captured);
      run();
    });
  const restore = async () => {
    const captured = epoch;
    const result = await action(
      "restore",
      undefined,
      () => {
        let stored: unknown;
        try {
          const raw = options.storage?.getItem(MOCK_SESSION_KEY);
          stored = raw ? JSON.parse(raw) : null;
        } catch {
          stored = null;
        }
        if (
          stored &&
          typeof stored === "object" &&
          "version" in stored &&
          stored.version === 1 &&
          "user" in stored &&
          "verificationRequested" in stored &&
          typeof stored.verificationRequested === "boolean"
        ) {
          const user = stored.user;
          if (
            user &&
            typeof user === "object" &&
            "email" in user &&
            typeof user.email === "string" &&
            syntheticEmail(user.email) &&
            "uid" in user &&
            user.uid === `mock:${user.email}` &&
            "email_verified" in user &&
            typeof user.email_verified === "boolean"
          ) {
            verificationRequested = stored.verificationRequested;
            publishUser({
              uid: user.uid,
              email: user.email,
              email_verified: user.email_verified,
            });
            return;
          }
        }
        clearMarker();
        emit({ status: "unauthenticated" });
      },
      captured,
    );
    if (!result.ok && captured === epoch) {
      clearMarker();
      emit({ status: "error", error: result.error });
    }
  };
  const authenticate = async (
    operation: "signIn" | "register",
    credentials: Credentials,
    input?: RequestOptions,
  ): Promise<ServiceResult<void>> => {
    if (input?.signal?.aborted)
      throw new DOMException("Request aborted", "AbortError");
    started = true;
    const captured = ++epoch;
    const email = emailOf(credentials.email);
    const validPassword = credentials.password === DEMO_PASSWORD;
    verificationRequested = false;
    clearMarker();
    emit({ status: "resolving" });
    try {
      const result = await action(
        operation,
        input,
        () => {
          if (!syntheticEmail(email) || !validPassword)
            throw new MockFailure("AUTH_FAILED");
          const existing = accounts.get(email);
          if (operation === "register") {
            if (existing) throw new MockFailure("AUTH_FAILED");
            publishUser({ uid: `mock:${email}`, email, email_verified: false });
          } else {
            if (!existing) throw new MockFailure("AUTH_FAILED");
            publishUser(existing);
          }
        },
        captured,
      );
      if (!result.ok && captured === epoch)
        emit({ status: "error", error: result.error });
      return result;
    } catch (error) {
      if (captured === epoch) emit({ status: "unauthenticated" });
      throw error;
    }
  };
  const invalidate = (reason: "expired" | "revoked" | "failed") => {
    started = true;
    ++epoch;
    verificationRequested = false;
    clearMarker();
    emit({
      status: "error",
      error: authError(`Simulated session ${reason}. Sign in again.`),
    });
  };
  const auth: AuthService = {
    observe(listener) {
      listeners.add(listener);
      queueMicrotask(() => {
        if (listeners.has(listener)) listener(copy(state));
        if (!started && listeners.size > 0) {
          started = true;
          void restore().catch((error: unknown) => {
            if (!(
              error instanceof DOMException && error.name === "AbortError"
            )) {
              clearMarker();
              emit({
                status: "error",
                error: authError("Simulated session restoration failed"),
              });
            }
          });
        }
      });
      return () => {
        listeners.delete(listener);
      };
    },
    signIn: (credentials, input) => authenticate("signIn", credentials, input),
    register: (credentials, input) =>
      authenticate("register", credentials, input),
    async signOut(input) {
      started = true;
      ++epoch;
      verificationRequested = false;
      clearMarker();
      emit({ status: "unauthenticated" });
      return action("signOut", input, () => {});
    },
    sendVerification(input) {
      return action("sendVerification", input, () => {
        const user = currentUser();
        if (!user) throw new MockFailure("AUTH_REQUIRED");
        verificationRequested = true;
        persist(user);
      });
    },
    resetPassword(email, input) {
      const normalized = emailOf(email);
      return action("resetPassword", input, () => {
        if (!syntheticEmail(normalized) || !accounts.has(normalized))
          throw new MockFailure("AUTH_FAILED");
        // Simulated delivery only: the fixed demo password remains unchanged.
      });
    },
    async refreshSession(input) {
      const user = currentUser();
      const captured = epoch;
      const result = await action(
        "refreshSession",
        input,
        () => {
          if (!user) throw new MockFailure("AUTH_REQUIRED");
          if (options.refresh_failure) {
            throw new MockFailure("AUTH_FAILED");
          }
          publishUser({
            ...user,
            email_verified: user.email_verified || verificationRequested,
          });
        },
        captured,
      );
      if (!result.ok && captured === epoch)
        invalidate(options.refresh_failure ?? "failed");
      return result;
    },
  };
  return {
    auth,
    /** Scenario drivers stay inside services/tests; UI uses AuthService only. */
    expireSession: () => invalidate("expired"),
    revokeSession: () => invalidate("revoked"),
    getSnapshot: (): AuthState => copy(state),
  };
}

/** Browser storage access belongs to the adapter, never to product components. */
export function browserMockSessionStorage(): MockSessionStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
