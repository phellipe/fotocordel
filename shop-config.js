/* SANDBOX ONLY. This dedicated endpoint must remain in Stripe test mode.
   Public test checkout becomes available only when the API enables sales.
   Never replace it with a live-payment endpoint without a separate release. No keys here. */
window.FOTOCORDEL_SHOP_CONFIG = Object.freeze({
  enabled: true,
  apiBase: 'https://fotocordel-commerce-test.fotocordel-commerce.workers.dev',
});
