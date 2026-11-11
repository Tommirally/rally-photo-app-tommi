import { expect, test, type Page } from "@playwright/test";

const EVENT = "/events/demo-forest-stages-2026";

async function cards(page: Page) {
  return page.getByTestId("photo-card").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.cars ?? ""));
}

test("searching 32 shows only car 32, from both photographers, and puts it in the URL", async ({ page }) => {
  await page.goto(EVENT);
  await page.getByRole("searchbox").fill("32");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\?car=32$/);
  expect(await cards(page)).toEqual(["32", "32", "32", "32"]);
  const credits = await page.getByTestId("photo-credit").allTextContents();
  expect(new Set(credits.map((c) => c.trim()))).toEqual(
    new Set(["📷 © Fern Hollow Photography (demo)", "📷 © Gravel Line Images (demo)"]),
  );
  await expect(page.getByTestId("results-count")).toHaveText("4 photos from 2 photographers");
});

for (const [car, count] of [["032", 2], ["320", 1]] as const) {
  test(`a shared link for ${car} shows only that car`, async ({ page }) => {
    await page.goto(`${EVENT}?car=${car}`);
    const c = await cards(page);
    expect(c).toHaveLength(count);
    expect(c.every((x) => x.split(",").includes(car))).toBe(true);
  });
}

test("partial numbers do not match", async ({ page }) => {
  for (const q of ["3", "03", "20"]) {
    await page.goto(`${EVENT}?car=${q}`);
    await expect(page.getByTestId("no-results")).toBeVisible();
    expect(await cards(page)).toHaveLength(0);
  }
});

test("tapping a number chip filters the gallery", async ({ page }) => {
  await page.goto(EVENT);
  await page.getByRole("navigation", { name: /numbers/ }).getByRole("link", { name: "032", exact: true }).click();
  await expect(page).toHaveURL(/\?car=032$/);
  expect(await cards(page)).toEqual(["032", "032"]);
});

test("search box is large enough to tap and the page never scrolls sideways", async ({ page }) => {
  await page.goto(`${EVENT}?car=32`);
  const box = await page.getByRole("searchbox").boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("Demo data", { exact: false }).first()).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("search still works", async ({ page }) => {
    await page.goto(EVENT);
    await page.getByRole("searchbox").fill("32");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/\?car=32$/);
    expect(await cards(page)).toHaveLength(4);
  });
});

test("photographer area is closed when sign-in is not configured", async ({ page, request }) => {
  await page.goto("/photographer");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Sign-in is not configured")).toBeVisible();
  const res = await request.post("/api/photographer/events/00000000-0000-4000-8000-000000000000/batches", { data: { files: [] } });
  expect(res.status()).toBe(503);
});

test("admin area is closed when sign-in is not configured", async ({ page }) => {
  for (const path of ["/admin", "/admin/events/new", "/admin/events/00000000-0000-4000-8000-000000000000"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/not-allowed$/);
    await expect(page.getByText("isn’t configured")).toBeVisible();
  }
});
