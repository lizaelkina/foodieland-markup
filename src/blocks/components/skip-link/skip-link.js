(() => {
  const skipLink = document.querySelector('.js-skip-link');

  if (!skipLink) return;

  skipLink.addEventListener('click', (event) => {
    const target = document.getElementById(skipLink.hash.slice(1));

    if (!target) return;

    event.preventDefault();
    target.focus();
  });

})();
