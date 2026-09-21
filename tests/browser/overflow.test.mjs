import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, serve, launchChromium, realPages} from '../helpers.mjs';

// No page may scroll horizontally at any common width, whatever phase its CSS animations are in
// (a floating decoration once pushed the page 4px wider for a few seconds of every cycle).
const WIDTHS = [320, 375, 480, 640, 768, 1024, 1280, 1440, 1920];

test('no horizontal overflow at common widths and animation key points', {timeout: 300000}, async t => {
  const f = await fixture(t, {real: true});
  await f.tasks.build();
  const pages = await realPages(f.outputDir);
  const browser = await launchChromium();
  t.after(() => browser.close());

  for (const {name, base} of pages) {
    // A page with <base> works only under its own path.
    const server = await serve(f.outputDir, base ?? '/');
    try {
      for (const width of WIDTHS) {
        // A fresh load per width: layout built at load on a narrow screen is checked too.
        const page = await browser.newPage({viewport: {width, height: 900}});
        try {
          await page.goto(server.url + name);
          await page.waitForLoadState('networkidle');
          await page.evaluate(() => document.fonts.ready);
          // Narrower than the page's own min-width is outside the design: the page scrolls there on purpose.
          const minWidth = await page.evaluate(() => Math.max(0, ...[document.documentElement, document.body, ...document.body.children]
            .map(element => getComputedStyle(element).minWidth)
            .map(value => (value.endsWith('px') ? parseFloat(value) : 0))));
          if (width < minWidth) {
            t.diagnostic(`${base ?? '/'}${name} @${width}: below min-width ${minWidth}px`);
            continue;
          }
          const failures = await page.evaluate(() => {
            const root = document.documentElement;
            // Elements sticking out past the right edge without an ancestor that clips them.
            const culprits = () => [...document.querySelectorAll('body *')].filter(element => {
              const box = element.getBoundingClientRect();
              if (!box.width || box.right <= root.clientWidth + 0.5) return false;
              for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                if (['hidden', 'clip'].includes(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= root.clientWidth + 0.5) return false;
              }
              return true;
            }).slice(0, 5).map(element => `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);

            const animations = document.getAnimations();
            animations.forEach(animation => animation.pause());
            // Key points of every animation: keyframe offsets o and 1 − o (reverse directions reach offset o at time 1 − o).
            const offsets = new Set([0, 1]);
            for (const animation of animations) {
              for (const {computedOffset} of animation.effect.getKeyframes()) {
                offsets.add(computedOffset);
                offsets.add(1 - computedOffset);
              }
            }
            const animated = [...new Set(animations.filter(animation => animation.effect.pseudoElement)
              .map(animation => `${animation.effect.target.className}${animation.effect.pseudoElement} ${animation.animationName}`))];

            const result = [];
            for (const offset of [...offsets].sort((a, b) => a - b)) {
              for (const animation of animations) {
                const {delay, duration} = animation.effect.getComputedTiming();
                // The very end of an iteration may already wrap to the next one: stop 1 ms earlier.
                animation.currentTime = delay + Math.max(0, offset * duration - (offset === 1 ? 1 : 0));
              }
              const overflow = root.scrollWidth - root.clientWidth;
              if (overflow > 0) result.push({offset: +offset.toFixed(3), overflow, culprits: culprits(), animated});
            }
            return result;
          });
          assert.deepEqual(failures, [], `${base ?? '/'}${name} @${width}`);
        } finally {
          await page.close();
        }
      }
    } finally {
      await server.close();
    }
  }
});
