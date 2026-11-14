import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Process tree (#16) through the composed default mock catalog (3 processes).
 * That catalog is too small to page at 50 leaves, so continuation, latency and
 * large-DOM bounds are component-level evidence only
 * (src/services/mock/process-tree.test.tsx; D9).
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

test("the process tree expands lazily from the keyboard and clears on signout", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.goto("/");
  await signInVerified(page);
  const tree = page.getByRole("tree", { name: "Processes" });
  const level = (n: number) =>
    tree.locator(`[role="treeitem"][aria-level="${n}"]`);
  const root = level(1).first();
  await expect(root).toHaveAttribute("aria-expanded", "false");
  const storageBefore = await page.evaluate(() =>
    Object.keys(localStorage).sort(),
  );

  // Tab into the tree's single tab stop.
  await root.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(root).toBeFocused();
  await expect(root).toHaveCSS("outline-style", "solid");
  await expect(root).toHaveCSS("outline-width", "3px");
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press("ArrowRight");
  await expect(root).toHaveAttribute("aria-expanded", "true");
  await expect(root).toHaveAccessibleName(/, 3 processes$/);
  const transport = tree.getByRole("treeitem", {
    name: "transport systems, 3 processes",
  });
  await expect(transport).toHaveAttribute("aria-level", "2");
  await page.keyboard.press("ArrowDown");
  await expect(transport).toBeFocused();
  await page.keyboard.press("Enter");
  const road = tree.getByRole("treeitem", { name: "road, 3 processes" });
  await expect(road).toHaveAttribute("aria-level", "3");
  await page.keyboard.press("ArrowRight");
  await expect(road).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const operations = tree.getByRole("treeitem", {
    name: "operations, 3 processes",
  });
  await expect(operations).toHaveAttribute("aria-level", "4");
  await page.keyboard.press("ArrowRight");
  await expect(operations).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(operations).toHaveAttribute("aria-expanded", "true");

  const infrastructure = tree.getByRole("treeitem", {
    name: "infrastructure, 1 process",
  });
  const alpha = tree.getByRole("treeitem", {
    name: "Synthetic road service Alpha — CH",
  });
  const gamma = tree.getByRole("treeitem", {
    name: "Synthetic road service Gamma — CH",
  });
  for (const node of [infrastructure, alpha, gamma])
    await expect(node).toHaveAttribute("aria-level", "5");
  await expect(infrastructure).toHaveAttribute("aria-expanded", "false");
  await expect(alpha).not.toHaveAttribute("aria-expanded");
  for (const branch of [root, transport, road, operations])
    await expect(branch).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("ArrowDown");
  await expect(infrastructure).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const beta = tree.getByRole("treeitem", {
    name: "Synthetic road service Beta — DE",
  });
  await expect(beta).toHaveAttribute("aria-level", "6");
  await page.keyboard.press("ArrowRight");
  await expect(beta).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(infrastructure).toBeFocused();
  await expect(tree.locator('[role="treeitem"][tabindex="0"]')).toHaveCount(1);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  await expect(page.getByRole("tree")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "Synthetic road service",
  );
  await expect(page.locator("body")).not.toContainText("transport systems");

  await signInVerified(page);
  await expect(level(1).first()).toHaveAttribute("aria-expanded", "false");
  await expect(tree.getByRole("treeitem", { name: /^transport/ })).toHaveCount(
    0,
  );
  const storageAfter = await page.evaluate(() =>
    Object.keys(localStorage).sort(),
  );
  expect(storageAfter).toEqual(storageBefore);
  expect(problems).toEqual([]);
});
