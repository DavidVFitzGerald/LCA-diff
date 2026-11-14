import { expect, test } from "@playwright/test";

test("@smoke required-login shell stays locked without protected data", async ({
  page,
  baseURL,
}) => {
  const runtimeErrors: string[] = [];
  const protectedRequests: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["fetch", "xhr"].includes(request.resourceType()) ||
      url.origin !== new URL(baseURL!).origin ||
      url.pathname.startsWith("/api/")
    )
      protectedRequests.push(request.url());
  });
  for (let visit = 0; visit < 2; visit += 1) {
    if (visit === 0) await page.goto("/");
    else await page.reload();
    const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(page.locator(".shell")).toHaveAttribute("inert", "");
    await expect(page.getByRole("status")).toHaveText(
      "Local demo mode — synthetic services. Auth: unauthenticated.",
    );
    const help = dialog.getByRole("button", { name: "About this demo" });
    await expect(help).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await help.click();
    await expect(
      dialog.getByText(/No live account or email delivery/),
    ).toBeVisible();
    await page.mouse.click(10, 200);
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText(/Synthetic road service|GWP 100|BAFU:2026/),
    ).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
    expect(protectedRequests).toEqual([]);
  }
});

test("@smoke narrow viewport explains the desktop requirement and recovers on resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A larger screen is required" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page.getByRole("dialog", { name: "Sign in to LCA diff" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "About this demo" }),
  ).toBeFocused();
});
