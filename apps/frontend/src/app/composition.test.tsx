import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthState, Page, Release, Services } from "../services/contracts";
import { App } from "../App";
import { ApplicationProviders } from "./ApplicationProviders";
import { Bootstrap } from "./Bootstrap";
import { CONFIGURATION_ERROR, createApplication } from "./composition";
import {
  createServiceQueries,
  ServiceQueryError,
  useServiceQueries,
} from "./queries";
import { useAuthState, useServices } from "./service-context";
import type { ApplicationRuntime } from "./service-context";

const user = (uid: string, email_verified = true): AuthState => ({
  status: "authenticated",
  user: { uid, email: `${uid}@example.invalid`, email_verified },
});
function injected(initial: AuthState) {
  let state = initial;
  const observers = new Set<(state: AuthState) => void>();
  const base = createApplication("mock");
  const releases = vi.fn(
    async (): Promise<{ ok: true; data: Page<Release> }> => ({
      ok: true,
      data: {
        items: [
          {
            release_id: "synthetic-release",
            revision_id: "synthetic-revision",
            database_code: "TEST",
            version: "1",
            display_name:
              state.status === "authenticated"
                ? state.user.uid
                : "unauthenticated",
            published_at: null,
          },
        ],
        revision_snapshot: [
          {
            release_id: "synthetic-release",
            revision_id: "synthetic-revision",
          },
        ],
        total_count: 1,
        next_cursor: null,
        request_id: "injected-release",
      },
    }),
  );
  const runtime: ApplicationRuntime = {
    mode: "test" as const,
    services: {
      auth: {
        ...base.services.auth,
        observe(listener: (state: AuthState) => void) {
          observers.add(listener);
          queueMicrotask(() => {
            if (observers.has(listener)) listener(state);
          });
          return () => {
            observers.delete(listener);
          };
        },
      },
      data: { ...base.services.data, releases },
    },
  };
  return {
    runtime,
    releases,
    emit(next: AuthState) {
      state = next;
      observers.forEach((observer) => observer(next));
    },
  };
}
function Probe() {
  const queries = useServiceQueries();
  const auth = useAuthState();
  const result = useQuery(queries.releases());
  return (
    <p data-testid="payload">
      {result.data?.items[0]?.display_name ?? auth.status}
    </p>
  );
}
function Capture({
  onClient,
  onServices,
}: {
  onClient?: (client: QueryClient) => void;
  onServices?: (services: Services) => void;
}) {
  const client = useQueryClient();
  const services = useServices();
  useEffect(() => {
    onClient?.(client);
    onServices?.(services);
  }, [client, services, onClient, onServices]);
  return null;
}
afterEach(() => vi.useRealTimers());

describe("explicit service composition", () => {
  it.each([
    undefined,
    null,
    "",
    "real",
    "bogus",
    { secret: "private-config-value" },
  ])("shows safe startup failure for unsupported mode %j", (mode) => {
    expect(() => createApplication(mode)).toThrow(CONFIGURATION_ERROR);
    render(<Bootstrap mode={mode} />);
    expect(screen.getByRole("alert")).toHaveTextContent(CONFIGURATION_ERROR);
    expect(screen.queryByText(/Local demo mode/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("private-config-value");
  });

  it("runs explicit mock mode without dataset reads during resolving/unauthenticated auth", async () => {
    const runtime = createApplication("mock");
    const releases = vi.spyOn(runtime.services.data, "releases");
    render(
      <ApplicationProviders runtime={runtime}>
        <App />
        <Probe />
      </ApplicationProviders>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Local demo mode — synthetic services",
    );
    await waitFor(() =>
      expect(screen.getByTestId("payload")).toHaveTextContent(
        "unauthenticated",
      ),
    );
    expect(releases).not.toHaveBeenCalled();
    await expect(
      runtime.services.auth.signIn({
        email: "demo@example.invalid",
        password: "synthetic",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_FAILED" },
    });
  });

  it("injects a substitute adapter through the provider without changing the component", async () => {
    const test = injected(user("account-a"));
    render(
      <ApplicationProviders runtime={test.runtime}>
        <App />
        <Probe />
      </ApplicationProviders>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("payload")).toHaveTextContent("account-a"),
    );
    expect(test.releases).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Injected test services",
    );
  });

  it("guards direct service calls as well as disabling queries before verification", async () => {
    const test = injected({ status: "resolving" });
    let services: Services | undefined;
    render(
      <ApplicationProviders runtime={test.runtime}>
        <Probe />
        <Capture
          onServices={(value) => {
            services = value;
          }}
        />
      </ApplicationProviders>,
    );
    await expect(services!.data.releases()).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_REQUIRED" },
    });
    act(() => test.emit(user("unverified", false)));
    await expect(services!.data.releases()).resolves.toMatchObject({
      ok: false,
      error: { code: "EMAIL_NOT_VERIFIED" },
    });
    expect(test.releases).not.toHaveBeenCalled();
    expect(screen.getByTestId("payload")).toHaveTextContent("authenticated");
  });

  it("clears prior account data/cache on UID change and logout with a stable QueryClient", async () => {
    const test = injected(user("account-a"));
    let client: QueryClient | undefined;
    const clients: QueryClient[] = [];
    const capture = (value: QueryClient) => {
      client = value;
      clients.push(value);
    };
    render(
      <ApplicationProviders runtime={test.runtime}>
        <Probe />
        <Capture onClient={capture} />
      </ApplicationProviders>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("payload")).toHaveTextContent("account-a"),
    );
    const original = client;
    act(() => test.emit(user("account-b")));
    expect(screen.getByTestId("payload")).not.toHaveTextContent("account-a");
    await waitFor(() =>
      expect(screen.getByTestId("payload")).toHaveTextContent("account-b"),
    );
    expect(client).toBe(original);
    expect(clients.every((value) => value === original)).toBe(true);
    expect(
      client!
        .getQueryCache()
        .getAll()
        .some((query) => query.queryKey.includes("account-a")),
    ).toBe(false);
    act(() => test.emit({ status: "unauthenticated" }));
    expect(screen.getByTestId("payload")).toHaveTextContent("unauthenticated");
    expect(
      client!
        .getQueryCache()
        .getAll()
        .some((query) => query.state.data !== undefined),
    ).toBe(false);
  });

  it("aborts a pending query and removes protected cached data on logout", async () => {
    const test = injected(user("account-a"));
    let receivedSignal: AbortSignal | undefined;
    test.runtime.services.data.releases = vi.fn<Services["data"]["releases"]>(
      ({ signal } = {}) => {
        receivedSignal = signal;
        return new Promise((_, reject) =>
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      },
    );
    render(
      <ApplicationProviders runtime={test.runtime}>
        <Probe />
      </ApplicationProviders>,
    );
    await waitFor(() => expect(receivedSignal).toBeDefined());
    expect(receivedSignal!.aborted).toBe(false);
    act(() => test.emit({ status: "unauthenticated" }));
    expect(receivedSignal!.aborted).toBe(true);
    expect(screen.getByTestId("payload")).toHaveTextContent("unauthenticated");
  });
});

describe("query contract integration", () => {
  it("does not deliver a direct pending service success after account context changes", async () => {
    const test = injected(user("account-a"));
    let resolve!: (
      value: Awaited<ReturnType<Services["data"]["releases"]>>,
    ) => void;
    test.runtime.services.data.releases = () =>
      new Promise((finish) => {
        resolve = finish;
      });
    let services: Services | undefined;
    render(
      <ApplicationProviders runtime={test.runtime}>
        <App />
        <Capture
          onServices={(value) => {
            services = value;
          }}
        />
      </ApplicationProviders>,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("authenticated"),
    );
    const pending = services!.data.releases();
    await Promise.resolve();
    act(() => test.emit(user("account-b")));
    resolve({
      ok: true,
      data: {
        items: [],
        revision_snapshot: [],
        next_cursor: null,
        total_count: 0,
        request_id: "previous-account-result",
      },
    });
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: {
        code: "AUTH_REQUIRED",
        message: "Authentication context changed",
      },
    });
  });

  it("forwards query cancellation to a pending mock request and leaves no cached success", async () => {
    vi.useFakeTimers();
    const runtime = createApplication("mock");
    const login = runtime.services.auth.signIn({
      email: "verified@example.invalid",
      password: "demo-password",
    });
    await vi.runAllTimersAsync();
    expect((await login).ok).toBe(true);
    const read = vi.spyOn(runtime.services.data, "releases");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const options = createServiceQueries(runtime.services.data, {
      namespace: "mock-test",
      uid: "verified-test",
    }).releases();
    const pending = client.fetchQuery(options);
    const rejected = expect(pending).rejects.toBeDefined();
    const signal = read.mock.calls[0][0]!.signal!;
    expect(signal.aborted).toBe(false);
    await client.cancelQueries();
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    client.clear();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("converts typed service failures into query errors rather than cached data", async () => {
    const runtime = createApplication("mock");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const options = createServiceQueries(runtime.services.data, {
      namespace: "test",
      uid: "verified-test",
    }).identity();
    await expect(client.fetchQuery(options)).rejects.toBeInstanceOf(
      ServiceQueryError,
    );
    expect(client.getQueryState(options.queryKey)).toMatchObject({
      status: "error",
      data: undefined,
      error: { detail: { code: "AUTH_REQUIRED" } },
    });
    client.clear();
  });

  it("keys caches by adapter, UID, operation, semantic inputs and immutable revisions", () => {
    const runtime = createApplication("mock");
    const scope = { namespace: "adapter-a", uid: "user-a" };
    const input = {
      fields: { process_name: "road" },
      limit: 2,
      revision_snapshot: [
        { release_id: "release-a", revision_id: "revision-a" },
      ],
    };
    const query = createServiceQueries(runtime.services.data, scope);
    const key = query.search(input).queryKey;
    expect(
      createServiceQueries(runtime.services.data, {
        ...scope,
        uid: "user-b",
      }).search(input).queryKey,
    ).not.toEqual(key);
    expect(
      createServiceQueries(runtime.services.data, {
        ...scope,
        namespace: "adapter-b",
      }).search(input).queryKey,
    ).not.toEqual(key);
    expect(
      query.search({ ...input, fields: { process_name: "water" } }).queryKey,
    ).not.toEqual(key);
    expect(
      query.search({
        ...input,
        revision_snapshot: [
          { release_id: "release-b", revision_id: "revision-a" },
        ],
      }).queryKey,
    ).not.toEqual(key);
    expect(
      query.search({
        ...input,
        revision_snapshot: [
          { release_id: "release-a", revision_id: "revision-b" },
        ],
      }).queryKey,
    ).not.toEqual(key);
    const header = {
      revision_snapshot: input.revision_snapshot,
      process_ids: ["one", "two"],
    };
    expect(query.headers(header).queryKey).not.toEqual(
      query.headers({ ...header, process_ids: ["two", "one"] }).queryKey,
    );
    const captured = query.search(input).queryKey;
    input.fields.process_name = "changed";
    expect(captured).toEqual(key);
  });
});
