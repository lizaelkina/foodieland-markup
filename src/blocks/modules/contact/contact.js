(() => {
  const contactForm = document.querySelector('.js-contact-form');

  if (!contactForm) return;

  const liveStatus = contactForm.querySelector('.js-contact-status');
  const submitButton = contactForm.querySelector('.js-contact-submit');
  const successText = contactForm.querySelector('.js-contact-message');
  const successMessage = successText.textContent.trim();

  if (!liveStatus || !submitButton || !successText) return;

  const SUCCESS_MESSAGE_DURATION_MS = 2000;

  let isSubmitting = false;

  function delay(duration) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) return;

    isSubmitting = true;
    submitButton.setAttribute('aria-disabled', 'true');

    try {
      contactForm.reset();
      liveStatus.textContent = successMessage;
      successText.classList.add('is-success');
      await delay(SUCCESS_MESSAGE_DURATION_MS);
      successText.classList.remove('is-success');
      liveStatus.textContent = '';
    } finally {
      submitButton.removeAttribute('aria-disabled');
      isSubmitting = false;
    }
  }

  contactForm.addEventListener('submit', handleSubmit);

})();
