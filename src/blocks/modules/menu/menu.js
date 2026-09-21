import {setMenuBurgersState} from '../../components/burger/burger';
import {getAnchorTarget} from '../../components/link/link';

(() => {
  const menuDialog = document.querySelector('.js-menu');
  const openButton = document.querySelector('.js-menu-open');

  if (!menuDialog || !openButton) return;

  const closeButton = menuDialog.querySelector('.js-menu-close');
  const menuItems = Array.from(menuDialog.querySelectorAll('.js-menu-link'));

  if (!closeButton) return;

  let closeOperationId = 0;

  function openMenu() {
    closeOperationId += 1;
    menuDialog.classList.remove('is-closing');

    if (!menuDialog.open) {
      menuDialog.showModal();
    }

    setMenuBurgersState(openButton, closeButton, true);
  }

  async function closeMenu() {
    if (!menuDialog.open || menuDialog.classList.contains('is-closing')) return false;

    const operationId = ++closeOperationId;

    setMenuBurgersState(openButton, closeButton, false);
    menuDialog.classList.add('is-closing');

    await new Promise(resolve => window.requestAnimationFrame(resolve));

    if (operationId !== closeOperationId) return false;

    await Promise.allSettled(
      menuDialog.getAnimations().map(animation => animation.finished)
    );

    if (operationId !== closeOperationId) return false;

    if (menuDialog.open) {
      menuDialog.close();
    }

    menuDialog.classList.remove('is-closing');

    return true;
  }

  function focusSection(link) {
    const section = getAnchorTarget(link);

    if (!section) return;

    if (!section.hasAttribute('tabindex')) {
      section.setAttribute('tabindex', '-1');
    }

    section.focus({preventScroll: true});
  }

  function closeOnBackdropClick({currentTarget, target}) {
    if (target === currentTarget) {
      closeMenu();
    }
  }

  menuItems.forEach((menuItem) => {
    menuItem.addEventListener('click', async ({target}) => {
      const link = target.closest('a');

      if (await closeMenu()) {
        focusSection(link);
      }
    });
  });

  openButton.addEventListener('click', openMenu);
  closeButton.addEventListener('click', closeMenu);
  menuDialog.addEventListener('click', closeOnBackdropClick);

  menuDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeMenu();
  });

  new ResizeObserver(async () => {
    if (openButton.checkVisibility()) return;
    const hadFocus = menuDialog.contains(document.activeElement);
    if (await closeMenu() && hadFocus) {
      (document.querySelector('.js-header nav a[aria-current="page"]') ?? document.querySelector('.js-header nav a'))?.focus();
    }
  }).observe(openButton);

})();
