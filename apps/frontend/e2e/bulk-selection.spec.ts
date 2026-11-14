import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Filter-scoped bulk selection and tri-state parents (#19) through the
 * composed default mock catalog. Cross-page branches, cancellation and
 * failures are component-level evidence (src/services/mock/bulk-selection.test.tsx).
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

test("bulk branch and all-match actions append in order and respect the filter", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
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
  const root = tree.locator('[role="treeitem"][aria-level="1"]').first();
  const heading = page.getByRole("button", { name: /^Selected processes \(/ });
  const items = page
    .getByRole("list", { name: "Selected processes" })
    .getByRole("listitem");

  for (const row of [
    root,
    node("transport systems, 3 processes"),
    node("road, 3 processes"),
    node("operations, 3 processes"),
  ]) {
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }
  const gamma = node("Synthetic road service Gamma — CH");
  await gamma.click();
  await expect(root).toHaveAttribute("aria-checked", "mixed");

  // Space on the release root selects the rest, alphabetically, after Gamma.
  await root.focus();
  await page.keyboard.press("Space");
  await expect(heading).toHaveText("Selected processes (3)");
  await expect(root).toHaveAttribute("aria-checked", "true");
  await expect(root).toBeFocused();
  await expect(items).toHaveText([
    /^1\.Synthetic road service Gamma — CH/,
    /^2\.Synthetic road service Alpha — CH/,
    /^3\.Synthetic road service Beta — DE/,
  ]);
  await node("Synthetic road service Alpha — CH").click();
  await expect(root).toHaveAttribute("aria-checked", "mixed");
  await expect(node("operations, 3 processes")).toHaveAttribute(
    "aria-checked",
    "mixed",
  );
  await expect(node("infrastructure, 1 process")).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Filtered: deselecting all matches keeps the hidden Beta selection.
  await page.getByRole("textbox", { name: "Process Name" }).fill("gamma");
  await expect(gamma).toBeVisible();
  await expect(root).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Deselect all matches" }).click();
  await expect(heading).toHaveText("Selected processes (1)");
  await expect(root).toHaveAttribute("aria-checked", "false");
  await page
    .getByRole("button", { name: "Select all matches", exact: true })
    .click();
  await expect(heading).toHaveText("Selected processes (2)");
  await expect(
    page.getByText("Selected 1 process in all matches."),
  ).toBeVisible();

  // Clearing changes the actionable scope, not the selection.
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(root).toHaveAttribute("aria-checked", "mixed");
  await expect(items).toHaveText([
    /^1\.Synthetic road service Beta — DE/,
    /^2\.Synthetic road service Gamma — CH/,
  ]);
  expect(problems).toEqual([]);
});
