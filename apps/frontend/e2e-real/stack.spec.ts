import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";

const password = "local-demo-password-not-secret";
const precise = "1.234567890123456789012345678901234";
const dataset = /\/api\/v1\/(releases|processes|indicators|comparison)/;
async function login(page: Page, email = "demo@example.com") {
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("tree", { name: "Processes", exact: true }),
  ).toBeVisible();
}
async function select(page: Page, query: string) {
  await page
    .getByRole("textbox", { name: "Process Name", exact: true })
    .fill(query);
  await expect(
    page.getByRole("tree", { name: "Processes", exact: true }),
  ).toContainText(query);
  await page
    .getByRole("button", { name: "Select all matches", exact: true })
    .click();
  await expect(
    page
      .getByRole("grid", { name: /Flows comparison/ })
      .locator("[data-state]")
      .first(),
  ).toBeVisible();
}
async function emulator(
  request: APIRequestContext,
  endpoint: string,
  body: object,
  owner = true,
) {
  const response = await request.post(
    `/identitytoolkit.googleapis.com/v1/${endpoint}?key=local-emulator-only`,
    {
      headers: owner ? { Authorization: "Bearer owner" } : {},
      data: body,
    },
  );
  expect(response.ok()).toBe(true);
  return response.json();
}
async function register(page: Page, email: string) {
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Create an account",
    exact: true,
  });
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Verify your email", exact: true }),
  ).toBeVisible();
}

test("real seed: gated login, search, bulk selection, reorder, exact flows, Scores and logout", async ({
  page,
}) => {
  const reads: string[] = [];
  page.on("request", (request) => {
    if (dataset.test(request.url())) reads.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  expect(reads).toEqual([]);
  await expect(page.getByText("Local demo mode", { exact: false })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "About this demo" }),
  ).toHaveCount(0);
  await login(page);
  await select(page, "steel");
  const headers = page.locator("#panel-flows .process-header");
  await expect(headers).toHaveCount(2);
  const before = await headers.first().getAttribute("data-process-id");
  await headers.first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("End");
  await page.keyboard.press("Space");
  await expect(headers.last()).toHaveAttribute("data-process-id", before!);
  const grid = page.getByRole("grid", { name: "Flows comparison" });
  // Scroll the short seed grid to its environmental rows to inspect precision.
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    grid.getByRole("gridcell", {
      name: new RegExp(precise.replaceAll(".", "\\.")),
    }),
  ).toBeVisible();
  await expect(grid.locator('[data-state="absent"]').first()).toBeVisible();
  await select(page, "photovoltaic, rooftop");
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(grid.locator('[data-state="zero"]').first()).toBeVisible();
  await select(page, "glued laminated");
  await select(page, "cement, Portland, packed");
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  const scores = page.getByRole("grid", { name: "Scores comparison" });
  await expect(scores.getByRole("rowheader").first()).toContainText("GWP 100");
  await expect(scores.locator('[data-state="positive"]').first()).toBeVisible();
  await expect(scores.locator('[data-state="unavailable"]')).toHaveCount(2);
  await expect(
    scores.getByRole("tooltip").filter({ hasText: "missing" }).first(),
  ).toHaveCount(1);
  await expect(
    scores
      .getByRole("tooltip")
      .filter({ hasText: "basis has not been verified" })
      .first(),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  await expect(page.locator("[data-state]")).toHaveCount(0);
});

test("emulator registration, verification, restore and account disable clear data", async ({
  page,
  request,
}) => {
  const reads: string[] = [];
  page.on("request", (value) => {
    if (dataset.test(value.url())) reads.push(value.url());
  });
  await page.goto("/");
  const email = `l2-${Date.now()}@example.invalid`;
  await register(page, email);
  expect(reads).toEqual([]);
  await page.getByRole("button", { name: "Resend verification email" }).click();
  const codesResponse = await request.get(
    "/emulator/v1/projects/demo-lca/oobCodes",
  );
  expect(codesResponse.ok()).toBe(true);
  const codes = await codesResponse.json();
  const code = codes.oobCodes.find(
    (value: { email: string; requestType: string }) =>
      value.email === email && value.requestType === "VERIFY_EMAIL",
  );
  expect(code).toBeTruthy();
  const verified = await emulator(
    request,
    "accounts:update",
    { oobCode: code.oobCode },
    false,
  );
  await page.getByRole("button", { name: "I've verified my email" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await select(page, "steel");
  // Observe the initial restored shell without a login-modal flash.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, "__loginFlashes", { value: seen });
    new MutationObserver(() => {
      if (document.querySelector("dialog[open]")) seen.push("modal");
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.reload();
  await expect(
    page.getByRole("tree", { name: "Processes", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __loginFlashes: string[] }).__loginFlashes,
    ),
  ).toEqual([]);
  await select(page, "steel");
  await emulator(request, "accounts:update", {
    localId: verified.localId,
    disableUser: true,
  });
  await page
    .getByRole("textbox", { name: "Process Name", exact: true })
    .fill("cement");
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  await expect(page.locator("[data-state]")).toHaveCount(0);
});

for (const status of [401, 403])
  test(`persistent protected ${status} locks once`, async ({ page }) => {
    await page.goto("/");
    await login(page);
    await select(page, "steel");
    let rejected = 0;
    await page.route("**/api/v1/processes/search", (route) => {
      rejected++;
      return route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: status === 401 ? "AUTH_REQUIRED" : "EMAIL_NOT_VERIFIED",
            message: "Authentication required",
            request_id: "l2-browser-denial",
            retryable: false,
          },
        }),
      });
    });
    await page
      .getByRole("textbox", { name: "Process Name", exact: true })
      .fill("cement");
    await expect(
      page.getByRole("dialog", { name: "Sign in to LCA diff" }),
    ).toBeVisible();
    await expect(page.locator("[data-state]")).toHaveCount(0);
    const count = rejected;
    await page.waitForTimeout(1500);
    expect(rejected).toBe(count);
    expect(count).toBe(status === 401 ? 2 : 1);
  });

test("unverified signout failure stays in verification guidance", async ({
  page,
}) => {
  await page.goto("/");
  await register(page, `l2-signout-${Date.now()}@example.invalid`);
  // Firebase's signout is local. Simulate browser persistence failure, with
  // the real SDK and a real emulator account, without a product test hook.
  await page.evaluate(() => {
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key: string) {
      if (key.startsWith("firebase:authUser:"))
        throw new Error("Persistence unavailable");
      return original.call(this, key);
    };
  });
  await page.getByRole("button", { name: "Use a different account" }).click();
  await expect(
    page.getByRole("dialog", { name: "Verify your email", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator("[data-state]")).toHaveCount(0);
});
