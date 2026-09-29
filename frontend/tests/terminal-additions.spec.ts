import { test, expect, type Page } from "@playwright/test";
import { previewPosition } from "../src/preview";

// Synthetic fixtures are used only in browser tests, never in production views.
const address = `0x${"1".repeat(40)}`;
const latestHash = `0x${"a".repeat(64)}`, olderHash = `0x${"b".repeat(64)}`;
const timestamp = new Date().toISOString();
const provider = { id: "lambda", provider: "Lambda", price: 4, region: "us", instance: "H100 SXM", scope: "instance", source_url: "https://example.test", updated_at: timestamp, included: true };
const market = { id: "h100-sxm", name: "H100", architecture: "Hopper", memory: "80 GB", color: "#ff9b68", price: 4, index: 100, baseline: 4, source_updated_at: timestamp, collected_at: timestamp, history_since: timestamp, stale: false, coverage: 5, quote_count: 5, required_providers: 5, status: "benchmark", changes: {}, history: [], providers: [provider] };
const series = { address, asset: "h100-sxm", phase: "settled", open_at: 1, expiry: 1000000000, base_price: 4, current_index: 100, call_premium: "2", put_premium: "2", quote_valid_until: 0, observation_time: 0, funded: "65", reserved: "15", available: "50", total_shares: "75", final_index: 103, settled: true, cancelled: false, paused: false, position_count: 1 };
const protocol = { address, verified: true, funding_enabled: false, funded: "65", reserved: "15", available: "50", status: "settled", token_configured: false, contracts: [series], activity: [], checked_at: timestamp, index_synced: true, indexed_block: 100 };

async function fixtures(page: Page) {
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "true"));
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/stream") return route.abort();
    const payloads: Record<string, unknown> = {
      "/config": { chain_id: 4663, privy_app_id: "", market_address: address, vault_round_addresses: [address], usdg_address: `0x${"2".repeat(40)}`, token_address: null, explorer_url: "https://example.test", trading_enabled: false, fee_bps: 100 },
      "/markets": { markets: [market, { ...market, id: "b200", name: "B200", architecture: "Blackwell", status: "tracking", required_providers: 3 }], network: { connected: true, chain_id: 4663, block: 100 }, server_time: timestamp, collection_interval: 180, trading_enabled: false },
      "/protocol": protocol,
      "/quote": previewPosition(2, 0, "call", 4, 100),
      "/vaults": [protocol],
      "/strategies": { evidence: ["h100-sxm", "b200"].map(id => ({ market: id, observations: 12, distinct_prices: 1, history_hours: 24, latest_at: timestamp, latest_price: "4", fresh: true })), spread_live: false, spread_reason: "Comparison reference only." },
      "/strategies/paper": { records: [], settled_count: 0, realized_profit: "0" },
      [`/vaults/${address}/accounting`]: { address, verified: true, index_synced: true, indexed_block: 100, checked_at: timestamp, phase: "settled", assets: "65", reserved: "15", available: "50", deposits: "100", withdrawals: "25", premiums_and_fees: "20", buyer_payments: "30", reconciled: true, final_provider_result: "-25", withdrawal_status: "Withdrawals open", notes: ["Premiums and fees stay in this round."] },
      "/receipts": { receipts: [{ hash: latestHash, receipt: { price: "4", index: "100", source_updated_at: timestamp, constituents: [provider] } }, { hash: olderHash, receipt: { price: "3", index: "75", source_updated_at: "2026-09-01T00:00:00Z", constituents: [{ ...provider, price: 3, updated_at: "2026-09-01T00:00:00Z" }] } }] },
    };
    if (path.startsWith("/history/")) return route.fulfill({ json: { points: [], range: "24h" } });
    if (path.endsWith("/context")) {
      const comparison = path.includes("b200");
      return route.fulfill({ json: { market: comparison ? "b200" : "h100-sxm", mode: comparison ? "comparison" : "benchmark", ready: false, contract_verified: !comparison, reasons: [comparison ? "This GPU is a comparison reference. It has no live trading contract." : "Live execution is not enabled."], source_fresh: true, source_updated_at: timestamp, contracts: comparison ? [] : [series], methodology: "Median of eligible provider listings.", exclusions: ["Spot and reserved offers"] } });
    }
    return route.fulfill({ status: path in payloads ? 200 : 404, json: payloads[path] ?? { detail: "No fixture" } });
  });
}

test("market details supplement the chart and distinguish comparison assets", async ({ page }) => {
  await fixtures(page);
  await page.goto("/terminal");
  await expect(page.locator(".benchmark")).toBeVisible();
  await expect(page.locator(".ticket")).toBeVisible();
  const details = page.getByRole("button", { name: "Market details", exact: true });
  await details.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Live execution is not enabled.");
  await expect(dialog).toContainText("50.0000 USDG");
  await page.keyboard.press("Escape");
  await expect(details).toBeFocused();
  await page.goto("/terminal?asset=b200");
  await details.click();
  await expect(dialog).toContainText("Comparison only");
  await expect(dialog.getByRole("link", { name: "Build a paper strategy" })).toHaveAttribute("href", "/terminal/strategies?tool=spread");
  await expect(dialog).not.toContainText("Available backing");
});

test("archived observations preserve their original providers on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixtures(page);
  await page.goto("/terminal");
  await page.getByRole("button", { name: /Sources & history/ }).click();
  await page.getByLabel("Observation time").selectOption(olderHash);
  await expect(page.locator(".observation-providers")).toContainText("$3.0000/hr");
  await expect(page.getByRole("link", { name: /Open archived receipt/ })).toHaveAttribute("href", `/api/v1/receipts/${olderHash}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test("vault accounting shows the actual round loss and preserves existing controls", async ({ page }) => {
  await fixtures(page);
  await page.goto("/terminal/strategies?tool=vault");
  await page.locator(".round-accounting summary").click();
  const accounting = page.locator(".round-accounting");
  await expect(accounting).toContainText("Reserved for buyers");
  await expect(accounting).toContainText("15.0000 USDG");
  await expect(accounting.locator(".insight-result")).toContainText("-25.0000 USDG");
  await expect(page.locator(".live-contract .contract-facts")).toContainText("Maximum payout per unit");
  await expect(page.getByLabel("Assumed buyer payouts", { exact: true })).toBeVisible();
});

test("a timed-out paper save reuses its request ID and keeps the written thesis", async ({ page }) => {
  await fixtures(page);
  const requests: Record<string, unknown>[] = [];
  let record: Record<string, unknown> | null = null;
  await page.route("**/api/v1/strategies/paper", route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { records: record ? [record] : [], settled_count: 0, realized_profit: "0" } });
    const body = route.request().postDataJSON(); requests.push(body);
    if (requests.length === 1) return route.abort();
    record = { ...body, id: "test-paper-record", created_at: timestamp, expiry: "2026-10-15T00:00:00Z", cost: "2.020000", units: "1", fee_bps: 100, entry_prices: { "h100-sxm": "4" }, entry_receipts: { "h100-sxm": latestHash }, status: "open", exit_prices: {}, exit_receipts: {} };
    return route.fulfill({ status: 201, json: record });
  });
  await page.goto("/terminal/strategies?tool=trend");
  await page.getByLabel("Your thesis (optional)").fill("New H100 supply reduces rents.");
  await page.getByRole("button", { name: "Record paper strategy" }).click();
  await expect(page.locator(".strategy-controls .inline-error")).toBeVisible();
  await page.getByRole("button", { name: "Record paper strategy" }).click();
  await expect(page.locator(".paper-saved-thesis")).toHaveText("New H100 supply reduces rents.");
  expect(requests[0].request_id).toBe(requests[1].request_id);
  await page.reload();
  await expect(page.locator(".paper-saved-thesis")).toHaveText("New H100 supply reduces rents.");
});
