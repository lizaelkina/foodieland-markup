(() => {

  const printButton = document.querySelector('.js-print-button');
  const shareButton = document.querySelector('.js-share-button');
  const shareStatus = document.querySelector('.js-share-status');

  if (shareButton && shareStatus) {
    shareButton.addEventListener('click', async () => {
      shareStatus.textContent = '';

      if (navigator.share) {
        try {
          await navigator.share({title: document.title, url: location.href});
        } catch (error) {
          if (error.name !== 'AbortError') shareStatus.textContent = 'Sharing failed';
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(location.href);
        shareStatus.textContent = 'Link copied';
      } catch {
        shareStatus.textContent = 'Could not copy the link';
      }
    });
  }

  if (printButton) {
    printButton.addEventListener('click', () => {
      window.print();
    });
  }

})();
