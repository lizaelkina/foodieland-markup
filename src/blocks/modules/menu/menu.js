import {initDialog} from '../../components/dialog/dialog';
import {setMenuBurgersState} from '../../components/burger/burger';
import {getAnchorTarget} from '../../components/link/link';

(() => {
  const menuDialog = document.querySelector('.js-menu');
  const openButton = document.querySelector('.js-menu-open');

  if (!menuDialog || !openButton) return;

  const closeButton = menuDialog.querySelector('.js-menu-close');
  const menuItems = Array.from(menuDialog.querySelectorAll('.js-menu-link'));

  if (!closeButton) return;

  initDialog({
    dialog: menuDialog,
    openButton,
    closeButton,
    onOpen: () => setMenuBurgersState(openButton, closeButton, true),
    onClose: ({isBeforeAnimation}) => {
      if (isBeforeAnimation) {
        setMenuBurgersState(openButton, closeButton, false);
      }
    },
    onInit: ({close}) => {
      menuItems.forEach((menuItem) => {
        menuItem.addEventListener('click', async ({target}) => {
          const link = target.closest('a');
          if (await close()) {
            focusSection(link);
          }
        });
      });

      new ResizeObserver(async () => {
        if (openButton.checkVisibility()) return;
        const hadFocus = menuDialog.contains(document.activeElement);
        if (await close() && hadFocus) {
          (document.querySelector('.js-header nav a[aria-current="page"]') ?? document.querySelector('.js-header nav a'))?.focus();
        }
      }).observe(openButton);
    }
  });

  function focusSection(link) {
    const section = getAnchorTarget(link);
    if (!section) return;

    if (!section.hasAttribute('tabindex')) {
      section.setAttribute('tabindex', '-1');
    }
    section.focus({preventScroll: true});
  }

})();
