import { test, expect, type Page } from "@playwright/test";

const address = `0x${"1".repeat(40)}`;
const at = new Date().toISOString();
const model = { id: "qwen/qwen3.7-flash", name: "Qwen Flash", description: "Everyday questions and code.", available: true, tools: true, input_per_million: "0.03", output_per_million: "0.13" };
const market = { id: "h100-sxm", name: "H100", architecture: "Hopper", memory: "80 GB", color: "#ff9b68", price: 4, index: 100, baseline: 4, source_updated_at: at, collected_at: at, stale: false, coverage: 5, quote_count: 5, required_providers: 5, status: "benchmark", changes: {}, history: [], providers: [] };
const draft = { kind: "trend", side: "put", days: 14, units: "3", premium_per_unit: "1.2", scenario_move_pct: -4, h100_move_pct: 0, thesis: "Additional H100 capacity softens rental prices.", assumptions: ["Premium and price change are paper assumptions."] };

async function fixture(page: Page, signedIn = true) {
  let signed = signedIn;
  const chatRequests: Record<string, unknown>[] = [];
  const paperRequests: unknown[] = [];
  const keys: { id: string; name: string; prefix: string; created_at: number; last_used_at: null; revoked: boolean }[] = [];
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "true"));
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    if (path === "/stream") return route.abort();
    if (path === "/compute/account") return route.fulfill({ status: signed ? 200 : 401, json: signed ? { address, available_usd: "0.5", used_usd: "0.0001", pending_usd: "0", request_count: chatRequests.length, access: "ready" } : { detail: "Sign in to Compute to continue." } });
    if (path === "/compute/auth/logout") { signed = false; return route.fulfill({ status: 204 }); }
    if (path === "/compute/chat") {
      const body = route.request().postDataJSON(); chatRequests.push(body);
      return route.fulfill({ json: { id: "fixture-draft", model: model.id, content: body.mode === "strategy" ? draft.thesis : "The reference comes from observed provider listings. <script>window.untrusted=true</script>", sources: body.mode === "chat" ? [] : [{ title: "H100 market reference", url: "/api/v1/markets/h100-sxm/context", observed_at: at }], draft: body.mode === "strategy" ? draft : null, cost_usd: "0.0001", accounting: "settled" } });
    }
    if (path === "/compute/keys") {
      if (method === "POST") { const key = { id: "key-1", name: route.request().postDataJSON().name, prefix: "sil_demo…abcd", created_at: Math.floor(Date.now() / 1000), last_used_at: null, revoked: false }; keys.push(key); return route.fulfill({ status: 201, json: { key: "sil_fake_browser_fixture_not_a_real_secret", info: key } }); }
      return route.fulfill({ json: keys });
    }
    if (path === "/compute/keys/key-1" && method === "DELETE") { keys[0].revoked = true; return route.fulfill({ status: 204 }); }
    if (path === "/strategies/paper") { if (method === "POST") paperRequests.push(route.request().postDataJSON()); return route.fulfill({ json: { records: [], settled_count: 0, realized_profit: "0" } }); }
    if (path.startsWith("/history/")) return route.fulfill({ json: { points: [], range: "24h" } });
    if (path.endsWith("/context")) return route.fulfill({ json: { market: "h100-sxm", mode: "benchmark", ready: false, reasons: ["Execution is paused."], source_fresh: true, source_updated_at: at, contracts: [], methodology: "Fixed basket of provider listings.", exclusions: [] } });
    const responses: Record<string, unknown> = {
      "/config": { chain_id: 4663, privy_app_id: "", usdg_address: address, market_address: "", token_address: "", explorer_url: "https://example.test", fee_bps: 100, trading_enabled: false },
      "/markets": { markets: [market, { ...market, id: "b200", name: "B200", architecture: "Blackwell", status: "tracking" }], network: { connected: true, chain_id: 4663, block: 100 }, trading_enabled: false, server_time: at, collection_interval: 180 },
      "/protocol": { address: "", verified: false, funded: "0", reserved: "0", available: "0", contracts: [], activity: [], status: "awaiting_deployment", checked_at: at },
      "/compute/models": { enabled: true, models: [model, { ...model, id: "anthropic/claude-haiku-4.5", name: "Claude Haiku", available: false }] },
      "/compute/usage": [{ id: "request-1", model: model.id, mode: "chat", status: "completed", cost_usd: "0.0001", prompt_tokens: 30, completion_tokens: 10, created_at: Math.floor(Date.now() / 1000) }, { id: "request-2", model: model.id, mode: "api", status: "pending", cost_usd: null, prompt_tokens: null, completion_tokens: null, created_at: Math.floor(Date.now() / 1000) }],
      "/strategies": { evidence: ["h100-sxm", "b200"].map(id => ({ market: id, observations: 12, history_hours: 48, distinct_prices: 2, latest_at: at, latest_price: "4", fresh: true })), spread_live: false, spread_reason: "Comparison reference only." },
      "/vaults": [],
    };
    return route.fulfill({ status: path in responses ? 200 : 404, json: responses[path] ?? { detail: "No test fixture" } });
  });
  return { chatRequests, paperRequests, keys };
}

test("Compute is a separate workspace with model chat and no internal funding copy", async ({ page }) => {
  const { chatRequests } = await fixture(page);
  await page.goto("/compute");
  await expect(page.getByRole("heading", { name: "Compute", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Compute", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByLabel("Message the assistant").fill("Explain GPU pricing");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".compute-message.assistant")).toContainText("observed provider listings");
  expect(chatRequests).toHaveLength(1);
  expect(await page.evaluate(() => "untrusted" in window)).toBe(false);
  await expect(page.locator("main")).not.toContainText(/\$0\.50|\$35|\$315|funded with|top.up/i);
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.locator(".compute-message")).toHaveCount(0);
});

test("market assistant attaches selected context and appears inside the terminal", async ({ page }) => {
  const { chatRequests } = await fixture(page);
  await page.goto("/terminal?asset=b200");
  await page.getByRole("button", { name: "Ask about B200" }).click();
  await page.getByLabel("Message the assistant").fill("What is this reference?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("link", { name: "H100 market reference" })).toBeVisible();
  expect(chatRequests[0].mode).toBe("market"); expect(chatRequests[0].market).toBe("b200");
  await page.getByRole("link", { name: "Open Compute", exact: true }).click();
  await expect(page.locator(".compute-message.user")).toContainText("What is this reference?");
  await expect(page.getByLabel("Assistant market")).toHaveValue("b200");
});

test("a strategy draft pre-fills editable paper terms without recording anything", async ({ page }) => {
  const { paperRequests } = await fixture(page);
  await page.goto("/compute?view=strategy");
  await page.getByLabel("Describe your strategy").fill("Test H100 rents falling");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".compute-draft")).toContainText("paper assumptions");
  await page.getByRole("link", { name: "Review in paper builder" }).click();
  await expect(page.getByText("Review your assistant draft", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Your thesis (optional)")).toHaveValue(draft.thesis);
  await expect(page.getByLabel("Assumed premium per unit", { exact: true })).toHaveValue("1.2");
  await expect(page.getByLabel("Strategy units", { exact: true })).toHaveValue("3");
  await page.getByLabel("Your thesis (optional)").fill("My revised thesis");
  await expect(page.getByLabel("Your thesis (optional)")).toHaveValue("My revised thesis");
  expect(paperRequests).toHaveLength(0);
});

test("private keys are one-time displays with working revocation and usage", async ({ page }) => {
  const { keys } = await fixture(page);
  await page.goto("/compute?view=api");
  await page.getByLabel("Key name").fill("Research terminal");
  await page.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(page.getByLabel("New Silicon API key")).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "I saved it" }).click();
  await expect(page.getByLabel("New Silicon API key")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke Research terminal" }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  expect(keys[0].revoked).toBe(true);
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await expect(page.locator(".compute-usage-table")).toContainText("Complete");
  await expect(page.locator(".compute-usage-table")).toContainText("Pending");
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain("sil_fake_browser");
});

test("signed-out access disables sending and reports wallet connection errors", async ({ page }) => {
  const { chatRequests } = await fixture(page, false);
  await page.goto("/compute");
  await page.getByLabel("Message the assistant").fill("Can I send?");
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  await page.getByRole("button", { name: "Sign in with wallet" }).click();
  await expect(page.locator(".compute-signin [role=alert]")).toContainText("Wallet connection is being configured");
  expect(chatRequests).toHaveLength(0);
});

test("request failures do not retry automatically or present a generated answer", async ({ page }) => {
  await fixture(page);
  let attempts = 0;
  await page.route("**/api/v1/compute/chat", route => { attempts++; return route.fulfill({ status: 502, json: { detail: "The model connection was interrupted. Check Usage before submitting again." } }); });
  await page.goto("/compute");
  await page.getByLabel("Message the assistant").fill("A request");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("alert")).toContainText("Check Usage");
  await expect(page.locator(".compute-message.assistant")).toHaveCount(0);
  expect(attempts).toBe(1);
});

test("signing out clears conversations and disables access", async ({ page }) => {
  await fixture(page);
  await page.goto("/compute");
  await page.getByLabel("Message the assistant").fill("Private session text");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.locator(".compute-message.assistant")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator(".compute-message")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in with wallet" })).toBeVisible();
});

test("mobile navigation, keyboard controls and reduced motion fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page);
  await page.goto("/compute");
  await page.getByRole("button", { name: "Strategy drafts", exact: true }).click();
  await page.getByLabel("Describe your strategy").fill("Draft an H100 put");
  await page.getByLabel("Describe your strategy").press("Enter");
  await expect(page.locator(".compute-draft")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "API access", exact: true }).click();
  await expect(page.getByLabel("Key name")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../artifacts/compute/mobile-api.png", fullPage: true });
});
