import {mountSwiper} from '%components%/swiper/swiper-media';

(() => {
  const slider = document.querySelector('.js-simple-slider');

  if (!slider) return;

  mountSwiper(slider, ({Navigation, Pagination, A11y}) => ({
    modules: [Navigation, Pagination, A11y],
    speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    slidesPerView: 'auto',
    spaceBetween: 16,
    rewind: true,
    grabCursor: true,
    lazyPreloadPrevNext: 1,
    navigation: {
      prevEl: slider.querySelector('.js-simple-button-prev'),
      nextEl: slider.querySelector('.js-simple-button-next'),
    },
    pagination: {
      el: slider.querySelector('.js-simple-pagination'),
      clickable: true,
    },
  }));

})();
