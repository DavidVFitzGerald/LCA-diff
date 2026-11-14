import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import type {
  AuthService,
  AuthState,
  Page,
  Release,
  ServiceError,
  ServiceResult,
  Services,
} from "../services/contracts";
import { ApplicationProviders } from "./ApplicationProviders";
import { createApplication } from "./composition";
import { useServiceQueries } from "./queries";
import { useServices } from "./service-context";

type ReleasesResult = ServiceResult<Page<Release>>;
const ok: ServiceResult<void> = { ok: true, data: undefined };
const user = (uid: string, email_verified = true): AuthState => ({
  status: "authenticated",
  user: { uid, email: `${uid}@example.invalid`, email_verified },
});
const failure = (code: ServiceError["code"]): ServiceError => ({
  code,
  message: "Synthetic",
  request_id: "synthetic-session",
  retryable: false,
});
const page = (label: string): ReleasesResult => ({
  ok: true,
  data: {
    items: [
      {
        release_id: "r",
        revision_id: "v",
        database_code: "TEST",
        version: "1",
        display_name: label,
        published_at: null,
      },
    ],
    revision_snapshot: [{ release_id: "r", revision_id: "v" }],
    next_cursor: null,
    total_count: 1,
    request_id: `request-${label}`,
  },
});
const WORKSPACE_KEY = "lca-diff:workspace:v1:account-a";

/** Visible protected content rendered only from guarded query data. */
function Sentinel() {
  const queries = useServiceQueries();
  const result = useQuery(queries.releases());
  const label = result.data?.items[0]?.display_name;
  return label ? <p data-testid="protected">PROTECTED {label}</p> : null;
}
function Capture({
  onReady,
}: {
  onReady: (services: Services, client: QueryClient) => void;
}) {
  const services = useServices();
  const client = useQueryClient();
  useEffect(() => onReady(services, client), [services, client, onReady]);
  return null;
}

/**
 * Test-only injected composition: the auth observer is driven by the test and
 * protected reads are controllable deferreds. Nothing here ships in the bundle.
 */
function harness(initial: AuthState, signOut?: AuthService["signOut"]) {
  let current = initial;
  const observers = new Set<(state: AuthState) => void>();
  const base = createApplication("mock");
  const reads: {
    signal: AbortSignal | undefined;
    resolve: (value: ReleasesResult) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const releases = vi.fn(
    (options?: { signal?: AbortSignal }) =>
      new Promise<ReleasesResult>((resolve, reject) => {
        reads.push({ signal: options?.signal, resolve, reject });
      }),
  );
  const data = Object.fromEntries(
    Object.entries(base.services.data).map(([name, operation]) => [
      name,
      name === "releases" ? releases : vi.fn(operation),
    ]),
  ) as unknown as Services["data"];
  const emit = (next: AuthState) => {
    current = next;
    observers.forEach((observer) => observer(next));
  };
  const auth: AuthService = {
    ...base.services.auth,
    observe(listener) {
      observers.add(listener);
      queueMicrotask(() => {
        if (observers.has(listener)) listener(current);
      });
      return () => {
        observers.delete(listener);
      };
    },
    signOut:
      signOut ??
      vi.fn(async () => {
        emit({ status: "unauthenticated" });
        return ok;
      }),
  };
  let services!: Services;
  let client!: QueryClient;
  render(
    <ApplicationProviders runtime={{ mode: "test", services: { auth, data } }}>
      <App />
      <Sentinel />
      <Capture
        onReady={(value, queryClient) => {
          services = value;
          client = queryClient;
        }}
      />
    </ApplicationProviders>,
  );
  return {
    data,
    releases,
    reads,
    auth,
    services: () => services,
    client: () => client,
    emit: (next: AuthState) => act(() => emit(next)),
    /** Resolve the latest read with a payload labelled for the account. */
    answer: (label: string, index = reads.length - 1) =>
      act(async () => reads[index].resolve(page(label))),
  };
}
const protectedText = () => screen.queryByTestId("protected");
function expectNoProtectedCalls(data: Services["data"]) {
  Object.entries(data).forEach(([name, operation]) => {
    if (name !== "health") expect(operation).not.toHaveBeenCalled();
  });
}
function cachedData(client: QueryClient) {
  return client
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.data !== undefined);
}
async function showAccountA(app: ReturnType<typeof harness>) {
  await waitFor(() => expect(app.reads).toHaveLength(1));
  await app.answer("account-a");
  expect(await screen.findByTestId("protected")).toHaveTextContent(
    "PROTECTED account-a",
  );
}

beforeEach(() => localStorage.clear());

describe("session restoration and zero protected reads", () => {
  it("shows only the loading shell while a valid session restores, then unlocks without a modal", async () => {
    const opened = vi.fn();
    const observer = new MutationObserver(() => {
      if (document.querySelector("dialog")) opened();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const app = harness({ status: "resolving" });
    await act(async () => {});
    expect(screen.getByText("Restoring your session…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expectNoProtectedCalls(app.data);
    app.emit(user("account-a"));
    await showAccountA(app);
    expect(screen.queryByText("Restoring your session…")).toBeNull();
    expect(opened).not.toHaveBeenCalled();
    observer.disconnect();
  });

  it("makes zero protected requests while resolving, anonymous or unverified", async () => {
    const app = harness({ status: "resolving" });
    await act(async () => {});
    app.emit({ status: "unauthenticated" });
    expect(
      await screen.findByRole("dialog", { name: "Sign in to LCA diff" }),
    ).toBeVisible();
    for (const state of [
      user("account-a", false),
      { status: "resolving" } as const,
      { status: "error", error: failure("AUTH_FAILED") } as const,
    ]) {
      app.emit(state);
      await expect(app.services().data.releases()).resolves.toMatchObject({
        ok: false,
      });
    }
    expectNoProtectedCalls(app.data);
    expect(protectedText()).toBeNull();
  });
});

describe("session loss removes protected content and cancels work", () => {
  it.each<[string, AuthState]>([
    ["logout", { status: "unauthenticated" }],
    ["expiry", { status: "error", error: failure("AUTH_FAILED") }],
    ["revocation", { status: "error", error: failure("AUTH_FAILED") }],
    ["failed refresh", { status: "error", error: failure("AUTH_FAILED") }],
    ["verification loss", user("account-a", false)],
  ])(
    "%s clears rendered data, aborts pending reads and empties the cache",
    async (_name, next) => {
      const app = harness(user("account-a"));
      await showAccountA(app);
      act(() => void app.client().refetchQueries());
      await waitFor(() => expect(app.reads).toHaveLength(2));
      const pending = app.reads[1];
      expect(pending.signal?.aborted).toBe(false);
      app.emit(next);
      expect(protectedText()).toBeNull();
      expect(pending.signal?.aborted).toBe(true);
      expect(cachedData(app.client())).toEqual([]);
      expect(screen.getByRole("dialog")).toBeVisible();
      expect(document.querySelector(".shell")).toHaveAttribute("inert");
      pending.resolve(page("late-account-a"));
      await act(async () => {});
      expect(protectedText()).toBeNull();
    },
  );

  it.each(["AUTH_REQUIRED", "EMAIL_NOT_VERIFIED"] as const)(
    "a protected %s response locks the session and clears protected state",
    async (code) => {
      const app = harness(user("account-a"));
      await showAccountA(app);
      const direct = app.services().data.releases();
      await waitFor(() => expect(app.reads).toHaveLength(2));
      await act(async () =>
        app.reads[1].resolve({ ok: false, error: failure(code) }),
      );
      await expect(direct).resolves.toMatchObject({ error: { code } });
      expect(protectedText()).toBeNull();
      expect(cachedData(app.client())).toEqual([]);
      expect(
        await screen.findByText(/session could not be confirmed/),
      ).toBeVisible();
      await expect(app.services().data.releases()).resolves.toMatchObject({
        ok: false,
        error: { code: "AUTH_REQUIRED" },
      });
      expect(app.releases).toHaveBeenCalledTimes(2);
      // A newer adapter state supersedes the local lock.
      app.emit(user("account-a"));
      await waitFor(() => expect(app.reads).toHaveLength(3));
      await app.answer("account-a-again");
      expect(await screen.findByText(/account-a-again/)).toBeVisible();
    },
  );

  it("locks before a slow signout answers and keeps a failed signout locked", async () => {
    let finish!: (value: ServiceResult<void>) => void;
    const signOut = vi.fn(
      () =>
        new Promise<ServiceResult<void>>((resolve) => {
          finish = resolve;
        }),
    );
    const app = harness(user("account-a"), signOut);
    await showAccountA(app);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(protectedText()).toBeNull();
    expect(cachedData(app.client())).toEqual([]);
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    await act(async () =>
      finish({ ok: false, error: failure("TEMPORARILY_UNAVAILABLE") }),
    );
    expect(
      screen.getByRole("dialog", { name: "Sign in to LCA diff" }),
    ).toBeVisible();
    expect(screen.getByText(/session could not be confirmed/)).toBeVisible();
    expect(protectedText()).toBeNull();
    await expect(app.services().data.releases()).resolves.toMatchObject({
      ok: false,
    });
    expect(app.releases).toHaveBeenCalledOnce();
  });
});

describe("account changes and stale responses", () => {
  it("never shows A's cached or pending content after switching to B", async () => {
    const app = harness(user("account-a"));
    await showAccountA(app);
    act(() => void app.client().refetchQueries());
    await waitFor(() => expect(app.reads).toHaveLength(2));
    const pendingA = app.reads[1];
    const directA = app.services().data.releases();
    await waitFor(() => expect(app.reads).toHaveLength(3));
    app.emit(user("account-b"));
    expect(protectedText()).toBeNull();
    expect(pendingA.signal?.aborted).toBe(true);
    expect(
      app
        .client()
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey.includes("account-a")),
    ).toBe(false);
    await waitFor(() => expect(app.reads).toHaveLength(4));
    // A's late answers arrive after B is current.
    pendingA.resolve(page("account-a-late"));
    app.reads[2].resolve(page("account-a-direct"));
    await expect(directA).resolves.toMatchObject({
      ok: false,
      error: { message: "Authentication context changed" },
    });
    await act(async () => {});
    expect(protectedText()).toBeNull();
    await app.answer("account-b", 3);
    expect(await screen.findByText(/PROTECTED account-b/)).toBeVisible();
  });

  it("rejects A's pending response after logout and relogin as the same UID", async () => {
    const app = harness(user("account-a"));
    await showAccountA(app);
    const stale = app.services().data.releases();
    await waitFor(() => expect(app.reads).toHaveLength(2));
    app.emit({ status: "unauthenticated" });
    app.emit(user("account-a"));
    await waitFor(() => expect(app.reads).toHaveLength(3));
    app.reads[1].resolve(page("stale-session"));
    await expect(stale).resolves.toMatchObject({
      ok: false,
      error: { message: "Authentication context changed" },
    });
    await app.answer("fresh-session", 2);
    expect(await screen.findByText(/fresh-session/)).toBeVisible();
  });

  it("ignores late failures from A so they cannot expire account B", async () => {
    const app = harness(user("account-a"));
    await showAccountA(app);
    const staleFailure = app.services().data.releases();
    const staleThrow = app.services().data.releases();
    await waitFor(() => expect(app.reads).toHaveLength(3));
    app.emit(user("account-b"));
    await waitFor(() => expect(app.reads).toHaveLength(4));
    app.reads[1].resolve({ ok: false, error: failure("AUTH_REQUIRED") });
    app.reads[2].reject(new Error("late transport failure"));
    for (const late of [staleFailure, staleThrow])
      await expect(late).resolves.toMatchObject({
        error: { message: "Authentication context changed" },
      });
    await app.answer("account-b", 3);
    expect(await screen.findByText(/PROTECTED account-b/)).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("passes the caller's own abort through for current-session reads", async () => {
    const app = harness(user("account-a"));
    await showAccountA(app);
    const controller = new AbortController();
    const read = app.services().data.releases({ signal: controller.signal });
    await waitFor(() => expect(app.reads).toHaveLength(2));
    controller.abort();
    app.reads[1].reject(new DOMException("Aborted", "AbortError"));
    await expect(read).rejects.toMatchObject({ name: "AbortError" });
    expect(await screen.findByText(/PROTECTED account-a/)).toBeVisible();
  });
});

describe("account-scoped workspace storage", () => {
  it("survives signout and account changes through the composed mock adapter", async () => {
    localStorage.setItem(WORKSPACE_KEY, '{"version":1}');
    const runtime = createApplication("mock");
    render(
      <ApplicationProviders runtime={runtime}>
        <App />
      </ApplicationProviders>,
    );
    await screen.findByRole("dialog");
    await act(async () => {
      await runtime.services.auth.signIn({
        email: "verified@example.invalid",
        password: "demo-password",
      });
    });
    expect(localStorage.getItem("lca-diff:mock-session:v1")).not.toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await screen.findByRole("dialog", { name: "Sign in to LCA diff" });
    await act(async () => {
      await runtime.services.auth.signIn({
        email: "other@example.invalid",
        password: "demo-password",
      });
    });
    await screen.findByText("other@example.invalid");
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe('{"version":1}');
  });
});
