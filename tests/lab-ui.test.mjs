/**
 * The Lab's first screen, driven in a real Chrome: the empty state, drag and drop, the disabled controls, the status
 * line and the Smart redraw helper chip.
 *
 * It needs a running app and Chrome, so it skips itself (and says why) when either is missing:
 *
 *   npm run dev            in one terminal
 *   npm run test:lab-ui    in another        (LAB_BASE_URL=http://localhost:3000 by default)
 *
 * The helper's /health answer is faked in the page, so the result does not depend on whether a real helper is running.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.LAB_BASE_URL || 'http://localhost:3000';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAMPLE = new URL('../public/lab-samples/cat.png', import.meta.url).pathname;
const require = createRequire(import.meta.url);

let skip = false;
if (!existsSync(CHROME)) skip = `no Chrome at ${CHROME} (set CHROME)`;
else {
  try {
    const answer = await fetch(`${BASE}/lab`, { signal: AbortSignal.timeout(3000) });
    if (!answer.ok) skip = `${BASE}/lab answered ${answer.status}`;
  } catch {
    skip = `no app at ${BASE} (run npm run dev)`;
  }
}

const HEALTH = { ok: true, version: '1', ready: true, models: {}, busy: false, styles: ['minimal'], modes: ['standard'], maxUploadMB: 25, timeoutSeconds: 900 };

/** A fresh page on /lab with /health faked ('up' or 'down'), past the rights question, at the given size and palette. */
async function open(browser, { helper = 'down', width = 1280, height = 720, palette = null } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (!request.url().endsWith('/health')) return void request.continue();
    const cors = { 'access-control-allow-origin': '*' };
    if (helper === 'up') request.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(HEALTH) });
    else request.abort('connectionrefused');
  });
  // Every distinct status text the page shows, from the first moment, so a fast "Reading your picture" is not missed.
  await page.evaluateOnNewDocument(() => {
    window.__seen = [];
    new MutationObserver(() => {
      const node = document.querySelector('[data-status-text]');
      const engine = document.querySelector('[data-status-engine]');
      const text = node ? `${node.textContent}|${engine?.textContent ?? ''}` : null;
      if (text && window.__seen.at(-1) !== text) window.__seen.push(text);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });
  await page.goto(`${BASE}/lab`, { waitUntil: 'networkidle0' });
  if (palette) await page.evaluate((p) => (document.documentElement.dataset.theme = p), palette);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /right to use/i.test(b.innerText))?.click());
  await page.waitForSelector('[data-dropzone]');
  return page;
}

/** Drag a file of the given name, type and size over a selector and (optionally) drop it. Returns whether it highlighted. */
async function dragFile(page, selector, { name, type, bytes, drop = true, base64 = null }) {
  return page.evaluate(
    async (sel, name, type, bytes, drop, base64) => {
      const target = document.querySelector(sel);
      const data = base64 ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : new Uint8Array(bytes);
      const transfer = new DataTransfer();
      transfer.items.add(new File([data], name, { type }));
      const fire = (kind) => target.dispatchEvent(new DragEvent(kind, { bubbles: true, cancelable: true, dataTransfer: transfer }));
      fire('dragenter');
      fire('dragover');
      await new Promise((r) => setTimeout(r, 80)); // React paints the highlight after the event
      const lit = target.getAttribute('data-over') === 'true' || Boolean(document.querySelector('[data-drop-overlay]'));
      if (drop) fire('drop');
      else fire('dragleave');
      await new Promise((r) => setTimeout(r, 80));
      return lit;
    },
    selector, name, type, bytes, drop, base64,
  );
}

const sampleBase64 = () => readFileSync(SAMPLE).toString('base64');
const loaded = (page) => page.waitForSelector('img[alt="The drawing"]', { timeout: 60000 });
const text = (page) => page.evaluate(() => document.body.innerText);

async function withBrowser(fn) {
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] });
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

test('empty state: a large drop zone, the steps, samples, and nothing from the old layout', { skip }, () =>
  withBrowser(async (browser) => {
    const page = await open(browser);
    const body = await text(page);
    assert.match(body, /Drop a picture here/);
    assert.match(body, /JPG, PNG or WebP/);
    assert.match(body, /Your picture stays on this computer/);
    assert.ok(await page.$('[data-dropzone] button'), 'a Choose picture button inside the zone');
    assert.equal(await page.evaluate(() => document.querySelector('[data-dropzone] button').innerText), 'Choose picture');

    const zone = await page.evaluate(() => {
      const z = document.querySelector('[data-dropzone]').getBoundingClientRect();
      const canvas = document.querySelector('section[aria-label="The drawing"]').getBoundingClientRect();
      return { zoneHeight: z.height, zoneWidth: z.width, sectionWidth: canvas.width };
    });
    assert.ok(zone.zoneWidth >= zone.sectionWidth - 2, 'the zone spans the canvas column');
    assert.ok(zone.zoneHeight > 400, `the zone is large (${zone.zoneHeight}px)`);

    const steps = await page.evaluate(() =>
      [...document.querySelectorAll('ol[aria-label="How it works"] li')].map((li) => ({ t: li.innerText.replace(/\s+/g, ' ').trim(), y: Math.round(li.getBoundingClientRect().top) })));
    assert.deepEqual(steps.map((s) => s.t.replace(/^\d\s*/, '')), ['Pick a picture', 'Choose a look', 'Download as SVG or PNG']);
    assert.ok(steps.every((s) => Math.abs(s.y - steps[0].y) <= 2), 'the three steps share one line');

    const samples = await page.$$eval('[aria-label="Try a sample"] button', (b) => b.map((x) => x.getAttribute('aria-label')));
    assert.ok(samples.length >= 2 && samples.length <= 3, `${samples.length} samples`);

    // Gone: the thin strip, the compare controls, the old one-line hint.
    assert.doesNotMatch(body, /Drop another picture|or choose a file/);
    assert.equal(await page.$('input[aria-label="Before and after"]'), null, 'no compare slider');
    assert.doesNotMatch(body, /Hold to compare/);
    assert.doesNotMatch(body, /Open a picture to begin/);
    await page.close();
  }));

test('empty state: Picture, Look, Tune, Export and both downloads are disabled, with the reason on hover', { skip }, () =>
  withBrowser(async (browser) => {
    const page = await open(browser);
    const rail = await page.$$eval('nav[aria-label="Lab sections"] li', (items) =>
      items.map((li) => ({ label: li.innerText.trim(), disabled: li.querySelector('button').disabled, title: li.title })));
    assert.deepEqual(rail.map((r) => r.label), ['Picture', 'Look', 'Tune', 'Export']);
    for (const item of rail) {
      assert.equal(item.disabled, true, `${item.label} is disabled`);
      assert.equal(item.title, 'Open a picture first', `${item.label} says why`);
    }
    for (const name of ['Download PNG', 'Download SVG']) {
      const one = await page.evaluate((n) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === n);
        return { disabled: b.disabled, title: b.title, wrapper: b.parentElement.title };
      }, name);
      assert.equal(one.disabled, true, name);
      assert.equal(one.title, 'Open a picture first');
      assert.equal(one.wrapper, 'Open a picture first', 'the wrapper carries it too, for browsers that show no tooltip on a disabled button');
    }
    // The right panel shows the steps, with a line each, instead of the old hint.
    const panel = await page.$eval('section[aria-label="Controls"]', (el) => el.innerText);
    assert.match(panel, /How it works/);
    assert.match(panel, /SVG stays sharp at any size/);
    await page.close();
  }));

test('drag and drop: the canvas highlights while a file is over it, and drops open it', { skip }, () =>
  withBrowser(async (browser) => {
    const page = await open(browser);
    assert.equal(await page.$eval('[data-dropzone]', (z) => z.dataset.over), 'false');
    assert.equal(await dragFile(page, '[data-dropzone]', { name: 'cat.png', type: 'image/png', base64: sampleBase64(), drop: false }), true, 'lit on drag over');
    assert.equal(await page.$eval('[data-dropzone]', (z) => z.dataset.over), 'false', 'and off again when it leaves');

    // Not a file (text dragged from the page): no highlight.
    const textLit = await page.evaluate(async () => {
      const z = document.querySelector('[data-dropzone]');
      const t = new DataTransfer(); t.setData('text/plain', 'hello');
      z.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: t }));
      await new Promise((r) => setTimeout(r, 80));
      return z.dataset.over;
    });
    assert.equal(textLit, 'false', 'dragged text does not light the zone');

    await dragFile(page, '[data-dropzone]', { name: 'cat.png', type: 'image/png', base64: sampleBase64() });
    await loaded(page);
    const body = await text(page);
    assert.match(body, /Change picture/);
    assert.equal(await page.$('[data-dropzone]'), null, 'the zone gives way to the drawing');
    assert.ok(await page.$('input[aria-label="Before and after"]'), 'the compare slider is back');
    assert.match(body, /Hold to compare/);
    assert.doesNotMatch(body, /Drop another picture/);

    // And a loaded canvas still takes a drop, with its own highlight.
    assert.equal(await dragFile(page, '[data-canvas-drop]', { name: 'cat.png', type: 'image/png', base64: sampleBase64(), drop: false }), true);
    await page.close();
  }));

test('errors say what went wrong and what to do, and leave the screen as it was', { skip }, () =>
  withBrowser(async (browser) => {
    const page = await open(browser);
    await dragFile(page, '[data-dropzone]', { name: 'notes.txt', type: 'text/plain', bytes: 20 });
    await page.waitForSelector('[role=alert]');
    let alert = await page.$eval('[role=alert]', (el) => el.innerText);
    assert.match(alert, /not a JPG, PNG or WebP/);
    assert.match(alert, /Choose a JPG, PNG or WebP file/);
    assert.ok(await page.$('[data-dropzone]'), 'still on the empty screen');

    await dragFile(page, '[data-dropzone]', { name: 'huge.png', type: 'image/png', bytes: 31 * 1024 * 1024 });
    await page.waitForFunction(() => /31 MB/.test(document.querySelector('[role=alert]')?.innerText ?? ''));
    alert = await page.$eval('[role=alert]', (el) => el.innerText);
    assert.match(alert, /up to 30 MB/);
    assert.match(alert, /smaller copy/);

    // Looks like a PNG by name and type, is not an image: the engine cannot read it, and says what to do.
    await dragFile(page, '[data-dropzone]', { name: 'broken.png', type: 'image/png', bytes: 500 });
    await page.waitForFunction(() => /could not read that picture/i.test(document.querySelector('[role=alert]')?.innerText ?? ''), { timeout: 20000 });
    assert.ok(await page.$('[data-dropzone]'), 'back on the empty screen, not stuck on a blank canvas');
    assert.doesNotMatch(await text(page), /browser cannot read|InvalidState/);
    await page.close();
  }));

test('status line: reading, finding the lines, done, and which engine made it', { skip }, () =>
  withBrowser(async (browser) => {
    const page = await open(browser);
    await page.click('[aria-label="Try the sample: Test photo"]');
    await loaded(page);
    await page.waitForFunction(() => document.querySelector('[data-status-text]')?.textContent === 'Done', { timeout: 60000 });
    const seen = await page.evaluate(() => window.__seen);
    assert.ok(seen.some((s) => /^(Reading your picture|Finding the lines)\|Built-in engine$/.test(s)), `a working state was shown: ${JSON.stringify(seen)}`);
    assert.ok(seen.at(-1).startsWith('Done|Built-in engine'), seen.at(-1));
    const status = await page.$eval('[role=status][data-status]', (el) => ({ live: el.getAttribute('aria-live'), tone: el.dataset.status }));
    assert.equal(status.live, 'polite');
    assert.equal(status.tone, 'done');
    // Downloads come on once there is a drawing.
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Download SVG')?.disabled);
    assert.equal(await page.$eval('nav[aria-label="Lab sections"] button', (b) => b.disabled), false, 'the tabs wake up too');
    await page.close();
  }));

test('keyboard: Tab reaches Choose picture with a visible focus ring, and Enter opens the file chooser', { skip }, () =>
  withBrowser(async (browser) => {
    const page = await open(browser);
    let name = '';
    for (let i = 0; i < 25 && name !== 'Choose picture'; i++) {
      await page.keyboard.press('Tab');
      name = await page.evaluate(() => document.activeElement?.innerText?.trim() ?? '');
    }
    assert.equal(name, 'Choose picture', 'reachable by keyboard');
    const ring = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement);
      return { outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' };
    });
    assert.ok(ring.outline || ring.shadow, 'a focus ring is drawn');
    const chooser = page.waitForFileChooser({ timeout: 5000 });
    await page.keyboard.press('Enter');
    await (await chooser).accept([SAMPLE]);
    await loaded(page);
    // The samples are buttons too: reachable and activated by keyboard.
    await page.close();

    const second = await open(browser);
    await second.focus('[aria-label="Try the sample: Cat drawing"]');
    await second.keyboard.press('Enter');
    await loaded(second);
    await second.close();
  }));

test('Smart redraw chip: helper running, helper not running with the command and a copy button', { skip }, () =>
  withBrowser(async (browser) => {
    const up = await open(browser, { helper: 'up' });
    const flagOn = await up.waitForSelector('[data-helper-chip]', { timeout: 4000 }).then(() => true, () => false);
    if (!flagOn) {
      // A production build without NEXT_PUBLIC_SMART_REDRAW: nothing about Smart redraw at all.
      assert.doesNotMatch(await text(up), /Smart redraw|logo-proto|server\.py/);
      await up.close();
      const down = await open(browser, { helper: 'down' });
      assert.doesNotMatch(await text(down), /Smart redraw|logo-proto|server\.py/, 'no command shown when the flag is off');
      await down.close();
      return;
    }
    await up.waitForFunction(() => /helper running/i.test(document.querySelector('[data-helper-chip]')?.innerText ?? ''));
    assert.doesNotMatch(await text(up), /server\.py/, 'no command while it is running');
    await up.close();

    const down = await open(browser, { helper: 'down' });
    await down.waitForFunction(() => /helper not running/i.test(document.querySelector('[data-helper-chip]')?.innerText ?? ''));
    assert.equal(await down.$eval('[data-start-command]', (c) => c.textContent), 'cd tools/logo-proto && .venv/bin/python server.py');
    await down.browserContext().overridePermissions(BASE, ['clipboard-read', 'clipboard-write']);
    await down.click('button[aria-label="Copy the start command"]');
    await down.waitForFunction(() => /^Copied$/.test(document.querySelector('button[aria-label="Copy the start command"]')?.innerText ?? ''));
    assert.equal(await down.evaluate(() => navigator.clipboard.readText()), 'cd tools/logo-proto && .venv/bin/python server.py');
    await down.close();
  }));

test('both palettes and both widths: nothing overflows sideways, and the zone and steps are inside the screen', { skip }, () =>
  withBrowser(async (browser) => {
    for (const palette of [null, 'night']) for (const [width, height] of [[1280, 720], [390, 844]]) {
      const page = await open(browser, { width, height, palette });
      const box = await page.evaluate(() => {
        const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { l: r.left, r: r.right }; };
        return { scroll: document.documentElement.scrollWidth, zone: rect('[data-dropzone]'), steps: rect('ol[aria-label="How it works"]') };
      });
      const label = `${palette ?? 'default'} ${width}`;
      assert.ok(box.scroll <= width, `${label}: no horizontal scroll (${box.scroll})`);
      for (const part of [box.zone, box.steps]) assert.ok(part.l >= 0 && part.r <= width + 1, `${label}: inside the screen`);
      await page.close();
    }
  }));

test('brand: the header says Vera with "by Isnaevy" small beside it, and the page title is Vera\'s', { skip }, () =>
  withBrowser(async (browser) => {
    for (const path of ['/lab', '/']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
      const seen = await page.evaluate(() => ({
        title: document.title,
        wordmark: document.querySelector('header a[href="/"], nav a[href="/"]')?.innerText.trim(),
        byline: [...document.querySelectorAll('[data-byline]')].map((n) => n.textContent.trim()),
        ogTitle: document.querySelector('meta[property="og:title"]')?.content,
        ogSite: document.querySelector('meta[property="og:site_name"]')?.content,
      }));
      assert.match(seen.title, /Vera/, `${path} title: ${seen.title}`);
      assert.doesNotMatch(seen.title, /Isnaevy/);
      assert.equal(seen.wordmark, 'Vera', `${path} wordmark`);
      assert.deepEqual(seen.byline.slice(0, 1), ['by Isnaevy'], `${path} byline`);
      assert.match(seen.ogTitle, /^Vera/);
      assert.equal(seen.ogSite, 'Vera');
      await page.close();
    }
  }));
