import { test, expect } from "@playwright/test";

test("GPU transitions reuse the canvas through rapid selection", async ({ page }) => {
  test.setTimeout(75000);
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter: number) {
      if (parameter === 0x9246) return "WebGL test device";
      return original.call(this, parameter);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.locator(".dream-hardware-grid").scrollIntoViewIfNeeded();
  const gpu = page.locator('.silicon-scene[data-kind="gpu"]');
  await expect(gpu).toHaveAttribute("data-renderer","webgl",{ timeout:30000 });
  const original = await gpu.locator("canvas").elementHandle();
  await expect(page.locator(".dream-gpu-row")).toHaveCount(5);
  for (const name of ["A100","B200","H100","H200","B200"]) await page.getByRole("button",{name,exact:true}).click();
  await expect(gpu).toHaveAttribute("aria-label",/NVIDIA B200 Blackwell/);
  await expect(gpu.locator(".silicon-canvas")).toHaveAttribute("data-displayed","b200");
  await expect(gpu.locator("canvas")).toHaveCSS("opacity","1");
  expect(await original!.evaluate(element => element.isConnected)).toBe(true);
  await expect(gpu.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("every visit starts light and the manual dark toggle preserves the layout", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("silicon:theme", "dark"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-silicon-theme","light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content","#f0eef5");
  await page.evaluate(() => document.fonts.ready);
  const hero = await page.locator(".dream-intro").boundingBox();
  await page.getByRole("button",{name:"Switch to dark mode"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-silicon-theme","dark");
  await expect(page.locator(".dreamlike")).toHaveCSS("background-color","rgb(19, 28, 32)");
  await expect(page.locator(".dream-environment-dark")).toHaveCSS("opacity","1");
  expect(await page.locator(".dream-intro").boundingBox()).toEqual(hero);
  const typography = await page.locator("h1").evaluate(el => ({family:getComputedStyle(el).fontFamily,weight:getComputedStyle(el).fontWeight}));
  expect(typography.family).toContain("Space Grotesk"); expect(typography.weight).toBe("450");
  await page.reload();
  await expect(page.getByRole("button",{name:"Switch to dark mode"})).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-silicon-theme","light");
  await page.getByRole("button",{name:"About",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.keyboard.press("Escape");
  await page.setViewportSize({width:320,height:780});
  await page.getByRole("button",{name:"Switch to dark mode"}).click();
  await page.getByRole("button",{name:"Switch to light mode"}).click();
  await expect(page.locator(".dreamlike")).toHaveCSS("background-color","rgb(240, 238, 245)");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".landing-header")).toHaveCSS("background-color","rgba(0, 0, 0, 0)");
});

test("all five models and the pause control remain usable without WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this,args);
    } as typeof original;
  });
  await page.goto("/");
  const objects = page.locator('.silicon-scene[data-kind="objects"]');
  await expect(objects).toHaveAttribute("data-renderer","poster");
  await expect(objects.locator(".silicon-objects-light")).toHaveCSS("opacity","1");
  await page.getByRole("button",{name:"Pause motion",exact:true}).click();
  const before = await objects.locator(".silicon-scene-poster").getAttribute("style");
  await page.waitForTimeout(200);
  expect(await objects.locator(".silicon-scene-poster").getAttribute("style")).toBe(before);
  await page.getByRole("button",{name:"Resume motion",exact:true}).click();
  for (const name of ["H200","B200","A100","L40S","H100"]) {
    await page.getByRole("button",{name,exact:true}).click();
    await expect(page.locator(".hardware-callout-name")).toHaveText(name);
    await expect.poll(async () => page.locator('.silicon-scene[data-kind="gpu"] img.active').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(page.getByRole("button",{name:"Reduced motion",exact:true})).toBeDisabled();
  await expect(page.locator(".dream-gpu-marker")).toHaveCSS("transition-duration","0s");
});
