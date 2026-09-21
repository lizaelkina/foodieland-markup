import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {files} from '../../gulp-tasks/io.mjs';
import {fixture, serve, launchChromium, realPages, hasClass} from '../helpers.mjs';

// Behaviour of the template's scroll-spy on the real build. Sections and anchor links are injected into
// the first page with .js-scroll-spy lists, so the test relies only on template conventions
// (.js-scroll-spy lists from +nav-list, main, footer), not on the pages' content or block classes.
// Without the component the whole file is skipped.
const LONG = [['s1', 1200], ['s2', 1200], ['s3', 120], ['s4', 120], ['s5', 120]];
const SHORT = [['s1', 40], ['s2', 300], ['s3', 300]];
const DESKTOP = {width: 1440, height: 1800};
// Scroll-spy keeps a clicked section for up to 1 s (or 150 ms after scrolling stops):
// "stays active" checks wait this long so a later wrong update would be seen.
const PIN_RELEASE = 1200;

test('scroll-spy highlights the section on screen', {timeout: 240000}, async t => {
  const f = await fixture(t, {real: true});
  // README: the component is removed together with its import line, while +nav-list still adds .js-scroll-spy.
  const scripts = (await files(path.join(f.rootDir, 'src/js'))).filter(name => name.endsWith('.js'));
  const sources = await Promise.all(scripts.map(name => fs.readFile(path.join(f.rootDir, 'src/js', name), 'utf8')));
  if (!sources.some(code => /^\s*import\b[^;]*['"][^'"]*scroll-spy[^'"]*['"]/m.test(code))) return t.skip('scroll-spy component is not imported');
  await f.tasks.build();
  const target = (await realPages(f.outputDir)).find(page => !page.base && hasClass(page.html, 'js-scroll-spy'));
  if (!target) return t.skip('no .js-scroll-spy lists in this project');

  const browser = await launchChromium();
  const server = await serve(f.outputDir);
  t.after(async () => {
    await server.close();
    await browser.close();
  });

  async function open({sections = LONG, css = '', viewport = DESKTOP, reducedMotion = 'no-preference', hash = ''} = {}) {
    const context = await browser.newContext({viewport, reducedMotion});
    const page = await context.newPage();
    await page.route(url => url.pathname.endsWith(`/${target.name}`), async route => {
      const response = await route.fetch();
      const links = sections.map(([id]) => `<li class="js-menu-link"><a class="link" href="#${id}">${id}</a></li>`).join('');
      const blocks = sections.map(([id, height]) => `<section id="${id}" data-test-section style="height:${height}px"><a href="#top">${id} link</a></section>`).join('');
      const html = (await response.text())
        .replace(/(<ul[^>]*\bjs-scroll-spy\b[^>]*>)[\s\S]*?(<\/ul>)/g, `$1${links}$2`)
        .replace('</main>', `${blocks}</main>`)
        .replace('</head>', `<style>${css}</style></head>`);
      await route.fulfill({response, body: html});
    });
    await page.goto(server.url + target.name + hash);
    await page.waitForFunction(() => document.querySelector('.js-scroll-spy a[aria-current="location"]'));
    return {page, close: () => context.close()};
  }

  const active = page => page.evaluate(() => {
    const links = [...document.querySelectorAll('.js-scroll-spy a[aria-current="location"]')];
    return {ids: [...new Set(links.map(link => link.hash.slice(1)))], count: links.length};
  });

  const waitActive = (page, id) => page.waitForFunction(expected => {
    const links = [...document.querySelectorAll('.js-scroll-spy a[aria-current="location"]')];
    return links.length && links.every(link => link.hash === expected);
  }, `#${id}`);

  // The first link to a section that the layout shows; which navigation it is in does not matter.
  const navLink = (page, id) => page.locator(`.js-scroll-spy a[href="#${id}"]`).filter({visible: true}).first();

  const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  // Waits until (smooth) scrolling has stopped.
  async function scrollEnd(page) {
    let last = -1;
    for (let y = await page.evaluate(() => window.scrollY); y !== last; y = await page.evaluate(() => window.scrollY)) {
      last = y;
      await page.waitForTimeout(100);
    }
  }

  async function scrollTop(page) {
    await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
    await frames(page);
  }

  await t.test('scroll-spy highlights one link in every navigation', async () => {
    const {page, close} = await open();
    try {
      assert.equal((await active(page)).count, await page.locator('.js-scroll-spy').count());
    } finally {
      await close();
    }
  });

  await t.test('scroll-spy: every short section at the page bottom becomes active in turn', async () => {
    const {page, close} = await open();
    try {
      const sequence = [];
      const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      for (let y = 0; y <= max + 40; y += 40) {
        await page.evaluate(top => window.scrollTo({top, behavior: 'instant'}), Math.min(y, max));
        await frames(page);
        const [id] = (await active(page)).ids;
        if (id && sequence.at(-1) !== id) sequence.push(id);
      }
      assert.deepEqual(sequence, ['s1', 's2', 's3', 's4', 's5']);
    } finally {
      await close();
    }
  });

  for (const reducedMotion of ['no-preference', 'reduce']) {
    await t.test(`scroll-spy: a clicked short bottom section stays active (${reducedMotion})`, async () => {
      const {page, close} = await open({reducedMotion});
      try {
        await scrollTop(page);
        await navLink(page, 's4').click();
        await scrollEnd(page);
        await page.waitForTimeout(PIN_RELEASE);
        assert.deepEqual((await active(page)).ids, ['s4']);
      } finally {
        await close();
      }
    });
  }

  await t.test('scroll-spy: scrolling away while a click is pinned updates the highlight', async () => {
    const {page, close} = await open();
    try {
      await scrollTop(page);
      await navLink(page, 's5').click();
      await page.evaluate(() => window.scrollTo({top: 0, behavior: 'instant'}));
      await waitActive(page, 's1');
    } finally {
      await close();
    }
  });

  await t.test('scroll-spy: opening the page with #s4 highlights s4', async () => {
    const {page, close} = await open({hash: '#s4'});
    try {
      await scrollEnd(page);
      await page.waitForTimeout(PIN_RELEASE);
      assert.deepEqual((await active(page)).ids, ['s4']);
    } finally {
      await close();
    }
  });

  // Chrome may restore a different scroll position on Back than the anchor's own,
  // so the check is what the user sees: the highlighted section is on screen, and it is s4 whenever s4 is.
  await t.test('scroll-spy: going back to #s4 highlights a section on screen', async () => {
    const {page, close} = await open();
    try {
      await navLink(page, 's4').click();
      await scrollEnd(page);
      await navLink(page, 's3').click();
      await scrollEnd(page);
      await page.goBack();
      await page.waitForFunction(() => window.location.hash === '#s4');
      await scrollEnd(page);
      await page.waitForTimeout(PIN_RELEASE);
      const state = await page.evaluate(() => {
        const onScreen = element => {
          const {top, bottom} = element.getBoundingClientRect();
          return bottom > 0 && top < window.innerHeight;
        };
        const link = [...document.querySelectorAll('.js-scroll-spy a[aria-current="location"]')].find(element => element.checkVisibility());
        return {
          active: link?.hash,
          activeOnScreen: Boolean(link) && onScreen(document.querySelector(link.hash)),
          s4OnScreen: onScreen(document.getElementById('s4'))
        };
      });
      assert.ok(state.activeOnScreen, `highlighted ${state.active} is off screen`);
      if (state.s4OnScreen) assert.equal(state.active, '#s4');
    } finally {
      await close();
    }
  });

  await t.test('scroll-spy: after a reload the restored position wins over the old hash', async () => {
    const {page, close} = await open({hash: '#s4'});
    try {
      await scrollEnd(page);
      await scrollTop(page);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('.js-scroll-spy a[aria-current="location"]'));
      await scrollEnd(page);
      await page.waitForTimeout(PIN_RELEASE);
      assert.equal(await page.evaluate(() => window.scrollY), 0);
      assert.deepEqual((await active(page)).ids, ['s1']);
    } finally {
      await close();
    }
  });

  await t.test('scroll-spy: a short page opens with the first section active', async () => {
    const {page, close} = await open({
      sections: SHORT,
      viewport: {width: 1440, height: 900},
      css: 'main > :not([data-test-section]), footer { display: none !important; }'
    });
    try {
      assert.deepEqual((await active(page)).ids, ['s1']);
    } finally {
      await close();
    }
  });
});
