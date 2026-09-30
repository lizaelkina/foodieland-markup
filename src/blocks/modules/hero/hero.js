import {down, swiperAbove} from '../../../js/breakpoints/breakpoints';
import {loadSwiper} from '%components%/swiper/swiper';

(() => {
  const slider = document.querySelector('.js-hero-slider');

  if (!slider) return;

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const laptopQuery = window.matchMedia(down('laptop'));

  const updateCards = swiper => {
    swiper.slides.forEach(slide => {
      const shift = Math.min(Math.abs(slide.progress), 1);
      slide.style.setProperty('--hero-card-shift', shift.toFixed(3));
    });
  };

  const setCardsTransition = (swiper, duration) => {
    swiper.slides.forEach(slide => {
      slide.style.setProperty('--hero-card-duration', `${duration}ms`);
    });
  };

  const updateInert = swiper => {
    const activeSlide = swiper.slides[swiper.activeIndex];
    const focusedSlide = swiper.slides.find(slide => slide.contains(document.activeElement));

    swiper.slides.forEach((slide) => {
      slide.inert = slide !== activeSlide;
    });

    if (focusedSlide && focusedSlide !== activeSlide) {
      (activeSlide.querySelector('a[href], button') ?? swiper.navigation.nextEl)?.focus({preventScroll: true});
    }
  };

  const mobileOptions = {
    slidesPerView: 1,
    spaceBetween: 16,
    centeredSlides: false,
    breakpoints: {
      [swiperAbove('tablet')]: {slidesPerView: 1.1, spaceBetween: 20},
    },
  };

  const desktopOptions = {
    slidesPerView: 'auto',
    spaceBetween: 30,
    centeredSlides: true,
    breakpoints: {
      [swiperAbove('desktop')]: {spaceBetween: 40},
    },
  };

  loadSwiper().then(({Swiper, Navigation, Pagination, A11y, Autoplay}) => {
    const createSwiper = initialSlide => new Swiper(slider, {
      modules: [Navigation, Pagination, A11y, Autoplay],
      speed: reduceMotionQuery.matches ? 0 : 300,
      loop: true,
      initialSlide,
      roundLengths: true,
      grabCursor: true,
      watchSlidesProgress: true,
      lazyPreloadPrevNext: 1,
      // autoplay: {delay: 4000,},
      a11y: {
        scrollOnFocus: false,
      },
      navigation: {
        prevEl: slider.querySelector('.js-hero-button-prev'),
        nextEl: slider.querySelector('.js-hero-button-next'),
      },
      pagination: {
        el: slider.querySelector('.js-hero-pagination'),
        clickable: true,
      },
      ...(laptopQuery.matches ? mobileOptions : desktopOptions),
      on: {
        progress: updateCards,
        setTransition: setCardsTransition,
        init: updateInert,
        slideChange: updateInert,
      },
    });

    let swiper = createSwiper(0);

    laptopQuery.addEventListener('change', () => {
      const {realIndex} = swiper;

      swiper.destroy(true, true);
      swiper = createSwiper(realIndex);
    });

  }).catch((error) => {
    console.error('Swiper failed to load', error);
  });

})();
