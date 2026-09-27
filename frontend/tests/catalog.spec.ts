import { test, expect } from "@playwright/test";

test("market snapshots and receipt reads stay valid under concurrent requests", async ({ request }) => {
  for (let batch = 0; batch < 4; batch++) {
    const responses = await Promise.all(Array.from({ length: 24 }, (_, i) => request.get(i % 3 === 0 ? "/api/v1/markets" : i % 3 === 1 ? "/api/v1/history/h200?range=24h" : "/api/v1/receipts?market=l40s")));
    for (let i = 0; i < responses.length; i++) {
      expect(responses[i].ok()).toBe(true);
      const body = await responses[i].json();
      if (i % 3 === 0) expect(body.markets).toHaveLength(16);
      else expect(Array.isArray(i % 3 === 1 ? body.points : body.receipts)).toBe(true);
    }
  }
});

test("expanded GPU models are searchable, selectable and keep quotes illustrative", async ({ page, request }) => {
  const snapshot = await (await request.get("/api/v1/markets")).json();
  expect(snapshot.markets).toHaveLength(16);
  for (const id of ["h200", "b300", "l40s", "l4", "rtx-5090", "rtx-4090"]) {
    const response = await request.post("/api/v1/quote", { data: { market: id, side: "call", premium: "2", move_pct: "4" } });
    expect(response.ok()).toBe(true);
    expect((await response.json()).indicative).toBe(true);
  }
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "seen"));
  await page.goto("/terminal");
  await expect(page.locator(".catalog-row")).toHaveCount(16);
  await page.getByRole("button", { name: "Blackwell", exact: true }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(4);
  await page.getByRole("button", { name: "Select RTX 5090", exact: true }).click();
  await expect(page).toHaveURL(/asset=rtx-5090/);
  await expect(page.locator(".benchmark h2")).toContainText("RTX 5090");
  await expect(page.locator(".provider-price-bar")).not.toHaveCount(0);
  await page.getByRole("button", { name: "All GPUs", exact: true }).click();
  await page.getByRole("button", { name: "Search markets", exact: true }).click();
  await page.getByRole("textbox", { name: "Search GPU markets" }).fill("L40S");
  await expect(page.locator(".catalog-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Select L40S", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".benchmark h2")).toContainText("L40S");
});

test("landing catalogue uses complete assets and stays compact on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const preview = page.locator(".terminal-preview");
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator(".preview-market")).toHaveCount(16);
  await preview.getByRole("textbox", { name: "Find a GPU in the preview" }).fill("L4");
  await preview.getByRole("button", { name: "Preview L4", exact: true }).click();
  await expect(preview.locator(".benchmark h2")).toContainText("L4");
  await expect(preview.getByRole("link", { name: "Open terminal" })).toHaveAttribute("href", "/terminal?asset=l4");
  await expect.poll(() => preview.locator(".preview-gpu-image").evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.addInitScript(() => localStorage.setItem("silicon:intro:v3", "seen"));
  await page.goto("/terminal");
  await expect(page.locator(".catalog-row")).toHaveCount(16);
  const height = await page.locator(".catalog-row").first().evaluate(element => element.getBoundingClientRect().height);
  expect(height).toBeLessThan(85);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
