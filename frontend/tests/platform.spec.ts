import { test, expect } from "@playwright/test";
import type { Snapshot } from "../src/api";

test("public landing, interactive hardware and wallet picker", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Trade the cost of compute." }),
  ).toBeVisible();
  await page.locator(".dream-hardware-grid").scrollIntoViewIfNeeded();
  await expect(page.locator('.silicon-scene[data-kind="gpu"]')).toBeVisible({
    timeout: 20000,
  });
  await page
    .locator(".dream-gpu-list")
    .getByRole("button", { name: "A100", exact: true })
    .click();
  await expect(page.locator('.silicon-scene[data-kind="gpu"]')).toHaveAttribute(
    "aria-label",
    /A100/,
  );
  await page.getByRole("link", { name: "Open terminal" }).first().click();
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Select your wallet", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("MetaMask", { exact: true })).toBeVisible();
  await expect(page.getByText("Phantom", { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("market selection, source details, filters and honest history", async ({
  page,
}) => {
  const initialMarkets = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/v1/markets" && response.ok(),
  );
  await page.goto("/terminal");
  const snapshot = (await (await initialMarkets).json()) as Snapshot;
  const included = (
    snapshot.markets.find((market) => market.id === "h100-sxm")?.providers ?? []
  ).filter((provider) => provider.included);
  expect(included.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await expect(page.locator(".asset-card")).toHaveCount(16);
  await page.getByRole("button", { name: "Select B200", exact: true }).click();
  await expect(page.locator(".benchmark h2")).toContainText("B200");
  await page.getByRole("button", { name: "B200 source information" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "not a tradable benchmark",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Select H100", exact: true }).click();
  await page.getByRole("button", { name: "Index only", exact: true }).click();
  await expect(page.locator(".providers tbody tr")).toHaveCount(included.length);
  await page.getByRole("textbox", { name: "Search providers" }).fill("Lambda");
  await expect(page.locator(".providers tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "6h", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "6h", exact: true }),
  ).toHaveClass("active");
});

test("payout sizing, capped returns, put direction and persistent alert", async ({
  page,
}) => {
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await expect(page.getByRole("dialog", { name: "Terminal introduction" })).toHaveCount(0);
  await page.getByLabel("Premium", { exact: true }).fill("20");
  await expect(page.getByLabel("Premium", { exact: true })).toHaveValue("20");
  await expect(page.locator(".ticket-values")).toContainText("100.00");
  await page.getByRole("button", { name: "Fall Put" }).click();
  await expect(page.locator(".ticket-note")).toHaveText(
    "You expect GPU rental prices to fall.",
  );
  await expect(page.locator(".simulation-result")).toContainText("40.00");
  await page.getByRole("button", { name: "Set alert", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Alert rental price" })
    .fill("100");
  await page.getByRole("button", { name: "Save price alert" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.reload();
  await page.getByRole("button", { name: "Price alerts", exact: true }).click();
  await expect(page.locator(".saved-alerts")).toContainText("$100.000");
  await page.getByRole("button", { name: "Remove alert" }).click();
  await expect(page.locator(".saved-alerts")).toBeEmpty();
});

test("all product routes and mobile layout", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "true"));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/terminal",
    "/terminal/contracts",
    "/terminal/strategies",
    "/terminal/activity",
    "/terminal/leaderboard",
    "/docs",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("domcontentloaded");
    if (path.startsWith("/terminal")) {
      await expect(page.locator(".terminal-status")).toBeVisible();
      await expect(page.locator(".terminal-placeholder")).toHaveCount(0);
    }
    await expect(page.locator("h1").first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      path,
    ).toBe(false);
  }
  await page.goto("/terminal");
  await expect(page.locator(".benchmark")).toBeVisible();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .locator(".terminal-nav")
    .getByRole("link", { name: "Leaderboard" })
    .click();
  await page.getByRole("button", { name: "1 month", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "1 month", exact: true }),
  ).toHaveClass("active");
  await expect(page.getByText("A clean slate.", { exact: true })).toBeVisible();
});
