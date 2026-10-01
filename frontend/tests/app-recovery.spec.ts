import { test, expect, type Page } from "@playwright/test";

async function quietTerminal(page: Page) {
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "seen"));
  await page.route("**/api/v1/stream", route => route.abort());
}

test("settlement rules opens the matching documentation section", async ({ page }) => {
  await quietTerminal(page);
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Market details", exact: true }).click();
  await page.getByRole("link", { name: "Settlement rules", exact: true }).click();
  await expect(page).toHaveURL(/\/docs#settlement$/);
  await expect(page.locator("#settlement")).toBeInViewport();
});

test("terminal trailing slashes work and unknown routes have a usable recovery link", async ({ page }) => {
  await quietTerminal(page);
  await page.goto("/terminal/");
  await expect(page.getByRole("heading", { name: "GPU markets", exact: true })).toBeVisible();
  await expect(page.locator(".ticket")).toBeVisible();
  for (const path of ["/terminal/does-not-exist", "/terminal/contracts/extra"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to markets" }).click();
    await expect(page.locator(".ticket")).toBeVisible();
  }
  await page.goto("/terminal/activity/");
  await expect(page.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
});

test("failed market requests show an error and retry restores prices", async ({ page }) => {
  await quietTerminal(page);
  await page.route("**/api/v1/markets", route => route.fulfill({ status: 503, json: { detail: "Test outage" } }));
  await page.goto("/terminal");
  await expect(page.getByRole("alert")).toContainText("Market data could not be refreshed.");
  await expect(page.getByText("Loading markets.", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/markets");
  await page.getByRole("button", { name: "Retry market data" }).click();
  await expect(page.locator(".ticket")).toBeVisible();
  await expect(page.locator(".benchmark-summary > strong")).not.toHaveText("—");
  await expect(page.getByRole("button", { name: "Retry market data" })).toHaveCount(0);
});

test("a failed contract read does not claim zero collateral or an empty activity feed", async ({ page, request }) => {
  await quietTerminal(page);
  const state = await (await request.get("/api/v1/protocol")).json();
  await page.route("**/api/v1/protocol", route => route.fulfill({ status: 503, json: { detail: "Test outage" } }));
  await page.goto("/terminal/activity");
  await expect(page.getByRole("alert")).toContainText("Contract balances and activity could not be refreshed.");
  await expect(page.locator(".terminal-status")).toContainText("Collateral — USDG");
  await expect(page.getByText("The first trade starts the feed.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Activity is unavailable.", { exact: true })).toBeVisible();
  await page.unroute("**/api/v1/protocol");
  await page.getByRole("button", { name: "Retry contract data" }).click();
  await expect(page.getByRole("button", { name: "Retry contract data" })).toHaveCount(0);
  await expect(page.locator(".terminal-status")).toContainText(`Collateral ${Number(state.funded).toFixed(2)} USDG`);
});

test("leaderboard outages can be retried without showing a false empty result", async ({ page }) => {
  await quietTerminal(page);
  let failed = true;
  await page.route("**/api/v1/leaderboard?*", route => route.fulfill({
    status: failed ? 503 : 200,
    json: failed ? { detail: "Test outage" } : { period: "7d", rows: [] },
  }));
  await page.goto("/terminal/leaderboard");
  await expect(page.getByRole("alert")).toContainText("The leaderboard could not be loaded.");
  await expect(page.getByText("A clean slate.", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Retry leaderboard" }).click();
  await expect(page.getByText("A clean slate.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry leaderboard" })).toHaveCount(0);
});

test("changing leaderboard periods never retains rows from the previous period after failure", async ({ page }) => {
  await quietTerminal(page);
  const wallet = `0x${"1".repeat(40)}`;
  await page.route("**/api/v1/leaderboard?*", route => {
    const period = new URL(route.request().url()).searchParams.get("period");
    return route.fulfill({
      status: period === "24h" ? 503 : 200,
      json: period === "24h" ? { detail: "Test outage" } : { period, rows: [{ wallet, trades: 2, wins: 1, pnl: "4.5" }] },
    });
  });
  await page.goto("/terminal/leaderboard");
  await expect(page.getByRole("cell", { name: "4.50 USDG" })).toBeVisible();
  await page.getByRole("button", { name: "24 hours", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The leaderboard could not be loaded.");
  await expect(page.getByRole("cell", { name: "4.50 USDG" })).toHaveCount(0);
  await page.getByRole("button", { name: "1 month", exact: true }).click();
  await expect(page.getByRole("cell", { name: "4.50 USDG" })).toBeVisible();
});

test("configured vaults with unavailable data do not masquerade as unfunded or undeployed", async ({ page, request }) => {
  await quietTerminal(page);
  const config = await (await request.get("/api/v1/config")).json();
  const rounds = await (await request.get("/api/v1/vaults")).json();
  expect(rounds.length).toBeGreaterThan(0);
  await page.route("**/api/v1/config", route => route.fulfill({ json: { ...config, market_address: null } }));
  await page.route("**/api/v1/protocol", route => route.fulfill({ json: { verified: false, contracts: [], activity: [], checked_at: "2026-09-30T00:00:00Z" } }));
  let failed = true;
  await page.route("**/api/v1/vaults", route => route.fulfill({ status: failed ? 503 : 200, json: failed ? { detail: "Test outage" } : rounds }));
  await page.goto("/terminal/contracts");
  await expect(page.getByRole("alert")).toContainText("The contract list could not be refreshed.");
  const h100 = page.getByRole("button", { name: "Open H100 contract details", exact: true });
  await expect(h100).toContainText("Awaiting contract data");
  await expect(h100).not.toContainText("Not funded");
  await h100.click();
  await expect(page.getByRole("dialog")).not.toContainText("No funds have been deposited");
  await page.getByRole("tab", { name: "Backing", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("Funding data is unavailable.");
  await page.keyboard.press("Escape");
  failed = false;
  await page.getByRole("button", { name: "Retry contracts" }).click();
  await expect(page.locator(".directory-heading")).toContainText("1 deployed series");
  await expect(h100).toContainText(Number(rounds[0].funded).toFixed(2));
  await expect(page.getByRole("button", { name: "Retry contracts" })).toHaveCount(0);
});

test("terminal configuration errors recover with the visible retry action", async ({ page }) => {
  await quietTerminal(page);
  await page.route("**/api/v1/config", route => route.fulfill({ status: 503, json: { detail: "Test configuration outage" } }));
  await page.goto("/terminal");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute("**/api/v1/config");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".ticket")).toBeVisible();
});
