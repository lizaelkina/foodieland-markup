import {swiperAbove} from '../../../js/breakpoints/breakpoints';
import {mountSwiper} from '%components%/swiper/swiper-media';

(() => {
  const slider = document.querySelector('.js-instagram-slider');

  if (!slider) return;

  mountSwiper(slider, ({Navigation, A11y}) => ({
    modules: [Navigation, A11y],
    speed: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    slidesPerView: 'auto',
    spaceBetween: 16,
    rewind: true,
    grabCursor: true,
    lazyPreloadPrevNext: 1,
    breakpoints: {
      [swiperAbove('tablet')]: {spaceBetween: 20},
      [swiperAbove('laptop')]: {spaceBetween: 30},
      [swiperAbove('desktop-small')]: {spaceBetween: 40},
    },
    navigation: {
      prevEl: slider.querySelector('.js-instagram-button-prev'),
      nextEl: slider.querySelector('.js-instagram-button-next'),
    },
  }));

})();
