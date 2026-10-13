import {mountSwiper} from '%components%/swiper/swiper-media';

(() => {

  const sliders = document.querySelectorAll('.js-recipes-slider');

  sliders.forEach((slider) => {
    mountSwiper(slider, ({Pagination, A11y}) => ({
      modules: [Pagination, A11y],
      speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
      slidesPerView: 'auto',
      spaceBetween: 16,
      rewind: true,
      grabCursor: true,
      lazyPreloadPrevNext: 1,
      pagination: {
        el: slider.querySelector('.js-recipes-pagination'),
        clickable: true,
      },
    }));
  });

})();
