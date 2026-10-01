import { test, expect } from "@playwright/test";
import { roundFeeBps } from "../src/benefits";
import type { Protocol } from "../src/api";
import { SILICON_TOKEN_ADDRESS, SILICON_TOKEN_EXPLORER } from "../src/token";

test("holder workspace eligibility cannot waive a legacy or unverified round fee", () => {
  const round = { verified: true, token_configured: false, contracts: [{}] } as Protocol;
  expect(roundFeeBps(true, round)).toBe(100);
  expect(roundFeeBps(true, { ...round, token_configured: true })).toBe(0);
  expect(roundFeeBps(false, { ...round, token_configured: true })).toBe(100);
  expect(roundFeeBps(true, { ...round, verified: false })).toBeNull();
  expect(roundFeeBps(true, null)).toBeNull();
});

test("official token is consistent across landing, docs, contracts and public configuration", async ({ page, request }) => {
  const config = await (await request.get("/api/v1/config")).json();
  expect(config.chain_id).toBe(4663);
  expect(config.token_address.toLowerCase()).toBe(SILICON_TOKEN_ADDRESS);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/docs#token", "/terminal/contracts"]) {
      await page.goto(path);
      const address = page.getByLabel("Silicon token contract", { exact: true });
      await address.scrollIntoViewIfNeeded();
      await expect(address).toBeVisible();
      await expect(address.locator("code")).toHaveText(SILICON_TOKEN_ADDRESS);
      await expect(address.locator("a")).toHaveAttribute("href", SILICON_TOKEN_EXPLORER);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test("token copy has useful success and clipboard-failure feedback", async ({ page }) => {
  await page.goto("/docs#token");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (value: string) => { (window as Window & { copied?: string }).copied = value; } } }));
  const address = page.getByLabel("Silicon token contract", { exact: true });
  await address.getByRole("button", { name: "Copy Silicon contract address" }).click();
  await expect(address.getByRole("status")).toHaveText("Contract address copied");
  expect(await page.evaluate(() => (window as Window & { copied?: string }).copied)).toBe(SILICON_TOKEN_ADDRESS);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Denied"); } } }));
  await address.getByRole("button", { name: "Copy Silicon contract address" }).click();
  await expect(address.getByRole("status")).toContainText("copy it manually");
});

test("guest benefits show the official token, a connect action and no invented balance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Benefits", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Your benefits" });
  await expect(panel).toContainText(SILICON_TOKEN_ADDRESS);
  await expect(panel).toContainText("Connect to check your benefits");
  await expect(panel.locator(".benefits-balance strong")).toContainText("—");
  await expect(panel.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
  await expect(panel).toContainText("strictly more than 5,000 SILICON");
  await expect(panel).not.toContainText("Holder benefits are not active yet");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("verified holder tools unlock and a changed balance removes eligibility", async ({ page }) => {
  const wallet = "0x1111111111111111111111111111111111111111";
  let eligible = true;
  // Test-only wallet adapter: no real connection, signature or transaction.
  await page.route(/\/(src\/wallet-runtime\.tsx|assets\/wallet-runtime-[^/]+\.js)(\?.*)?$/, async route => {
    // Rollup may expose this lazy entry as a named module namespace. Preserve
    // that export shape so the same adapter works on dev and production builds.
    let bundledExport = "";
    if (route.request().url().includes("/assets/")) {
      const source = await (await route.fetch()).text();
      const namespace = source.match(/\b([\w$]+)=Object\.freeze\(Object\.defineProperty\(\{__proto__:null,default:/)?.[1];
      const alias = namespace && source.match(new RegExp(`${namespace.replace(/\$/g, "\\$")} as ([\\w$]+)`))?.[1];
      expect(alias, "lazy wallet module namespace").toBeTruthy();
      bundledExport = `export const ${alias} = {default:Runtime};`;
    }
    await route.fulfill({ contentType: "text/javascript", body: `let handled = 0; export default function Runtime({request, success}) { if (request > handled) { handled = request; queueMicrotask(() => success('${wallet}', async () => ({ request: async ({method}) => method === 'eth_chainId' ? '0x1237' : ['${wallet}'] }))); } return null; } ${bundledExport}` });
  });
  const access = () => ({ address: wallet, verified: true, advanced: true, benefits_verified: true, token_configured: true, token_balance: eligible ? "5000.000000000000000001" : "5000", holder: true, workflow_benefits: eligible, fee_free: eligible, fee_bps: eligible ? 0 : 100, alert_limit: eligible ? 100 : 20, template_limit: eligible ? 50 : 10, usdg: "0", eth: "0", checked_at: new Date().toISOString() });
  await page.route(`**/api/v1/access/${wallet}`, route => route.fulfill({ json: access() }));
  await page.route(`**/api/v1/benefits/${wallet}`, route => route.fulfill({ json: { access: access(), recorded_savings: null, recorded_trades: 0, history_complete: false } }));
  await page.goto("/terminal/strategies");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await page.getByRole("button", { name: "Benefits", exact: true }).click();
  let panel = page.getByRole("dialog", { name: "Your benefits" });
  await expect(panel).toContainText("Holder benefits active");
  // The live legacy round still charges 1%, even for a qualified holder.
  await expect(panel.locator(".benefits-stats")).toContainText("1% of premium");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Compare GPUs", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("16 model allowance");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export comparison CSV" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.csv$/);
  await page.keyboard.press("Escape");
  eligible = false;
  await page.getByRole("button", { name: "Benefits", exact: true }).click();
  panel = page.getByRole("dialog", { name: "Your benefits" });
  await panel.getByRole("button", { name: "Check balance" }).click();
  await expect(panel).toContainText("Standard access");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Compare GPUs", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("2 model allowance");
  await expect(page.getByRole("button", { name: "Export comparison CSV" })).toBeDisabled();
});
