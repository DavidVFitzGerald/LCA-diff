import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * F3 gate journey (#19 AC6): keyboard tree navigation, search, individual and
 * bulk selection, selected-list retention and signout clearing, all by keyboard
 * against the composed mock. Component suites hold the cross-page evidence.
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
async function signIn(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
}

test("@smoke F3 keyboard journey: tree, search, individual and bulk selection", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  await signIn(page);
  const tree = page.getByRole("tree", { name: "Processes" });
  const node = (name: string) =>
    tree.getByRole("treeitem", { name, exact: true });
  const root = tree.locator('[role="treeitem"][aria-level="1"]').first();
  const heading = page.getByRole("button", { name: /^Selected processes \(/ });
  const items = page
    .getByRole("list", { name: "Selected processes" })
    .getByRole("listitem");

  // Keyboard tree: expand down to the processes with arrows only.
  await root.focus();
  for (const row of [
    root,
    node("transport systems, 3 processes"),
    node("road, 3 processes"),
    node("operations, 3 processes"),
  ]) {
    await expect(row).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowRight");
  }
  await expect(node("infrastructure, 1 process")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const alpha = node("Synthetic road service Alpha — CH");
  await expect(alpha).toBeFocused();
  await page.keyboard.press("Space");
  await expect(alpha).toHaveAttribute("aria-checked", "true");
  await expect(root).toHaveAttribute("aria-checked", "mixed");

  // Search by keyboard, then bulk-select the filtered branch with Space.
  const name = page.getByRole("textbox", { name: "Process Name" });
  await name.focus();
  await page.keyboard.type("road service");
  await page.getByRole("button", { name: "Advanced search" }).press("Enter");
  await page.getByRole("textbox", { name: "Geography" }).focus();
  await page.keyboard.type("ch");
  await expect(node("Synthetic road service Beta — DE")).toHaveCount(0);
  const operations = node("operations, 2 processes");
  await expect(operations).toHaveAttribute("aria-checked", "mixed");
  await operations.focus();
  await page.keyboard.press("Space");
  await expect(heading).toHaveText("Selected processes (2)");
  await expect(operations).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Space");
  await expect(heading).toHaveText("Selected processes (0)");
  await page.keyboard.press("Space");
  await expect(heading).toHaveText("Selected processes (2)");

  // Clearing keeps the selected list; the unfiltered parent becomes mixed.
  await page.getByRole("button", { name: "Clear search" }).press("Enter");
  await expect(name).toBeFocused();
  await expect(items).toHaveText([
    /^1\.Synthetic road service Alpha — CH/,
    /^2\.Synthetic road service Gamma — CH/,
  ]);
  await expect(root).toHaveAttribute("aria-checked", "mixed");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("body")).not.toContainText(
    "Synthetic road service",
  );
  await signIn(page);
  await expect(heading).toHaveText("Selected processes (0)");
  expect(problems).toEqual([]);
});
