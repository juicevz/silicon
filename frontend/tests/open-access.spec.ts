import { test, expect } from "@playwright/test";
import { csvCell, readTemplates, TEMPLATE_KEY } from "../src/workspace";
import { browserStorage } from "./browser-storage";
import { benefitsForWallet, type BenefitData } from "../src/benefits";

test("guest benefits use the current theme and make no invented savings claim", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "true"));
  for (const theme of ["dark", "light"]) {
    await page.goto("/terminal");
    await page.evaluate(value => { document.documentElement.dataset.siliconTheme = value; }, theme);
    await page.getByRole("button", { name: "Benefits", exact: true }).click();
    const panel = page.getByRole("dialog", { name: "Your benefits" });
    await expect(panel).toContainText("Silicon ownership is optional");
    await expect(panel).toContainText("1% of premium");
    await expect(panel).toContainText("Shown once configured round history is verified");
    await expect(panel.locator(".benefits-stats")).not.toContainText("0.0000 USDG");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Benefits", exact: true })).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Benefits", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Your benefits" });
  await expect(panel).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/silicon-benefits-mobile.png" });
});

test("guest strategy tools and two-model comparison work without a wallet", async ({ page }) => {
  await page.goto("/terminal/strategies");
  for (const name of ["Compute spread", "Two-way scenario", "Price ladder"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Compare GPUs", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Compare GPU references" });
  await expect(panel).toContainText("2 selected · 2 model allowance");
  const picks = panel.locator(".comparison-picker button");
  await expect(picks.nth(2)).toBeDisabled();
  await picks.nth(0).click();
  await expect(picks.nth(2)).toBeEnabled();
  await picks.nth(2).click();
  await expect(panel.locator("tbody tr")).toHaveCount(2);
  await expect(panel.getByRole("button", { name: "Export comparison CSV" })).toBeDisabled();
});

test("saving and loading a template restores terms without opening a paper position", async ({ page }) => {
  let submissions = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/strategies/paper")) submissions++; });
  await page.goto("/terminal/strategies");
  await page.getByLabel("Your thesis (optional)").fill("New GPU supply lowers rental prices");
  await page.getByRole("button", { name: "30 days", exact: true }).click();
  await page.getByLabel("Assumed premium per unit").fill("3.125");
  await page.getByRole("button", { name: "Save current template" }).click();
  await page.reload();
  await page.getByRole("button", { name: "New GPU supply lowers rental prices", exact: true }).click();
  await expect(page.getByLabel("Your thesis (optional)")).toHaveValue("New GPU supply lowers rental prices");
  await expect(page.getByLabel("Assumed premium per unit")).toHaveValue("3.125");
  await expect(page.getByRole("button", { name: "30 days", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(submissions).toBe(0);
});

test("losing eligibility preserves saved templates while restricting new additions", async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ id: String(index), name: `Saved thesis ${index}`, spread: false, side: "put", days: 14, units: 1, premium: "2", thesis: `Saved thesis ${index}` })))), TEMPLATE_KEY);
  await page.goto("/terminal/strategies");
  await expect(page.locator(".template-row")).toHaveCount(12);
  await page.getByRole("button", { name: "Saved thesis 11", exact: true }).click();
  await expect(page.getByLabel("Your thesis (optional)")).toHaveValue("Saved thesis 11");
  await page.getByRole("button", { name: "Save current template" }).click();
  await expect(page.locator(".workspace-tools [role=alert]")).toContainText("existing templates remain available");
  await expect(page.locator(".template-row")).toHaveCount(12);
});

test("CSV escapes formulas and template loading discards corrupt input", () => {
  expect(csvCell(' =HYPERLINK("https://example.com")')).toBe('"\' =HYPERLINK(""https://example.com"")"');
  expect(csvCell("H100, SXM")).toBe('"H100, SXM"');
  const restore = browserStorage();
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify([null, { units: "10000000" }, { id: "good", name: "H100", spread: false, side: "call", days: 7, units: 1, premium: "2", thesis: "" }]));
    expect(readTemplates()).toHaveLength(1);
    localStorage.setItem(TEMPLATE_KEY, "broken");
    expect(readTemplates()).toEqual([]);
  } finally { restore(); }
});

test("disconnects and wallet switches cannot reuse the previous wallet's benefits", () => {
  const address = "0x" + "a".repeat(40);
  const cached = { access: { address, verified: true, benefits_verified: true, workflow_benefits: true } } as BenefitData;
  expect(benefitsForWallet(cached, address.toUpperCase())).toBe(cached);
  expect(benefitsForWallet(cached, "0x" + "b".repeat(40))).toBeNull();
  expect(benefitsForWallet(cached, null)).toBeNull();
  expect(benefitsForWallet(null, address)).toBeNull();
});
