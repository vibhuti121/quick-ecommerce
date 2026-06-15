import { chromium } from 'playwright';

const OUT = '../docs/screenshots';
const URL = 'http://localhost:5173';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });

// 1) Storefront — wait for the product grid to render real catalog data.
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.product-card', { timeout: 30000 });
await page.waitForTimeout(800); // let lazy images settle
await page.screenshot({ path: `${OUT}/01-storefront.png`, fullPage: true });
console.log('captured 01-storefront');

// 2) Cart — add two different products, then capture the open drawer.
const addButtons = page.locator('.product-card button:has-text("Add to cart")');
await addButtons.nth(0).click();
await page.waitForSelector('.cart-drawer-open', { timeout: 15000 });
await page.waitForTimeout(500);
// close, add a second product so the cart shows multiple lines
await page.locator('.cart-drawer .icon-button').click();
await page.waitForTimeout(400);
await addButtons.nth(3).click();
await page.waitForSelector('.cart-drawer-open');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/02-cart.png`, fullPage: false });
console.log('captured 02-cart');

// 3) Confirmation — check out and capture the success state.
await page.locator('.cart-footer button:has-text("Checkout")').click();
await page.waitForSelector('.order-success', { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-confirmation.png`, fullPage: false });
console.log('captured 03-confirmation');

await browser.close();
console.log('done');
