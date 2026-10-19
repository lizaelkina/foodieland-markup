(() => {

  const initPagination = (nav) => {
    const pages = [...nav.querySelectorAll('[data-page]')];
    const total = pages.length;
    const siblings = Number(nav.dataset.siblings);

    const requested = Number.parseInt(new URLSearchParams(window.location.search).get('page'), 10);
    const current = Math.min(Math.max(requested || 1, 1), total);

    const currentLink = pages[current - 1].querySelector('.js-pagination-item');
    currentLink.setAttribute('aria-current', 'page');
    currentLink.removeAttribute('href');

    const [gapBefore, gapAfter] = nav.querySelectorAll('.js-pagination-gap');
    if (!gapAfter) return;

    const start = Math.max(Math.min(current - siblings, total - siblings * 2 - 2), 3);
    const end = Math.min(Math.max(current + siblings, siblings * 2 + 3), total - 2);

    pages.forEach((li, i) => {
      const page = i + 1;
      li.hidden = !(
        page === 1 || page === total ||
        (page >= start && page <= end) ||
        (page === 2 && start === 3) ||
        (page === total - 1 && end === total - 2)
      );
    });
    gapBefore.hidden = start === 3;
    gapAfter.hidden = end === total - 2;
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.js-pagination').forEach(initPagination);
  });

})();
