import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Shared process headers and comparability warnings (#21) through the
 * composed default mock catalog. Windowing of hundreds of columns, minimum
 * widths and invalid responses are component-level evidence
 * (src/services/mock/comparison-headers.test.tsx); the large browser
 * scenario is exercised in e2e/flows-grid.spec.ts (#23).
 */
const PASSWORD = "demo-password";

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

test("headers follow the selection and warn on different reference bases", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  const main = page.getByRole("main", { name: "Comparison workspace" });
  await expect(main).toBeFocused();
  const flows = page.getByRole("tabpanel", { name: "Flows" });
  await expect(
    flows.getByRole("heading", { name: "Compare process flows" }),
  ).toBeVisible();
  await expect(flows.getByText(/^Select processes in the left/)).toBeVisible();

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

  const columns = flows.getByRole("list", { name: "Process columns" });
  const header = (name: string) =>
    columns.getByRole("group", { name: `Synthetic road service ${name}` });
  const warning = flows.locator(".comparability-warning");
  const panel = flows.getByTestId("process-header-panel");

  await node("Synthetic road service Alpha — CH").click();
  const alpha = header("Alpha");
  await expect(alpha).toBeVisible();
  for (const text of [
    "Location",
    "CH",
    "Reference flow",
    "Amount",
    "1",
    "Unit",
    "km",
  ])
    await expect(alpha.getByText(text, { exact: true })).toBeVisible();
  await expect(
    alpha.getByText("Synthetic transport service", { exact: true }),
  ).toBeVisible();
  await expect(warning).toHaveCount(0);
  // Few columns keep the normal maximum width.
  expect((await alpha.boundingBox())!.width).toBeCloseTo(240, 0);

  // Same amount, different unit.
  await node("Synthetic road service Gamma — CH").click();
  await expect(warning).toHaveText(
    /Different reference quantities\. Selected processes have different reference units\. No normalization has been applied\./,
  );
  const why = flows.getByRole("button", { name: "Why?" });
  await why.focus();
  await expect(flows.getByRole("tooltip")).toBeVisible();
  await expect(why).toHaveAccessibleDescription(
    /may be based on different quantities or units/,
  );

  // Different exact amount too; the stored lexeme is shown unchanged.
  await node("Synthetic road service Beta — DE").click();
  await expect(warning).toContainText("different reference amounts and units.");
  await expect(columns.getByRole("group")).toHaveCount(3);
  // Columns follow selection order.
  for (const [index, name] of ["Alpha", "Gamma", "Beta"].entries())
    await expect(columns.getByRole("group").nth(index)).toHaveAccessibleName(
      `Synthetic road service ${name}`,
    );
  const beta = header("Beta");
  await expect(beta.locator("dd").nth(2)).toHaveText(
    "2.0000000000000000000000001",
  );
  await expect(beta.locator("dd").nth(2)).toHaveCSS(
    "text-overflow",
    "ellipsis",
  );

  // One tab stop; arrows move and focus reveals the full identity.
  await alpha.focus();
  await expect(panel).toContainText("Process: Synthetic road service Alpha");
  await expect(panel).toContainText(/Release: .+/);
  await page.keyboard.press("End");
  await expect(beta).toBeFocused();
  await expect(panel).toContainText(
    "Reference amount: 2.0000000000000000000000001",
  );
  await expect(beta).toHaveAccessibleDescription(
    /Location: DE; Reference flow: Synthetic transport service; Reference amount: 2\.0000000000000000000000001; Reference unit: km; Release: .+; Revision: .+; Process ID: .+/,
  );
  await page.keyboard.press("ArrowLeft");
  await expect(header("Gamma")).toBeFocused();
  // One header tab stop, plus its × (#25): one extra stop, not one per column.
  await expect(columns.locator('[role="group"][tabindex="0"]')).toHaveCount(1);
  await expect(columns.locator('button[tabindex="0"]')).toHaveCount(1);

  // Removing Gamma elsewhere updates the headers and narrows the warning.
  await page
    .getByRole("button", {
      name: "Remove Synthetic road service Gamma — CH from selection",
    })
    .click();
  await expect(columns.getByRole("group")).toHaveCount(2);
  await expect(warning).toContainText("different reference amounts.");
  await expect(alpha.getByText("1", { exact: true })).toBeVisible();

  // Tabs share the selection; Scores mounts headers in #28.
  await page.getByRole("tab", { name: "Scores" }).click();
  await page.getByRole("tab", { name: "Flows" }).click();
  await expect(columns.getByRole("group")).toHaveCount(2);

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(
    flows.getByRole("heading", { name: "Compare process flows" }),
  ).toBeVisible();
  await expect(columns).toHaveCount(0);
  expect(problems).toEqual([]);
});
