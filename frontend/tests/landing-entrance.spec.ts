import { test, expect } from "@playwright/test";

test("the page stays usable while hero assets and market configuration are pending", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  for (const resource of ["**/dream-environment.webp", "**/dream-objects-poster.webp", "**/api/v1/config"]) {
    await page.route(resource, async route => { await pending; await route.abort(); });
  }
  try {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await response!.text()).not.toContain("silicon-opening");
    await expect(page.locator("#dream-title")).toBeVisible();
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await expect(page.locator("html")).not.toHaveAttribute("data-silicon-opening");
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
    const about = page.getByRole("button", { name: "About", exact: true });
    await about.focus();
    await expect(about).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("#silicon-opening")).toHaveCount(0);
  } finally { release(); }
});

test("failed assets cannot block the page", async ({ page }) => {
  await page.route("**/dream-environment.webp", route => route.abort());
  await page.route("**/dream-objects-poster.webp", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#silicon-opening")).toHaveCount(0);
  await expect(page.locator("#dream-title")).toBeVisible();
  await expect(page.locator("#root")).toHaveJSProperty("inert", false);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("assets retain their slower entrance ahead of the headline on cold and warm visits", async ({ page }) => {
  for (let visit = 0; visit < 2; visit++) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#silicon-opening")).toHaveCount(0);
    const assets = page.locator(".dream-objects");
    await expect(assets).toHaveClass(/is-visible/);
    await expect(assets).toHaveCSS("transition-duration", "1.8s, 2.4s");
    await expect(assets).toHaveCSS("transition-delay", "0s");
    await expect(page.locator("#dream-title")).toHaveCSS("transition-delay", "0.62s");
    await expect(assets).toHaveCSS("opacity", "1");
    await expect(page.locator("#dream-title")).toHaveCSS("opacity", "1");
  }
});

test("mobile reduced motion opens directly and direct app visits have no cover", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#silicon-opening")).toHaveCount(0);
  await expect(page.locator("#dream-title")).toHaveCSS("transform", "none");
  await expect(page.locator("#dream-title")).toHaveCSS("opacity", "1");
  await expect(page.locator(".landing-header")).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/compute");
  await expect(page.locator("#silicon-opening")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-silicon-opening");
  await expect(page.getByRole("heading", { name: "Compute", exact: true })).toBeVisible();
});
