import { test, expect } from "@playwright/test";
import { previewPosition, withScenario } from "../src/preview";

test("instant scenarios preserve capped payouts, fees and direction", () => {
  const call = previewPosition(20, 15, "call", 4, 100);
  expect(call.max_payout).toBe("100.000000");
  expect(call.payout).toBe("100.000000");
  expect(call.cost).toBe("20.200000");
  expect(call.profit).toBe("79.800000");
  expect(previewPosition(20, -4, "call", 4, 100).payout).toBe("0.000000");
  const put = previewPosition(20, -4, "put", 4, 0);
  expect(put.payout).toBe("40.000000");
  expect(put.fee).toBe("0.000000");
  expect(put.breakeven).toBe("3.920000");
  expect(previewPosition(0.1, 4, "call", null, 100).breakeven).toBeNull();
  const live = {
    ...call,
    indicative: false,
    units_raw: "3000000",
    cost: "15.150000",
    max_payout: "30.000000",
  };
  expect(withScenario(live, "call", 5).payout).toBe("15.000000");
  expect(withScenario(live, "call", 20).payout).toBe("30.000000");
  expect(withScenario(live, "put", -4).profit).toBe("-3.150000");
});

test("slider values update in the next frame while quote network is delayed", async ({
  page,
}) => {
  await page.route("**/api/v1/quote", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.abort();
  });
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await expect(page.locator(".amount-slider")).toBeVisible();
  const result = await page.locator(".amount-slider").evaluate(async (el) => {
    const t = performance.now();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, "20");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise(requestAnimationFrame);
    return {
      values: document.querySelector(".ticket-values")?.textContent,
      scenario: document.querySelector(".simulation-result")?.textContent,
      ms: performance.now() - t,
    };
  });
  expect(result.values).toContain("100.00");
  expect(result.values).toContain("20.20");
  expect(result.scenario).toContain("40.00");
  const scenario = await page
    .locator("#settlement-move")
    .evaluate(async (el) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(el, "10");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(requestAnimationFrame);
      return document.querySelector(".simulation-result")?.textContent;
    });
  expect(scenario).toContain("100.00");
  console.log(
    `Slider displayed on next frame (${Math.round(result.ms)} ms), with API held for 1500 ms.`,
  );
});

test("chart scrubbing follows the pointer and keyboard without a data request", async ({
  page,
}) => {
  // Deterministic observations verify the interaction independently of a flat live rate.
  await page.route("**/api/v1/stream", (route) => route.abort());
  await page.route("**/api/v1/markets", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.markets[0].history = [1, 2, 3, 4].map((price, i) => ({
      price,
      index: price * 25,
      time: new Date(Date.now() - (3 - i) * 600000).toISOString(),
    }));
    await route.fulfill({ response, json: data });
  });
  await page.goto("/terminal");
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  const chart = page.getByRole("slider", {
    name: "Explore rental price history",
  });
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 2, box!.y + box!.height / 2);
  await expect(page.locator(".benchmark-summary > strong")).toContainText(
    "$1.000",
  );
  await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height / 2);
  await expect(page.locator(".benchmark-summary > strong")).toContainText(
    "$4.000",
  );
  await chart.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".benchmark-summary > strong")).toContainText(
    "$3.000",
  );
});

test("contract directory, details and real settlement explorer link", async ({
  page,
}) => {
  await page.goto("/terminal/contracts");
  await expect(page.locator(".contract-entry")).toHaveCount(3);
  for (const asset of ["H100", "A100", "B200"]) {
    await page
      .getByRole("button", { name: `Open ${asset} contract details` })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      `${asset} rental market`,
    );
    await page.getByRole("tab", { name: "Backing", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText(
      "No USDG deposited.",
    );
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText(
      "No contract activity yet.",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.locator(".token-contracts a")).toHaveAttribute(
    "href",
    /\/address\/0x[0-9a-fA-F]{40}$/,
  );
});

test("about menu blurs, traps focus, closes and restores focus", async ({
  page,
}) => {
  await page.goto("/");
  const about = page.getByRole("button", { name: "About", exact: true });
  await about.click();
  await expect(
    page.getByRole("dialog", { name: "Explore Silicon" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".site-menu .modal-backdrop")
      .evaluate((el) => getComputedStyle(el).backdropFilter),
  ).toContain("blur(9px)");
  const backdrop = await page
    .locator(".site-menu .modal-backdrop")
    .boundingBox();
  expect(backdrop?.height).toBe(page.viewportSize()?.height);
  expect(backdrop?.width).toBe(page.viewportSize()?.width);
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /Documentation/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(about).toBeFocused();
});

test("new intro appears once, can be reopened, and reduced motion disables inertia", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(() =>
      document.documentElement.classList.contains("lenis"),
    ),
  ).toBe(false);
  await page.goto("/terminal");
  await expect(page.getByLabel("Terminal introduction")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByLabel("Terminal introduction")).toContainText(
    "Try a position.",
  );
  await page.getByRole("button", { name: "Dismiss introduction" }).click();
  await page.reload();
  await expect(page.locator(".asset-card")).toHaveCount(16);
  await expect(page.getByLabel("Terminal introduction")).toHaveCount(0);
  await page.getByRole("button", { name: "Show introduction" }).click();
  await expect(page.getByLabel("Terminal introduction")).toBeVisible();
});

test("narrow phones keep application controls and docs inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 780 });
  for (const path of ["/", "/terminal", "/terminal/contracts", "/docs"]) {
    await page.goto(path);
    if (path.startsWith("/terminal")) {
      await expect(page.locator(".terminal-status")).toBeVisible();
      await expect(page.locator(".terminal-placeholder")).toHaveCount(0);
    }
    await expect(page.locator("h1").first()).toBeVisible({ timeout: 15000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      path,
    ).toBe(false);
    if (path === "/")
      expect(
        await page
          .locator("h1")
          .evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(false);
  }
});
