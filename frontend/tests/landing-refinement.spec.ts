import { test, expect } from "@playwright/test";

test("hardware switches reuse the scene through pointer, scroll and rapid selection", async ({ page }) => {
  test.setTimeout(75000);
  // Exercise the live WebGL path on CI's software GPU as well as real devices.
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 0x9246) return "WebGL test device";
      return original.call(this, parameter);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".hardware-ready")).toBeVisible({ timeout: 30000 });
  const original = await page.locator(".hero-hardware-canvas canvas").elementHandle();
  await expect(page.locator(".hardware-previews button")).toHaveCount(16);
  const images = await page.locator(".hardware-previews img").evaluateAll((elements) => elements.map((element) => (element as HTMLImageElement).src));
  expect(new Set(images).size).toBe(16);
  await page.mouse.move(100, 330);
  await page.mouse.move(1240, 500, { steps: 18 });
  await page.mouse.wheel(0, 170);
  await page.waitForTimeout(500);
  for (const name of ["A100", "B200", "H100", "A100", "B200"]) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(page.locator(".hero-hardware-canvas")).toHaveAttribute("aria-label", /NVIDIA B200 Blackwell/);
  await expect(page.locator(".hero-hardware-canvas canvas")).toHaveCSS("opacity", "1");
  expect(await original!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.locator(".hero-hardware-canvas canvas")).toHaveCount(1);
  await expect(page.locator(".hardware-fallback")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("landing theme persists, retains readable prices and works on narrow screens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-silicon-theme", "dark");
  const typography = await page.locator("h1").evaluate((el) => ({ family: getComputedStyle(el).fontFamily, weight: getComputedStyle(el).fontWeight }));
  expect(typography.family).toContain("Space Grotesk");
  expect(typography.weight).toBe("448");
  await expect.poll(async () => page.locator(".preview-market strong").first().evaluate((el) => {
    const [r, g, b] = getComputedStyle(el).color.match(/\d+/g)!.map(Number);
    return Math.min(r, g, b);
  })).toBeGreaterThan(180);
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 780 });
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-silicon-theme", "light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".section-label, .stage-hint, .hero-availability, .stage-heading, .step-index")).toHaveCount(0);
});

test("hardware retains usable image previews when WebGL is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.locator(".hardware-fallback")).toBeVisible();
  await page.getByRole("button", { name: "B200", exact: true }).click();
  await expect(page.locator(".hardware-poster")).toHaveAttribute("aria-label", /B200/);
  await expect.poll(async () => page.locator(".hardware-poster img.active").evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});
