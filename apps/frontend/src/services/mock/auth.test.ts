import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../contracts";
import { createMockAuth, DEMO_PASSWORD, MOCK_SESSION_KEY } from "./auth";
import type { AuthOperation, MockSessionStorage } from "./auth";
import { createApplication } from "../../app/composition";

const credentials = (email = "verified@example.invalid") => ({
  email,
  password: DEMO_PASSWORD,
});
function storage(initial?: string) {
  const values = new Map(initial ? [[MOCK_SESSION_KEY, initial]] : []);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  } satisfies MockSessionStorage & { values: Map<string, string> };
}
const settle = () => vi.runAllTimersAsync();
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("deterministic simulated authentication", () => {
  it("observes resolving then anonymous asynchronously and stops delivery after unsubscribe", async () => {
    const session = createMockAuth();
    const states: AuthState[] = [];
    const unsubscribe = session.auth.observe((state) => states.push(state));
    expect(states).toEqual([]);
    await settle();
    expect(states.map((state) => state.status)).toEqual([
      "resolving",
      "unauthenticated",
    ]);
    unsubscribe();
    const pending = session.auth.signIn(credentials());
    await settle();
    expect((await pending).ok).toBe(true);
    expect(states).toHaveLength(2);
  });

  it("cancels the initial observer callback before delivery and supports resubscribe", async () => {
    const session = createMockAuth();
    const removed = vi.fn();
    session.auth.observe(removed)();
    await settle();
    expect(removed).not.toHaveBeenCalled();
    const active = vi.fn();
    session.auth.observe(active);
    await settle();
    expect(active.mock.calls.map(([state]) => state.status)).toEqual([
      "resolving",
      "unauthenticated",
    ]);
  });

  it("restores verified session metadata and never stores a submitted password", async () => {
    const saved = storage();
    const session = createMockAuth({ storage: saved });
    const login = session.auth.signIn(credentials());
    expect(session.getSnapshot().status).toBe("resolving");
    await settle();
    expect((await login).ok).toBe(true);
    expect([...saved.values.values()].join()).not.toContain(DEMO_PASSWORD);
    expect(JSON.parse(saved.getItem(MOCK_SESSION_KEY)!)).toEqual({
      version: 1,
      user: {
        uid: "mock:verified@example.invalid",
        email: "verified@example.invalid",
        email_verified: true,
      },
      verificationRequested: false,
    });
    const restored = createMockAuth({ storage: saved });
    const observed = vi.fn();
    restored.auth.observe(observed);
    await settle();
    expect(observed.mock.calls.map(([state]) => state.status)).toEqual([
      "resolving",
      "authenticated",
    ]);
    expect(restored.getSnapshot()).toEqual(session.getSnapshot());
  });

  it.each([
    "not json",
    "{}",
    JSON.stringify({ version: 9 }),
    JSON.stringify({
      version: 1,
      verificationRequested: true,
      user: {
        uid: "real-token",
        email: "verified@example.invalid",
        email_verified: true,
      },
    }),
    JSON.stringify({
      version: 1,
      verificationRequested: false,
      user: {
        uid: "mock:real@example.com",
        email: "real@example.com",
        email_verified: true,
      },
    }),
  ])(
    "rejects malformed or non-synthetic restore marker %s",
    async (initial) => {
      const saved = storage(initial);
      const session = createMockAuth({ storage: saved });
      session.auth.observe(() => {});
      await settle();
      expect(session.getSnapshot()).toEqual({ status: "unauthenticated" });
      expect(saved.getItem(MOCK_SESSION_KEY)).toBeNull();
    },
  );

  it("remains usable when browser storage is unavailable", async () => {
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    const session = createMockAuth({
      storage: {
        getItem: unavailable,
        setItem: unavailable,
        removeItem: unavailable,
      },
    });
    session.auth.observe(() => {});
    await settle();
    expect(session.getSnapshot().status).toBe("unauthenticated");
    const pending = session.auth.signIn(credentials());
    await settle();
    expect((await pending).ok).toBe(true);
    expect(session.getSnapshot().status).toBe("authenticated");
  });

  it("normalizes email, switches accounts and emits logout without deleting workspace keys", async () => {
    const saved = storage();
    saved.setItem("lca-diff:workspace:v1:account-a", "saved-workspace");
    const session = createMockAuth({ storage: saved });
    const observed = vi.fn();
    session.auth.observe(observed);
    await settle();
    for (const email of [
      " VERIFIED@example.invalid ",
      "other@example.invalid",
    ]) {
      const pending = session.auth.signIn(credentials(email));
      await settle();
      expect((await pending).ok).toBe(true);
    }
    expect(session.getSnapshot()).toMatchObject({
      user: { uid: "mock:other@example.invalid" },
    });
    const logout = session.auth.signOut();
    expect(session.getSnapshot().status).toBe("unauthenticated");
    await settle();
    expect((await logout).ok).toBe(true);
    expect(saved.getItem(MOCK_SESSION_KEY)).toBeNull();
    expect(saved.getItem("lca-diff:workspace:v1:account-a")).toBe(
      "saved-workspace",
    );
    expect(observed.mock.calls.map(([state]) => state.status)).toEqual([
      "resolving",
      "unauthenticated",
      "resolving",
      "authenticated",
      "resolving",
      "authenticated",
      "unauthenticated",
    ]);
  });

  it("registers unverified, resends verification and completes only on explicit refresh", async () => {
    const session = createMockAuth();
    const registration = session.auth.register(
      credentials("new@example.invalid"),
    );
    await settle();
    expect((await registration).ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      user: { email_verified: false },
    });
    let action = session.auth.refreshSession();
    await settle();
    await action;
    expect(session.getSnapshot()).toMatchObject({
      user: { email_verified: false },
    });
    action = session.auth.sendVerification();
    await settle();
    expect((await action).ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      user: { email_verified: false },
    });
    action = session.auth.refreshSession();
    await settle();
    expect((await action).ok).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      user: { email_verified: true },
    });
  });

  it("retains unverified state and pending demo verification across reload", async () => {
    const saved = storage();
    const session = createMockAuth({ storage: saved });
    let pending = session.auth.signIn(
      credentials("unverified@example.invalid"),
    );
    await settle();
    await pending;
    pending = session.auth.sendVerification();
    await settle();
    await pending;
    const restored = createMockAuth({ storage: saved });
    restored.auth.observe(() => {});
    await settle();
    expect(restored.getSnapshot()).toMatchObject({
      user: { email_verified: false },
    });
    pending = restored.auth.refreshSession();
    await settle();
    await pending;
    expect(restored.getSnapshot()).toMatchObject({
      user: { email_verified: true },
    });
  });

  it("reports duplicate registration and invalid credentials without persisting input", async () => {
    const saved = storage();
    const session = createMockAuth({ storage: saved });
    const invalid = session.auth.signIn({
      email: "verified@example.invalid",
      password: "private-entered-password",
    });
    await settle();
    expect(await invalid).toMatchObject({
      ok: false,
      error: { code: "AUTH_FAILED" },
    });
    expect([...saved.values.values()].join()).not.toContain(
      "private-entered-password",
    );
    const duplicate = session.auth.register(credentials());
    await settle();
    expect(await duplicate).toMatchObject({
      ok: false,
      error: { code: "AUTH_FAILED" },
    });
    const retry = session.auth.signIn(credentials());
    await settle();
    expect((await retry).ok).toBe(true);
  });

  it("simulates password reset using the documented fixed demo password", async () => {
    const session = createMockAuth();
    const reset = session.auth.resetPassword("verified@example.invalid");
    await settle();
    expect((await reset).ok).toBe(true);
    const failed = session.auth.resetPassword("unknown@example.invalid");
    await settle();
    expect(await failed).toMatchObject({
      ok: false,
      error: { code: "AUTH_FAILED" },
    });
    const pending = session.auth.signIn(credentials());
    await settle();
    expect((await pending).ok).toBe(true);
  });

  it.each([
    "signIn",
    "register",
    "sendVerification",
    "resetPassword",
    "refreshSession",
  ] as const)(
    "provides deterministic typed failure for %s",
    async (operation) => {
      const session = createMockAuth({
        scenario: { failures: { [operation]: "TEMPORARILY_UNAVAILABLE" } },
      });
      const pending =
        operation === "signIn" || operation === "register"
          ? session.auth[operation](credentials("new@example.invalid"))
          : operation === "resetPassword"
            ? session.auth.resetPassword("verified@example.invalid")
            : session.auth[operation]();
      await settle();
      expect(await pending).toMatchObject({
        ok: false,
        error: { code: "TEMPORARILY_UNAVAILABLE", retryable: true },
      });
    },
  );

  it("rejects verification without an authenticated account", async () => {
    const session = createMockAuth();
    const pending = session.auth.sendVerification();
    await settle();
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it.each(["expired", "revoked", "failed"] as const)(
    "removes restored state and marker on %s refresh",
    async (reason) => {
      const saved = storage();
      const session = createMockAuth({
        storage: saved,
        refresh_failure: reason,
      });
      const login = session.auth.signIn(credentials());
      await settle();
      await login;
      const refresh = session.auth.refreshSession();
      await settle();
      expect(await refresh).toMatchObject({
        ok: false,
        error: { code: "AUTH_FAILED" },
      });
      expect(session.getSnapshot()).toMatchObject({
        status: "error",
        error: { message: expect.stringContaining(reason) },
      });
      expect(saved.getItem(MOCK_SESSION_KEY)).toBeNull();
    },
  );

  it.each(["expireSession", "revokeSession"] as const)(
    "emits immediate session loss via %s scenario",
    async (operation) => {
      const session = createMockAuth();
      const listener = vi.fn();
      session.auth.observe(listener);
      await settle();
      const pending = session.auth.signIn(credentials());
      await settle();
      await pending;
      session[operation]();
      expect(listener.mock.lastCall?.[0]).toMatchObject({
        status: "error",
        error: { code: "AUTH_FAILED" },
      });
    },
  );

  it("aborts delayed login without identity publication or stored marker", async () => {
    const saved = storage();
    const session = createMockAuth({
      storage: saved,
      scenario: { latency_ms: 100 },
    });
    const abort = new AbortController();
    const pending = session.auth.signIn(credentials(), {
      signal: abort.signal,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    abort.abort();
    await rejection;
    await settle();
    expect(session.getSnapshot().status).toBe("unauthenticated");
    expect(saved.getItem(MOCK_SESSION_KEY)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restore a late sign-in after logout or overwrite the newest sign-in", async () => {
    const latency = (operation: AuthOperation, sequence: number) =>
      operation === "signIn" && sequence === 1 ? 100 : 0;
    const session = createMockAuth({ scenario: { latency_ms: latency } });
    const stale = session.auth.signIn(credentials());
    const rejected = expect(stale).rejects.toMatchObject({
      name: "AbortError",
    });
    const logout = session.auth.signOut();
    await settle();
    await logout;
    await rejected;
    expect(session.getSnapshot().status).toBe("unauthenticated");
    const next = createMockAuth({ scenario: { latency_ms: latency } });
    const first = next.auth.signIn(credentials());
    const obsolete = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = next.auth.signIn(credentials("other@example.invalid"));
    await settle();
    await obsolete;
    await second;
    expect(next.getSnapshot()).toMatchObject({
      user: { email: "other@example.invalid" },
    });
  });

  it("cannot let pending initial restoration overwrite a sign-in", async () => {
    const session = createMockAuth({
      scenario: {
        latency_ms: (operation) => (operation === "restore" ? 100 : 0),
      },
    });
    session.auth.observe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const login = session.auth.signIn(credentials());
    await settle();
    await login;
    expect(session.getSnapshot()).toMatchObject({
      user: { email_verified: true },
    });
  });
});

describe("composed mock protected services", () => {
  it("rejects a pending read after logout and same-account sign-in", async () => {
    const runtime = createApplication("mock");
    let action = runtime.services.auth.signIn(credentials());
    await settle();
    await action;
    const read = runtime.services.data.releases();
    action = runtime.services.auth.signOut();
    await settle();
    await action;
    action = runtime.services.auth.signIn(credentials());
    await settle();
    await action;
    expect(await read).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
  });

  it("denies raw catalog calls while anonymous and unverified, then returns verified identity", async () => {
    const runtime = createApplication("mock");
    expect(await runtime.services.data.releases()).toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
    let pending = runtime.services.auth.signIn(
      credentials("unverified@example.invalid"),
    );
    await settle();
    await pending;
    expect(await runtime.services.data.releases()).toMatchObject({
      ok: false,
      error: { code: "EMAIL_NOT_VERIFIED" },
    });
    pending = runtime.services.auth.signIn(credentials());
    await settle();
    await pending;
    expect(await runtime.services.data.identity()).toMatchObject({
      ok: true,
      data: { email_verified: true, access: { published_catalog: true } },
    });
    const read = runtime.services.data.releases();
    await settle();
    expect((await read).ok).toBe(true);
  });
});
