import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Reactive process search (#17) through the composed default mock catalog.
 * Debounce races, retries and large filtered paging are component-level
 * evidence (src/services/mock/process-search.test.tsx).
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

test("search filters the tree, keeps selections and clears back to the full tree", async ({
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
  const storageBefore = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }));
  const tree = page.getByRole("tree", { name: "Processes" });
  const rows = tree.getByRole("treeitem");
  const name = page.getByRole("textbox", { name: "Process Name" });
  const gamma = tree.getByRole("treeitem", {
    name: "Synthetic road service Gamma — CH",
  });
  const root = tree.locator('[role="treeitem"][aria-level="1"]').first();
  await expect(root).toHaveAttribute("aria-expanded", "false");

  await name.click();
  await page.keyboard.type("  GAMMA ");
  await expect(gamma).toBeVisible();
  await expect(name).toBeFocused();
  await expect(rows).toHaveCount(5);
  for (const level of ["1", "2", "3", "4"]) {
    const branch = tree.locator(`[role="treeitem"][aria-level="${level}"]`);
    await expect(branch).toHaveAttribute("aria-expanded", "true");
    await expect(branch).toHaveAccessibleName(/, 1 process$/);
  }
  await expect(tree.getByRole("treeitem", { name: /Alpha|Beta/ })).toHaveCount(
    0,
  );
  await gamma.click();
  await expect(gamma).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Advanced search" }).click();
  await name.fill("road service");
  await page.getByRole("textbox", { name: "Geography" }).fill("de");
  const beta = tree.getByRole("treeitem", {
    name: "Synthetic road service Beta — DE",
  });
  await expect(beta).toBeVisible();
  await expect(beta).toHaveAttribute("aria-level", "6");
  await expect(gamma).toHaveCount(0);

  // The search controls stay inside the process sidebar in every browser.
  const sidebar = await page
    .getByRole("complementary", { name: "Process selection" })
    .boundingBox();
  for (const control of [
    name,
    page.getByRole("button", { name: "Clear search" }),
    page.getByRole("textbox", { name: "Geography" }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(sidebar!.x);
    expect(box.x + box.width).toBeLessThanOrEqual(sidebar!.x + sidebar!.width);
  }
  await page.getByRole("textbox", { name: "Geography" }).fill("zzz");
  await expect(page.getByText("No processes match your search.")).toBeVisible();

  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(name).toHaveValue("");
  await expect(name).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Geography" })).toHaveValue(
    "",
  );
  await expect(page.getByText("No processes match your search.")).toHaveCount(
    0,
  );
  await expect(root).toHaveAttribute("aria-expanded", "false");
  await expect(rows).toHaveCount(1);
  const selected = page.getByRole("list", { name: "Selected processes" });
  await expect(selected.getByRole("listitem")).toHaveText([
    /^1\.Synthetic road service Gamma — CH/,
  ]);
  const storageAfter = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }));
  expect(storageAfter).toEqual(storageBefore);
  expect(problems).toEqual([]);
});
