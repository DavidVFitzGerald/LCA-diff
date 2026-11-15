import { expect, test } from "@playwright/test";

test("Scores indicator selection supports keyboard, native hierarchy and workspace retention", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("tree", { name: "Indicators" })).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill("demo-password");
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
  // No process selection is required to initialize the default.
  await page.getByRole("tab", { name: "Scores" }).click();
  const tree = page.getByRole("tree", { name: "Indicators" });
  const ipcc = tree.getByRole("treeitem", { name: "IPCC 2021", exact: true });
  await expect(ipcc).toHaveAttribute("aria-checked", "true");
  await ipcc.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const gwp = tree.getByRole("treeitem", {
    name: "GWP 100 [kg CO2-eq]",
    exact: true,
  });
  await expect(gwp).toBeFocused();
  await expect(gwp).toHaveAttribute("aria-level", "2");
  await expect(ipcc.getByRole("group")).toContainText("GWP 100");
  await page.keyboard.press("Space");
  await expect(ipcc).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("End");
  const method = tree.getByRole("treeitem", {
    name: "Synthetic method",
    exact: true,
  });
  await expect(method).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const category = tree.getByRole("treeitem", {
    name: "Synthetic category",
    exact: true,
  });
  await expect(category).toBeFocused();
  await page.keyboard.press("Space");
  await expect(method).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(
    tree.getByRole("treeitem", {
      name: "A synthetic indicator [synthetic points]",
      exact: true,
    }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Collapse indicators" }).click();
  await expect(tree).not.toBeVisible();
  await page.getByRole("tab", { name: "Flows" }).click();
  await expect(
    page.getByRole("complementary", { name: "Indicator selection" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Scores" }).click();
  await page.getByRole("button", { name: "Expand indicators" }).click();
  await expect(ipcc).toHaveAttribute("aria-checked", "false");
  await expect(method).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(tree).toHaveCount(0);
  expect(errors).toEqual([]);
});
