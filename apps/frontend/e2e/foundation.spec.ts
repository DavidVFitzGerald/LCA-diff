import { expect, test } from "@playwright/test";

test("@smoke explicit local demo composes services without protected data", async ({
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
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "LCA diff", level: 1 }),
    ).toBeVisible();
    // Rendering this status requires the mounted service provider and auth observer.
    await expect(page.getByRole("status")).toHaveText(
      "Local demo mode — synthetic services. Auth: unauthenticated.",
    );
    await expect(
      page.getByText(
        "Development scaffold — product journeys are not available yet.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/Synthetic road service|GWP 100|BAFU:2026/),
    ).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
    expect(protectedRequests).toEqual([]);
  }
});
