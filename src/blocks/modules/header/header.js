(() => {
  const header = document.querySelector('.js-header');

  if (!header) return;

  let isScrolledLast = false;

  function updateScrolled() {
    const isScrolled = window.scrollY > 50;

    if (isScrolled !== isScrolledLast) {
      header.classList.toggle('is-scrolled', isScrolled);
      isScrolledLast = isScrolled;
    }
  }

  updateScrolled();

  window.addEventListener('scroll', updateScrolled, {passive: true});

  new ResizeObserver(([entry]) => {
    document.documentElement.style.setProperty('--header-height', `${Math.ceil(entry.borderBoxSize[0].blockSize)}px`);
  }).observe(header);

})();
