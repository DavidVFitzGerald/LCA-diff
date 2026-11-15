import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Column operations (#25) in Chromium: pointer drag and keyboard reorder of
 * process headers, the header × and the shared order across tabs, in the
 * default catalog; edge auto-scroll drag and an off-screen keyboard reorder
 * in the large scenario (`?mock-scenario=large`, 220 processes). Read
 * counts and the #69 hold are component-level evidence
 * (src/services/mock/flows-grid-columns.test.tsx).
 */
const PASSWORD = "demo-password";
const NAME = "Synthetic road service";

function monitor(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  return problems;
}
async function signIn(page: Page, path = "/") {
  await page.goto(path);
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
}
const box = async (locator: Locator) => (await locator.boundingBox())!;
const centre = async (locator: Locator) => {
  const { x, y, width, height } = await box(locator);
  return { x: x + width / 2, y: y + height / 2 };
};
const strip = (page: Page) => page.locator(".process-header-scroller");
const grid = (page: Page) =>
  page.getByRole("grid", { name: "Flows comparison" });
/**
 * The Flows tabpanel, located by ID rather than by role and name (#75). In
 * Playwright 1.65.1's Firefox build, a named role query whose name comes
 * from `aria-labelledby` crashes the content process (signal 11) once the
 * same element has been read in both the isolated and main worlds, as
 * `expect` and `evaluateAll`/`boundingBox` do here. Upstream:
 * https://github.com/microsoft/playwright/issues/43967 (Mozilla bug
 * 2090055). `expectFlowsPanel` keeps the role and name assertion.
 */
const flowsPanel = (page: Page) => page.locator("#panel-flows");
async function expectFlowsPanel(page: Page) {
  await expect(flowsPanel(page)).toBeVisible();
  await expect(flowsPanel(page)).toHaveRole("tabpanel");
  await expect(flowsPanel(page)).toHaveAccessibleName("Flows");
}
const columns = (page: Page) =>
  flowsPanel(page)
    .getByRole("list", { name: "Process columns" })
    .getByRole("group");
const announcer = (page: Page) => page.getByTestId("workspace-announcer");
const scrollLeft = (locator: Locator) =>
  locator.evaluate((element) => element.scrollLeft);
/** Header names in column order. */
const headerNames = (page: Page) =>
  columns(page).evaluateAll((groups) =>
    groups.map(
      (group) => group.querySelector(".process-header-name")!.textContent,
    ),
  );
/** Selected-list names in list order. */
const selectedNames = (page: Page) =>
  page
    .getByRole("list", { name: "Selected processes" })
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        button
          .getAttribute("aria-label")!
          .replace(/^Remove (.+) — .+ from selection$/, "$1"),
      ),
    );
/** Each mounted value cell's label, keyed by flow and process ID. */
const cellValues = (page: Page) =>
  grid(page).evaluate((element) => {
    const values: Record<string, string> = {};
    for (const cell of element.querySelectorAll<HTMLElement>(
      '[role="gridcell"][data-state]',
    )) {
      const flow = cell
        .closest('[role="row"]')!
        .querySelector('[role="rowheader"]')!
        .getAttribute("aria-label");
      const process = document
        .querySelector(
          `.process-header[data-column-index="${cell.dataset.col}"]`,
        )
        ?.getAttribute("data-process-id");
      if (flow && process)
        values[`${flow}|${process}`] =
          cell.getAttribute("aria-label") ?? cell.textContent ?? "";
    }
    return values;
  });
/** Every visible value cell starts where its process header starts. */
async function expectAligned(page: Page) {
  const gridBox = await box(grid(page));
  const cells = grid(page).locator(".comparison-grid-cell");
  let checked = 0;
  for (
    let index = 0;
    index < (await cells.count()) && checked < 4;
    index += 1
  ) {
    const cell = cells.nth(index);
    const cellBox = await box(cell);
    if (
      cellBox.x < gridBox.x + 320 ||
      cellBox.x + cellBox.width > gridBox.x + gridBox.width - 20
    )
      continue;
    const column = await cell
      .locator('[role="gridcell"]')
      .getAttribute("data-col");
    const headerBox = await box(
      page.locator(`.process-header[data-column-index="${column}"]`),
    );
    expect(Math.abs(headerBox.x - cellBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(headerBox.width - cellBox.width)).toBeLessThanOrEqual(1);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}

test("drag, keyboard reorder and × removal keep one order across tabs and the Selected list", async ({
  page,
}) => {
  const problems = monitor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
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
  const header = (name: string) =>
    columns(page).and(page.getByRole("group", { name: `${NAME} ${name}` }));
  const remove = (name: string) =>
    page.getByRole("button", { name: `Remove column ${NAME} ${name}` });
  const order = async (expected: string[]) => {
    const names = expected.map((name) => `${NAME} ${name}`);
    await expect.poll(() => headerNames(page)).toEqual(names);
    expect(await selectedNames(page)).toEqual(names);
  };
  await expectFlowsPanel(page);
  await order(["Alpha", "Gamma", "Beta"]);
  await expect(
    grid(page).locator('[role="gridcell"][data-state]').first(),
  ).toBeVisible();
  const values = await cellValues(page);

  // The × appears on hover and focus without resizing the header.
  await page.mouse.move(5, 5);
  await expect(remove("Alpha — CH")).toHaveCSS("opacity", "0");
  const before = await box(header("Alpha"));
  await header("Alpha").hover();
  await expect(remove("Alpha — CH")).toHaveCSS("opacity", "1");
  expect(await box(header("Alpha"))).toEqual(before);
  await page.mouse.move(5, 5);
  await header("Alpha").focus();
  await expect(remove("Alpha — CH")).toHaveCSS("opacity", "1");

  // Pointer drag Alpha onto Beta's column: one reorder on drop.
  const from = await centre(header("Alpha"));
  const to = await centre(header("Beta"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(page.locator(".process-header-drop")).toHaveAttribute(
    "data-drop-index",
    "2",
  );
  await page.mouse.up();
  await order(["Gamma", "Beta", "Alpha"]);
  await expect(header("Alpha")).toBeFocused();
  await expect(announcer(page)).toHaveText(
    `${NAME} Alpha — CH moved to position 3 of 3.`,
  );
  // Values follow their processes; headers stay aligned with the cells.
  await expect.poll(() => cellValues(page)).toEqual(values);
  await expectAligned(page);

  // Escape cancels a drag.
  const gamma = await centre(header("Gamma"));
  await page.mouse.move(gamma.x, gamma.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await order(["Gamma", "Beta", "Alpha"]);

  // The order survives Flows → Scores → Flows.
  await page.getByRole("tab", { name: "Scores" }).click();
  await page.getByRole("tab", { name: "Flows" }).click();
  await order(["Gamma", "Beta", "Alpha"]);

  // Keyboard: pick Alpha up, move it first, drop it; focus stays on it.
  // Alpha is reached by keyboard (Shift+Tab back from its ×), as a
  // keyboard user would: after the tab clicks, Firefox never shows the
  // focus ring for focus set by script, even on later key presses (#75).
  await header("Alpha").focus();
  await page.keyboard.press("Tab");
  await expect(remove("Alpha — CH")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(header("Alpha")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(announcer(page)).toContainText(
    `Picked up ${NAME} Alpha — CH at position 3 of 3.`,
  );
  await page.keyboard.press("Home");
  await expect(header("Alpha")).toBeFocused();
  await page.keyboard.press("Space");
  await order(["Alpha", "Gamma", "Beta"]);
  await expect(header("Alpha")).toBeFocused();
  await expect(header("Alpha")).toHaveCSS("outline-style", "solid");
  await expect(announcer(page)).toHaveText(
    `${NAME} Alpha — CH dropped at position 1 of 3.`,
  );
  await expect.poll(() => cellValues(page)).toEqual(values);

  // × by pointer: removed everywhere, focus on the next header.
  await header("Gamma").hover();
  await remove("Gamma — CH").click();
  await order(["Alpha", "Beta"]);
  await expect(node(`${NAME} Gamma — CH`)).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(header("Beta")).toBeFocused();
  await expect(announcer(page)).toHaveText(
    `Removed ${NAME} Gamma — CH from selection`,
  );
  expect(new Set(await headerNames(page)).size).toBe(2);

  // × by keyboard: Tab reaches it; the last column falls back to the
  // previous one, then the only one to the empty state.
  await page.keyboard.press("Tab");
  await expect(remove("Beta — DE")).toBeFocused();
  await page.keyboard.press("Enter");
  await order(["Alpha"]);
  await expect(header("Alpha")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(remove("Alpha — CH")).toBeFocused();
  await page.keyboard.press("Space");
  const empty = flowsPanel(page).getByRole("heading", {
    name: "Compare process flows",
  });
  await expectFlowsPanel(page);
  await expect(empty).toBeFocused();
  expect(await selectedNames(page)).toEqual([]);
  await expect(node(`${NAME} Alpha — CH`)).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(problems).toEqual([]);
});

async function openLarge(page: Page) {
  const problems = monitor(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "/?mock-scenario=large");
  const tree = page.getByRole("tree", { name: "Processes" });
  await tree.locator('[role="treeitem"][aria-level="1"]').first().click();
  await tree
    .locator('[role="treeitem"][aria-level="2"]')
    .first()
    .locator(".tree-check")
    .click();
  await expect(
    grid(page).locator('[role="gridcell"][data-state]').first(),
  ).toBeVisible();
  await expectFlowsPanel(page);
  await expect(columns(page).first()).toHaveAttribute("aria-busy", "false");
  return problems;
}
const mountedHeaders = (page: Page) => page.locator(".process-header").count();

test("a pointer drag auto-scrolls the strip at its edge and drops a column far away (large)", async ({
  page,
}) => {
  const problems = await openLarge(page);
  const count = Number(await grid(page).getAttribute("aria-colcount")) - 1;
  const dragged = columns(page).nth(1);
  const id = await dragged.getAttribute("data-process-id");
  const width = Number(await strip(page).getAttribute("data-column-width"));
  const stripBox = await box(strip(page));
  const from = await centre(dragged);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y, { steps: 4 });
  // Hold near the right edge until the strip has scrolled 30+ columns.
  await page.mouse.move(stripBox.x + stripBox.width - 8, from.y, { steps: 8 });
  await expect
    .poll(() => scrollLeft(strip(page)), { timeout: 15000 })
    .toBeGreaterThan(32 * width);
  // Leave the edge zone so scrolling stops, then drop over a column.
  await page.mouse.move(stripBox.x + stripBox.width / 2, from.y, { steps: 4 });
  expect(await mountedHeaders(page)).toBeLessThan(30);
  const target = Number(
    await page.locator(".process-header-drop").getAttribute("data-drop-index"),
  );
  expect(target).toBeGreaterThanOrEqual(30);
  await page.mouse.up();
  const moved = page.locator(`.process-header[data-process-id="${id}"]`);
  await expect(moved).toHaveAttribute("data-column-index", String(target));
  await expect(moved).toBeFocused();
  // The body followed the strip; nothing else moved or duplicated.
  await expect
    .poll(() => scrollLeft(grid(page)))
    .toBe(await scrollLeft(strip(page)));
  expect(Number(await grid(page).getAttribute("aria-colcount")) - 1).toBe(
    count,
  );
  expect(await mountedHeaders(page)).toBeLessThan(30);
  await expectAligned(page);
  expect(problems).toEqual([]);
});

test("keyboard reorder to an off-screen end scrolls the header into view with focus (large)", async ({
  page,
}) => {
  const problems = await openLarge(page);
  const count = Number(await grid(page).getAttribute("aria-colcount")) - 1;
  const first = columns(page).first();
  const id = await first.getAttribute("data-process-id");
  await first.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("End");
  const moved = page.locator(`.process-header[data-process-id="${id}"]`);
  await expect(moved).toHaveAttribute("data-column-index", String(count - 1));
  await expect(moved).toBeFocused();
  await expect(moved).toBeInViewport();
  const stripBox = await box(strip(page));
  const movedBox = await box(moved);
  expect(movedBox.x + movedBox.width).toBeLessThanOrEqual(
    stripBox.x + stripBox.width + 1,
  );
  await expect
    .poll(() => scrollLeft(grid(page)))
    .toBe(await scrollLeft(strip(page)));
  expect(await mountedHeaders(page)).toBeLessThan(30);
  await page.keyboard.press("Space");
  await expect(announcer(page)).toContainText(
    `dropped at position ${count} of ${count}.`,
  );
  await expect(moved).toBeFocused();
  expect(await mountedHeaders(page)).toBeLessThan(30);
  await expectAligned(page);
  expect(problems).toEqual([]);
});
