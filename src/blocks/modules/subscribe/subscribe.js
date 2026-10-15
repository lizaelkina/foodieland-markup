(() => {
  const subscribeSection = document.querySelector('.js-subscribe');
  const subscribeForm = subscribeSection?.querySelector('.js-subscribe-form');

  if (!subscribeForm) return;

  const titleContainer = subscribeForm.querySelector('.js-subscribe-title');
  const liveStatus = subscribeForm.querySelector('.js-subscribe-status');
  const submitButton = subscribeForm.querySelector('.js-subscribe-submit');
  const successTitleText = titleContainer
    ?.querySelector('[data-title="success"]')
    ?.textContent;

  if (!titleContainer || !liveStatus || !submitButton || !successTitleText) {
    return;
  }

  const SUCCESS_MESSAGE_DURATION_MS = 2000;

  let isTransitioning = false;

  function delay(duration) {
    return new Promise(resolve => window.setTimeout(resolve, duration));
  }

  async function transitionTitleTo(state) {
    titleContainer.dataset.state = state === 'success'
      ? 'to-success'
      : 'to-default';

    const nextTitle = titleContainer.querySelector(`[data-title="${state}"]`);

    if (nextTitle) {
      await Promise.allSettled(
        nextTitle.getAnimations().map(animation => animation.finished)
      );
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isTransitioning) return;

    isTransitioning = true;
    submitButton.disabled = true;

    try {
      subscribeForm.reset();
      liveStatus.textContent = successTitleText;
      await transitionTitleTo('success');
      await delay(SUCCESS_MESSAGE_DURATION_MS);
      liveStatus.textContent = '';
      await transitionTitleTo('default');
    } catch (error) {
      console.error('Error submitting the form:', error);
    } finally {
      submitButton.disabled = false;
      isTransitioning = false;
    }
  }

  subscribeForm.addEventListener('submit', handleSubmit);

})();
