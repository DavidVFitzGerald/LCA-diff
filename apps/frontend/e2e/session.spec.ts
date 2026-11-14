import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Session lifecycle through the composed mock adapter (no live auth/backend). */
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
async function signIn(page: Page, email: string) {
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
}
/** Records, from before app scripts run, whether any modal dialog ever rendered. */
async function recordDialogs(page: Page) {
  await page.addInitScript(() => {
    const flags = window as unknown as { __dialogSeen?: boolean };
    flags.__dialogSeen = false;
    new MutationObserver(() => {
      if (document.querySelector("dialog")) flags.__dialogSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
}
const dialogSeen = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __dialogSeen?: boolean }).__dialogSeen,
  );

test("@smoke a returning verified session restores without a login-modal flash", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  await signIn(page, "verified@example.invalid");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await recordDialogs(page);
  for (let visit = 0; visit < 2; visit += 1) {
    await page.reload();
    await expect(page.locator(".account-controls")).toContainText(
      "verified@example.invalid",
    );
    await expect(page.locator(".shell")).not.toHaveAttribute("inert");
    expect(await dialogSeen(page)).toBe(false);
  }
  expect(problems).toEqual([]);
});

test("unverified sessions restore locked and anonymous reloads open the modal", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  await signIn(page, "unverified@example.invalid");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "Verify your email",
  );
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "Verify your email",
  );
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use a different account" }).click();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
  ).toBeNull();
  expect(problems).toEqual([]);
});

test("signout and account switching keep the account-scoped workspace key", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  await page.evaluate(
    (key) => localStorage.setItem(key, '{"version":1,"seeded":true}'),
    WORKSPACE_KEY,
  );
  await signIn(page, "verified@example.invalid");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  await expect(page.locator(".shell")).toHaveAttribute("inert", "");
  await expect(page.locator(".shell")).not.toContainText(
    "verified@example.invalid",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY),
  ).toBeNull();

  await signIn(page, "other@example.invalid");
  await expect(page.locator(".account-controls")).toContainText(
    "other@example.invalid",
  );
  await expect(page.locator(".shell")).not.toContainText(
    "verified@example.invalid",
  );
  await page.reload();
  await expect(page.locator(".account-controls")).toContainText(
    "other@example.invalid",
  );
  expect(
    await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_KEY),
  ).toBe('{"version":1,"seeded":true}');
  expect(problems).toEqual([]);
});
