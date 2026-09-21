// Keep in sync with $breakpoints in src/styles/helpers/_variables.scss.
export const BREAKPOINTS = {
  'mobile': 480,
  'mobile-wide': 640,
  'tablet': 768,
  'tablet-wide': 800,
  'laptop-small': 960,
  'laptop': 1024,
  'desktop-small': 1170,
  'desktop': 1200,
  'desktop-wide': 2000,
};

function widthOf(name) {
  const width = BREAKPOINTS[name];

  if (width === undefined) throw new Error(`Unknown breakpoint "${name}"`);

  return width;
}

// The same query as the down($name) mixin: for matchMedia and data-swiper-media
export const down = name => `(max-width: ${widthOf(name)}px)`;

// Swiper breakpoint keys mean "width >= key": the range right above down(name) starts at width + 1
export const swiperAbove = name => widthOf(name) + 1;
