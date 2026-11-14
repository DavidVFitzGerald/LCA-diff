import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Simulated account journeys through the composed mock adapter. No live
 * account, Firebase project, backend or email delivery is involved.
 */
const PASSWORD = "demo-password";
const protectedContent = /Synthetic road service|GWP 100|BAFU:2026/;

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
async function expectLocked(page: Page) {
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await expect(page.getByText(protectedContent)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
}
async function expectUnlocked(page: Page, email: string) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".shell")).not.toHaveAttribute("inert");
  await expect(page.locator(".account-controls")).toContainText(email);
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
  await expect(page.getByRole("status")).toHaveText(
    "Local demo mode — synthetic services. Auth: authenticated.",
  );
}

test("@smoke keyboard sign-in recovers from invalid credentials and resists dismissal", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  const email = dialog.getByLabel("Email");
  await expect(email).toBeFocused();
  // Repeated Escape (browser close requests) must not reveal an interactive shell.
  for (let press = 0; press < 3; press += 1)
    await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expectLocked(page);

  await page.keyboard.press("Enter");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Enter your email address.");
  await expect(email).toBeFocused();

  await page.keyboard.type("verified@example.invalid");
  await page.keyboard.press("Tab");
  await expect(dialog.getByLabel("Password")).toBeFocused();
  await page.keyboard.type("wrong-password");
  await page.keyboard.press("Enter");
  const alert = dialog.getByRole("alert");
  await expect(alert).toHaveText(/email or password is incorrect/);
  await expect(email).toBeFocused();
  await expect(email).toHaveAccessibleDescription(/incorrect/);
  await expect(dialog.getByLabel("Password")).toHaveValue("");
  await expectLocked(page);

  await page.keyboard.press("Tab");
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");
  await expectUnlocked(page, "verified@example.invalid");
  expect(problems).toEqual([]);
});

test("registration rejects duplicates and unlocks only after simulated verification", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Sign in to LCA diff");
  // Keyboard flow switch: Email → Password → Sign in → Create an account.
  for (let tab = 0; tab < 3; tab += 1) await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Create an account" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAccessibleName("Create an account");
  await expect(dialog.getByLabel("Email")).toBeFocused();

  await dialog.getByLabel("Email").fill("other@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(/already be registered/);
  await expect(dialog).toHaveAccessibleName("Create an account");

  await dialog.getByLabel("Email").fill("new@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Create account" }).click();
  await expect(dialog).toHaveAccessibleName("Verify your email");
  await expect(dialog).toContainText("Signed in as new@example.invalid");
  const resend = dialog.getByRole("button", {
    name: "Resend verification email",
  });
  await expect(resend).toBeFocused();
  await expectLocked(page);

  const refresh = dialog.getByRole("button", {
    name: "I've verified my email",
  });
  await refresh.click();
  await expect(dialog.getByRole("status")).toHaveText(/not verified yet/);
  await expectLocked(page);

  await resend.click();
  await expect(dialog.getByRole("status")).toHaveText(
    /verification email for new@example.invalid was simulated/,
  );
  await expectLocked(page);
  await refresh.click();
  await expectUnlocked(page, "new@example.invalid");
  expect(problems).toEqual([]);
});

test("unverified accounts stay locked and can switch to another account", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("unverified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toHaveAccessibleName("Verify your email");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expectLocked(page);
  await dialog.getByRole("button", { name: "Use a different account" }).click();
  await expect(dialog).toHaveAccessibleName("Sign in to LCA diff");
  await expect(dialog.getByLabel("Email")).toBeFocused();
  await expectLocked(page);
  expect(problems).toEqual([]);
});

test("password reset reports unknown accounts and returns to sign-in", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("nobody@example.invalid");
  await dialog.getByRole("button", { name: "Forgot password?" }).click();
  await expect(dialog).toHaveAccessibleName("Reset your password");
  await expect(dialog.getByLabel("Email")).toBeFocused();
  await expect(dialog.getByLabel("Email")).toHaveValue(
    "nobody@example.invalid",
  );
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(
    /couldn't send a reset email/,
  );
  await expect(dialog.getByLabel("Email")).toBeFocused();

  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status")).toHaveText(
    /No email was sent\. Return to sign in with the demo password demo-password/,
  );
  const back = dialog.getByRole("button", { name: "Return to sign in" });
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveAccessibleName("Sign in to LCA diff");
  await expect(dialog.getByLabel("Email")).toHaveValue(
    "verified@example.invalid",
  );
  await dialog.getByLabel("Password").fill(PASSWORD);
  await page.keyboard.press("Enter");
  await expectUnlocked(page, "verified@example.invalid");
  expect(problems).toEqual([]);
});
