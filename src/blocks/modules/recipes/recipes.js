import {mountSwiper} from '%components%/swiper/swiper-media';

(() => {

  const sliders = document.querySelectorAll('.js-recipes-slider');

  sliders.forEach((slider) => {
    mountSwiper(slider, ({Navigation, Pagination, A11y}) => ({
      modules: [Navigation, Pagination, A11y],
      speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
      slidesPerView: 'auto',
      spaceBetween: 16,
      rewind: true,
      grabCursor: true,
      lazyPreloadPrevNext: 1,
      navigation: {
        prevEl: slider.querySelector('.js-recipes-button-prev'),
        nextEl: slider.querySelector('.js-recipes-button-next'),
      },
      pagination: {
        el: slider.querySelector('.js-recipes-pagination'),
        clickable: true,
      },
    }));
  });

})();
