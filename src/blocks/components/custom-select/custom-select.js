import customSelect from 'custom-select';

(() => {

  const SELECT_CLASSES = {
    containerClass: 'custom-select',
    openerClass: 'custom-select__opener js-custom-select',
    panelClass: 'custom-select__panel',
    optionClass: 'custom-select__option',
    optgroupClass: 'custom-select__optgroup',
    isSelectedClass: 'is-selected',
    hasFocusClass: 'is-focus',
    isDisabledClass: 'is-disabled',
    isOpenClass: 'is-open',
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.js-custom-select').forEach(nativeSelect => {
      const [mySelect] = customSelect(nativeSelect, SELECT_CLASSES);
      if (!mySelect) return;

      const {opener, panel} = mySelect;
      const NAV_KEYS = [' ', 'ArrowUp', 'ArrowDown'];

      opener.addEventListener('keydown', (event) => {
        if (NAV_KEYS.includes(event.key)) {
          event.preventDefault();
        }
      });

      const label = nativeSelect.labels?.[0] ||
        (nativeSelect.id ? document.querySelector(`label[for="${nativeSelect.id}"]`) : null);

      if (label) {
        label.addEventListener('click', (event) => {
          event.preventDefault();
          mySelect.open = !mySelect.open;
          opener.focus();
        });
      }

      panel.addEventListener('custom-select:focus-outside-panel', (event) => {
        event.stopPropagation();

        const option = event.target;
        const optionTop = option.offsetTop;
        const optionBottom = optionTop + option.offsetHeight;
        const viewTop = panel.scrollTop;
        const viewBottom = viewTop + panel.clientHeight;

        let target = panel.scrollTop;

        if (optionTop < viewTop) {
          target = optionTop;
        } else if (optionBottom > viewBottom) {
          target = optionBottom - panel.clientHeight;
        }

        panel.scrollTo({top: target, behavior: 'smooth'});
      });
    });
  });

})();
