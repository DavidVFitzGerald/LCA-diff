import { expect, test } from "@playwright/test";

/**
 * Bundled Inter (#79): the identity labels must not depend on the fonts a
 * machine happens to have. After `document.fonts.ready` the same-origin
 * Inter face is loaded, and Chromium reports it as the font actually used
 * to render an identity label.
 */
const PASSWORD = "demo-password";

test("the bundled Inter face is loaded and renders the identity labels", async ({
  page,
  baseURL,
  browserName,
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "font") fontRequests.push(request.url());
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  const tree = page.getByRole("tree", { name: "Processes" });
  const node = (name: string) =>
    tree.getByRole("treeitem", { name, exact: true });
  for (const row of [
    tree.locator('[role="treeitem"][aria-level="1"]').first(),
    node("transport systems, 3 processes"),
    node("road, 3 processes"),
    node("operations, 3 processes"),
  ]) {
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }
  await node("Synthetic road service Alpha — CH").click();
  const label = page.locator(".comparison-corner .identity-fields > span");
  await expect(label).toHaveCount(7);

  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((face) => ({
      family: face.family.replace(/^["']|["']$/g, ""),
      status: face.status,
    }));
  });
  expect(faces).toContainEqual({ family: "Inter", status: "loaded" });
  expect(fontRequests.length).toBeGreaterThan(0);
  for (const url of fontRequests) {
    expect(new URL(url).origin).toBe(new URL(baseURL!).origin);
    expect(new URL(url).pathname).toMatch(/\.woff2$/);
  }

  if (browserName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector: ".comparison-corner .identity-fields > span",
    });
    expect(nodeIds).toHaveLength(7);
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
        nodeId,
      });
      expect(fonts.map((font) => font.familyName)).toEqual([
        expect.stringMatching(/^Inter\b/),
      ]);
      expect(fonts[0].isCustomFont).toBe(true);
    }
  }
});
