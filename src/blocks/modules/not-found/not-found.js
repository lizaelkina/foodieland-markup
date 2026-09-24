(() => {
  const notFound = document.querySelector('.js-not-found');

  if (!notFound) return;

  const goBack = notFound.querySelector('.js-go-back');

  if (!goBack) return;

  const canGoBack = document.referrer !== '' && new URL(document.referrer).origin === location.origin && history.length > 1;

  goBack.addEventListener('click', () => {
    if (canGoBack) {
      history.back();
    } else {
      location.href = 'index.html';
    }
  });

})();
