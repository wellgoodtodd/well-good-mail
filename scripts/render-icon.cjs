// Renders public/icon.svg to a 1024px PNG for `tauri icon`.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'public', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(__dirname, '..', 'src-tauri', 'icons', 'source.png'), omitBackground: true });
  await browser.close();
})();
