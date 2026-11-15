import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * F4 gate (#26 AC2): the core Flows comparison in the PR smoke suite, in the
 * default synthetic catalog through the composed mock: exact signed, zero and
 * absent labels, the comparability and cell warnings, a keyboard column
 * reorder and a header × removal with Selected-list parity. The full journey
 * and the large scenario are in flows-composition, flows-grid and
 * column-operations specs (docs/engineering/f4-verification.md).
 */
const PASSWORD = "demo-password";
const NAME = "Synthetic road service";

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

test("@smoke F4 core Flows comparison: exact cells, warnings, keyboard reorder and header ×", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();

  const tree = page.getByRole("tree", { name: "Processes" });
  const node = (name: string) =>
    tree.getByRole("treeitem", { name, exact: true });
  for (const row of [
    tree.locator('[role="treeitem"][aria-level="1"]').first(),
    node("transport systems, 3 processes"),
    node("road, 3 processes"),
    node("operations, 3 processes"),
    node("infrastructure, 1 process"),
  ]) {
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }
  for (const name of ["Alpha — CH", "Gamma — CH", "Beta — DE"])
    await node(`${NAME} ${name}`).click();

  // The Flows tabpanel is located by ID, not by role and name: in
  // Playwright 1.65.1's Firefox build a named role query on it crashes the
  // content process (#75; upstream microsoft/playwright#43967; revert in
  // #85). Its role and accessible name are still asserted here.
  const flows = page.locator("#panel-flows");
  await expect(flows).toBeVisible();
  await expect(flows).toHaveRole("tabpanel");
  await expect(flows).toHaveAccessibleName("Flows");
  const grid = page.getByRole("grid", { name: "Flows comparison" });
  const cell = (row: number, column: number) =>
    grid.locator(`[data-row="${row}"][data-col="${column}"]`);
  const headers = flows
    .getByRole("list", { name: "Process columns" })
    .getByRole("group");
  const header = (name: string) =>
    headers.and(page.getByRole("group", { name: `${NAME} ${name}` }));
  /** Header order and Selected-list order are the same list. */
  const order = async (expected: string[]) => {
    const names = expected.map((name) => `${NAME} ${name}`);
    await expect
      .poll(() =>
        headers.evaluateAll((groups) =>
          groups.map(
            (group) => group.querySelector(".process-header-name")!.textContent,
          ),
        ),
      )
      .toEqual(names);
    await expect(
      page
        .getByRole("list", { name: "Selected processes" })
        .getByRole("listitem"),
    ).toHaveText(
      names.map((name, index) => new RegExp(`^${index + 1}\\.${name} — `)),
    );
  };
  const idle = async (rows: number) => {
    await expect(grid).toHaveAttribute("aria-rowcount", String(rows));
    await expect(grid).not.toHaveAttribute("aria-busy");
    await expect(grid.locator("[aria-busy], [data-pending]")).toHaveCount(0);
  };

  await idle(8);
  await order(["Alpha", "Gamma", "Beta"]);
  // Signed: Alpha's recovered-material input, exact lexeme and sign.
  const signed = cell(3, 0);
  await expect(signed).toHaveAttribute("data-state", "negative");
  await expect(signed.locator(".signed-label")).toHaveText("-80");
  await expect(signed).toHaveAccessibleName(
    `${NAME} Alpha: -80.000000000000000000000001, negative. Warning: Synthetic duplicate exchanges aggregated during ingestion.`,
  );
  // Present zero: water, labelled 0.
  const zero = cell(5, 0);
  await expect(zero).toHaveAttribute("data-state", "zero");
  await expect(zero.locator(".signed-label")).toHaveText("0");
  await expect(zero).toHaveAccessibleName(`${NAME} Alpha: 0, zero`);
  // Absent: Beta has no upper-atmosphere emission; blank, never 0.
  const absent = cell(7, 2);
  await expect(absent).toHaveAttribute("data-state", "absent");
  await expect(absent.locator(".signed-label, .signed-bar")).toHaveCount(0);
  await expect(absent).toHaveText(`${NAME} Beta: No flow`);
  // Cell warning on Beta's recovered material only, and the comparability
  // warning for different reference amounts and units.
  await expect(cell(3, 2).getByTestId("cell-warning")).toBeVisible();
  await expect(cell(3, 1).getByTestId("cell-warning")).toHaveCount(0);
  await expect(cell(3, 2)).toHaveAccessibleName(
    /^Synthetic road service Beta: 20, positive\. Warning: Unresolved reference: /,
  );
  await expect(flows.locator(".comparability-warning")).toHaveText(
    /different reference amounts and units/,
  );

  // Keyboard reorder: pick Alpha up, move it to the end, drop it.
  await header("Alpha").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("End");
  await page.keyboard.press("Space");
  await order(["Gamma", "Beta", "Alpha"]);
  await expect(header("Alpha")).toBeFocused();
  await idle(8);
  await expect(cell(3, 2)).toHaveAccessibleName(
    new RegExp(`^${NAME} Alpha: -80\\.000000000000000000000001, negative`),
  );

  // Header ×: Gamma goes everywhere, with the rows only it contributed.
  await header("Gamma").hover();
  await page
    .getByRole("button", { name: `Remove column ${NAME} Gamma — CH` })
    .click();
  await order(["Beta", "Alpha"]);
  await expect(node(`${NAME} Gamma — CH`)).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await idle(6);
  await expect(
    grid.locator(
      `[role="rowheader"][aria-label*="Process Name: ${NAME} Gamma;"]`,
    ),
  ).toHaveCount(0);
  await expect(grid.locator('[role="rowheader"]')).toHaveCount(6);
  expect(problems).toEqual([]);
});
