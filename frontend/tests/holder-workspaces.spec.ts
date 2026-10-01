import { expect, test, type Page } from "@playwright/test";
import { mockWallet } from "./mock-wallet";
import type { SavedWorkspace } from "../src/holders-api";

const wallet = "0x1111111111111111111111111111111111111111";
type Server = { eligible: boolean; saved: SavedWorkspace[]; rules: Record<string, unknown>[]; failed: boolean };
const server = (): Server => ({ eligible: true, saved: [], rules: [], failed: false });

async function fixture(page: Page, data: Server) {
  let signed = false;
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "seen"));
  await page.route("**/api/v1/config", async route => route.fulfill({ json: { ...await (await route.fetch()).json(), privy_app_id: "test-wallet" } }));
  await mockWallet(page, wallet);
  await page.route("**/api/v1/holders/**", async route => {
    const path = new URL(route.request().url()).pathname.split("/holders")[1];
    const method = route.request().method();
    const account = { address: wallet, eligible: data.eligible, verified: true, workspace_limit: 5, alert_limit: 100, reason: data.eligible ? null : "Hold more than 5,000 SILICON to save workspaces and run advanced alerts." };
    if (path === "/auth/challenge") return route.fulfill({ json: { id: "test-challenge", message: "Sign in to Silicon holder tools. This does not authorize transactions.", expires_at: Math.floor(Date.now() / 1000) + 300 } });
    if (path === "/auth/verify") { signed = true; return route.fulfill({ json: account }); }
    if (path === "/auth/logout") { signed = false; return route.fulfill({ json: { ok: true } }); }
    if (!signed) return route.fulfill({ status: 401, json: { detail: "Sign in with this wallet" } });
    if (path === "/account") return route.fulfill({ json: account });
    if (path === "/workspaces" && method === "GET") return route.fulfill({ json: data.saved });
    if (path.startsWith("/workspaces") && method === "DELETE") { data.saved = data.saved.filter(row => row.id !== path.split("/")[2]); return route.fulfill({ json: { ok: true } }); }
    if (path.startsWith("/workspaces")) {
      if (data.failed) return route.fulfill({ status: 503, json: { detail: "Storage temporarily unavailable" } });
      if (!data.eligible) return route.fulfill({ status: 403, json: { detail: "Holder access required" } });
      const body = route.request().postDataJSON();
      const id = path.split("/")[2] ?? crypto.randomUUID();
      const old = data.saved.find(row => row.id === id);
      if (old && old.revision !== body.revision) return route.fulfill({ status: 409, json: { detail: "This workspace changed on another device. Load the latest version, or save your changes as a new workspace." } });
      const row = { ...body, id, revision: body.revision + 1, updated_at: new Date().toISOString() };
      data.saved = [row, ...data.saved.filter(item => item.id !== id)]; return route.fulfill({ status: method === "POST" ? 201 : 200, json: row });
    }
    if (path === "/alerts" && method === "GET") return route.fulfill({ json: { rules: data.rules, events: [], push_enabled: false, push_available: false, limit: 100 } });
    if (path === "/alerts" && method === "POST") {
      const body = route.request().postDataJSON();
      const rule = { ...body, id: crypto.randomUUID(), created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 90 * 86400000).toISOString(), status: "watching" };
      data.rules.push(rule); return route.fulfill({ json: rule, status: 201 });
    }
    if (path.startsWith("/alerts/") && method === "DELETE") { data.rules = data.rules.filter(row => row.id !== path.split("/")[2]); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ json: { ok: true } });
  });
}

async function open(page: Page, tab = "workspaces") {
  await page.goto(`/terminal?${tab === "alerts" ? "holderAlerts" : "workspaces"}=1`);
  await page.getByRole("button", { name: "Sign in with wallet" }).click();
  await expect(page.getByText("Holder access", { exact: false }).first()).toBeVisible();
  return page.getByRole("dialog", { name: "Your holder workspace" });
}

test("wallet workspace saves and restores across devices with stale-write protection", async ({ page, browser }) => {
  const data = server(); await fixture(page, data);
  const panel = await open(page);
  await panel.getByLabel("Workspace name").fill("Hopper research");
  await panel.getByLabel("Research notes").fill("Watch H100 provider coverage before changing the thesis.");
  await panel.locator(".holder-watchlist").getByRole("button", { name: "H100", exact: true }).click();
  await panel.getByRole("button", { name: "Save workspace", exact: true }).click();
  await expect(panel.locator(".holder-saved")).toContainText("Hopper research");
  const other = await browser.newPage(); await fixture(other, data);
  const otherPanel = await open(other);
  await otherPanel.locator(".holder-saved-row").getByRole("button", { name: /^Hopper research/ }).click();
  await expect(otherPanel.getByLabel("Research notes")).toHaveValue("Watch H100 provider coverage before changing the thesis.");
  await otherPanel.getByLabel("Research notes").fill("Updated on another device");
  await otherPanel.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(otherPanel).toContainText("version 2");
  await panel.getByLabel("Research notes").fill("Older unsaved edit");
  await panel.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("changed on another device");
  await expect(panel.getByLabel("Research notes")).toHaveValue("Older unsaved edit");
  await panel.getByRole("button", { name: "Save as new" }).click();
  await expect(panel.locator(".holder-saved-row")).toHaveCount(2);
  await other.close();
});

test("holder alerts combine signals and remain manageable after eligibility loss", async ({ page }) => {
  const data = server(); await fixture(page, data);
  const panel = await open(page, "alerts");
  await panel.getByLabel("Alert name").fill("H100 down with full coverage");
  await panel.getByRole("button", { name: "Add condition" }).click();
  await expect(panel.getByLabel("Signal 2")).toHaveValue("benchmark");
  await panel.getByLabel("Alert cooldown").selectOption("15");
  await panel.getByRole("button", { name: "Save advanced alert" }).click();
  await expect(panel.locator(".holder-rules")).toContainText("H100 down with full coverage");
  expect(data.rules[0].conditions).toHaveLength(2);
  expect(data.rules[0].cooldown_minutes).toBe(15);
  data.eligible = false;
  await panel.getByRole("button", { name: "Refresh holder tools" }).click();
  await expect(panel.getByRole("button", { name: "Save advanced alert" })).toBeDisabled();
  await expect(panel).toContainText("Read access");
  await panel.getByRole("button", { name: "Remove rule H100 down with full coverage" }).click();
  await expect(panel.locator(".holder-rules article")).toHaveCount(0);
});

test("mobile holder tools preserve drafts on save failure and fit the viewport", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const data = server(); await fixture(page, data); await page.setViewportSize({ width: 390, height: 844 });
  const panel = await open(page);
  await panel.getByLabel("Workspace name").fill("Mobile research");
  await panel.getByLabel("Research notes").fill("Keep this draft if the save fails");
  data.failed = true;
  await panel.getByRole("button", { name: "Save workspace", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Storage temporarily unavailable");
  await expect(panel.getByLabel("Research notes")).toHaveValue("Keep this draft if the save fails");
  expect(data.saved).toHaveLength(0);
  data.failed = false;
  await panel.getByRole("button", { name: "Save workspace", exact: true }).click();
  await expect(panel.locator(".holder-saved-row")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../artifacts/holder-workspaces-mobile.png", fullPage: true });
  await panel.getByRole("tab", { name: "Advanced alerts", exact: true }).click();
  await panel.getByRole("button", { name: "Add condition" }).click();
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "../artifacts/holder-alerts-mobile.png", fullPage: true });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("holder workspace is discoverable without a wallet and signs out cleanly", async ({ page }) => {
  const data = server(); await fixture(page, data);
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Open holder workspaces" }).click();
  const panel = page.getByRole("dialog", { name: "Your holder workspace" });
  await expect(panel).toContainText("more than 5,000 SILICON");
  await panel.getByRole("button", { name: "Sign in with wallet" }).click();
  await expect(panel.getByLabel("Research notes")).toBeVisible();
  await panel.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Sign in with wallet" })).toBeVisible();
  await expect(panel.getByLabel("Research notes")).toHaveCount(0);
});

if (process.env.SILICON_CAPTURE_RELEASE === "1") test("capture holder workspace product previews", async ({ page }) => {
  const data = server(); await fixture(page, data);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const panel = await open(page);
  const directory = "../docs/updates/2026-10-01-holder-workspaces/media/";
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const label = document.createElement("div"); label.textContent = "product preview · example wallet and research";
    label.style.cssText = "position:fixed;bottom:12px;left:14px;z-index:1000;padding:8px 12px;background:#17211fe8;color:#bcc9c0;border:1px solid #36443f;border-radius:5px;font:11px monospace";
    document.body.appendChild(label);
  });
  await panel.getByLabel("Workspace name").fill("Hopper research");
  await panel.getByLabel("Research notes").fill("Watch H100 and H200 rental references.\nCheck which providers changed before revising the thesis.\nWait for the full H100 benchmark before using a percentage signal.");
  for (const name of ["H100", "H200", "B200"]) await panel.locator(".holder-watchlist").getByRole("button", { name, exact: true }).click();
  await panel.getByRole("button", { name: "Save workspace", exact: true }).click();
  await expect(panel.locator(".holder-saved-row")).toHaveCount(1);
  if (await page.getByRole("button", { name: "Dismiss notification" }).count()) await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.screenshot({ path: directory + "workspaces-desktop.png" });
  await panel.getByRole("tab", { name: "Advanced alerts", exact: true }).click();
  await panel.getByLabel("Alert name").fill("H100 down, full coverage");
  await panel.getByRole("button", { name: "Add condition" }).click();
  await panel.getByLabel("Alert cooldown").selectOption("60");
  await page.screenshot({ path: directory + "advanced-alerts-desktop.png" });
  await panel.getByRole("button", { name: "Save advanced alert" }).click();
  await expect(panel.locator(".holder-rules")).toContainText("H100 down, full coverage");
  if (await page.getByRole("button", { name: "Dismiss notification" }).count()) await page.getByRole("button", { name: "Dismiss notification" }).click();
  await panel.locator(".holder-intro").scrollIntoViewIfNeeded();
  await page.screenshot({ path: directory + "saved-alert-desktop.png" });
  await panel.getByRole("tab", { name: "Workspaces", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.locator(".holder-intro").scrollIntoViewIfNeeded();
  await page.screenshot({ path: directory + "workspaces-mobile.png" });
});
