(() => {
  const contactForm = document.querySelector('.js-contact-form');

  if (!contactForm) return;

  const submitButton = contactForm.querySelector('.js-contact-submit');
  const successText = contactForm.querySelector('.js-contact-message');

  if (!submitButton || !successText) return;

  const SUCCESS_MESSAGE_DURATION_MS = 2000;

  function delay(duration) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    submitButton.disabled = true;

    try {
      contactForm.reset();
      successText.classList.add('is-success');
      await delay(SUCCESS_MESSAGE_DURATION_MS);
      successText.classList.remove('is-success');
    } catch (error) {
      console.error('Error submitting the form:', error);
    } finally {
      submitButton.disabled = false;
    }
  }

  contactForm.addEventListener('submit', handleSubmit);

})();
