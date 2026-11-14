import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Windowed Flows grid (#23) on the large synthetic workload
 * (`?mock-scenario=large`: 220 processes × 2,000+ generated mixed-sign
 * rows). Bounded reads and cancellation are component-level evidence
 * (src/services/mock/flows-grid.test.tsx); this checks the browser DOM,
 * sticky layout, alignment, resize and keyboard behaviour.
 */
const FIELDS = [
  "Type",
  "Flow Name",
  "Location",
  "Process Name",
  "Category",
  "Subcategory",
  "Unit",
];

async function openLargeComparison(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?mock-scenario=large");
  await expect(page.getByRole("status").first()).toContainText(
    "large synthetic scenario",
  );
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill("demo-password");
  await dialog.getByLabel("Password").press("Enter");
  const tree = page.getByRole("tree", { name: "Processes" });
  await tree.locator('[role="treeitem"][aria-level="1"]').first().click();
  await tree
    .locator('[role="treeitem"][aria-level="2"]')
    .first()
    .locator(".tree-check")
    .click();
  const grid = page.getByRole("grid", { name: "Flows comparison" });
  await expect(
    grid.locator('[role="gridcell"][data-state]').first(),
  ).toBeVisible();
  return { grid, problems };
}

const box = async (locator: Locator) => (await locator.boundingBox())!;

/** Every mounted, visible value cell starts where its process header starts. */
async function expectAligned(page: Page, grid: Locator) {
  const gridBox = await box(grid);
  // Column wrappers of value cells (the gridcell fills its wrapper).
  const cells = grid.locator(".comparison-grid-cell");
  const count = await cells.count();
  let checked = 0;
  for (let index = 0; index < count && checked < 4; index += 1) {
    const cell = cells.nth(index);
    const cellBox = await box(cell);
    // Visible to the right of the sticky identifying block only.
    if (
      cellBox.x < gridBox.x + 320 ||
      cellBox.x + cellBox.width > gridBox.x + gridBox.width - 20
    )
      continue;
    const column = await cell
      .locator('[role="gridcell"]')
      .getAttribute("data-col");
    const header = page.locator(
      `.process-header[data-column-index="${column}"]`,
    );
    await expect(header).toBeVisible();
    const headerBox = await box(header);
    expect(Math.abs(headerBox.x - cellBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(headerBox.width - cellBox.width)).toBeLessThanOrEqual(1);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}

test("220 × 2,000+ flows mount only a window with sticky, aligned headers and identity", async ({
  page,
}) => {
  const { grid, problems } = await openLargeComparison(page);
  // AC1: the full workload is addressable, but only a window is in the DOM.
  const rows = Number(await grid.getAttribute("aria-rowcount"));
  const columns = Number(await grid.getAttribute("aria-colcount")) - 1;
  expect(rows).toBeGreaterThanOrEqual(2000);
  expect(columns).toBeGreaterThanOrEqual(200);
  const mountedRows = await grid.locator('[role="row"]').count();
  const mountedCells = await grid.locator('[role="gridcell"]').count();
  test.info().annotations.push({
    type: "workload",
    description: `${rows} rows × ${columns} process columns; mounted ${mountedRows} rows, ${mountedCells} cells`,
  });
  expect(mountedRows).toBeLessThanOrEqual(40);
  expect(mountedCells).toBeLessThan(800);
  expect(await page.locator(".process-header").count()).toBeLessThan(30);

  // AC3: a bounded sticky block shows all seven fields in order.
  const corner = page.locator(".comparison-corner .identity-fields > span");
  await expect(corner).toHaveText(FIELDS);
  const gridBox = await box(grid);
  const firstHeader = grid.locator('[role="rowheader"]').first();
  const leading = await box(firstHeader);
  expect(leading.width).toBeLessThanOrEqual(gridBox.width * 0.45);
  const fields = firstHeader.locator("span");
  await expect(fields).toHaveCount(7);
  for (let index = 0; index < 7; index += 1) {
    await expect(fields.nth(index)).toBeVisible();
    expect((await box(fields.nth(index))).width).toBeGreaterThan(8);
  }

  // AC2: horizontal and vertical scrolling keep headers aligned and pinned.
  await expectAligned(page, grid);
  const stripTop = (await box(page.locator(".process-headers"))).y;
  await grid.evaluate((element) => {
    element.scrollLeft = 6000;
    element.scrollTop = 40000;
  });
  await expect(
    grid.locator('[role="gridcell"][data-state]').first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".process-header-scroller")
        .evaluate((element) => element.scrollLeft),
    )
    .toBe(await grid.evaluate((element) => element.scrollLeft));
  expect((await box(page.locator(".process-headers"))).y).toBe(stripTop);
  expect((await box(grid.locator('[role="rowheader"]').first())).x).toBeCloseTo(
    gridBox.x,
    0,
  );
  await expectAligned(page, grid);
  expect(await grid.locator('[role="row"]').count()).toBeLessThanOrEqual(40);

  // AC4: mixed rows are taller; stripes follow the row index; no jumps.
  await expect
    .poll(async () =>
      grid
        .locator('[role="row"]')
        .evaluateAll((list) =>
          list.some(
            (row) => parseFloat((row as HTMLElement).style.height) > 52,
          ),
        ),
    )
    .toBe(true);
  const stripes = await grid
    .locator('[role="row"]')
    .evaluateAll((list) =>
      list.map((row) => [
        Number(row.getAttribute("aria-rowindex")),
        getComputedStyle(row).backgroundColor,
      ]),
    );
  for (const [index, color] of stripes)
    expect(color).toBe(
      Number(index) % 2 === 1 ? "rgb(255, 255, 255)" : "rgb(244, 247, 245)",
    );
  await page.waitForTimeout(300);
  const settled = await grid.evaluate((element) => element.scrollTop);
  const firstRow = await grid
    .locator('[role="row"]')
    .first()
    .getAttribute("aria-rowindex");
  await page.waitForTimeout(1000);
  expect(await grid.evaluate((element) => element.scrollTop)).toBe(settled);
  expect(
    await grid.locator('[role="row"]').first().getAttribute("aria-rowindex"),
  ).toBe(firstRow);
  expect(problems).toEqual([]);
});

test("sidebar collapse and resizing keep minimum widths and alignment; the keyboard reaches far cells", async ({
  page,
}) => {
  const { grid, problems } = await openLargeComparison(page);
  const strip = page.locator(".process-header-scroller");
  const width = async () =>
    Number(await strip.getAttribute("data-column-width"));
  expect(await width()).toBeGreaterThanOrEqual(120);
  const before = (await box(grid)).width;

  // AC5: collapsing the processes sidebar widens the grid, not the columns
  // beyond their bounds; a narrow viewport keeps the Flows minimum.
  await page.getByRole("button", { name: "Collapse processes" }).click();
  await expect
    .poll(async () => (await box(grid)).width)
    .toBeGreaterThan(before);
  expect(await width()).toBeGreaterThanOrEqual(120);
  await expectAligned(page, grid);
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect.poll(width).toBe(120);
  await expect(
    grid.locator('[role="gridcell"][data-state]').first(),
  ).toBeVisible();
  await expectAligned(page, grid);

  // AC6: one tab stop; arrows and Ctrl+End move focus to mounted cells.
  await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
  await grid.locator('[tabindex="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("data-row", "1");
  await expect(focused).toHaveAttribute("data-col", "0");
  await expect(focused).toHaveAttribute("role", "gridcell");
  await page.keyboard.press("Control+End");
  const rows = Number(await grid.getAttribute("aria-rowcount"));
  const columns = Number(await grid.getAttribute("aria-colcount")) - 1;
  await expect(focused).toHaveAttribute("data-row", String(rows - 1));
  await expect(focused).toHaveAttribute("data-col", String(columns - 1));
  await expect(focused).toBeInViewport();
  await expect(grid.locator('[tabindex="0"]')).toHaveCount(1);
  await expect(
    grid.locator('[role="gridcell"][data-state]').last(),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(focused).toHaveAttribute("role", "rowheader");
  await expect(focused).toBeInViewport();
  await page.keyboard.press("PageUp");
  await expect(focused).toHaveAttribute("role", "rowheader");
  expect(Number(await focused.getAttribute("data-row"))).toBeLessThan(rows - 1);
  expect(problems).toEqual([]);
});
