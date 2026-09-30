import assert from "node:assert/strict";
import { copyFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Run from frontend with: node scripts/render-share-preview.mjs
const source = new URL("../brand/share-preview.html", import.meta.url);
const output = fileURLToPath(new URL("../public/assets/silicon-preview-v4.png", import.meta.url));
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.goto(source.href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const rendered = await page.evaluate(() => ({
    copy: document.querySelector(".wordmark").textContent,
    logoLoaded: document.querySelector(".logo").naturalWidth > 0,
    fontLoaded: [...document.fonts].some((font) => font.family === "Space Grotesk" && font.status === "loaded"),
    readingFontLoaded: [...document.fonts].some((font) => font.family === "Inter" && font.status === "loaded"),
    artworkLoaded: [...document.images].every(image => image.complete && image.naturalWidth > 0),
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  assert.deepEqual(rendered, {
    copy: "silicon.",
    logoLoaded: true,
    fontLoaded: true,
    readingFontLoaded: true,
    artworkLoaded: true,
    width: 1200,
    height: 630,
  });
  await page.screenshot({ path: output, type: "png" });
  // Cached cards can keep requesting an older image URL after metadata changes.
  const assets = new URL("../public/assets/", import.meta.url);
  for (const name of await readdir(assets)) {
    if (!/^silicon-preview(?:-v\d+)?\.png$/.test(name)) continue;
    const legacy = fileURLToPath(new URL(name, assets));
    if (legacy !== output) await copyFile(output, legacy);
  }
  console.log(`Rendered 1200 × 630 share preview: ${output} (${(await stat(output)).size} bytes)`);
} finally {
  await browser.close();
}
