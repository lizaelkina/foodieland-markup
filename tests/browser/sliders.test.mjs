import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, serve, launchChromium, realPages, PROBE_WIDTHS} from '../helpers.mjs';

// Template convention only: a .swiper with data-swiper-media runs while its media query matches
// (mountSwiper in components/swiper/swiper-media.js). Sizes and visibility of the slider parts belong
// to the project's design and are not checked.
test('sliders with data-swiper-media follow their breakpoint and leave no carousel behind', {timeout: 300000}, async t => {
  const f = await fixture(t, {real: true});
  await f.tasks.build();
  const pages = (await realPages(f.outputDir)).filter(page => !page.base && page.html.includes('data-swiper-media'));
  if (!pages.length) return t.skip('no sliders with data-swiper-media in this project');

  const browser = await launchChromium();
  const server = await serve(f.outputDir);
  t.after(async () => {
    await server.close();
    await browser.close();
  });

  // What keyboard and screen reader users meet: role, tabindex, disabled and aria-* of the slider parts,
  // and the pagination content. Classes, ids and styles hold harmless Swiper traces and are not compared.
  const a11yState = (page, index) => page.evaluate(index => {
    const slider = document.querySelectorAll('[data-swiper-media]')[index];
    const attributes = element => Object.fromEntries([...element.attributes]
      .filter(({name}) => ['role', 'tabindex', 'disabled'].includes(name) || name.startsWith('aria-'))
      .map(({name, value}) => [name, value]));
    return {
      root: attributes(slider),
      wrappers: [...slider.querySelectorAll('.swiper-wrapper')].map(attributes),
      slides: [...slider.querySelectorAll('.swiper-slide')].map(attributes),
      arrows: [...slider.querySelectorAll('.swiper-button-prev, .swiper-button-next')].map(attributes),
      pagination: [...slider.querySelectorAll('.swiper-pagination')].map(element => element.innerHTML),
    };
  }, index);

  const isRunning = (page, index) => page.evaluate(index => document.querySelectorAll('[data-swiper-media]')[index].classList.contains('swiper-initialized'), index);

  const expectRunning = async (page, index, label) => {
    await page.waitForFunction(index => document.querySelectorAll('[data-swiper-media]')[index].classList.contains('swiper-initialized'), index, {timeout: 5000})
      .catch(() => assert.fail(`${label}: slider is not running`));
    // A double initialization adds a second A11y live region; sliders without A11y cannot be checked this way.
    const liveRegions = await page.evaluate(index => document.querySelectorAll('[data-swiper-media]')[index].querySelectorAll('.swiper-notification').length, index);
    assert.ok(liveRegions <= 1, `${label}: slider is initialized twice`);
  };

  const expectStatic = async (page, index, initial, label) => {
    await page.waitForFunction(index => !document.querySelectorAll('[data-swiper-media]')[index].classList.contains('swiper-initialized'), index, {timeout: 5000})
      .catch(() => assert.fail(`${label}: slider keeps running`));
    assert.deepEqual(await a11yState(page, index), initial, `${label}: accessibility state differs from the initial one`);
    const focusable = await page.evaluate(index => [...document.querySelectorAll('[data-swiper-media]')[index].querySelectorAll('button, [tabindex]')]
      .filter(element => !element.closest('.swiper-slide'))
      .filter(element => element.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true
      }) && !element.disabled && element.tabIndex >= 0)
      .map(element => element.className), index);
    assert.deepEqual(focusable, [], `${label}: carousel controls stay focusable`);
  };

  // Horizontal overflow at the current moment, animations paused while measuring.
  const expectNoOverflow = async (page, label) => {
    const overflow = await page.evaluate(() => {
      const animations = document.getAnimations();
      animations.forEach(animation => animation.pause());
      const result = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      animations.forEach(animation => animation.play());
      return result;
    });
    assert.ok(overflow <= 0, `${label}: horizontal overflow ${overflow}px`);
  };

  for (const {name} of pages) {
    const probe = await browser.newPage({viewport: {width: PROBE_WIDTHS[0], height: 900}});
    await probe.goto(server.url + name);
    const queries = await probe.evaluate(() => [...document.querySelectorAll('[data-swiper-media]')].map(slider => slider.dataset.swiperMedia));
    const widths = queries.map(() => ({on: null, off: null}));
    for (const width of PROBE_WIDTHS) {
      await probe.setViewportSize({width, height: 900});
      const matches = await probe.evaluate(queries => queries.map(query => window.matchMedia(query).matches), queries);
      matches.forEach((match, i) => {
        widths[i][match ? 'on' : 'off'] ??= width;
      });
    }
    await probe.close();

    for (const [index, {on, off}] of widths.entries()) {
      const label = `${name} [data-swiper-media="${queries[index]}"]`;
      if (on === null || off === null) {
        t.diagnostic(`${label}: no breakpoint within ${PROBE_WIDTHS.join(', ')}`);
        continue;
      }

      // The initial state: a fresh load where the slider must not run, before any initialization.
      const reference = await browser.newPage({viewport: {width: off, height: 900}});
      await reference.goto(server.url + name);
      await reference.waitForLoadState('networkidle');
      assert.equal(await isRunning(reference, index), false, `${label} @${off}: runs where it must not`);
      const initial = await a11yState(reference, index);
      await reference.close();

      await t.test(`${label}: load at ${off}, then cross the breakpoint both ways`, async () => {
        const page = await browser.newPage({viewport: {width: off, height: 900}});
        try {
          await page.goto(server.url + name);
          await page.waitForLoadState('networkidle');
          await expectStatic(page, index, initial, `${label} @${off}`);
          await page.setViewportSize({width: on, height: 900});
          await expectRunning(page, index, `${label} ${off}→${on}`);
          await expectNoOverflow(page, `${label} ${off}→${on}`);
          await page.setViewportSize({width: off, height: 900});
          await expectStatic(page, index, initial, `${label} ${on}→${off}`);
          await expectNoOverflow(page, `${label} ${on}→${off}`);
        } finally {
          await page.close();
        }
      });

      await t.test(`${label}: load at ${on}, leave and come back; fast toggling starts it once`, async () => {
        const page = await browser.newPage({viewport: {width: on, height: 900}});
        try {
          await page.goto(server.url + name);
          await expectRunning(page, index, `${label} @${on}`);
          await page.setViewportSize({width: off, height: 900});
          await expectStatic(page, index, initial, `${label} ${on}→${off}`);
          await expectNoOverflow(page, `${label} loaded at ${on}, ${on}→${off}`);
          for (const width of [on, off, on, off, on]) await page.setViewportSize({width, height: 900});
          await expectRunning(page, index, `${label} after fast toggling`);
          await expectNoOverflow(page, `${label} after fast toggling`);
        } finally {
          await page.close();
        }
      });
    }
  }
});
