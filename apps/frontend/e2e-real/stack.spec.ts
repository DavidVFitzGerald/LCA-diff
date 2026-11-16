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

test("real seed: exact differences toggles per tab (L3 #30)", async ({
  page,
}) => {
  // Row reads by tab and difference flag, from the requests the app sends.
  const rowReads: { tab: string; differences: boolean }[] = [];
  page.on("request", (request) => {
    const match = /\/api\/v1\/comparison\/(flows|scores)\/rows/.exec(
      request.url(),
    );
    if (match)
      rowReads.push({
        tab: match[1],
        differences: request.postDataJSON()?.differences_only === true,
      });
  });
  const toggle = (tab: "flows" | "scores") =>
    page
      .locator(`#panel-${tab}`)
      .getByRole("checkbox", { name: "Show differences only" });
  const flows = page.getByRole("grid", { name: "Flows comparison" });
  const scores = page.getByRole("grid", { name: "Scores comparison" });
  await page.goto("/");
  await login(page);
  // One process: the switch is disabled and off.
  await select(page, "run-of-river");
  await expect(toggle("flows")).toBeDisabled();
  await expect(toggle("flows")).not.toBeChecked();
  // Rooftop PV has a present-zero CO2 amount that run-of-river lacks.
  await select(page, "photovoltaic, rooftop");
  await expect(toggle("flows")).toBeEnabled();
  await expect(toggle("flows")).not.toBeChecked();
  await expect(flows).toHaveAttribute("aria-rowcount", "5");
  expect(rowReads.filter((read) => read.differences)).toEqual([]);
  await toggle("flows").check();
  // The seed has no equal flow rows: every row differs, and the absent vs
  // present-zero row stays.
  await expect
    .poll(() => rowReads.filter((read) => read.differences))
    .toEqual([{ tab: "flows", differences: true }]);
  await expect(flows).not.toHaveAttribute("aria-busy");
  await expect(flows).toHaveAttribute("aria-rowcount", "5");
  await flows.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const co2 = flows.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: /Carbon dioxide, fossil/ }),
  });
  await expect(co2.locator('[data-state="zero"]')).toHaveCount(1);
  await expect(co2.locator('[data-state="absent"]')).toHaveCount(1);
  // Off reuses the cached full rows: no new row read.
  const reads = rowReads.length;
  await toggle("flows").uncheck();
  await expect(flows).toHaveAttribute("aria-rowcount", "5");
  await toggle("flows").check();
  await expect(flows).toHaveAttribute("aria-rowcount", "5");
  expect(rowReads.length).toBe(reads);

  // Scores has its own switch, initially off; Flows stays on.
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  await expect(scores.getByRole("rowheader").first()).toContainText("GWP 100");
  await expect(toggle("scores")).toBeEnabled();
  await expect(toggle("scores")).not.toBeChecked();
  await page.getByRole("tab", { name: "Flows", exact: true }).click();
  await expect(toggle("flows")).toBeChecked();

  // A uniformly missing GWP 100 is not a difference: glued laminated timber
  // has no workbook row and rail transport's GWP 100 is missing.
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await select(page, "glued laminated");
  await expect(toggle("flows")).toBeDisabled();
  await expect(toggle("flows")).not.toBeChecked();
  await select(page, "transport, freight, rail");
  await expect(toggle("flows")).not.toBeChecked();
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  await expect(scores.locator('[data-state="unavailable"]')).toHaveCount(2);
  await toggle("scores").check();
  await expect(
    page
      .locator("#panel-scores")
      .getByText(
        "No differences: every selected indicator has the same score in all selected processes.",
      ),
  ).toBeVisible();
  await expect(scores).toHaveAttribute("aria-rowcount", "0");
  expect(rowReads.filter((read) => read.differences).at(-1)).toEqual({
    tab: "scores",
    differences: true,
  });
  await toggle("scores").uncheck();
  await expect(scores).toHaveAttribute("aria-rowcount", "1");
  await expect(scores.locator('[data-state="unavailable"]')).toHaveCount(2);
});

test("real seed UAT: name + geography filtered category, comparability warning, indicator order and column removal (L3 #30)", async ({
  page,
}) => {
  await page.goto("/");
  await login(page);
  const tree = page.getByRole("tree", { name: "Processes", exact: true });
  const selected = page.getByRole("button", { name: /^Selected processes \(/ });
  const headers = page.locator("#panel-flows .process-header");
  const warning = page.locator("#panel-flows .comparability-warning");
  // Swiss electricity: name and geography combine with AND; the filtered
  // category selects only its matching descendants.
  await page
    .getByRole("textbox", { name: "Process Name", exact: true })
    .fill("electricity");
  await page.getByRole("button", { name: "Advanced search" }).click();
  await page
    .getByRole("textbox", { name: "Geography", exact: true })
    .fill("ch");
  await expect(tree.getByRole("treeitem", { name: /open ground/ })).toHaveCount(
    0,
  );
  const energy = tree.getByRole("treeitem", { name: /^Energy, 3 processes$/ });
  await energy.focus();
  await page.keyboard.press("Space");
  await expect(selected).toHaveText("Selected processes (3)");
  await expect(headers).toHaveCount(3);
  for (const name of ["run-of-river", "reservoir", "rooftop"])
    await expect(page.locator("#panel-flows")).toContainText(name);
  await expect(warning).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(selected).toHaveText("Selected processes (3)");
  // A different reference amount and unit warns without changing values.
  await select(page, "cement, Portland, packed");
  await expect(headers).toHaveCount(4);
  await expect(warning).toContainText("different reference amounts and units.");
  // Additional indicators follow workbook order.
  await page.getByRole("tab", { name: "Scores", exact: true }).click();
  const indicators = page.getByRole("tree", { name: "Indicators" });
  const ipcc = indicators.getByRole("treeitem", {
    name: "IPCC 2021",
    exact: true,
  });
  await ipcc.focus();
  await page.keyboard.press("ArrowRight");
  const gwp20 = indicators.getByRole("treeitem", { name: /^GWP 20\b/ });
  await gwp20.focus();
  await page.keyboard.press("Space");
  await expect(gwp20).toHaveAttribute("aria-checked", "true");
  const scores = page.getByRole("grid", { name: "Scores comparison" });
  await expect(scores).toHaveAttribute("aria-rowcount", "2");
  await expect(scores.getByRole("rowheader").nth(0)).toContainText("GWP 100");
  await expect(scores.getByRole("rowheader").nth(1)).toContainText("GWP 20");
  // Removing a column with its header × (shown on hover) deselects it
  // everywhere.
  await page
    .locator("#panel-scores .process-header")
    .filter({ hasText: "cement, Portland, packed" })
    .hover();
  await page
    .getByRole("button", { name: /^Remove column cement, Portland, packed/ })
    .click();
  await expect(page.locator("#panel-scores .process-header")).toHaveCount(3);
  await expect(selected).toHaveText("Selected processes (3)");
  await page.getByRole("tab", { name: "Flows", exact: true }).click();
  await expect(headers).toHaveCount(3);
  await expect(warning).toHaveCount(0);
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
