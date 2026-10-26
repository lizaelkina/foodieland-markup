import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {serve, launchChromium} from '../helpers.mjs';
import {sliderSetup, eachWidth, openPage, pageMinWidth, startSliders, formatRect} from './sliders-shared.mjs';

const CHUNK_DELAY = 1000;
const MAX_SHIFT = 0.01;

// Layout shifts from the first paint. Sources are resolved at once, while their nodes are still in place.
function recordShifts() {
  window.__sliderShifts = [];
  new PerformanceObserver(list => {
    const probe = window.__sliderProbe;
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      const sliders = probe.sliders();
      window.__sliderShifts.push({
        value: entry.value,
        sources: entry.sources.map(source => {
          const node = source.node?.nodeType === Node.TEXT_NODE ? source.node.parentElement : source.node;
          const slider = node?.closest?.('.swiper');
          return {
            slider: slider ? sliders.indexOf(slider) : -1,
            node: node ? probe.describe(node) : 'removed node',
            previousRect: probe.round(source.previousRect),
            currentRect: probe.round(source.currentRect)
          };
        })
      });
    }
  }).observe({type: 'layout-shift', buffered: true});
}

const shiftText = ({value, sources}) => `  ${value.toFixed(4)}: ${sources.filter(source => source.slider >= 0)
  .map(source => `swiper #${source.slider} ${source.node} ${formatRect(source.previousRect)} → ${formatRect(source.currentRect)}`)
  .join('; ')}`;

test('sliders do not shift the layout when Swiper starts', {timeout: 600000}, async t => {
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
        let chunkDelayed = false;
        const {context, page} = await openPage(browser, server.url + name, width, async context => {
          // A font swap is not a slider shift.
          await context.route('**/*.woff2', route => route.abort());
          // A slow Swiper chunk keeps the layout before initialization on screen long enough to measure the jump.
          await context.route(/\/chunks\/swiper\.[^/?]+\.js(\?.*)?$/, async route => {
            chunkDelayed = true;
            await delay(CHUNK_DELAY);
            await route.continue();
          });
          await context.addInitScript(recordShifts);
        });
        try {
          const minWidth = await pageMinWidth(page);
          if (width < minWidth) return note(`below min-width ${minWidth}px`);
          const sliders = await startSliders(page);
          sliders.forEach(({expected, running}, index) => {
            if (expected && !running) report(`swiper #${index}: slider is not running`);
          });
          const running = sliders.flatMap(({running}, index) => (running ? [index] : []));
          if (!running.length) return note('no running sliders');
          if (!chunkDelayed) note('the Swiper chunk was not requested, its delay did not apply');
          await delay(500);
          const {shifts, below} = await page.evaluate(running => ({
            shifts: window.__sliderShifts.filter(shift => shift.sources.some(source => source.slider >= 0)),
            below: running.filter(index => window.__sliderProbe.sliders()[index].getBoundingClientRect().top >= innerHeight)
          }), running);
          if (below.length) note(`CLS not measured below the first screen: swiper #${below.join(', #')}`);
          const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
          if (total >= MAX_SHIFT) report(`layout shift ${total.toFixed(4)} inside sliders when Swiper starts (limit ${MAX_SHIFT}):\n${shifts.map(shiftText).join('\n')}`);
        } finally {
          await context.close();
        }
      });
      // Widths finish in any order: the report goes from narrow to wide.
      if (problems.length) assert.fail(`${name}:\n${problems.sort((a, b) => a[0] - b[0]).map(([, message]) => message).join('\n')}`);
    });
  }
});
