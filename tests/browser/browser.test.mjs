import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {files} from '../../gulp-tasks/io.mjs';
import {fixture, serve, launchChromium, realPages} from '../helpers.mjs';

// Real pages are checked on a phone and a desktop width: code that runs only on one of them must load cleanly too.
const REAL_WIDTHS = [375, 1280];

// Which .swiper elements must be running at the current viewport width: data-swiper-media holds
// the media query, a slider without it always runs. Runs in the page, hence globalThis.
function slidersToRun(page) {
  return page.evaluate(() => [...globalThis.document.querySelectorAll('.swiper')]
    .map(slider => !slider.dataset.swiperMedia || globalThis.matchMedia(slider.dataset.swiperMedia).matches));
}

// The real site is only smoke-tested: it must not depend on how the header, menu or pages look.
test('Chromium: fixture bundles work and every real page loads cleanly in root and subpath (404 under its <base>)', {timeout: 180000}, async t => {
  const browser = await launchChromium();
  try {
    for (const real of [false, true]) {
      const f = await fixture(t, {real});
      await f.tasks.build();
      const pages = real ? (await files(f.outputDir)).filter(name => !name.includes('/') && name.endsWith('.html')) : [''];
      const targets = new Map();
      for (const name of pages) {
        // 404.html has <base>, so it only works under its deploy path, where it also answers any missing path.
        const base = name && (await fs.readFile(path.join(f.outputDir, name), 'utf8')).match(/<base\s+href="(\/[^"]*\/)"/)?.[1];
        const missing = name === '404.html' ? ['missing/nested/page'] : [];
        for (const prefix of base ? [base] : ['/', '/test-landing/']) targets.set(prefix, [...(targets.get(prefix) || []), name, ...missing]);
      }
      for (const [prefix, names] of targets) {
        const server = await serve(f.outputDir, prefix);
        try {
          // Every width is a fresh load: whether the Swiper chunk was requested only makes sense for a fresh page.
          for (const width of real ? REAL_WIDTHS : [1280]) {
            for (const name of names) {
              const label = `${prefix}${name} @${width}`;
              const page = await browser.newPage({viewport: {width, height: 900}});
              const errors = [];
              const requests = [];
              page.on('pageerror', error => errors.push(error.message));
              // The page's own status is asserted below: a missing path answers 404 by design.
              const own = url => url === server.url + name;
              page.on('console', message => {
                if (message.type() === 'error' && !own(message.location().url)) errors.push(message.text());
              });
              page.on('response', response => {
                if (response.status() >= 400 && !own(response.url())) errors.push(`${response.status()} ${response.url()}`);
              });
              page.on('requestfailed', request => errors.push(request.url()));
              page.on('request', request => requests.push(request.url()));
              try {
                const response = await page.goto(server.url + name);
                assert.equal(response.status(), name.startsWith('missing/') ? 404 : 200, label);
                if (!real) {
                  assert.equal(await page.evaluate(() => window.syncValue), 7);
                  assert.equal(await page.evaluate(() => window.loadChunk()), 42);
                } else {
                  const broken = await page.evaluate(async () => {
                    await document.fonts.ready;
                    const problems = [];
                    await Promise.all([...document.images].map(image => {
                      image.loading = 'eager';
                      return image.decode().catch(() => problems.push(`image ${image.getAttribute('src')}`));
                    }));
                    // Every sprite icon must point to an existing symbol.
                    const sprites = new Map();
                    for (const use of document.querySelectorAll('svg use[href]')) {
                      const url = new URL(use.getAttribute('href'), document.baseURI);
                      const file = url.href.replace(/#.*$/, '');
                      if (!sprites.has(file)) sprites.set(file, fetch(file).then(response => response.text()).then(text => new DOMParser().parseFromString(text, 'image/svg+xml')));
                      if (!(await sprites.get(file)).getElementById(url.hash.slice(1))) problems.push(`icon ${use.getAttribute('href')}`);
                    }
                    return problems;
                  });
                  assert.deepEqual(broken, [], label);
                  // Swiper is loaded lazily: a slider with data-swiper-media runs only while its query matches, any other
                  // slider must start, and if no slider has to run at this width the chunk must not be downloaded.
                  const shouldRun = await slidersToRun(page);
                  if (shouldRun.some(Boolean)) {
                    await page.waitForFunction(run => [...document.querySelectorAll('.swiper')].every((slider, i) => slider.classList.contains('swiper-initialized') === run[i]), shouldRun, {timeout: 5000})
                      .catch(() => assert.fail(`${label}: swiper state does not match data-swiper-media`));
                  } else {
                    assert.deepEqual(requests.filter(url => /\/js\/chunks\/swiper\./.test(url)), [], `${label}: swiper chunk loaded without running sliders`);
                  }
                }
                assert.deepEqual(errors, [], label);
              } finally {
                await page.close();
              }
            }
          }
        } finally {
          await server.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
});

// A general page style (_general.scss): only an anchor target loses the outline, any other tabindex="-1" element keeps it.
test('focus outline stays on tabindex="-1" elements that are not an anchor target', {timeout: 90000}, async t => {
  const f = await fixture(t, {real: true});
  await f.tasks.build();
  const pages = (await realPages(f.outputDir)).filter(page => !page.base);
  const {name} = pages.find(page => page.name === 'index.html') ?? pages[0];
  const browser = await launchChromium();
  const server = await serve(f.outputDir);
  t.after(async () => {
    await server.close();
    await browser.close();
  });
  const tab = await browser.newPage();
  await tab.goto(server.url + name);
  await tab.evaluate(() => {
    const item = document.createElement('div');
    item.id = 'roving-item';
    item.tabIndex = -1;
    item.textContent = 'roving item';
    document.querySelector('main').prepend(item);
  });
  await tab.keyboard.press('Tab');
  await tab.evaluate(() => document.getElementById('roving-item').focus());
  assert.equal(await tab.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
});
