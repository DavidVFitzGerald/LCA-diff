import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApplicationProviders } from "./app/ApplicationProviders";
import { Bootstrap } from "./app/Bootstrap";
import { createApplication } from "./app/composition";
import type { AuthState, Services } from "./services/contracts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const verified: AuthState = {
  status: "authenticated",
  user: {
    uid: "shell-user",
    email: "shell@example.invalid",
    email_verified: true,
  },
};
function mount(initial: AuthState) {
  const base = createApplication("mock");
  let listener: ((state: AuthState) => void) | undefined;
  const data = Object.fromEntries(
    Object.entries(base.services.data).map(([name, operation]) => [
      name,
      vi.fn(operation),
    ]),
  ) as unknown as Services["data"];
  const auth = {
    ...base.services.auth,
    observe(next: (state: AuthState) => void) {
      listener = next;
      queueMicrotask(() => next(initial));
      return () => {
        listener = undefined;
      };
    },
    signOut: vi.fn(async () => {
      listener?.({ status: "unauthenticated" });
      return { ok: true as const, data: undefined };
    }),
  };
  const runtime = { mode: "test" as const, services: { auth, data } };
  const result = render(
    <ApplicationProviders runtime={runtime}>
      <App />
    </ApplicationProviders>,
  );
  return {
    ...result,
    data,
    auth,
    emit: (next: AuthState) => act(() => listener?.(next)),
  };
}

function expectNoDataCalls(data: Services["data"]) {
  Object.values(data).forEach((operation) =>
    expect(operation).not.toHaveBeenCalled(),
  );
}

describe("F2 shell", () => {
  it("opens the named required-login dialog only after anonymous auth resolves", async () => {
    const app = mount({ status: "unauthenticated" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Restoring your session…")).toBeVisible();
    const dialog = await screen.findByRole("dialog", {
      name: "Sign in to LCA diff",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.querySelector(".shell")).toHaveAttribute("inert");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    const event = new Event("cancel", { bubbles: false, cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dialog).toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "About this demo" }));
    expect(screen.getByText(/No live account or email delivery/)).toBeVisible();
    expectNoDataCalls(app.data);
  });
  it("keeps the resolving shell free of a login flash and protected data", async () => {
    const app = mount({ status: "resolving" });
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expectNoDataCalls(app.data);
    app.emit(verified);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Flows" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
  it("keeps unverified users and auth failures locked without data calls", async () => {
    const app = mount({
      ...verified,
      user: { ...verified.user, email_verified: false },
    });
    expect(
      await screen.findByRole("dialog", { name: "Verify your email" }),
    ).toBeVisible();
    expectNoDataCalls(app.data);
    app.emit({
      status: "error",
      error: {
        code: "AUTH_FAILED",
        message: "Synthetic failure",
        request_id: "test",
        retryable: false,
      },
    });
    expect(
      screen.getByRole("dialog", { name: "Sign in to LCA diff" }),
    ).toBeVisible();
    expect(
      screen.getByText(/Your session could not be confirmed/),
    ).toBeVisible();
    expectNoDataCalls(app.data);
  });
  it("renders verified account controls, keyboard tabs, collapsible sidebars and signout", async () => {
    const app = mount(verified);
    const flows = await screen.findByRole("tab", { name: "Flows" });
    expect(document.querySelector(".shell")).not.toHaveAttribute("inert");
    expect(screen.getByText("shell@example.invalid")).toBeVisible();
    expect(
      screen.queryByRole("complementary", { name: "Indicator selection" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse processes" }));
    expect(
      screen.getByRole("button", { name: "Expand processes" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("heading", { name: "Processes" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand processes" }));
    expect(screen.getByRole("heading", { name: "Processes" })).toBeVisible();
    fireEvent.keyDown(flows, { key: "ArrowRight" });
    const scores = screen.getByRole("tab", { name: "Scores" });
    expect(scores).toHaveFocus();
    expect(scores).toHaveAttribute("aria-selected", "true");
    expect(flows).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "Scores" })).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Indicator selection" }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse indicators" }),
    );
    expect(
      screen.queryByRole("heading", { name: "Indicators" }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(scores, { key: "Home" });
    expect(flows).toHaveFocus();
    expect(flows).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("region", { name: "Settings" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("dialog")).toBeVisible();
    expect(app.auth.signOut).toHaveBeenCalledOnce();
    expectNoDataCalls(app.data);
  });
  it("removes the dialog on observed verified auth and restores focus", async () => {
    const app = mount({ status: "unauthenticated" });
    await screen.findByRole("dialog");
    app.emit(verified);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Comparison workspace" }),
    ).toBeVisible();
    expect(
      screen.getByRole("main", { name: "Comparison workspace" }),
    ).toHaveFocus();
    expectNoDataCalls(app.data);
  });
  it("uses a meaningful narrow-screen message rather than the workspace or dialog", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const app = mount({ status: "unauthenticated" });
    expect(
      await screen.findByRole("heading", {
        name: "A larger screen is required",
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("unauthenticated"),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expectNoDataCalls(app.data);
  });
  it("retains the explicit local demo marker in the real composition", async () => {
    render(<Bootstrap mode="mock" />);
    await screen.findByRole("dialog");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Local demo mode — synthetic services. Auth: unauthenticated.",
    );
  });
});
