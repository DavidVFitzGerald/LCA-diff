import type { AuthState, DataService, ServiceResult } from "../contracts";

interface MockSession {
  readonly getSnapshot: () => AuthState;
  readonly auth: { observe(listener: (state: AuthState) => void): () => void };
}

/** Guards raw composed mock services as well as the application's query boundary. */
export function protectMockData(
  data: DataService,
  session: MockSession,
): DataService {
  const operations = Object.keys(data) as (keyof DataService)[];
  const denial = (state: AuthState): ServiceResult<never> => ({
    ok: false,
    error: {
      code:
        state.status === "authenticated" && !state.user.email_verified
          ? "EMAIL_NOT_VERIFIED"
          : "AUTH_REQUIRED",
      message: "Verified simulated authentication is required",
      request_id: "synthetic-auth-guard",
      retryable: false,
    },
  });
  return Object.fromEntries(
    operations.map((operation) => [
      operation,
      async (...args: unknown[]) => {
        if (operation === "health")
          return Reflect.apply(data[operation], data, args);
        const state = session.getSnapshot();
        if (state.status !== "authenticated" || !state.user.email_verified)
          return denial(state);
        // A temporary observer catches even A → signed-out → A while a read is pending.
        let changed = false;
        const unsubscribe = session.auth.observe((next) => {
          if (
            next.status !== "authenticated" ||
            !next.user.email_verified ||
            next.user.uid !== state.user.uid
          )
            changed = true;
        });
        try {
          const result = await Reflect.apply(data[operation], data, args);
          const next = session.getSnapshot();
          if (
            changed ||
            next.status !== "authenticated" ||
            !next.user.email_verified ||
            next.user.uid !== state.user.uid
          )
            return denial(next);
          return result;
        } finally {
          unsubscribe();
        }
      },
    ]),
  ) as unknown as DataService;
}
