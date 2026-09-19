import { test, expect } from "@playwright/test";
import type { Snapshot } from "../src/api";

test("dragged values stay current and stationary on every sampled frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".hardware-callout-price")).toContainText("$");
  await page.evaluate(() => document.fonts.ready);
  const slider = page.getByRole("slider", { name: "Reference price change", exact: true });
  await slider.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const slider = document.querySelector<HTMLInputElement>("#landing-scenario")!;
    const output = slider.closest(".smooth-range")!.querySelector<HTMLElement>(".number-visual")!;
    const errors: string[] = [];
    const track = slider.closest(".smooth-range")!;
    const initialY = output.getBoundingClientRect().y - track.getBoundingClientRect().y;
    let frames = 0;
    const sample = () => {
      const value = Number(slider.value);
      const expected = `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
      if (output.textContent !== expected) errors.push(`Delayed value: ${output.textContent} vs ${expected}`);
      if (Math.abs(output.getBoundingClientRect().y - track.getBoundingClientRect().y - initialY) > 1) errors.push("Digits moved vertically");
      if (output.parentElement!.getAnimations({ subtree: true }).length) errors.push("Digits animated during input");
      frames++;
      (window as unknown as { inputSamples: object }).inputSamples = { errors, frames };
      if (frames < 150) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const rect = (await slider.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  for (const fraction of [.08, .92, .2, .7, .35, .8]) {
    await page.mouse.move(rect.x + rect.width * fraction, rect.y + rect.height / 2, { steps: 9 });
  }
  await page.mouse.up();
  const samples = await page.evaluate(() => (window as unknown as { inputSamples: { errors: string[]; frames: number } }).inputSamples);
  expect(samples.frames).toBeGreaterThan(15);
  expect(samples.errors).toEqual([]);
  await slider.focus();
  await page.keyboard.press("End");
  await expect(page.locator(".range-value")).toHaveText("+15.0%");
  await expect(page.locator(".landing-results .animated-number")).toHaveText("100.00");
  await page.keyboard.press("Home");
  await expect(page.locator(".range-value")).toHaveText("-15.0%");
  await expect(page.locator(".landing-results .animated-number")).toHaveText("0.00");
  await expect(slider).toHaveCSS("outline-style", "none");
});

test("the selected model follows streamed provider rates without mixing models", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/v1/markets")).json() as Snapshot;
  const market = snapshot.markets.find(({ id }) => id === "rtx-pro-6000")!;
  const quote = market.providers[0];
  market.stale = false;
  market.price = .5; // The callout's average must not silently use the median.
  market.providers = [
    { ...quote, id: "one", price: 1, included: true },
    { ...quote, id: "one", price: 1, included: true },
    { ...quote, id: "two", price: 3, included: true },
    { ...quote, id: "excluded", price: 200, included: false },
  ];
  await page.route("**/api/v1/markets", (route) => route.fulfill({ json: snapshot }));
  await page.addInitScript(() => {
    class Stream {
      static OPEN = 1;
      readyState = 1;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror = null;
      emit = (event: Event) => this.onmessage?.(new MessageEvent("message", { data: JSON.stringify((event as CustomEvent).detail) }));
      constructor() { window.addEventListener("test:snapshot", this.emit); }
      close() { window.removeEventListener("test:snapshot", this.emit); }
    }
    window.EventSource = Stream as unknown as typeof EventSource;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "RTX PRO 6000", exact: true }).click();
  await expect(page.locator(".hardware-callout")).toHaveAttribute("data-model", "rtx-pro-6000");
  await expect(page.locator(".hardware-callout-release")).toHaveText("Released 2025");
  await expect(page.locator(".hardware-callout-price")).toHaveText("$2.00 / GPU·hr");
  market.providers[2].price = 5;
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("test:snapshot", { detail })), snapshot);
  await expect(page.locator(".hardware-callout-price")).toHaveText("$3.00 / GPU·hr");
  await page.getByRole("button", { name: "H100", exact: true }).click();
  await expect(page.locator(".hardware-callout")).toHaveAttribute("data-model", "h100");
  await expect(page.locator(".hardware-callout-release")).toHaveText("Released 2022");
  market.providers = [];
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("test:snapshot", { detail })), snapshot);
  await page.getByRole("button", { name: "RTX PRO 6000", exact: true }).click();
  await expect(page.locator(".hardware-callout-price")).toHaveText("Unavailable");
});

test("callouts remain readable on mobile in both themes and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  for (const name of ["RTX PRO 6000", "B200", "L4"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".hardware-callout-name")).toHaveText(name);
    const rect = (await page.locator(".hardware-callout-copy").boundingBox())!;
    const previews = (await page.locator(".hardware-previews").boundingBox())!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(320);
    expect(rect.y + rect.height).toBeLessThan(previews.y);
    expect(await page.locator(".hardware-callout-copy").evaluate((el) => el.getAnimations().length)).toBe(0);
  }
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator(".hardware-callout-name")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
