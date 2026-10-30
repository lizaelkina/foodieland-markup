import {initDialog} from '../../components/dialog/dialog';

(() => {
  const modalDialog = document.querySelector('.js-modal');
  const openButton = document.querySelector('.js-modal-open');

  if (!modalDialog || !openButton) return;

  const closeButton = document.querySelector('.js-modal-close');
  const iframe = modalDialog.querySelector('.js-iframe');

  if (!closeButton || !iframe) return;

  const videoSrc = iframe.dataset.src;

  initDialog({
    dialog: modalDialog,
    openButton,
    closeButton,
    onOpen: () => {
      if (iframe.src !== videoSrc) {
        iframe.src = videoSrc;
      }
    },
    onClose: ({isBeforeAnimation}) => {
      if (isBeforeAnimation) {
        iframe.src = 'about:blank';
      }
    }
  });

})();
