import customSelect from 'custom-select';

(() => {

  const SELECT_CLASSES = {
    containerClass: 'custom-select',
    openerClass: 'custom-select__opener',
    panelClass: 'custom-select__panel',
    optionClass: 'custom-select__option',
    optgroupClass: 'custom-select__optgroup',
    isSelectedClass: 'is-selected',
    hasFocusClass: 'is-focus',
    isDisabledClass: 'is-disabled',
    isOpenClass: 'is-open',
  };

  function setupA11y(mySelect, nativeSelect) {
    const {opener, panel} = mySelect;
    const container = opener.parentElement;
    const options = [...panel.querySelectorAll(`.${SELECT_CLASSES.optionClass}`)];

    nativeSelect.setAttribute('aria-hidden', 'true');

    opener.removeAttribute('aria-owns');
    opener.removeAttribute('aria-autocomplete');
    opener.setAttribute('aria-controls', panel.id);
    opener.setAttribute('aria-haspopup', 'listbox');

    const labelId = opener.getAttribute('aria-labelledby');
    if (labelId) {
      panel.setAttribute('aria-labelledby', labelId);
    }

    const syncA11y = () => {
      options.forEach((option, index) => {
        if (!option.id) {
          option.id = `${panel.id}-option-${index}`;
        }
        option.setAttribute(
          'aria-selected',
          String(option.classList.contains(SELECT_CLASSES.isSelectedClass))
        );
      });

      const focusedOption = panel.querySelector(`.${SELECT_CLASSES.hasFocusClass}`);
      const isOpen = container.classList.contains(SELECT_CLASSES.isOpenClass);

      if (isOpen && focusedOption) {
        opener.setAttribute('aria-activedescendant', focusedOption.id);
      } else {
        opener.removeAttribute('aria-activedescendant');
      }
    };

    new MutationObserver(syncA11y).observe(container, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    syncA11y();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.js-custom-select').forEach(nativeSelect => {
      const [mySelect] = customSelect(nativeSelect, SELECT_CLASSES);
      if (!mySelect) return;

      const {opener, panel} = mySelect;
      const NAV_KEYS = [' ', 'ArrowUp', 'ArrowDown'];

      setupA11y(mySelect, nativeSelect);

      opener.addEventListener('keydown', (event) => {
        if (NAV_KEYS.includes(event.key)) {
          event.preventDefault();
        }

        if (event.key === 'Enter' && !mySelect.open) {
          event.preventDefault();
          event.stopImmediatePropagation();
          mySelect.open = true;
        }
      }, {capture: true});

      const label = nativeSelect.labels?.[0] ||
        (nativeSelect.id ? document.querySelector(`label[for="${nativeSelect.id}"]`) : null);

      if (label) {
        label.addEventListener('click', (event) => {
          event.preventDefault();
          mySelect.open = !mySelect.open;
          opener.focus();
        });
      }

      nativeSelect.form?.addEventListener('reset', () => {
        window.setTimeout(() => {
          mySelect.value = nativeSelect.value;
        });
      });

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
