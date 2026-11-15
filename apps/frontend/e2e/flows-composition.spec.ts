import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * Flows composition (#24) through the composed default mock catalog: the
 * row union and its removal, service order, identifying fields, exact
 * values, cell warnings by hover and keyboard, empty-selection transitions,
 * and the readability and fixed-header layout with the sidebar open
 * (1440 × 900 and 1280 × 800, with 3 and 50 processes). Component-level
 * evidence is src/services/mock/flows-composition.test.tsx.
 */
const PASSWORD = "demo-password";
const ALPHA = "Synthetic road service Alpha";
const BETA = "Synthetic road service Beta";
const GAMMA = "Synthetic road service Gamma";
const FIELDS = [
  "Type",
  "Flow Name",
  "Location",
  "Process Name",
  "Category",
  "Subcategory",
  "Unit",
];

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

async function signIn(page: Page, path = "/") {
  await page.goto(path);
  const dialog = page.getByRole("dialog", { name: "Sign in to LCA diff" });
  await dialog.getByLabel("Email").fill("verified@example.invalid");
  await dialog.getByLabel("Password").fill(PASSWORD);
  await dialog.getByLabel("Password").press("Enter");
  await expect(
    page.getByRole("main", { name: "Comparison workspace" }),
  ).toBeFocused();
}

/** Expands the default catalog down to Beta's infrastructure branch. */
async function openTree(page: Page) {
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
  return {
    alpha: node(`${ALPHA} — CH`),
    beta: node(`${BETA} — DE`),
    gamma: node(`${GAMMA} — CH`),
  };
}

const grid = (page: Page) =>
  page.getByRole("grid", { name: "Flows comparison" });
/** Rowheader names in row order, once idle and fully loaded. */
async function rowNames(page: Page) {
  const flows = grid(page);
  await expect(flows).not.toHaveAttribute("aria-busy");
  await expect(flows.locator("[aria-busy], [data-pending]")).toHaveCount(0);
  return flows.locator('[role="row"]').evaluateAll((rows) =>
    rows
      .map((row) => ({
        index: Number(row.getAttribute("aria-rowindex")),
        name: row
          .querySelector('[role="rowheader"]')!
          .getAttribute("aria-label")!,
      }))
      .sort((a, b) => a.index - b.index)
      .map(({ name }) => {
        const type = /^Type: ([^;]+);/.exec(name)![1];
        const flow = /Flow Name: ([^;]+);/.exec(name)![1];
        const process = /Process Name: ([^;]+);/.exec(name)![1];
        const sub = /Subcategory: ([^;]+);/.exec(name)![1];
        return `${type} | ${flow} | ${process} | ${sub}`;
      }),
  );
}
const ROW = {
  alphaReference: `Reference | Synthetic transport service | ${ALPHA} | road\\operations`,
  gammaReference: `Reference | Synthetic transport service | ${GAMMA} | road\\operations`,
  betaReference: `Reference | Synthetic transport service | ${BETA} | road\\operations\\infrastructure`,
  recovered:
    "Technosphere | Synthetic recovered material | Synthetic supplier | recovered",
  alphaInput: `Technosphere | Synthetic transport service | ${ALPHA} | road\\operations`,
  water: "Ecosphere Input | Synthetic water | not specified | river",
  airLow:
    "Ecosphere Output | Synthetic trace emission | not specified | lower atmosphere",
  airHigh:
    "Ecosphere Output | Synthetic trace emission | not specified | Upper atmosphere",
};
const cell = (page: Page, row: number, column: number) =>
  grid(page).locator(`[data-row="${row}"][data-col="${column}"]`);
const box = async (locator: Locator) => (await locator.boundingBox())!;

test("Flows shows the ordered union, exact values and per-cell warnings, and follows deselection", async ({
  page,
  baseURL,
}) => {
  const problems = monitor(page, baseURL!);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const flows = page.getByRole("tabpanel", { name: "Flows" });
  const empty = flows.getByRole("heading", { name: "Compare process flows" });
  await expect(empty).toBeVisible();
  await expect(
    flows.getByText(
      "Select processes in the left sidebar to start your comparison.",
    ),
  ).toBeVisible();
  const { alpha, beta, gamma } = await openTree(page);
  await alpha.click();
  await gamma.click();
  await beta.click();

  // AC1/AC2: the represented union, in service order (Upper after lower).
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "8");
  expect(await rowNames(page)).toEqual([
    ROW.alphaReference,
    ROW.gammaReference,
    ROW.betaReference,
    ROW.recovered,
    ROW.alphaInput,
    ROW.water,
    ROW.airLow,
    ROW.airHigh,
  ]);

  // AC3: technosphere identity from the service; no ecosphere location.
  const recoveredFields = grid(page).locator(
    '[role="rowheader"][data-row="3"] > span',
  );
  await expect(recoveredFields).toHaveText([
    "Tech",
    "Synthetic recovered material",
    "CH",
    "Synthetic supplier",
    "materials",
    "recovered",
    "kg",
  ]);
  await expect(recoveredFields.first()).toHaveAttribute(
    "title",
    "Technosphere",
  );
  const waterFields = grid(page).locator(
    '[role="rowheader"][data-row="5"] > span',
  );
  await expect(waterFields.nth(2)).toHaveText("—");
  await expect(waterFields.nth(3)).toHaveText("—");

  // AC4: present zero, absence and full lexemes. Columns: Alpha, Gamma, Beta.
  for (const column of [0, 1, 2]) {
    await expect(cell(page, 5, column)).toHaveAttribute("data-state", "zero");
    await expect(cell(page, 5, column).locator(".signed-label")).toHaveText(
      "0",
    );
  }
  const absent = cell(page, 7, 2);
  await expect(absent).toHaveAttribute("data-state", "absent");
  await expect(absent.locator(".signed-label, .signed-bar")).toHaveCount(0);
  await expect(
    grid(page).locator(
      '[data-state="absent"] .signed-label, [data-state="absent"] .signed-bar',
    ),
  ).toHaveCount(0);
  const alphaRecovered = cell(page, 3, 0);
  await alphaRecovered.hover();
  const alphaTip = alphaRecovered.locator(".signed-tooltip");
  await expect(alphaTip).toHaveCSS("opacity", "1");
  await expect(alphaTip.locator(".signed-tooltip-value")).toHaveText(
    "-80.000000000000000000000001",
  );

  // AC5: the fallback warning on Beta's cell only, revealed by keyboard.
  const betaRecovered = cell(page, 3, 2);
  const gammaRecovered = cell(page, 3, 1);
  await expect(betaRecovered.getByTestId("cell-warning")).toBeVisible();
  await expect(gammaRecovered.getByTestId("cell-warning")).toHaveCount(0);
  await expect(alphaRecovered.getByTestId("cell-warning")).toBeVisible();
  await expect(grid(page).getByTestId("cell-warning")).toHaveCount(2);
  await page.mouse.move(0, 0);
  await grid(page).locator('[tabindex="0"]').focus();
  for (let step = 0; step < 3; step += 1)
    await page.keyboard.press("ArrowDown");
  for (let step = 0; step < 3; step += 1)
    await page.keyboard.press("ArrowRight");
  await expect(betaRecovered).toBeFocused();
  await expect(betaRecovered).toHaveAccessibleName(
    /^Synthetic road service Beta: 20, positive\. Warning: Unresolved reference: .*not verified.*fallback flow is used\.$/,
  );
  const betaTip = betaRecovered.locator(".signed-tooltip");
  await expect(betaTip).toHaveCSS("opacity", "1");
  await expect(betaTip).toContainText(
    "Warning: Unresolved reference: the synthetic supplier reference was not verified",
  );
  // The icon changes no geometry: Beta and Gamma both show 20.
  for (const selector of [".signed-bar", ".signed-label-text"]) {
    const warned = await box(betaRecovered.locator(selector));
    const plain = await box(gammaRecovered.locator(selector));
    expect(warned.y).toBeCloseTo(plain.y, 1);
    expect(warned.height).toBeCloseTo(plain.height, 1);
    expect(warned.width).toBeCloseTo(plain.width, 1);
  }
  await expect(betaRecovered.locator(".signed-label")).toHaveText("20");
  await expect(
    grid(page).locator('[role="rowheader"][data-row="3"]'),
  ).not.toHaveAccessibleName(/warning/i);

  // AC1: deselecting Gamma in the tree removes its reference row and the
  // input only it contributes; the other selections and order stay.
  await gamma.click();
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "6");
  expect(await rowNames(page)).toEqual([
    ROW.alphaReference,
    ROW.betaReference,
    ROW.recovered,
    ROW.water,
    ROW.airLow,
    ROW.airHigh,
  ]);
  const columns = flows.getByRole("list", { name: "Process columns" });
  await expect(columns.getByRole("group")).toHaveCount(2);
  for (const [index, name] of [ALPHA, BETA].entries())
    await expect(columns.getByRole("group").nth(index)).toHaveAccessibleName(
      name,
    );

  // AC6/AC8: N → 0 through the Selected list, then 0 → 1.
  for (const name of [`${BETA} — DE`, `${ALPHA} — CH`])
    await page
      .getByRole("button", { name: `Remove ${name} from selection` })
      .click();
  await expect(empty).toBeVisible();
  await expect(grid(page)).toHaveCount(0);
  await expect(flows.getByText(/Updating the comparison/)).toHaveCount(0);
  await beta.click();
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "4");
  expect(await rowNames(page)).toEqual([
    ROW.betaReference,
    ROW.recovered,
    ROW.water,
    ROW.airLow,
  ]);
  await expect(flows.locator(".comparison-grid-status")).toHaveText("");
  expect(problems).toEqual([]);
});

/** AC7 (a)–(c): labels and Type values legible; block and columns bounded. */
async function expectReadable(page: Page) {
  const labels = page.locator(".comparison-corner .identity-fields > span");
  await expect(labels).toHaveText(FIELDS);
  for (const label of await labels.all()) {
    const { scroll, client } = await label.evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
    }));
    expect(scroll, (await label.textContent()) ?? "").toBeLessThanOrEqual(
      client,
    );
  }
  const types = grid(page).locator(
    '[role="rowheader"]:not([aria-busy]) > span:first-child',
  );
  expect(await types.count()).toBeGreaterThan(0);
  for (const type of await types.all()) {
    const state = await type.evaluate((element) => ({
      scroll: element.scrollWidth,
      client: element.clientWidth,
      title: element.getAttribute("title"),
      name: element.parentElement!.getAttribute("aria-label"),
    }));
    expect(state.scroll).toBeLessThanOrEqual(state.client);
    expect(state.name).toContain(`Type: ${state.title};`);
    expect([
      "Reference",
      "Technosphere",
      "Ecosphere Input",
      "Ecosphere Output",
    ]).toContain(state.title);
  }
  const gridBox = await box(grid(page));
  const block = await box(grid(page).locator('[role="rowheader"]').first());
  expect(block.width).toBeLessThanOrEqual(Math.max(410, gridBox.width * 0.4));
  await expect(
    grid(page).locator('[role="rowheader"]').first().locator("> span"),
  ).toHaveCount(7);
  expect(
    Number(
      await page
        .locator(".process-header-scroller")
        .getAttribute("data-column-width"),
    ),
  ).toBeGreaterThanOrEqual(120);
}
/** AC7 (d): the page itself never scrolls vertically. */
async function expectNoPageScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({
    scroll: document.scrollingElement!.scrollHeight,
    inner: window.innerHeight,
  }));
  expect(scroll).toBeLessThanOrEqual(inner);
}

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
] as const) {
  test(`identity block is readable and headers stay fixed at ${width} × ${height} with the sidebar open`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const problems = monitor(page, baseURL!);
    await page.setViewportSize({ width, height });
    await signIn(page);
    await expect(
      page.getByRole("button", { name: "Collapse processes" }),
    ).toHaveAttribute("aria-expanded", "true");
    const { alpha, beta, gamma } = await openTree(page);
    await alpha.click();
    await gamma.click();
    await beta.click();
    await expect(grid(page)).toHaveAttribute("aria-rowcount", "8");
    await rowNames(page);
    await expectReadable(page);
    await expectNoPageScroll(page);
    expect(problems).toEqual([]);
  });

  test(`50 processes keep the page fixed and headers in place while the grid scrolls at ${width} × ${height}`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const problems = monitor(page, baseURL!);
    await page.setViewportSize({ width, height });
    // 50 processes over 2,000+ rows: the Selected list and the sidebar
    // scroll internally; headers keep their place while the grid scrolls.
    await signIn(page, "/?mock-scenario=large");
    const search = page.getByRole("textbox", { name: "Process Name" });
    const heading = page.getByRole("button", {
      name: /^Selected processes \(/,
    });
    // Ten new generated processes each: 000010–29, then 000100–129.
    for (const [index, digits] of [
      "00001",
      "00002",
      "00010",
      "00011",
      "00012",
    ].entries()) {
      // Clear first, so the debounced search never acts on stale fields.
      const selectMatches = page.getByRole("button", {
        name: "Select all matches",
        exact: true,
      });
      await search.fill("");
      await expect(selectMatches).toHaveCount(0);
      await search.fill(`generated ${digits}`);
      await expect(selectMatches).toBeEnabled();
      await selectMatches.click();
      await expect(heading).toHaveText(
        `Selected processes (${(index + 1) * 10})`,
      );
    }
    await expect(grid(page)).toHaveAttribute("aria-colcount", "51");
    await expect(
      grid(page).locator('[role="gridcell"][data-state]').first(),
    ).toBeVisible();
    await expect(grid(page)).not.toHaveAttribute("aria-busy");
    await expectReadable(page);
    await expectNoPageScroll(page);
    const strip = page.locator(".process-headers");
    const label = page
      .locator(".comparison-corner .identity-fields > span")
      .first();
    const before = { strip: await box(strip), label: await box(label) };
    await grid(page).evaluate((element) => {
      element.scrollTop = 30000;
    });
    await expect
      .poll(() => grid(page).evaluate((element) => element.scrollTop))
      .toBeGreaterThan(1000);
    await expect(
      grid(page).locator('[role="gridcell"][data-state]').first(),
    ).toBeVisible();
    expect(await box(strip)).toEqual(before.strip);
    expect(await box(label)).toEqual(before.label);
    await expectNoPageScroll(page);
    expect(problems).toEqual([]);
  });
}
