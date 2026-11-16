import { initializeApp, getApps } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  connectAuthEmulator,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  reload,
} from "firebase/auth";
import type { User, Auth } from "firebase/auth";
import type {
  AuthService,
  AuthState,
  RequestOptions,
  ServiceResult,
} from "./contracts";
import type { TokenSource } from "./http-adapter";
export interface RealSettings {
  apiBase: string;
  projectId: string;
  apiKey: string;
  emulator: string;
}
export function realSettings(env: Record<string, unknown>): RealSettings {
  const apiBase = env.VITE_API_BASE,
    projectId = env.VITE_FIREBASE_PROJECT_ID,
    apiKey = env.VITE_FIREBASE_API_KEY,
    emulator = env.VITE_AUTH_EMULATOR;
  if (
    apiBase !== "/api/v1" ||
    typeof projectId !== "string" ||
    !/^demo-[a-z0-9-]+$/.test(projectId) ||
    typeof apiKey !== "string" ||
    !apiKey.trim() ||
    emulator !== "same-origin"
  )
    throw new Error("Invalid real service settings");
  return { apiBase, projectId, apiKey, emulator };
}
const failure = (): ServiceResult<void> => ({
  ok: false,
  error: {
    code: "AUTH_FAILED",
    message:
      "Authentication could not be completed. Check your credentials or the local Auth Emulator and retry.",
    request_id: "firebase-auth",
    retryable: true,
  },
});
function state(user: User | null): AuthState {
  return user
    ? {
        status: "authenticated",
        user: {
          uid: user.uid,
          email: user.email ?? "",
          email_verified: user.emailVerified,
        },
      }
    : { status: "unauthenticated" };
}
/** Firebase owns persistence and tokens; neither crosses the UI service boundary. */
export function createFirebaseServices(settings: RealSettings): {
  auth: AuthService;
  tokens: TokenSource;
} {
  const name = "lca-local-auth";
  const app =
    getApps().find((item) => item.name === name) ??
    initializeApp(
      { projectId: settings.projectId, apiKey: settings.apiKey },
      name,
    );
  // Composition can run twice under React StrictMode; configure each app only once.
  let instance = instances.get(app.name);
  if (instance) return instance;
  const sdk = initializeAuth(app, { persistence: browserLocalPersistence });
  connectAuthEmulator(sdk, window.location.origin, { disableWarnings: true });
  instance = adaptFirebase(sdk);
  instances.set(app.name, instance);
  return instance;
}
const instances = new Map<string, { auth: AuthService; tokens: TokenSource }>();
export function adaptFirebase(sdk: Auth): {
  auth: AuthService;
  tokens: TokenSource;
} {
  const run = async (
    action: () => Promise<unknown>,
    options?: RequestOptions,
  ): Promise<ServiceResult<void>> => {
    options?.signal?.throwIfAborted();
    try {
      await action();
      options?.signal?.throwIfAborted();
      return { ok: true, data: undefined };
    } catch {
      options?.signal?.throwIfAborted();
      return failure();
    }
  };
  return {
    tokens: {
      async token(forceRefresh) {
        await sdk.authStateReady();
        return sdk.currentUser
          ? sdk.currentUser.getIdToken(forceRefresh)
          : null;
      },
    },
    auth: {
      observe(listener) {
        return onIdTokenChanged(
          sdk,
          (user) => listener(state(user)),
          () => listener({ status: "error", error: failureError() }),
        );
      },
      signIn: (input, options) =>
        run(
          () => signInWithEmailAndPassword(sdk, input.email, input.password),
          options,
        ),
      register: (input, options) =>
        run(
          () =>
            createUserWithEmailAndPassword(sdk, input.email, input.password),
          options,
        ),
      signOut: (options) => run(() => signOut(sdk), options),
      sendVerification: (options) =>
        run(async () => {
          if (!sdk.currentUser) throw new Error("No session");
          await sendEmailVerification(sdk.currentUser);
        }, options),
      resetPassword: (email, options) =>
        run(() => sendPasswordResetEmail(sdk, email), options),
      refreshSession: (options) =>
        run(async () => {
          if (!sdk.currentUser) throw new Error("No session");
          await reload(sdk.currentUser);
          await sdk.currentUser.getIdToken(true);
        }, options),
    },
  };
}
function failureError() {
  const result = failure();
  if (result.ok) throw new Error("Expected failure");
  return result.error;
}
