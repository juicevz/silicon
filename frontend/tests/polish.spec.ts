import { test, expect } from "@playwright/test";
import { hardwareTarget } from "../src/hardwareMotion";

test("hardware proximity includes a 15 percent margin on each side and accounts for scroll", () => {
  const bounds = { left: 500, top: 300, width: 400, height: 200 };
  const frame = { x: 700, y: 400, scroll: 0, pointerActive: true, reduced: false };
  for (const [x, y, axis, direction] of [[440,400,"x",-1],[960,400,"x",1],[700,270,"y",-1],[700,530,"y",1]] as const) {
    const target = hardwareTarget({ ...frame, x, y }, bounds);
    expect(target.active).toBe(true);
    expect(target[axis]).toBe(direction);
  }
  for (const [x, y] of [[439,400],[961,400],[700,269],[700,531]]) {
    expect(hardwareTarget({ ...frame, x, y }, bounds)).toEqual({x:0,y:0,active:false});
  }
  expect(hardwareTarget({...frame,y:200,scroll:200},bounds)).toEqual({x:0,y:0,active:true});
  expect(hardwareTarget({...frame,reduced:true},bounds).active).toBe(false);
  expect(hardwareTarget({...frame,pointerActive:false},bounds).active).toBe(false);
});

test("the landing and hardware poster render while configuration is still pending", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let pending = false;
  await page.route("**/api/v1/config", async (route) => {
    pending = true;
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", {name:"Trade the cost of compute."})).toBeVisible();
    await expect.poll(() => pending).toBe(true);
    await expect(page.getByText(/Opening Silicon|Loading Silicon/)).toHaveCount(0);
    await expect.poll(async () => page.locator(".hardware-poster img.active").evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByRole("link",{name:"Open terminal",exact:true}).first().click();
    await expect(page.locator(".terminal-placeholder")).toBeVisible();
    await expect(page.getByRole("button",{name:"Connect wallet",exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"Toggle navigation"}).click();
    await expect(page.locator(".terminal-nav")).toHaveClass(/open/);
    release();
    await expect(page.locator(".ticket")).toBeVisible();
    await expect(page.locator(".terminal-nav")).toHaveClass(/open/);
  } finally { release(); }
});

test("hardware follows nearby input within 100ms, rests outside it, and reveals hovered models", async ({ page }) => {
  // Deterministic no-WebGL path verifies the same interaction on low power devices.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(...args: Parameters<typeof original>) {
      if (String(args[0]).includes("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto("/");
  const poster = page.locator(".hardware-poster");
  await expect(page.locator(".hardware-ready")).toBeVisible();
  await page.mouse.move(25,150);
  await page.waitForTimeout(500);
  const rest = await poster.evaluate(el => el.style.transform);
  await page.mouse.move(400,300);
  await page.waitForTimeout(200);
  expect(await poster.evaluate(el => el.style.transform)).toBe(rest);
  const box = (await poster.boundingBox())!;
  await page.mouse.move(box.x + box.width * .77, box.y + box.height * .4);
  await page.waitForTimeout(80);
  await expect(poster).toHaveAttribute("data-pointer-active","true");
  expect(await poster.evaluate(el => el.style.transform)).not.toBe(rest);
  for (const name of ["A100","B200","H100","B200"]) {
    await page.locator(".hardware-previews").getByRole("button",{name,exact:true}).hover();
    await expect(page.locator(".hardware-previews").getByRole("button",{name,exact:true})).toHaveAttribute("aria-pressed","true");
  }
  await expect(poster.locator("img.active")).toHaveAttribute("src",/b200/);
  await expect(poster.locator("img.active")).toHaveCSS("opacity","1");
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(poster).toHaveAttribute("data-pointer-active","false");
  expect(await poster.locator("img.active").evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("landing slider, curve and capped payout remain synchronized through keyboard input", async ({ page }) => {
  await page.goto("/");
  const range = page.getByRole("slider",{name:"Reference price change",exact:true});
  await range.scrollIntoViewIfNeeded();
  await range.focus();
  await page.keyboard.press("End");
  await expect(range).toHaveValue("15");
  await expect(range).toHaveAttribute("aria-valuetext","+15.0%");
  await expect(page.locator(".landing-results [data-value]")).toHaveAttribute("data-value","100.00");
  await expect(page.locator(".landing-calculator .payoff-chart")).toHaveAttribute("aria-label",/15% reference move pays 100.00/);
  await page.keyboard.press("Home");
  await expect(page.locator(".landing-results [data-value]")).toHaveAttribute("data-value","0.00");
  await expect(page.locator(".landing-calculator .payoff-chart")).toHaveAttribute("aria-label",/-15% reference move pays 0.00/);
});

test("the landing preview uses actual markets and provider controls", async ({ page }) => {
  await page.goto("/");
  const preview = page.locator(".terminal-preview");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator(".preview-market")).toHaveCount(16);
  await preview.locator(".preview-market").filter({hasText:"B200"}).click();
  await expect(preview.locator(".benchmark h2")).toContainText("B200");
  await preview.getByRole("button",{name:"6h",exact:true}).click();
  await expect(preview.getByRole("button",{name:"6h",exact:true})).toHaveClass("active");
  await preview.getByRole("textbox",{name:"Search providers"}).fill("no matching provider");
  await expect(preview.locator(".providers .table-empty")).toHaveText("No matching provider quotes.");
  await preview.getByRole("link",{name:"Open terminal",exact:true}).click();
  await expect(page).toHaveURL(/\/terminal\?asset=b200/);
  await expect(page.locator(".ticket-asset")).toContainText("B200");
});
