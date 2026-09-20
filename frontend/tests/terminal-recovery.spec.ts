import { test, expect } from "@playwright/test";
import { previewPosition } from "../src/preview";

test("a funded quote stops being executable when its deadline passes", async ({ page }) => {
  await page.route("**/api/v1/quote", route => route.fulfill({ json: {
    ...previewPosition(2, 0, "call", 4, 100),
    indicative: false,
    deadline: Math.floor(Date.now() / 1000) + 4,
    expiry: Math.floor(Date.now() / 1000) + 3600,
  } }));
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await expect(page.locator(".ticket .mini-label")).toHaveText("FUNDED QUOTE");
  await expect(page.locator(".ticket .mini-label")).toHaveText("CALCULATOR", { timeout: 8000 });
  await expect(page.locator(".calculator-disclaimer")).toContainText("not an executable quote");
});

test("a failed quote refresh removes the previous funded quote", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/v1/quote", route => {
    requests++;
    return requests === 1
      ? route.fulfill({ json: {
        ...previewPosition(2, 0, "call", 4, 100), indicative: false,
        deadline: Math.floor(Date.now() / 1000) + 60,
      } })
      : route.fulfill({ status: 503, json: { detail: "Quotes temporarily unavailable" } });
  });
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await expect(page.locator(".ticket .mini-label")).toHaveText("FUNDED QUOTE");
  await expect(page.locator(".ticket .inline-error")).toHaveText("Quotes temporarily unavailable", { timeout: 20000 });
  await expect(page.locator(".ticket .mini-label")).toHaveText("CALCULATOR");
});

test("provider comparison preserves the actual H100 reference listing", async ({ page }) => {
  await page.route("**/api/v1/stream", route => route.abort());
  await page.route("**/api/v1/markets", async route => {
    const response = await route.fetch();
    const data = await response.json();
    const market = data.markets.find((m: { id: string }) => m.id === "h100-sxm");
    const reference = { ...market.providers.find((p: { included: boolean }) => p.included),
      id: "lambda", provider: "Lambda", included: true, price: 4 };
    market.providers = [reference, { ...reference, included: false, price: 1, instance: "comparison-only" }];
    await route.fulfill({ response, json: data });
  });
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await page.locator(".chart-view-switch").getByRole("button", { name: "Providers", exact: true }).click();
  await expect(page.locator(".provider-price-bar")).toContainText("$4.000");
  await expect(page.locator(".provider-price-bar i")).toHaveAttribute("data-included", "true");
});

test("open contract details follow refreshed collateral and funding availability", async ({ page }) => {
  await page.clock.install();
  let funded = false;
  await page.route("**/api/v1/protocol", route => route.fulfill({ json: {
    verified: true, funding_enabled: funded, index_synced: true,
    status: "funding", checked_at: new Date().toISOString(), activity: [],
    contracts: [{
      address: "0x1111111111111111111111111111111111111111", asset: "h100-sxm",
      phase: "funding", open_at: 1791000000, expiry: 1791003600,
      base_price: 3, current_index: 100, call_premium: "2", put_premium: "2",
      funded: funded ? "20" : "0", reserved: "0", available: funded ? "20" : "0",
      total_shares: funded ? "20" : "0", final_index: 0,
      settled: false, cancelled: false, paused: false, position_count: 0,
    }],
  } }));
  await page.goto("/terminal/contracts");
  await expect(page.locator(".contract-entry").first()).toContainText("funding");
  await page.getByRole("button", { name: "Open H100 contract details" }).click();
  await page.getByRole("tab", { name: "Backing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Funding unavailable" })).toBeDisabled();
  funded = true;
  await page.clock.fastForward(31000);
  await expect(page.getByRole("button", { name: "Provide USDG" })).toBeEnabled();
  await expect(page.locator(".live-contract .contract-facts")).toContainText("20.00 USDG");
});
