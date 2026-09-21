import {loadSwiper} from './swiper';

const SLIDE_ATTRIBUTES = ['role', 'aria-label'];

// Swiper's destroy() keeps A11y attributes, tabindex and pagination bullets:
// the static layout must not expose a carousel to keyboard and screen reader users.
function cleanUp(slider, originalSlideAttributes) {
  slider.querySelector('.swiper-wrapper')?.removeAttribute('aria-live');

  slider.querySelectorAll('.swiper-button-prev, .swiper-button-next').forEach((button) => {
    button.removeAttribute('tabindex');
    button.disabled = true;
  });

  slider.querySelectorAll('.swiper-pagination').forEach(pagination => pagination.replaceChildren());

  slider.querySelectorAll('.swiper-slide').forEach((slide) => {
    const original = originalSlideAttributes.get(slide);

    SLIDE_ATTRIBUTES.forEach((name) => {
      const value = original?.[name] ?? null;

      if (value === null) {
        slide.removeAttribute(name);
      } else {
        slide.setAttribute(name, value);
      }
    });
  });
}

// Runs a slider only while its data-swiper-media query matches
// (e.g. a mobile-only slider that is a grid on wider screens).
// Without the attribute the slider always runs.
export function mountSwiper(slider, getOptions) {
  const query = slider.dataset.swiperMedia ? window.matchMedia(slider.dataset.swiperMedia) : null;

  // Swiper's A11y module overwrites role and aria-label of slides: remember the author's values to restore them.
  const originalSlideAttributes = new Map([...slider.querySelectorAll('.swiper-slide')].map(slide => [
    slide,
    Object.fromEntries(SLIDE_ATTRIBUTES.map(name => [name, slide.getAttribute(name)])),
  ]));

  let swiper = null;
  let swiperModule = null;

  async function sync() {
    if (query && !query.matches) {
      if (swiper) {
        swiper.destroy(true, true);
        swiper = null;
        cleanUp(slider, originalSlideAttributes);
      }
      return;
    }

    if (swiper) return;

    swiperModule ??= loadSwiper();

    let modules;

    try {
      modules = await swiperModule;
    } catch (error) {
      swiperModule = null;
      console.error('Swiper failed to load', error);
      return;
    }

    // The breakpoint may have flipped, or another sync() may have finished, while the chunk was loading.
    if ((query && !query.matches) || swiper) return;

    swiper = new modules.Swiper(slider, getOptions(modules));
  }

  sync();
  query?.addEventListener('change', sync);
}
