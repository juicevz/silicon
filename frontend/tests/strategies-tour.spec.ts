import { test, expect } from "@playwright/test";

test("first visit spotlights each target, contains focus and can replay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/terminal");
  const tour = page.getByRole("dialog", { name: "Terminal introduction" });
  await expect(tour).toBeVisible();
  await expect(page.locator(".tour-spotlight")).toHaveAttribute("data-tour-target", ".gpu-market-catalog");
  expect(await page.locator("#root").evaluate(e => e.inert)).toBe(true);
  expect(await tour.evaluate(e => getComputedStyle(e).backgroundImage)).toContain("gradient");
  const targets = [".benchmark", ".ticket-body", ".providers", ".strategies-shortcut"];
  for (const target of targets) {
    await tour.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator(".tour-spotlight")).toHaveAttribute("data-tour-target", target);
    await expect(tour).toBeInViewport();
    await page.waitForTimeout(420);
    const focus = await page.locator(".tour-spotlight").boundingBox();
    const card = await tour.boundingBox();
    expect(focus!.width).toBeGreaterThan(20);
    expect(focus!.height).toBeGreaterThan(20);
    expect(Math.max(0, Math.min(focus!.x + focus!.width, card!.x + card!.width) - Math.max(focus!.x, card!.x)) * Math.max(0, Math.min(focus!.y + focus!.height, card!.y + card!.height) - Math.max(focus!.y, card!.y))).toBeLessThan(1);
    await page.keyboard.press("Tab");
    expect(await tour.evaluate(e => e.contains(document.activeElement))).toBe(true);
  }
  await tour.getByRole("button", { name: "Start exploring" }).click();
  await expect(tour).toHaveCount(0);
  expect(await page.locator("#root").evaluate(e => e.inert)).toBe(false);
  await page.reload();
  await expect(page.locator(".benchmark")).toBeVisible();
  await expect(tour).toHaveCount(0);
  await page.getByRole("button", { name: "Show introduction" }).click();
  await expect(tour).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show introduction" })).toBeFocused();
  expect(errors).toEqual([]);
});

test("mobile spotlight survives resize, reduced motion and every step", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/terminal");
  const tour = page.getByRole("dialog", { name: "Terminal introduction" });
  await expect(tour).toBeVisible();
  for (let step = 0; step < 5; step++) {
    const box = await tour.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (step < 4) await tour.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.setViewportSize({ width: 720, height: 450 });
  await expect(tour).toBeInViewport();
  await tour.getByRole("button", { name: "Start exploring" }).click();
  await expect(tour).toHaveCount(0);
});

test("strategy builders have instant outcomes, honest data and immutable paper request terms", async ({ page }) => {
  await page.route("**/api/v1/strategies", route => route.fulfill({ json: { evidence: ["h100-sxm", "b200"].map(market => ({ market, observations: 12, distinct_prices: 1, history_hours: 24, latest_at: new Date().toISOString(), latest_price: "4", fresh: true })), spread_live: false, spread_reason: "B200 requires a fixed benchmark before live trading." } }));
  await page.route("**/api/v1/strategies/paper", route => route.request().method() === "GET" ? route.fulfill({ json: { records: [], settled_count: 0, realized_profit: "0" } }) : route.fulfill({ status: 201, json: {} }));
  await page.goto("/terminal/strategies");
  await expect(page.getByRole("heading", { name: "GPU strategies" })).toBeVisible();
  await expect(page.getByText("12 observations", { exact: false }).first()).toBeVisible();
  await page.getByLabel("H100 price change", { exact: true }).fill("-10");
  await expect(page.locator(".payoff-net-detail")).toContainText("7.98");
  const saved = page.waitForRequest(r => r.url().endsWith("/strategies/paper") && r.method() === "POST");
  await page.getByRole("button", { name: "Record paper strategy" }).click();
  expect((await saved).postDataJSON()).toEqual({ kind: "trend", side: "put", days: 14, units: 1, premium_per_unit: "2" });
  await page.getByRole("button", { name: /Generation spread.*Model/ }).click();
  await page.getByLabel("B200 price change", { exact: true }).fill("10");
  await page.getByLabel("H100 comparison change", { exact: true }).fill("5");
  await expect(page.locator(".spread-equation")).toContainText("5.0 percentage points");
  await expect(page.locator(".payoff-net-detail")).toContainText("2.98");
  await page.getByRole("button", { name: /Premium vault.*Earn/ }).click();
  await page.getByLabel("Assumed buyer payouts", { exact: true }).fill("1080.8");
  await expect(page.locator(".vault-return")).toContainText("−100.00".replace("−", "-"));
  await expect(page.locator(".vault-return")).toContainText("0.00 USDG");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [/Trend builder.*Turn/, /Generation spread.*Model/, /Premium vault.*Earn/]) {
    await page.getByRole("button", { name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
