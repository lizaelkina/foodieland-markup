export function initDialog({dialog, openButton, closeButton, onOpen, onClose, onInit}) {
  if (!dialog || !openButton || !closeButton) return null;

  let closeOperationId = 0;

  async function open() {
    closeOperationId += 1;
    dialog.classList.add('is-open');

    if (typeof onOpen === 'function') onOpen();

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  async function close() {
    if (!dialog.open || dialog.classList.contains('is-closing')) return false;

    const operationId = ++closeOperationId;
    dialog.classList.add('is-closing');

    if (typeof onClose === 'function') onClose({isBeforeAnimation: true});

    await new Promise(resolve => window.requestAnimationFrame(resolve));
    if (operationId !== closeOperationId) return false;

    await Promise.allSettled(
      dialog.getAnimations().map(animation => animation.finished)
    );
    if (operationId !== closeOperationId) return false;

    if (dialog.open) {
      dialog.close();
    }

    dialog.classList.remove('is-closing');

    if (typeof onClose === 'function') onClose({isBeforeAnimation: false});
    return true;
  }

  function closeOnBackdropClick({currentTarget, target}) {
    if (target === currentTarget) {
      close();
    }
  }

  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', closeOnBackdropClick);

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  if (typeof onInit === 'function') {
    onInit({open, close});
  }

  return {open, close};
}
