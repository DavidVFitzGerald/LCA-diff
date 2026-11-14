import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * F2 gate journeys (#15) through the composed mock adapter. Live expiry,
 * revocation and failed refresh have no shipped trigger by design; they are
 * proven in component tests (src/app/session.test.tsx), and real browser
 * evidence is deferred to I1 with the Firebase Auth Emulator.
 */
const PASSWORD = "demo-password";
const SESSION_KEY = "lca-diff:mock-session:v1";
const WORKSPACE_KEY = "lca-diff:workspace:v1:mock:verified@example.invalid";

function monitor(page: Page, baseURL: string) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["fetch", "xhr"].includes(request.resourceType()) ||
      url.origin !== new URL(baseURL).origin ||
      url.pathname.startsWith("/api/")
    )
      problems.push(`request ${request.url()}`);
  });
  return problems;
}
async function signInVerified(page: Page) {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
}
/** Keyboard focus must be visibly indicated (shell.css :focus-visible ring). */
async function expectVisibleFocus(control: Locator) {
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toHaveCSS("outline-width", "3px");
}

test("verified shell tabs, sidebars, settings and signout work from the keyboard", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await signInVerified(page);
  const flows = page.getByRole("tab", { name: "Flows" });
  const scores = page.getByRole("tab", { name: "Scores" });
  const indicators = page.getByRole("complementary", {
    name: "Indicator selection",
  });
  await expect(
    page.getByRole("tablist", { name: "Comparison view" }),
  ).toBeVisible();
  await expect(flows).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Flows" })).toBeVisible();
  await expect(indicators).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expectVisibleFocus(flows);
  await page.keyboard.press("ArrowRight");
  await expectVisibleFocus(scores);
  await expect(scores).toHaveAttribute("aria-selected", "true");
  await expect(flows).toHaveAttribute("tabindex", "-1");
  await expect(page.getByRole("tabpanel", { name: "Scores" })).toBeVisible();
  await expect(indicators).toBeVisible();
  await page.keyboard.press("Home");
  await expectVisibleFocus(flows);
  await expect(indicators).toHaveCount(0);
  await page.keyboard.press("End");
  await expectVisibleFocus(scores);
  await page.keyboard.press("ArrowLeft");
  await expectVisibleFocus(flows);
  await page.keyboard.press("ArrowRight");

  // Indicator sidebar follows the Scores panel in the DOM.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tabpanel", { name: "Scores" })).toBeFocused();
  await page.keyboard.press("Tab");
  const collapseIndicators = page.getByRole("button", {
    name: "Collapse indicators",
  });
  await expectVisibleFocus(collapseIndicators);
  await expect(collapseIndicators).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  const expandIndicators = page.getByRole("button", {
    name: "Expand indicators",
  });
  await expect(expandIndicators).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Indicators" })).toBeHidden();
  await page.keyboard.press("Space");
  await expect(page.getByRole("heading", { name: "Indicators" })).toBeVisible();

  // Back through the process sidebar to the header account controls.
  await scores.focus();
  await page.keyboard.press("Shift+Tab");
  const collapseProcesses = page.getByRole("button", {
    name: "Collapse processes",
  });
  await expectVisibleFocus(collapseProcesses);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Expand processes" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Processes" })).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Processes" })).toBeVisible();

  await page.keyboard.press("Shift+Tab");
  const signOut = page.getByRole("button", { name: "Sign out" });
  await expectVisibleFocus(signOut);
  await page.keyboard.press("Shift+Tab");
  const settings = page.getByRole("button", { name: "Settings" });
  await expectVisibleFocus(settings);
  await page.keyboard.press("Enter");
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Settings" })).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expectVisibleFocus(signOut);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Email")).toBeFocused();
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await expect(page.locator(".shell")).not.toContainText(
    "verified@example.invalid",
  );
  expect(problems).toEqual([]);
});

test.describe("a session invalidated before reload returns to the locked modal", () => {
  for (const [label, marker] of [
    ["removed marker", null],
    ["malformed marker", "{not json"],
    [
      "non-synthetic marker",
      JSON.stringify({
        version: 1,
        user: {
          uid: "mock:someone@example.com",
          email: "someone@example.com",
          email_verified: true,
        },
        verificationRequested: false,
      }),
    ],
  ] as const) {
    test(label, async ({ page, baseURL }) => {
      const problems = monitor(page, baseURL!);
      await signInVerified(page);
      await page.evaluate(
        ([workspace, session, value]) => {
          localStorage.setItem(workspace, '{"version":1,"seeded":true}');
          if (value === null) localStorage.removeItem(session);
          else localStorage.setItem(session, value);
        },
        [WORKSPACE_KEY, SESSION_KEY, marker] as const,
      );
      await page.reload();
      const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Email")).toBeFocused();
      await expect(page.locator(".shell")).toHaveAttribute("inert", "");
      await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(
        0,
      );
      await expect(page.locator(".shell")).not.toContainText(/@example\./);
      await expect(page.getByRole("status")).toHaveText(
        "Local demo mode — synthetic services. Auth: unauthenticated.",
      );
      expect(
        await page.evaluate(
          ([workspace, session]) => [
            localStorage.getItem(workspace),
            localStorage.getItem(session),
          ],
          [WORKSPACE_KEY, SESSION_KEY] as const,
        ),
      ).toEqual(['{"version":1,"seeded":true}', null]);
      expect(problems).toEqual([]);
    });
  }
});
