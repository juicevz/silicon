import { test, expect, type Page } from "@playwright/test";

async function openTicket(page: Page) {
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v2", "1"));
  await page.route("**/api/v1/quote", (route) => route.abort());
  await page.goto("/terminal");
  await expect(page.locator(".payoff-facts")).toBeVisible();
}

async function pointAt(page: Page, move: number) {
  const chart = page.locator(".payoff-chart");
  await chart.scrollIntoViewIfNeeded();
  const point = await chart.evaluate((element, move) => {
    const svg = element as SVGSVGElement;
    const vertices = svg.querySelector<SVGPolylineElement>(".payoff-curve")!.points;
    const start = vertices.getItem(0).x;
    const end = vertices.getItem(vertices.numberOfItems - 1).x;
    const rect = svg.getBoundingClientRect();
    return { x: rect.x + start + (end - start) * (move + 15) / 30, y: rect.y + 100 };
  }, move);
  await page.mouse.move(point.x, point.y);
}

test("call and put details follow the selected scenario immediately", async ({ page }) => {
  await openTicket(page);
  const facts = page.locator(".payoff-facts");
  await expect(facts).toContainText("+2.02%");
  await expect(facts).toContainText("−2.02");
  await expect(facts).toContainText("+7.98");
  const readout = page.locator(".payoff-value-label");
  const initialPosition = await readout.getAttribute("transform");
  for (const [move, payout, net] of [[-15, "0.00", "-2.02"], [4, "4.00", "+1.98"], [15, "10.00", "+7.98"]] as const) {
    await pointAt(page, move);
    await expect(page.locator("#settlement-move")).toHaveValue(String(move));
    await expect(readout).toContainText(payout);
    await expect(page.locator(".payoff-net-detail")).toContainText(net);
    await expect(page.locator(".simulation-result")).toContainText(payout);
    await expect(readout).toHaveAttribute("transform", initialPosition!);
  }
  await page.getByRole("button", { name: "Fall Put" }).click();
  await expect(facts).toContainText("-2.02%");
  await expect(page.locator(".payoff-cap-label")).toContainText("-10%");
  for (const [move, payout] of [[-15, "10.00"], [-4, "4.00"], [15, "0.00"]] as const) {
    await pointAt(page, move);
    await expect(readout).toContainText(payout);
    await expect(page.locator(".simulation-result")).toContainText(payout);
  }
  expect(await readout.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.locator("#premium").fill("20");
  await expect(facts).toContainText("−20.20");
  await expect(facts).toContainText("+79.80");
  await expect(page.locator(".payoff-cap-label")).toContainText("100.00");
});

test("plot labels stay legible and within the ticket on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTicket(page);
  for (const width of [375, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => page.locator(".payoff-chart").evaluate(el => Math.abs((el as SVGSVGElement).viewBox.baseVal.width - el.getBoundingClientRect().width))).toBeLessThan(1);
    const layout = await page.locator(".payoff-chart").evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const labels = Array.from(el.querySelectorAll("text")).map(label => ({
        font: parseFloat(getComputedStyle(label).fontSize),
        left: label.getBoundingClientRect().left - bounds.left,
        right: label.getBoundingClientRect().right - bounds.right,
      }));
      return { height: bounds.height, labels, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.height).toBe(222);
    expect(layout.overflow).toBe(false);
    for (const label of layout.labels) {
      expect(label.font).toBeGreaterThanOrEqual(9);
      expect(label.left).toBeGreaterThanOrEqual(-1);
      expect(label.right).toBeLessThanOrEqual(1);
    }
  }
});

test("landing details and keyboard input work in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Reference price change", exact: true });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => document.documentElement.setAttribute("data-silicon-theme", theme), theme);
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    await page.keyboard.press("End");
    await expect(page.locator(".payoff-net-detail")).toContainText("+79.80");
    await expect(page.locator(".payoff-value-label")).toContainText("100.00");
    await page.keyboard.press("Home");
    await expect(page.locator(".payoff-net-detail")).toContainText("-20.20");
    await expect(page.locator(".payoff-net-detail strong")).toHaveAttribute("data-positive", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});
