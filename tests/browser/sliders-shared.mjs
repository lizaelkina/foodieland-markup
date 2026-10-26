import {fixture, realPages, hasClass, readBreakpoints, sliderWidths} from '../helpers.mjs';

// Installed into the page before its own scripts. Relies only on Swiper classes, element.swiper
// and data-swiper-media, never on the project's blocks.
export function installProbe() {
  const FOCUSABLE = 'a[href], area[href], button, input, select, textarea, iframe, summary, [tabindex], [contenteditable]';
  const ids = new WeakMap();
  let nextId = 1;
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

  const probe = {
    sliders: () => [...document.querySelectorAll('.swiper')],
    shouldRun: slider => !slider.dataset.swiperMedia || matchMedia(slider.dataset.swiperMedia).matches,
    round: ({left, top, right, bottom}) => ({left: Math.round(left), top: Math.round(top), right: Math.round(right), bottom: Math.round(bottom)}),
    rect: element => probe.round(element.getBoundingClientRect()),
    // A stable number per element: slides moved in the DOM keep it.
    id(element) {
      if (!element) return 0;
      if (!ids.has(element)) ids.set(element, nextId++);
      return ids.get(element);
    },
    describe(element) {
      if (!element) return 'nothing';
      const classes = [...element.classList].map(name => `.${name}`).join('');
      const text = (element.getAttribute('href') ?? element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim();
      return `${element.tagName.toLowerCase()}${classes}${text ? ` "${text.slice(0, 40)}"` : ''}`;
    },
    isFocusable(element) {
      if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[inert]')) return false;
      if (!element.checkVisibility({visibilityProperty: true})) return false;
      const box = element.getBoundingClientRect();
      return box.width > 0 || box.height > 0;
    },
    focusables: (root = document) => [...root.querySelectorAll(FOCUSABLE)].filter(element => probe.isFocusable(element)),
    // A radio group is one Tab stop: the checked radio, or the first one when none is checked.
    isTabStop(element) {
      if (element.type !== 'radio' || !element.name) return true;
      const group = [...(element.form ?? document).querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)]
        .filter(radio => radio.form === element.form);
      return element === (group.find(radio => radio.checked) ?? group[0]);
    },
    // The last stop of Tab: positive tabindex comes first, then tabindex 0 in DOM order.
    lastFocusable() {
      const all = probe.focusables().filter(element => probe.isTabStop(element));
      const natural = all.filter(element => element.tabIndex === 0);
      return natural.at(-1) ?? all.sort((a, b) => a.tabIndex - b.tabIndex).at(-1) ?? null;
    },
    // Waits for slide transitions and for A11y focus handlers, which run in the next frame.
    async settle() {
      await frame();
      await frame();
      const deadline = performance.now() + 3000;
      while (probe.sliders().some(slider => slider.swiper?.animating) && performance.now() < deadline) await frame();
      await frame();
    },
    // What is focused after the page settles, and whether a slider was scrolled under it.
    async step() {
      await probe.settle();
      const sliders = probe.sliders();
      const active = document.activeElement;
      const lost = !active || active === document.body || active === document.documentElement;
      const slider = lost ? null : active.closest('.swiper-initialized');
      const last = probe.lastFocusable();
      return {
        id: lost ? 0 : probe.id(active),
        lost,
        // Tab may also stop on elements outside the FOCUSABLE list (e.g. a scrollable box):
        // anything after the last known element counts as the end of the page.
        afterLast: !lost && Boolean(last) && (active === last || Boolean(last.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING)),
        label: lost ? 'body' : probe.describe(active),
        slider: slider ? sliders.indexOf(slider) : -1,
        rect: lost ? null : probe.rect(active),
        sliderRect: slider ? probe.rect(slider) : null,
        scrolled: sliders.map((item, index) => ({index, left: item.scrollLeft, top: item.scrollTop})).filter(item => item.left || item.top),
        lastLabel: probe.describe(last)
      };
    }
  };
  window.__sliderProbe = probe;
}

// Built pages with a .swiper (pages with <base> work only under their own path) and the widths to check.
export async function sliderSetup(t) {
  const f = await fixture(t, {real: true});
  await f.tasks.build();
  const pages = (await realPages(f.outputDir)).filter(page => !page.base && hasClass(page.html, 'swiper'));
  return {f, pages, widths: sliderWidths(readBreakpoints(f.rootDir))};
}

// Every width is a fresh page in its own context, so a few of them run at once to keep the test short.
export async function eachWidth(widths, check, parallel = 4) {
  const queue = [...widths];
  const worker = async () => {
    while (queue.length) await check(queue.shift());
  };
  await Promise.all(Array.from({length: parallel}, worker));
}

// Reduced motion: the template sets Swiper speed to 0, so slide changes finish at once.
export async function openPage(browser, url, width, prepare = async () => {}) {
  const context = await browser.newContext({viewport: {width, height: 900}, reducedMotion: 'reduce'});
  await context.addInitScript(installProbe);
  await prepare(context);
  const page = await context.newPage();
  await page.goto(url);
  return {context, page};
}

// Narrower than the page's own min-width is outside the design: the page scrolls there on purpose.
export function pageMinWidth(page) {
  return page.evaluate(() => Math.max(0, ...[document.documentElement, document.body, ...document.body.children]
    .map(element => getComputedStyle(element).minWidth)
    .map(value => (value.endsWith('px') ? parseFloat(value) : 0))));
}

// Waits until every slider that must run at this width is initialized. A slider that never starts
// is not an exception here: the caller reports it with the page and width.
export async function startSliders(page) {
  await page.waitForFunction(() => window.__sliderProbe.sliders()
    .every(slider => !window.__sliderProbe.shouldRun(slider) || slider.classList.contains('swiper-initialized')), null, {timeout: 5000})
    .catch(() => {});
  await page.evaluate(() => window.__sliderProbe.settle());
  return page.evaluate(() => window.__sliderProbe.sliders().map(slider => ({
    expected: window.__sliderProbe.shouldRun(slider),
    running: slider.classList.contains('swiper-initialized')
  })));
}

export const isOutside = (rect, box) => rect.left < box.left - 1 || rect.top < box.top - 1 || rect.right > box.right + 1 || rect.bottom > box.bottom + 1;

export const formatRect = ({left, top, right, bottom}) => `(${left}, ${top})–(${right}, ${bottom})`;
