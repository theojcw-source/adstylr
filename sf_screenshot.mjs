import { chromium } from '/Users/t.willems/.npm/_npx/420ff84f11983ee5/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto('http://localhost:3000');
await page.click('text=LISAA');
await page.waitForTimeout(800);
// Now click "Générer des images" on the home screen
await page.locator('button:has-text("Générer des images")').click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/sf_gen.png', fullPage: true });
await browser.close();
console.log('done');
