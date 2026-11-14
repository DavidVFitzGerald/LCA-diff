import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { ApplicationProviders } from "../app/ApplicationProviders";
import { createApplication } from "../app/composition";
import type { ApplicationRuntime } from "../app/service-context";
import type {
  AuthService,
  AuthState,
  ServiceResult,
  Services,
} from "../services/contracts";

const ok: ServiceResult<void> = { ok: true, data: undefined };
const failed = (code: "AUTH_FAILED" | "TEMPORARILY_UNAVAILABLE") =>
  ({
    ok: false,
    error: {
      code,
      message: "Synthetic",
      request_id: "req-7",
      retryable: code === "TEMPORARILY_UNAVAILABLE",
    },
  }) as const;

beforeEach(() => localStorage.clear());

function spyData(data: Services["data"]) {
  return Object.fromEntries(
    Object.entries(data).map(([name, operation]) => [name, vi.fn(operation)]),
  ) as unknown as Services["data"];
}
function expectNoDataCalls(data: Services["data"]) {
  Object.values(data).forEach((operation) =>
    expect(operation).not.toHaveBeenCalled(),
  );
}
function renderRuntime(runtime: ApplicationRuntime) {
  return render(
    <ApplicationProviders runtime={runtime}>
      <App />
    </ApplicationProviders>,
  );
}
/** Real composed mock adapter: product journeys use the same deterministic contract. */
function mountComposed() {
  const base = createApplication("mock");
  const data = spyData(base.services.data);
  renderRuntime({ ...base, services: { auth: base.services.auth, data } });
  return { data };
}
/** Injected auth whose actions are controlled deferreds, for pending/failure states. */
function mountControlled(initial: AuthState = { status: "unauthenticated" }) {
  let listener: ((state: AuthState) => void) | undefined;
  const signals: AbortSignal[] = [];
  let settle: (result: ServiceResult<void>) => void = () => {};
  const deferred = (_input?: unknown, options?: { signal?: AbortSignal }) => {
    if (options?.signal) signals.push(options.signal);
    return new Promise<ServiceResult<void>>((resolve, reject) => {
      settle = resolve;
      options?.signal?.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  };
  const auth = {
    observe(next: (state: AuthState) => void) {
      listener = next;
      queueMicrotask(() => next(initial));
      return () => {
        listener = undefined;
      };
    },
    signIn: vi.fn(deferred),
    register: vi.fn(deferred),
    resetPassword: vi.fn(deferred),
    sendVerification: vi.fn((options?: { signal?: AbortSignal }) =>
      deferred(undefined, options),
    ),
    refreshSession: vi.fn((options?: { signal?: AbortSignal }) =>
      deferred(undefined, options),
    ),
    signOut: vi.fn(async () => ok),
  } satisfies AuthService;
  const data = spyData(createApplication("mock").services.data);
  renderRuntime({ mode: "test", services: { auth, data } });
  return {
    auth,
    data,
    signals,
    settle: (result: ServiceResult<void>) => act(async () => settle(result)),
    emit: (next: AuthState) => act(() => listener?.(next)),
  };
}
const dialog = (name: RegExp | string) => screen.findByRole("dialog", { name });
const email = () => screen.getByLabelText("Email");
const password = () => screen.getByLabelText("Password");
function fill(address: string, secret?: string) {
  fireEvent.change(email(), { target: { value: address } });
  if (secret !== undefined)
    fireEvent.change(password(), { target: { value: secret } });
}

describe("AuthDialog with the composed mock adapter", () => {
  it("signs a verified account in only through the observed auth state", async () => {
    const { data } = mountComposed();
    await dialog("Sign in to LCA diff");
    expect(email()).toHaveFocus();
    fill("verified@example.invalid", "demo-password");
    fireEvent.submit(email().closest("form")!);
    expectNoDataCalls(data);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("verified@example.invalid")).toBeVisible();
    expect(
      screen.getByRole("main", { name: "Comparison workspace" }),
    ).toHaveFocus();
    expect(document.querySelector(".shell")).not.toHaveAttribute("inert");
  });

  it("shows recoverable invalid-credential errors and keeps the shell locked", async () => {
    const { data } = mountComposed();
    await dialog("Sign in to LCA diff");
    fill("verified@example.invalid", "wrong-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByText(/email or password is incorrect/);
    expect(alert).toHaveAttribute("role", "alert");
    expect(email()).toHaveFocus();
    expect(email()).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(alert.id),
    );
    expect(password()).toHaveValue("");
    expect(
      screen.queryByText(/session could not be confirmed/),
    ).not.toBeInTheDocument();
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    expectNoDataCalls(data);
    fill("verified@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("validates fields accessibly before calling the service", async () => {
    mountComposed();
    await dialog("Sign in to LCA diff");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(email()).toHaveAccessibleDescription("Enter your email address.");
    expect(password()).toHaveAccessibleDescription("Enter your password.");
    expect(email()).toHaveFocus();
    fill("not-an-email", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(email()).toHaveAccessibleDescription(/valid email address/);
    expect(password()).not.toHaveAttribute("aria-invalid");
    fill("verified@example.invalid", "");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(password()).toHaveFocus();
  });

  it("registers into verification, rejects duplicates and unlocks after resend and refresh", async () => {
    const { data } = mountComposed();
    await dialog("Sign in to LCA diff");
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    await dialog("Create an account");
    expect(email()).toHaveFocus();
    fill("verified@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(
      await screen.findByText(/may already be registered/),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Create an account",
    );
    fill("new@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const verify = await dialog("Verify your email");
    expect(within(verify).getByText(/Signed in as/)).toHaveTextContent(
      "Signed in as new@example.invalid",
    );
    const resend = screen.getByRole("button", {
      name: "Resend verification email",
    });
    expect(resend).toHaveFocus();
    fireEvent.click(
      screen.getByRole("button", { name: "I've verified my email" }),
    );
    expect(await screen.findByText(/not verified yet/)).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    fireEvent.click(resend);
    expect(
      await screen.findByText(/verification email for new@example.invalid/),
    ).toBeVisible();
    expectNoDataCalls(data);
    fireEvent.click(
      screen.getByRole("button", { name: "I've verified my email" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("new@example.invalid")).toBeVisible();
  });

  it("keeps unverified sign-ins locked and lets them switch account", async () => {
    const { data } = mountComposed();
    await dialog("Sign in to LCA diff");
    fill("unverified@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await dialog("Verify your email");
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    expectNoDataCalls(data);
    fireEvent.click(
      screen.getByRole("button", { name: "Use a different account" }),
    );
    await dialog("Sign in to LCA diff");
    expect(email()).toHaveFocus();
  });

  it("resets a known account, reports unknown ones and returns to sign-in", async () => {
    mountComposed();
    await dialog("Sign in to LCA diff");
    fill("someone@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    await dialog("Reset your password");
    expect(email()).toHaveValue("someone@example.invalid");
    expect(email()).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Send reset email" }));
    expect(
      await screen.findByText(/couldn't send a reset email/),
    ).toHaveAttribute("role", "alert");
    fill("verified@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Send reset email" }));
    expect(
      await screen.findByText(/No email was sent. Return to sign in/),
    ).toHaveTextContent("demo-password");
    const back = screen.getByRole("button", { name: "Return to sign in" });
    expect(back).toHaveFocus();
    fireEvent.click(back);
    await dialog("Sign in to LCA diff");
    expect(email()).toHaveValue("verified@example.invalid");
    expect(email()).toHaveFocus();
  });

  it("explains demo accounts only from composition-supplied mock guidance", async () => {
    mountComposed();
    await dialog("Sign in to LCA diff");
    fireEvent.click(screen.getByRole("button", { name: "About this demo" }));
    expect(screen.getByText(/No live account or email delivery/)).toBeVisible();
    expect(screen.getByText("demo-password")).toBeVisible();
    expect(screen.getByText("unverified@example.invalid")).toBeVisible();
  });
});

describe("AuthDialog pending, cancellation and failure states", () => {
  it("prevents duplicate submissions and exposes progress until recovery", async () => {
    const app = mountControlled();
    await dialog("Sign in to LCA diff");
    fill("verified@example.invalid", "demo-password");
    const submit = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.submit(email().closest("form")!);
    expect(app.auth.signIn).toHaveBeenCalledOnce();
    expect(app.auth.signIn).toHaveBeenCalledWith(
      { email: "verified@example.invalid", password: "demo-password" },
      { signal: expect.any(AbortSignal) },
    );
    expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(email().closest("form")).toHaveAttribute("aria-busy", "true");
    expect(email()).toHaveAttribute("readonly");
    expect(screen.getByText("Signing in…")).toBeVisible();
    // An action-driven resolving state keeps the modal and its form mounted.
    app.emit({ status: "resolving" });
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(
      screen.queryByText("Restoring your session…"),
    ).not.toBeInTheDocument();
    await app.settle(failed("TEMPORARILY_UNAVAILABLE"));
    expect(
      screen.getByText(/temporarily unavailable \(reference req-7\)/),
    ).toBeVisible();
    expect(submit).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Signing in…")).not.toBeInTheDocument();
    fill("verified@example.invalid", "demo-password");
    fireEvent.click(submit);
    expect(app.auth.signIn).toHaveBeenCalledTimes(2);
    expectNoDataCalls(app.data);
  });

  it("aborts and ignores an obsolete submission when the flow changes", async () => {
    const app = mountControlled();
    await dialog("Sign in to LCA diff");
    fill("verified@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
    await dialog("Create an account");
    expect(app.signals[0].aborted).toBe(true);
    await app.settle(failed("AUTH_FAILED"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("does not unlock on a successful action result without an observed verified state", async () => {
    const app = mountControlled();
    await dialog("Sign in to LCA diff");
    fill("verified@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await app.settle(ok);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    app.emit({
      status: "authenticated",
      user: {
        uid: "u1",
        email: "verified@example.invalid",
        email_verified: true,
      },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expectNoDataCalls(app.data);
  });

  it("recovers from thrown service failures and verification action errors", async () => {
    const app = mountControlled({
      status: "authenticated",
      user: { uid: "u2", email: "u2@example.invalid", email_verified: false },
    });
    await dialog("Verify your email");
    fireEvent.click(
      screen.getByRole("button", { name: "Resend verification email" }),
    );
    expect(screen.getByText("Sending a verification email…")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "I've verified my email" }),
    );
    expect(app.auth.refreshSession).not.toHaveBeenCalled();
    await app.settle(failed("AUTH_FAILED"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The verification email could not be sent. Try again.",
    );
    app.auth.signIn.mockRejectedValueOnce(new Error("boom"));
    app.emit({ status: "unauthenticated" });
    await dialog("Sign in to LCA diff");
    fill("verified@example.invalid", "demo-password");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /temporarily unavailable/,
    );
  });

  it("aborts pending verification work when the account changes", async () => {
    const app = mountControlled({
      status: "authenticated",
      user: { uid: "u3", email: "u3@example.invalid", email_verified: false },
    });
    await dialog("Verify your email");
    fireEvent.click(
      screen.getByRole("button", { name: "I've verified my email" }),
    );
    app.emit({
      status: "authenticated",
      user: { uid: "u4", email: "u4@example.invalid", email_verified: false },
    });
    expect(app.signals[0].aborted).toBe(true);
    expect(screen.getByText("u4@example.invalid")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Resend verification email" }),
    ).toHaveFocus();
  });

  it("shows the session-failure notice and no mock credentials for injected services", async () => {
    const app = mountControlled({
      status: "error",
      error: failed("AUTH_FAILED").error,
    });
    await dialog("Sign in to LCA diff");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your session could not be confirmed",
    );
    expect(email()).toHaveAccessibleDescription(/could not be confirmed/);
    fireEvent.click(screen.getByRole("button", { name: "About this demo" }));
    expect(screen.queryByText("demo-password")).not.toBeInTheDocument();
    expect(screen.queryByText(/Local demo/)).not.toBeInTheDocument();
    const cancel = new Event("cancel", { cancelable: true });
    screen.getByRole("dialog").dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expectNoDataCalls(app.data);
  });
});
