import test from 'node:test';
import assert from 'node:assert/strict';
import {serve, launchChromium} from '../helpers.mjs';
import {sliderSetup, eachWidth, openPage, pageMinWidth, startSliders, isOutside, formatRect} from './sliders-shared.mjs';

const MAX_TABS = 300;

const outsideText = step => `${step.label} ${formatRect(step.rect)}, slider ${formatRect(step.sliderRect)}`;

// Tab from the top of the page until an element repeats. Catches focus lost to body, keyboard traps,
// focus on slides outside the visible slider area and sliders scrolled by the browser.
async function walkTab(page, report) {
  const visited = new Set();
  const stops = new Map();
  const scrolled = new Map();
  let previous = null;
  let reachedLast = false;
  let lastLabel = 'nothing';
  let repeated = null;
  let presses = 0;
  await page.evaluate(() => document.activeElement?.blur());
  while (presses < MAX_TABS) {
    presses++;
    await page.keyboard.press('Tab');
    const step = await page.evaluate(() => window.__sliderProbe.step());
    lastLabel = step.lastLabel;
    for (const {index, left, top} of step.scrolled) {
      if (!scrolled.has(index)) scrolled.set(index, `swiper #${index}: slider scrolled to scrollLeft ${left}, scrollTop ${top} with focus on ${step.label}`);
    }
    if (step.lost) {
      // Body right after the last element is the end of the page, anywhere else focus is lost.
      if (previous && !previous.afterLast) report(`focus lost: Tab ${presses} from ${previous.label} moved focus to body`);
      previous = null;
      continue;
    }
    // Tab inside an iframe or a date input keeps the same active element: one stop, not a repeat.
    // A real trap on one element still runs into MAX_TABS.
    if (previous && step.id === previous.id) continue;
    if (visited.has(step.id)) {
      repeated = step.label;
      break;
    }
    visited.add(step.id);
    if (step.afterLast) reachedLast = true;
    if (step.slider >= 0) {
      const counter = stops.get(step.slider) ?? {count: 0, outside: 0, example: null};
      counter.count++;
      if (isOutside(step.rect, step.sliderRect)) {
        counter.outside++;
        counter.example ??= outsideText(step);
      }
      stops.set(step.slider, counter);
    }
    previous = step;
  }
  if (!reachedLast) {
    const inside = [...stops].map(([index, {count, outside}]) => `#${index} ${count} (${outside} outside)`).join(', ');
    const end = repeated ? `Tab returned to ${repeated} after ${presses} presses` : `${presses} Tab presses`;
    report(`keyboard trap: last focusable ${lastLabel} not reached, ${end}; stops in sliders: ${inside || 'none'}`);
  }
  for (const [index, {count, outside, example}] of stops) {
    if (outside) report(`swiper #${index}: focus outside slider at ${outside} of ${count} stops, e.g. ${example}`);
  }
  scrolled.forEach(message => report(message));
}

// Slide change while focus is inside the active slide: focus must never fall to body. A slider that
// keeps only the active slide reachable (inert on the others) must also move focus into view;
// in a slider with every slide focusable the focus may stay on a slide that left the view.
async function changeSlides(page, running, report, note) {
  for (const index of running) {
    const start = await page.evaluate(index => {
      const probe = window.__sliderProbe;
      const {swiper} = probe.sliders()[index];
      const target = probe.focusables(swiper.slides[swiper.activeIndex])[0];
      target?.focus();
      return target ? probe.describe(target) : null;
    }, index);
    if (!start) {
      note(`swiper #${index}: no focusable element in the active slide, slide change not checked`);
      continue;
    }
    await page.evaluate(() => window.__sliderProbe.settle());
    for (const method of ['slideNext', 'slidePrev']) {
      await page.evaluate(([index, method]) => window.__sliderProbe.sliders()[index].swiper[method](), [index, method]);
      const step = await page.evaluate(() => window.__sliderProbe.step());
      const inert = await page.evaluate(index => window.__sliderProbe.sliders()[index].swiper.slides.some(slide => slide.inert), index);
      const where = `after ${method} with focus on ${start}`;
      if (step.lost) report(`swiper #${index}: focus lost ${where}`);
      else if (step.slider >= 0 && isOutside(step.rect, step.sliderRect)) {
        const message = `swiper #${step.slider}: focus outside slider ${where}: ${outsideText(step)}`;
        if (inert) report(message);
        else note(`${message} (no inert slides, not an error)`);
      }
      step.scrolled.forEach(({index: scrolledIndex, left, top}) => report(`swiper #${scrolledIndex}: slider scrolled to scrollLeft ${left}, scrollTop ${top} ${where}`));
    }
    await page.evaluate(() => document.activeElement?.blur());
  }
}

// Every visible pagination bullet needs its own 24×24 target around its center (WCAG 2.5.8).
async function checkBullets(page, running, report) {
  const problems = await page.evaluate(running => {
    const probe = window.__sliderProbe;
    const result = [];
    for (const index of running) {
      const bullets = [...probe.sliders()[index].querySelectorAll('.swiper-pagination-bullet')]
        .filter(bullet => bullet.checkVisibility({visibilityProperty: true, opacityProperty: true}));
      bullets.forEach((bullet, number) => {
        bullet.scrollIntoView({block: 'center', inline: 'nearest', behavior: 'instant'});
        const box = bullet.getBoundingClientRect();
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;
        let misses = 0;
        let thief = null;
        // ±11 px, not ±12: Chromium snaps boxes at fractional positions to whole pixels,
        // which moves the edges of a 24px target by up to half a pixel.
        for (let i = 0; i <= 10; i++) {
          for (let j = 0; j <= 10; j++) {
            const hit = document.elementFromPoint(centerX - 11 + i * 2.2, centerY - 11 + j * 2.2);
            if (!hit || !bullet.contains(hit)) {
              misses++;
              thief ??= probe.describe(hit);
            }
          }
        }
        if (misses) result.push(`swiper #${index}: bullet ${number + 1} target is smaller than 24×24, ${misses} of 121 points hit ${thief}`);
      });
    }
    return result;
  }, running);
  problems.forEach(report);
}

test('sliders keep keyboard focus on visible elements and let it leave', {timeout: 600000}, async t => {
  const {f, pages, widths} = await sliderSetup(t);
  if (!pages.length) return t.skip('no .swiper on the built pages');
  const browser = await launchChromium();
  const server = await serve(f.outputDir);
  t.after(async () => {
    await server.close();
    await browser.close();
  });

  for (const {name} of pages) {
    await t.test(name, async st => {
      const problems = [];
      await eachWidth(widths, async width => {
        const report = message => problems.push([width, `@${width} ${message}`]);
        const note = message => st.diagnostic(`${name} @${width}: ${message}`);
        const {context, page} = await openPage(browser, server.url + name, width);
        try {
          await page.waitForLoadState('networkidle');
          const minWidth = await pageMinWidth(page);
          if (width < minWidth) return note(`below min-width ${minWidth}px`);
          const sliders = await startSliders(page);
          sliders.forEach(({expected, running}, index) => {
            if (expected && !running) report(`swiper #${index}: slider is not running`);
          });
          const running = sliders.flatMap(({running}, index) => (running ? [index] : []));
          if (!running.length) return note('no running sliders');
          await walkTab(page, report);
          await changeSlides(page, running, report, note);
          await checkBullets(page, running, report);
        } finally {
          await context.close();
        }
      });
      // Widths finish in any order: the report goes from narrow to wide.
      if (problems.length) assert.fail(`${name}:\n${problems.sort((a, b) => a[0] - b[0]).map(([, message]) => message).join('\n')}`);
    });
  }
});
