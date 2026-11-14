import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Ordered process selection (#18) through the composed default mock catalog.
 * Bounded rendering for hundreds of entries is component-level evidence
 * (src/services/mock/selection.test.tsx).
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
async function signInVerified(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
}

test("selection follows user order, removes everywhere and clears on signout", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  await signInVerified(page);
  const storageBefore = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }));
  const tree = page.getByRole("tree", { name: "Processes" });
  const node = (name: string | RegExp) =>
    tree.getByRole("treeitem", { name, exact: typeof name === "string" });
  const heading = page.getByRole("button", { name: /^Selected processes \(/ });
  const list = page.getByRole("list", { name: "Selected processes" });
  await expect(heading).toHaveText("Selected processes (0)");
  await expect(page.getByText(/^No processes selected\./)).toBeVisible();

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
  const alpha = node("Synthetic road service Alpha — CH");
  const beta = node("Synthetic road service Beta — DE");
  const gamma = node("Synthetic road service Gamma — CH");
  await expect(alpha).toHaveAttribute("aria-checked", "false");

  await gamma.focus();
  await page.keyboard.press("Space");
  await expect(gamma).toHaveAttribute("aria-checked", "true");
  await expect(gamma).toBeFocused();
  await alpha.click();
  await beta.focus();
  await page.keyboard.press("Enter");
  await expect(beta).toHaveAttribute("aria-checked", "true");
  await expect(heading).toHaveText("Selected processes (3)");
  const items = list.getByRole("listitem");
  await expect(items).toHaveText([
    /^1\.Synthetic road service Gamma — CH/,
    /^2\.Synthetic road service Alpha — CH/,
    /^3\.Synthetic road service Beta — DE/,
  ]);

  // Keyboard removal: Tab from the tree past the section controls into the
  // list's single tab stop (the first entry).
  const removeAlpha = list.getByRole("button", {
    name: "Remove Synthetic road service Alpha — CH from selection",
  });
  await expect(beta).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(heading).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Clear all" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    list.getByRole("button", {
      name: "Remove Synthetic road service Gamma — CH from selection",
    }),
  ).toBeFocused();
  await expect(list.locator('button[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await expect(removeAlpha).toBeFocused();
  await expect(removeAlpha).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(alpha).toHaveAttribute("aria-checked", "false");
  await expect(
    list.getByRole("button", {
      name: "Remove Synthetic road service Beta — DE from selection",
    }),
  ).toBeFocused();
  await alpha.click();
  await expect(items).toHaveText([
    /^1\.Synthetic road service Gamma — CH/,
    /^2\.Synthetic road service Beta — DE/,
    /^3\.Synthetic road service Alpha — CH/,
  ]);

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(heading).toHaveText("Selected processes (0)");
  await expect(page.getByText(/^No processes selected\./)).toBeFocused();
  for (const row of [alpha, beta, gamma])
    await expect(row).toHaveAttribute("aria-checked", "false");

  await gamma.click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    "Synthetic road service",
  );
  await signInVerified(page);
  await expect(heading).toHaveText("Selected processes (0)");
  const storageAfter = await page.evaluate(() => ({
    local: Object.keys(localStorage).sort(),
    session: Object.keys(sessionStorage).sort(),
  }));
  expect(storageAfter).toEqual(storageBefore);
  expect(problems).toEqual([]);
});
