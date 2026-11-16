import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const NAME = "Synthetic road service";
const panel = (page: Page) => page.locator("#panel-scores");
const grid = (page: Page) =>
  panel(page).getByRole("grid", { name: "Scores comparison" });
const headers = (page: Page) => panel(page).locator(".process-header");
const headerNames = (page: Page) =>
  headers(page).evaluateAll((elements) =>
    elements.map(
      (element) => element.querySelector(".process-header-name")!.textContent,
    ),
  );
const cell = (page: Page, row: number, column: number) =>
  grid(page).locator(`[data-row="${row}"][data-col="${column}"]`);
async function signIn(page: Page, path = "/") {
  await page.goto(path);
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill("demo-password");
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
}
function monitor(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (["fetch", "xhr"].includes(request.resourceType()))
      errors.push(`Unexpected network read: ${request.url()}`);
  });
  return errors;
}
async function selectThree(page: Page) {
  const tree = page.getByRole("tree", { name: "Processes" });
  const node = (name: string) =>
    tree.getByRole("treeitem", { name, exact: true });
  for (const row of [
    tree.locator('[role="treeitem"][aria-level="1"]').first(),
    node("transport systems, 3 processes"),
    node("road, 3 processes"),
    node("operations, 3 processes"),
    node("infrastructure, 1 process"),
  ])
    await row.click();
  for (const name of ["Alpha — CH", "Gamma — CH", "Beta — DE"])
    await node(`${NAME} ${name}`).click();
}

test("Scores shows exact zero and unavailable states, shared columns and source rows @smoke", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await page.getByRole("tab", { name: "Scores" }).click();
  await expect(panel(page)).toHaveRole("tabpanel");
  await expect(panel(page)).toHaveAccessibleName("Scores");
  await expect(
    panel(page).getByText(
      "Select processes in the left sidebar to start your comparison.",
    ),
  ).toBeVisible();
  const indicators = page.getByRole("tree", { name: "Indicators" });
  const ipcc = indicators.getByRole("treeitem", {
    name: "IPCC 2021",
    exact: true,
  });
  await expect(ipcc).toHaveAttribute("aria-checked", "true");
  await selectThree(page);
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "1");
  await expect(cell(page, 0, 0)).toHaveAttribute("data-state", "zero");
  await expect(cell(page, 0, 0).locator(".signed-label")).toHaveText("0");
  for (const col of [1, 2]) {
    await expect(cell(page, 0, col)).toHaveAttribute(
      "data-state",
      "unavailable",
    );
    await expect(cell(page, 0, col).locator(".signed-label")).toHaveText("N/A");
    await expect(cell(page, 0, col).locator(".signed-bar")).toHaveCount(0);
  }
  await cell(page, 0, 1).focus();
  await expect(cell(page, 0, 1).locator("[role=tooltip]")).toBeVisible();
  await expect(cell(page, 0, 1).locator("[role=tooltip]")).toContainText(
    "Reference basis has not been verified",
  );
  await expect(panel(page).locator(".comparability-warning")).toContainText(
    "different reference amounts and units",
  );
  await expect(
    panel(page).locator(".comparison-corner .identity-fields span"),
  ).toHaveText(["Method", "Category", "Indicator", "Unit"]);
  await expect(cell(page, 0, -1).locator("span").nth(1)).toHaveText("");
  // Alphabetically earlier label is added later, but source order is retained.
  await indicators
    .getByRole("treeitem", { name: "Synthetic method", exact: true })
    .locator(".indicator-check")
    .click();
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "2");
  await expect(cell(page, 0, -1)).toContainText("GWP 100");
  await expect(cell(page, 1, -1)).toContainText("A synthetic indicator");
  const precise = "123456789012345678901234567890.1234567890123456789";
  await expect(cell(page, 1, 0)).toHaveAttribute("data-state", "positive");
  await cell(page, 1, 0).focus();
  await expect(cell(page, 1, 0).locator("[role=tooltip]")).toHaveText(precise);
  await expect(cell(page, 1, 0).locator("[role=tooltip]")).toBeVisible();
  await expect
    .poll(() => headerNames(page))
    .toEqual([`${NAME} Alpha`, `${NAME} Gamma`, `${NAME} Beta`]);
  // Pointer drag in Scores uses the shared store and follows through tab switches.
  const first = await headers(page).nth(0).boundingBox();
  const last = await headers(page).nth(2).boundingBox();
  if (!first || !last) throw new Error("Missing process header geometry");
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    first.x + first.width / 2 + 20,
    first.y + first.height / 2,
    { steps: 4 },
  );
  await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
  await expect
    .poll(() => headerNames(page))
    .toEqual([`${NAME} Gamma`, `${NAME} Beta`, `${NAME} Alpha`]);
  await expect(cell(page, 1, 2)).toHaveAccessibleName(
    `${NAME} Alpha: ${precise}, positive`,
  );
  // Header metadata and cell edges remain aligned.
  const valueBox = await cell(page, 0, 0).boundingBox();
  const headerBox = await headers(page).nth(0).boundingBox();
  expect(Math.abs(valueBox!.x - headerBox!.x)).toBeLessThanOrEqual(1);
  const identityX = (await cell(page, 0, -1).boundingBox())!.x;
  await grid(page).evaluate((element) => {
    element.scrollLeft = 40;
  });
  expect((await cell(page, 0, -1).boundingBox())!.x).toBe(identityX);
  await page.getByRole("tab", { name: "Flows" }).click();
  await expect
    .poll(() =>
      page.locator("#panel-flows .process-header-name").allTextContents(),
    )
    .toEqual([`${NAME} Gamma`, `${NAME} Beta`, `${NAME} Alpha`]);
  await page.getByRole("tab", { name: "Scores" }).click();
  await headers(page)
    .filter({ hasText: `${NAME} Beta` })
    .hover();
  await panel(page)
    .getByRole("button", { name: `Remove column ${NAME} Beta — DE` })
    .click();
  await expect
    .poll(() => headerNames(page))
    .toEqual([`${NAME} Gamma`, `${NAME} Alpha`]);
  await expect(grid(page)).toHaveAttribute("aria-colcount", "3");
  await ipcc.locator(".indicator-check").click();
  await indicators
    .getByRole("treeitem", { name: "Synthetic method", exact: true })
    .locator(".indicator-check")
    .click();
  await expect(
    panel(page).getByRole("heading", { name: "Select an indicator" }),
  ).toBeVisible();
  await expect(page.getByText("Selected processes (2)")).toBeVisible();
  await ipcc.locator(".indicator-check").click();
  for (const name of ["Gamma — CH", "Alpha — CH"]) {
    const remove = panel(page).getByRole("button", {
      name: `Remove column ${NAME} ${name}`,
    });
    await remove.locator("..").hover();
    await remove.click();
  }
  await expect(
    panel(page).getByText(
      "Select processes in the left sidebar to start your comparison.",
    ),
  ).toBeVisible();
  await expect(ipcc).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});

test("Scores windows keep signed scale from offscreen extrema in a large selection", async ({
  page,
}) => {
  const errors = monitor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "/?mock-scenario=large");
  const tree = page.getByRole("tree", { name: "Processes" });
  await tree.locator('[role=treeitem][aria-level="1"]').first().click();
  await tree
    .locator('[role=treeitem][aria-level="2"]')
    .first()
    .locator(".tree-check")
    .click();
  await page.getByRole("tab", { name: "Scores" }).click();
  await expect(grid(page)).toHaveAttribute("aria-colcount", "221");
  await expect(cell(page, 0, 3)).toHaveAttribute("data-state", "positive");
  await expect(cell(page, 0, 3).locator(".signed-bar")).toHaveCSS(
    "height",
    "10px",
  );
  await expect(cell(page, 0, 4)).toHaveAttribute("data-state", "negative");
  await expect(cell(page, 0, 4).locator(".signed-bar")).toHaveCSS(
    "height",
    "5px",
  );
  const rowHeight = await cell(page, 0, 3).evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(rowHeight).toBe(62);
  expect(await headers(page).count()).toBeLessThan(25);
  expect(await grid(page).locator('[role="gridcell"]').count()).toBeLessThan(
    25,
  );
  const leading = await cell(page, 0, -1).boundingBox();
  await grid(page).evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect(cell(page, 0, 219)).toHaveAttribute("data-state", "negative");
  await expect(cell(page, 0, 219).locator(".signed-bar")).toHaveCSS(
    "height",
    "40px",
  );
  expect(
    await cell(page, 0, 219).evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBe(rowHeight);
  expect((await cell(page, 0, -1).boundingBox())!.x).toBe(leading!.x);
  expect(await headers(page).count()).toBeLessThan(25);
  const header = panel(page).locator(
    '.process-header[data-column-index="219"]',
  );
  const h = await header.boundingBox();
  const c = await cell(page, 0, 219).boundingBox();
  expect(Math.abs(h!.x - c!.x)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
