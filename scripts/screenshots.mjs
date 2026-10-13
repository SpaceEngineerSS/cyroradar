// Regenerates the screenshots used by the README and the in-app docs, plus the
// app icons and the social preview image. Every picture comes from the real
// app, so they stay honest when the interface changes.
//
//   npm run build && npm run preview          (in one terminal)
//   npm run screenshots                       (in another)
//   npm run screenshots -- --pds              also capture a live SHARAD track (needs network)
//
// Output: public/media/*.jpg, public/icon-192.png, public/icon-512.png, public/og.png

import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.CRYORADAR_URL ?? 'http://localhost:4173';
const OUT = new URL('../public/media/', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);
const withPds = process.argv.includes('--pds');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

async function page(width = 1440, height = 900, extra = {}) {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, ...extra });
  p.on('pageerror', e => console.error('page error:', e.message));
  return p;
}
const save = (p, name) => p.screenshot({ path: fileURLToPath(new URL(`${name}.jpg`, OUT)), type: 'jpeg', quality: 86 });
const rail = (p, name) => p.getByRole('navigation', { name: 'Panels' }).getByRole('button', { name, exact: true }).click();
const settle = p => p.waitForTimeout(900);

async function scene(id, view = 'radargram') {
  const p = await page();
  await p.goto(`${BASE}/#scene=${id}${view !== 'radargram' ? `&view=${view}` : ''}`, { waitUntil: 'load' });
  await p.waitForFunction(() => document.querySelector('header')?.textContent?.includes('simulated'), null, { timeout: 60_000 });
  await settle(p);
  return p;
}

// Welcome
{
  const p = await page();
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  await settle(p);
  await save(p, 'welcome');
  await p.close();
}

// Detection on Planum Australe
{
  const p = await scene('planum-australe');
  await rail(p, 'Detection');
  await p.getByRole('button', { name: /Scan for bright/ }).click();
  await p.waitForTimeout(2000);
  await save(p, 'detection');
  await rail(p, 'Uncertainty');
  await p.getByRole('button', { name: /^Run / }).click();
  await p.waitForTimeout(3000);
  await save(p, 'uncertainty');
  await p.close();
}

// Guided tour, the bright-patch step
{
  const p = await page();
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  await p.getByRole('button', { name: 'Guided tour' }).click();
  await p.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) {
    await p.getByRole('button', { name: 'Next' }).click();
    await p.waitForTimeout(900);
  }
  await save(p, 'tour');
  await p.close();
}

// Layers and migration on the north polar deposits
{
  const p = await scene('planum-boreum');
  await rail(p, 'Depth model');
  await p.getByRole('button', { name: /Copy the scene/ }).click();
  await settle(p);
  await rail(p, 'Display');
  await p.getByRole('switch', { name: /Scene model interfaces/ }).click();
  await settle(p);
  await save(p, 'layers');
  await p.getByRole('switch', { name: /Scene model interfaces/ }).click();
  await rail(p, 'Processing');
  await p.getByRole('button', { name: 'Migrate' }).click();
  await p.getByRole('button', { name: 'Compare side by side' }).waitFor({ timeout: 120_000 });
  await p.getByRole('button', { name: 'Compare side by side' }).click();
  await settle(p);
  await save(p, 'migration');
  await p.close();
}

// Clutter-prone glacier, A-scope, map and 3D
{
  const p = await scene('deuteronilus-mensae');
  await save(p, 'deuteronilus');
  const box = await p.locator('[data-radargram]').boundingBox();
  await p.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await p.getByRole('tab', { name: /A-scope/ }).click();
  await settle(p);
  await save(p, 'ascope');
  await p.getByRole('tab', { name: /Track/ }).click();
  await settle(p);
  await save(p, 'track');
  await p.getByRole('tab', { name: /3D/ }).click();
  await p.waitForTimeout(2500);
  await save(p, 'scene-3d');
  await p.close();
}

// Inversion of the bright patch
{
  const p = await scene('planum-australe');
  await rail(p, 'Inversion');
  await p.getByRole('button', { name: /Draw a window/ }).click();
  const box = await p.locator('[data-radargram]').boundingBox();
  await p.mouse.move(box.x + box.width * 0.44, box.y + box.height * 0.62);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.86, { steps: 10 });
  await p.mouse.up();
  await p.getByRole('button', { name: 'Invert window' }).click();
  await p.getByRole('button', { name: /Save result/ }).waitFor({ timeout: 180_000 });
  await settle(p);
  await save(p, 'inversion');
  await p.close();
}

// Light theme and phone
{
  const p = await scene('utopia-planitia');
  await p.getByRole('button', { name: 'Light theme' }).click();
  await rail(p, 'Data');
  await settle(p);
  await save(p, 'light');
  await p.getByRole('button', { name: 'Dark theme' }).click();
  await p.close();

  const m = await page(390, 844, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(`${BASE}/#scene=planum-australe`, { waitUntil: 'load' });
  await m.waitForFunction(() => document.querySelector('[data-radargram]'), null, { timeout: 60_000 });
  await settle(m);
  await save(m, 'phone');
  await m.close();
}

// Live SHARAD track
if (withPds) {
  const p = await page();
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  await p.getByRole('button', { name: 'Search SHARAD radargrams' }).click();
  await p.getByRole('button', { name: 'Browse image' }).first().click();
  await p.waitForFunction(() => document.querySelector('header')?.textContent?.includes('NASA PDS'), null, { timeout: 120_000 });
  await settle(p);
  await save(p, 'pds-sharad');
  await p.close();
}

// Docs page
{
  const p = await page();
  await p.goto(`${BASE}/docs/detection`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await save(p, 'docs');
  await p.close();
}

// Icons and social preview, drawn from the favicon so the mark stays in one place.
{
  const svg = await readFile(new URL('favicon.svg', PUBLIC), 'utf-8');
  for (const size of [192, 512]) {
    const p = await page(size, size);
    await p.setContent(`<style>html,body{margin:0;background:#121110}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await p.screenshot({ path: fileURLToPath(new URL(`icon-${size}.png`, PUBLIC)) });
    await p.close();
  }
  const shot = await readFile(new URL('detection.jpg', OUT));
  const p = await page(1200, 630);
  await p.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: Plex; src: local('IBM Plex Sans'); }
    html,body{margin:0;width:1200px;height:630px;background:#121110;color:#ece7dd;font-family:'IBM Plex Sans',system-ui,sans-serif}
    .wrap{display:grid;grid-template-columns:430px 1fr;height:100%}
    .left{padding:64px 48px;display:flex;flex-direction:column;gap:22px;border-right:1px solid #2c2925}
    h1{font-size:54px;margin:0;letter-spacing:-0.02em}
    p{font-size:22px;line-height:1.4;color:#a59e92;margin:0}
    .tag{font:500 15px ui-monospace,monospace;color:#878075;margin-top:auto}
    .right{background:url(data:image/jpeg;base64,${shot.toString('base64')}) left center/cover}
  </style></head><body><div class="wrap"><div class="left">${svg.replace('<svg ', '<svg width="64" height="64" ')}
    <h1>CryoRadar</h1><p>Mars subsurface radar in the browser. SHARAD archive data, simulated scenes, depth and basal reflection analysis.</p>
    <div class="tag">cyroradar.vercel.app</div></div><div class="right"></div></div></body></html>`);
  await p.screenshot({ path: fileURLToPath(new URL('og.png', PUBLIC)) });
  await p.close();
}

await browser.close();
console.log('Screenshots written to public/media.');
