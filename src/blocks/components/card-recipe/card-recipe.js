(() => {
  if (!document.querySelector('.js-card-recipe-like')) return;

  document.addEventListener('click', (event) => {
    const buttonLike = event.target.closest('.js-card-recipe-like');

    if (!buttonLike) return;

    const isPressed = buttonLike.getAttribute('aria-pressed') === 'true';

    buttonLike.setAttribute('aria-pressed', String(!isPressed));

  });

})();
