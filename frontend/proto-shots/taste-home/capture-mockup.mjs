// THROWAWAY Playwright capture for the LOCKED Taste-Match-on-home samples. NOT committed.
// Screenshots each #shot-* block to its own PNG at deviceScaleFactor:2.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = 'file://' + path.join(here, 'mockup.html');
const OUT = here;

// id → output filename (per fe-lead's brief)
const SHOTS = {
  'shot-hub-dirA-loggedin': 'hub-dirA-loggedin.png',
  'shot-hub-dirB-loggedin': 'hub-dirB-loggedin.png',
  'shot-hub-guest': 'hub-guest.png',
  'shot-home-teaser': 'home-teaser.png',
  'shot-carousel-slide': 'carousel-slide.png',
  'shot-header-chip-loggedin': 'header-chip-loggedin.png',
  'shot-header-chip-guest': 'header-chip-guest.png',
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1260, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(FILE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

for (const [id, file] of Object.entries(SHOTS)) {
  const el = page.locator('#' + id);
  await el.screenshot({ path: `${OUT}/${file}` });
  console.log('captured', file);
}

await browser.close();
console.log('done');
