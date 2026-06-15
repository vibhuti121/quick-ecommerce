import { chromium } from 'playwright';
const OUT = '/tmp/qe-profile-shots';
const URL = 'https://localhost:8443';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();

// log every search request + its status, and any console errors
page.on('console', (m) => { if (m.type() === 'error') console.log('  [console-error]', m.text()); });
page.on('requestfailed', (r) => console.log('  [req-failed]', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.url().includes('/search')) console.log('  [search-resp]', r.status(), r.url()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.product-card', { timeout: 30000 });
const before = await page.locator('.product-card').count();
console.log('product cards before search:', before);

// find the search input
const box = page.locator('input[type="search"], .search-bar input, input[placeholder*="earch" i]').first();
console.log('search input found:', await box.count());
await box.fill('mango');
console.log('typed "mango"; waiting for debounce + fetch...');
await page.waitForTimeout(1500);

const after = await page.locator('.product-card').count();
console.log('product cards after search "mango":', after);
const names = await page.locator('.product-card h3, .product-card .product-name, .product-name').allInnerTexts().catch(() => []);
console.log('visible product names:', JSON.stringify(names.slice(0, 6)));
const errBanner = await page.locator('.error, .error-banner, [role="alert"]').allInnerTexts().catch(() => []);
if (errBanner.length) console.log('error banners:', JSON.stringify(errBanner));
await page.screenshot({ path: `${OUT}/08-search-mango.png` });

await browser.close();
console.log('done');
