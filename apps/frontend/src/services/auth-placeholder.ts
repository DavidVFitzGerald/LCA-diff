import type { AuthService, AuthState, ServiceResult } from "./contracts";

/** Technical auth lifecycle only. Account simulation belongs to #12. */
export function createPlaceholderAuth(): AuthService {
  let state: AuthState = { status: "resolving" };
  let started = false;
  const listeners = new Set<(state: AuthState) => void>();
  const emit = () => {
    state = { status: "unauthenticated" };
    listeners.forEach((listener) => listener(state));
  };
  const unsupported = async (): Promise<ServiceResult<void>> => ({
    ok: false,
    error: {
      code: "UNSUPPORTED_OPERATION",
      message: "Account actions are not available in this technical demo",
      request_id: "synthetic-auth-placeholder",
      retryable: false,
    },
  });
  return {
    observe(listener) {
      listeners.add(listener);
      queueMicrotask(() => {
        if (listeners.has(listener)) listener(state);
      });
      if (!started) {
        started = true;
        queueMicrotask(() => queueMicrotask(emit));
      }
      return () => {
        listeners.delete(listener);
      };
    },
    signIn: unsupported,
    register: unsupported,
    sendVerification: unsupported,
    resetPassword: unsupported,
    async signOut() {
      emit();
      return { ok: true, data: undefined };
    },
    async refreshSession() {
      emit();
      return { ok: true, data: undefined };
    },
  };
}
