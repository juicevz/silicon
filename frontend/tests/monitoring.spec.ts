import { test, expect } from "@playwright/test";

const at = new Date().toISOString();
const receipt = `0x${"a".repeat(64)}`;
const baseline = `0x${"b".repeat(64)}`;
const provider = { id: "lambda", provider: "Lambda", price: 5, instance: "H100 SXM", region: null, scope: "instance", source_url: "https://lambda.ai", updated_at: at, included: true };
const market = { id: "h100-sxm", name: "H100", architecture: "Hopper", memory: "80 GB", color: "orange", price: 5, index: 100, baseline: 5, source_updated_at: at, collected_at: at, history_since: at, stale: false, coverage: 5, quote_count: 5, required_providers: 5, status: "benchmark", changes: {}, history: [], providers: [provider] };

async function fixtures(page: import("@playwright/test").Page) {
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "true"));
  await page.route("**/api/v1/stream", route => route.abort());
  await page.route("**/api/v1/markets", route => route.fulfill({ json: { markets: [market], network: { connected: true, chain_id: 4663 }, server_time: at, collection_interval: 180, trading_enabled: false } }));
  await page.route("**/api/v1/movers", route => route.fulfill({ json: { generated_at: at, window_hours: 24, markets: [
    { market: "h100-sxm", name: "H100", price: 5, change_pct: 25, coverage: 5, required_providers: 5, status: "ready", source_time: at, baseline_time: new Date(Date.now() - 86400000).toISOString(), receipt_hash: receipt, baseline_receipt_hash: baseline, provider_moves: [{ provider: "Lambda", instance: "H100 SXM", region: null, previous: 4, current: 5, change_pct: 25, source_url: "https://lambda.ai" }] },
    { market: "b200", name: "B200", price: 8, change_pct: null, coverage: 3, required_providers: 3, status: "insufficient_history", source_time: at, provider_moves: [] },
    { market: "a100", name: "A100", price: 2, change_pct: null, coverage: 2, required_providers: 3, status: "stale", source_time: at, provider_moves: [] },
  ] } }));
}

test("daily movers expose receipt evidence and missing data on desktop and mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await fixtures(page);
  await page.goto("/terminal");
  const panel = page.getByRole("region", { name: "GPU price movers" });
  await expect(panel).toContainText("+25.00%");
  await expect(panel).toContainText("Need 24h history");
  await expect(panel).toContainText("Withheld / stale");
  await panel.locator("summary").first().click();
  await expect(panel.getByRole("link", { name: "Latest receipt" })).toHaveAttribute("href", `/api/v1/receipts/${receipt}`);
  await expect(panel.getByRole("link", { name: "Baseline receipt" })).toHaveAttribute("href", `/api/v1/receipts/${baseline}`);
  await expect(panel).toContainText("$4.0000 → $5.0000");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: "../artifacts/monitoring-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("server alerts persist after reload, allow all three rules and delete cleanly", async ({ page }) => {
  await fixtures(page);
  await page.goto("/terminal?alerts=1");
  const dialog = page.getByRole("dialog", { name: "H100 · background alerts" });
  await expect(dialog.getByRole("heading", { name: "Watching · 0/20" })).toBeVisible();
  await dialog.getByLabel("Alert rental price").fill("900");
  await dialog.getByRole("button", { name: "Save background alert" }).click();
  await expect(dialog.getByRole("heading", { name: "Watching · 1/20" })).toBeVisible();
  await dialog.getByLabel("Alert type").selectOption("provider");
  await dialog.getByRole("button", { name: "Save background alert" }).click();
  await dialog.getByLabel("Alert type").selectOption("recovery");
  await dialog.getByRole("button", { name: "Save background alert" }).click();
  await expect(dialog.getByRole("heading", { name: "Watching · 3/20" })).toBeVisible();
  await page.reload();
  await expect(dialog.locator(".server-alert-rules")).toContainText("$900.0000/hr");
  await expect(dialog.locator(".server-alert-rules")).toContainText("Provider price change");
  await expect(dialog.locator(".server-alert-rules")).toContainText("Benchmark recovery");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "../artifacts/alerts-mobile.png", fullPage: true });
  for (let i = 3; i > 0; i--) {
    await dialog.getByRole("button", { name: /Remove background alert/ }).first().click();
    await expect(dialog.getByRole("heading", { name: `Watching · ${i - 1}/20` })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/alerts=1/);
});

test("legacy browser alerts migrate explicitly and retain holder browser limits", async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("monitoring:migration-seeded")) {
      localStorage.setItem("silicon:alerts", JSON.stringify([{ id: "legacy", market: "h100-sxm", price: 800, direction: "above", triggered: false }]));
      localStorage.setItem("monitoring:migration-seeded", "yes");
    }
  });
  await page.goto("/terminal?alerts=1");
  const dialog = page.getByRole("dialog");
  await dialog.locator(".legacy-alerts summary").click();
  await dialog.getByRole("button", { name: "Move to server" }).click();
  await expect(dialog.locator(".server-alert-rules")).toContainText("$800.0000/hr");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("silicon:alerts") ?? "[]"))).toEqual([]);
  await dialog.getByLabel("Alert monitoring").selectOption("browser");
  await dialog.getByLabel("Alert rental price").fill("850");
  await dialog.getByRole("button", { name: "Save browser alert" }).click();
  await expect(dialog.locator(".legacy-alerts summary")).toContainText("1/20");
});

test("an alert API failure shows retry and never claims a saved rule", async ({ page }) => {
  await fixtures(page);
  await page.route("**/api/v1/alerts", route => route.fulfill({ status: 503, json: { detail: "Monitoring temporarily unavailable" } }));
  await page.goto("/terminal?alerts=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Monitoring temporarily unavailable");
  await expect(dialog.getByRole("button", { name: "Save background alert" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Retry/ })).toBeVisible();
});

test("push controls require opt-in and disable the server subscription", async ({ page }) => {
  await fixtures(page);
  const calls: string[] = [];
  let enabled = false;
  await page.route("**/api/v1/alerts", route => route.fulfill({ json: { rules: [], events: [], limit: 20, push_enabled: enabled, push_available: true, vapid_public_key: "BHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg" } }));
  await page.route("**/api/v1/alerts/push", route => { calls.push("enable"); enabled = true; return route.fulfill({ json: { ok: true } }); });
  await page.route("**/api/v1/alerts/push/subscription", route => { calls.push("disable"); enabled = false; return route.fulfill({ json: { ok: true } }); });
  await page.addInitScript(() => {
    const subscription = { toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/mock", keys: { p256dh: "mock", auth: "mock" } }), unsubscribe: async () => true };
    const registration = { pushManager: { getSubscription: async () => null, subscribe: async () => subscription } };
    Object.defineProperty(navigator, "serviceWorker", { value: { register: async () => registration, ready: Promise.resolve(registration), getRegistration: async () => registration } });
    Object.defineProperty(window, "PushManager", { value: function PushManager() {} });
    Object.defineProperty(window, "Notification", { value: { requestPermission: async () => "granted" } });
  });
  await page.goto("/terminal?alerts=1");
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Enable notifications", exact: true }).click();
  await expect(page.getByRole("button", { name: "Disable notifications", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable notifications", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable notifications", exact: true })).toBeVisible();
  expect(calls).toEqual(["enable", "disable"]);
});
