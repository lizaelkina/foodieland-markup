import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, serve, launchChromium, realPages, hasClass, PROBE_WIDTHS} from '../helpers.mjs';

// Behaviour of the template's mobile menu (dialog.js-menu with .js-menu-link items) on the real build.
// Sections and anchor links are injected, so the test does not depend on the pages' content or on scroll-spy.
const SECTIONS = [['s1', 1200], ['s2', 1200], ['s3', 120], ['s4', 120], ['s5', 120]];

// Replaces the items of the menu list that holds .js-menu-link items; other dialogs on the page
// and the order of lists in the menu do not matter.
function injectMenuLinks(html, links) {
  return html.replace(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/g, dialog => {
    if (!hasClass(dialog.slice(0, dialog.indexOf('>') + 1), 'js-menu')) return dialog;
    return dialog.replace(/(<ul\b[^>]*>)((?:(?!<\/ul>)[\s\S])*)(<\/ul>)/g, (list, open, items, close) => (items.includes('js-menu-link') ? open + links + close : list));
  });
}

test('menu: choosing an anchor moves focus to its section', {timeout: 120000}, async t => {
  const f = await fixture(t, {real: true});
  await f.tasks.build();
  const target = (await realPages(f.outputDir)).find(page => !page.base && hasClass(page.html, 'js-menu'));
  if (!target) return t.skip('no mobile menu in this project');

  const browser = await launchChromium();
  const server = await serve(f.outputDir);
  t.after(async () => {
    await server.close();
    await browser.close();
  });

  // The burger appears at the project's own breakpoint: take the widest probe width where it is visible.
  const probe = await browser.newPage();
  await probe.goto(server.url + target.name);
  const button = probe.locator('.js-menu-open').first();
  let width = null;
  if (await button.count()) {
    for (const candidate of [...PROBE_WIDTHS].reverse()) {
      await probe.setViewportSize({width: candidate, height: 900});
      if (await button.evaluate(element => element.checkVisibility())) {
        width = candidate;
        break;
      }
    }
  }
  await probe.close();
  if (width === null) return t.skip(`no visible .js-menu-open at ${PROBE_WIDTHS.join(', ')}`);
  t.diagnostic(`menu checked at ${width}px`);

  async function open() {
    const context = await browser.newContext({viewport: {width, height: 900}});
    const page = await context.newPage();
    await page.route(url => url.pathname.endsWith(`/${target.name}`), async route => {
      const response = await route.fetch();
      const links = SECTIONS.map(([id]) => `<li class="js-menu-link"><a class="link" href="#${id}">${id}</a></li>`).join('');
      const blocks = SECTIONS.map(([id, height]) => `<section id="${id}" style="height:${height}px"><a href="#top">${id} link</a></section>`).join('');
      const html = injectMenuLinks(await response.text(), links).replace('</main>', `${blocks}</main>`);
      await route.fulfill({response, body: html});
    });
    await page.goto(server.url + target.name);
    return {page, close: () => context.close()};
  }

  // Waits until (smooth) scrolling has stopped.
  async function scrollEnd(page) {
    let last = -1;
    for (let y = await page.evaluate(() => window.scrollY); y !== last; y = await page.evaluate(() => window.scrollY)) {
      last = y;
      await page.waitForTimeout(100);
    }
  }

  for (const input of ['mouse', 'keyboard']) {
    await t.test(`after choosing an anchor (${input}) focus moves to the section`, async () => {
      const {page, close} = await open();
      try {
        await page.click('.js-menu-open');
        await page.waitForFunction(() => {
          const menu = document.querySelector('.js-menu');
          return menu.open && menu.getAnimations().every(animation => animation.playState !== 'running');
        });
        const link = '.js-menu a[href="#s2"]';
        if (input === 'mouse') await page.click(link);
        else {
          await page.focus(link);
          await page.keyboard.press('Enter');
        }
        await page.waitForFunction(() => document.activeElement.id === 's2', null, {timeout: 5000});
        assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'none');
        await scrollEnd(page);
        const before = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.closest('section')?.id), 's2');
        await scrollEnd(page);
        assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - before) < 100, 'Tab must not jump away from the section');
      } finally {
        await close();
      }
    });
  }
});
