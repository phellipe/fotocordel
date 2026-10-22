import Stripe from 'stripe';

const AMOUNT = 999;
const CURRENCY = 'brl';
const LICENSE = 'Uso pessoal e comercial';
const TOKEN_LIFETIME = 30 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/i;
const REVOKED = new Set(['refunded', 'disputed', 'review']);
const EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'refund.created', 'refund.updated', 'refund.failed', 'charge.refunded',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
]);

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
});
const idOf = object => typeof object === 'string' ? object : object?.id;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const hashToken = async token => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.toLowerCase())),
), byte => byte.toString(16).padStart(2, '0')).join('');
const sameHash = (left, right) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
};

async function boundedBody(request, maximum) {
  const declared = request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    fail(413, 'BODY_TOO_LARGE', 'A solicitação é muito grande.');
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        fail(413, 'BODY_TOO_LARGE', 'A solicitação é muito grande.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

function configuration(env) {
  const mode = env.STRIPE_MODE || 'test';
  if (!['test', 'live'].includes(mode)) fail(503, 'UNAVAILABLE', 'A loja está temporariamente indisponível.');
  let site;
  try {
    site = new URL(env.SITE_URL || 'https://phellipe.eti.br/fotocordel/');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
    if ((site.protocol !== 'https:' && !(mode === 'test' && local && site.protocol === 'http:')) || site.username || site.password || site.search || site.hash) throw new Error();
    site.pathname = `${site.pathname.replace(/\/$/, '')}/`;
  } catch { fail(503, 'UNAVAILABLE', 'A loja está temporariamente indisponível.'); }
  const checkoutSites = new Map([[site.origin, site]]);
  if (env.CHECKOUT_SITE_URLS !== undefined) {
    try {
      const roots = typeof env.CHECKOUT_SITE_URLS === 'string' ? JSON.parse(env.CHECKOUT_SITE_URLS) : env.CHECKOUT_SITE_URLS;
      if (!Array.isArray(roots) || roots.length === 0 || roots.length > 10) throw new Error();
      checkoutSites.clear();
      for (const value of roots) {
        if (typeof value !== 'string' || value.includes('?') || value.includes('#')) throw new Error();
        const root = new URL(value);
        if (root.protocol !== 'https:' || root.username || root.password || checkoutSites.has(root.origin)) throw new Error();
        root.pathname = `${root.pathname.replace(/\/$/, '')}/`;
        checkoutSites.set(root.origin, root);
      }
      if (checkoutSites.get(site.origin)?.href !== site.href) throw new Error();
    } catch { fail(503, 'UNAVAILABLE', 'A loja está temporariamente indisponível.'); }
  }
  const origins = new Set(checkoutSites.keys());
  for (const value of (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)) {
    try {
      const origin = new URL(value);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
      if (origin.origin === value && (origin.protocol === 'https:' || (mode === 'test' && local && origin.protocol === 'http:'))) origins.add(origin.origin);
    } catch { /* Invalid extra origins grant no access. */ }
  }
  const keyReady = new RegExp(`^(rk|sk)_${mode}_[A-Za-z0-9]+$`).test(env.STRIPE_SECRET_KEY || '');
  const ready = Boolean(keyReady && env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') && env.DB && env.ORIGINALS);
  return { mode, site, checkoutSites, origins, ready, sales: env.SALES_ENABLED === 'true' && ready };
}

function publicPhoto(photo) {
  return {
    id: photo.id ?? photo.photo_id, title: photo.title, amount: photo.amount,
    currency: photo.currency, width: photo.width, height: photo.height, license: LICENSE,
  };
}

export function createWorker({ catalog, stripeFactory, now = nowSeconds } = {}) {
  if (!Array.isArray(catalog)) throw new TypeError('A server-side catalog is required.');
  const products = new Map();
  for (const photo of catalog) {
    if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(photo.id) || products.has(photo.id)
      || photo.amount !== AMOUNT || photo.currency !== CURRENCY
      || photo.fileKey !== `originals/${photo.id}.jpg` || photo.filename !== `${photo.id}.jpg`
      || !Number.isSafeInteger(photo.width) || photo.width < 1 || !Number.isSafeInteger(photo.height) || photo.height < 1
      || typeof photo.title !== 'string' || !photo.title.trim()) throw new TypeError('Invalid server-side catalog.');
    products.set(photo.id, Object.freeze({ ...photo }));
  }

  const stripeClient = env => stripeFactory ? stripeFactory(env) : new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-09-30.endive', httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1, timeout: 15000,
  });
  const priceFor = (photo, mode) => mode === 'live' ? photo.livePriceId : (photo.testPriceId || photo.priceId);
  const selectable = (photo, config) => config.sales && /^price_[A-Za-z0-9]+$/.test(priceFor(photo, config.mode) || '')
    && (config.mode !== 'live' || photo.readyForLive === true);
  const exists = async (env, key) => Boolean((await env.ORIGINALS.head(key))?.size);
  const getOrder = (env, id) => env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();

  async function limitNewCheckout(request, env) {
    // Cloudflare supplies this header. Local requests without it share one bucket.
    // Keyed hashing prevents storing raw IPs or a reversible IPv4 hash dictionary.
    const address = (request.headers.get('CF-Connecting-IP') || 'local-or-unknown').slice(0, 64);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`checkout-rate:${address}`));
    const addressHash = Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
    const window = Math.floor(now() / 60) * 60;
    const allowance = await env.DB.prepare(`INSERT INTO checkout_rate_limits (ip_hash, window_start, attempts) VALUES (?, ?, 1)
      ON CONFLICT(ip_hash, window_start) DO UPDATE SET attempts = attempts + 1 WHERE attempts < 10 RETURNING attempts`)
      .bind(addressHash, window).first();
    if (!allowance) fail(429, 'RATE_LIMITED', 'Muitas tentativas de compra. Aguarde um minuto e tente novamente.');
    if (allowance.attempts === 1) await env.DB.prepare('DELETE FROM checkout_rate_limits WHERE window_start < ?').bind(window - 120).run();
  }

  async function authenticate(request, env, id) {
    const header = request.headers.get('Authorization') || '';
    const match = /^Bearer ([0-9a-f]{64})$/i.exec(header);
    if (!match) fail(401, 'INVALID_ORDER_ACCESS', 'Use o navegador em que esta compra foi iniciada.');
    const order = await getOrder(env, id);
    const digest = await hashToken(match[1]);
    if (!order || !sameHash(order.buyer_token_hash, digest)) fail(403, 'INVALID_ORDER_ACCESS', 'Não foi possível acessar este pedido.');
    if (order.expires_at <= now()) fail(410, 'ORDER_ACCESS_EXPIRED', 'O prazo de acesso a este pedido terminou. Entre em contato para recuperar sua compra.');
    return order;
  }

  async function currentPaymentState(order, stripe) {
    if (!order.stripe_session_id) return { status: 'pending', paymentIntentId: null };
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    const expectedLive = order.mode === 'live';
    const knownSession = session.id === order.stripe_session_id && session.livemode === expectedLive
      && session.mode === 'payment' && session.client_reference_id === order.id
      && session.metadata?.order_id === order.id && session.metadata?.photo_id === order.photo_id;
    if (!knownSession) return { status: 'review', paymentIntentId: null };
    const paymentIntentId = idOf(session.payment_intent) || null;
    if (session.status === 'expired') return { status: 'expired', paymentIntentId };
    if (session.payment_status !== 'paid') {
      if (paymentIntentId) {
        const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (intent.status === 'canceled' || (session.status === 'complete' && intent.status === 'requires_payment_method' && intent.last_payment_error)) return { status: 'failed', paymentIntentId };
      }
      return { status: 'pending', paymentIntentId };
    }
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
    const item = items.data?.[0];
    const correctPurchase = session.status === 'complete' && session.amount_total === order.amount && session.currency === order.currency
      && !items.has_more && items.data?.length === 1 && item.quantity === 1
      && idOf(item.price) === order.price_id && item.amount_total === order.amount && item.currency === order.currency;
    if (!correctPurchase || !paymentIntentId) return { status: 'review', paymentIntentId };
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = intent.latest_charge;
    if (intent.id !== paymentIntentId || intent.livemode !== expectedLive || intent.metadata?.order_id !== order.id
      || intent.amount !== order.amount || intent.amount_received !== order.amount || intent.currency !== order.currency
      || intent.status !== 'succeeded' || !charge || typeof charge === 'string'
      || charge.livemode !== expectedLive || !charge.paid || !charge.captured || charge.status !== 'succeeded'
      || charge.amount !== order.amount || charge.currency !== order.currency || idOf(charge.payment_intent) !== intent.id) {
      return { status: 'review', paymentIntentId };
    }
    if (charge.disputed) return { status: 'disputed', paymentIntentId };
    // Pending refunds suspend delivery, but may fail/cancel without reversing payment.
    let after;
    let pendingRefund = false;
    do {
      const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100, ...(after ? { starting_after: after } : {}) });
      if (refunds.data.some(refund => refund.status === 'succeeded')) return { status: 'refunded', paymentIntentId };
      pendingRefund ||= refunds.data.some(refund => ['pending', 'requires_action'].includes(refund.status));
      if (!refunds.has_more) break;
      const next = refunds.data.at(-1)?.id;
      if (!next || next === after) return { status: 'review', paymentIntentId };
      after = next;
    } while (true);
    if (pendingRefund) return { status: 'refund_pending', paymentIntentId };
    if (charge.refunded || charge.amount_refunded > 0) return { status: 'refunded', paymentIntentId };
    return { status: 'paid', paymentIntentId };
  }

  async function reconcile(env, stripe, initialOrder) {
    let order = initialOrder;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Revocation is sticky: a delayed payment event must never restore access.
      if (REVOKED.has(order.status)) return order;
      const state = await currentPaymentState(order, stripe);
      const update = await env.DB.prepare(`UPDATE orders SET status = ?, stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
        updated_at = ?, revision = revision + 1 WHERE id = ? AND revision = ?`)
        .bind(state.status, state.paymentIntentId, now(), order.id, order.revision).run();
      order = await getOrder(env, order.id);
      if (update.meta.changes === 1) return order;
      // Another request committed first. Re-read Stripe instead of applying a stale snapshot.
    }
    fail(503, 'ORDER_BUSY', 'Estamos confirmando seu pagamento. Tente novamente em instantes.');
  }

  async function checkout(request, env, config, stripe) {
    if (!config.sales) fail(503, 'SALES_DISABLED', 'As compras ainda não estão disponíveis.');
    const origin = request.headers.get('Origin');
    const checkoutSite = origin ? config.checkoutSites.get(origin) : config.site;
    if (!checkoutSite) fail(403, 'ORIGIN_FORBIDDEN', 'Origem não autorizada para iniciar uma compra.');
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) fail(415, 'INVALID_CONTENT_TYPE', 'Envie uma solicitação JSON.');
    let body;
    try { body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 2048))); }
    catch (error) { if (error instanceof ApiError) throw error; fail(400, 'INVALID_REQUEST', 'Solicitação de compra inválida.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || typeof body.requestId !== 'string' || !UUID.test(body.requestId)
      || typeof body.buyerToken !== 'string' || !TOKEN.test(body.buyerToken)
      || !['v1', 'v2'].includes(body.edition) || typeof body.photoId !== 'string'
      || Object.keys(body).some(key => !['photoId', 'edition', 'requestId', 'buyerToken'].includes(key))) fail(400, 'INVALID_REQUEST', 'Solicitação de compra inválida.');
    const photo = products.get(body.photoId);
    if (!photo || !selectable(photo, config) || !await exists(env, photo.fileKey)) fail(409, 'PHOTO_UNAVAILABLE', 'Esta fotografia ainda não está disponível para compra.');
    const buyerHash = await hashToken(body.buyerToken);
    const requestId = body.requestId.toLowerCase();
    let order = await env.DB.prepare('SELECT * FROM orders WHERE request_id = ?').bind(requestId).first();
    if (order && (order.photo_id !== photo.id || order.edition !== body.edition || order.mode !== config.mode || !sameHash(order.buyer_token_hash, buyerHash))) fail(409, 'REQUEST_CONFLICT', 'Esta tentativa de compra já foi utilizada.');
    if (order?.stripe_checkout_url) {
      if (order.expires_at <= now()) fail(410, 'ORDER_ACCESS_EXPIRED', 'Inicie uma nova compra.');
      // Stripe, not local age, decides expiry. A paid abandoned return must retain
      // the same Session so retrying cannot create a second charge for that order.
      const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (session.status === 'expired') fail(409, 'CHECKOUT_EXPIRED', 'Esta tentativa de pagamento expirou. Inicie uma nova compra.');
      if (session.id !== order.stripe_session_id || session.livemode !== (config.mode === 'live') || session.client_reference_id !== order.id) fail(502, 'CHECKOUT_UNAVAILABLE', 'Não foi possível abrir o pagamento. Tente novamente.');
      return json({ orderId: order.id, url: order.stripe_checkout_url, mode: order.mode });
    }
    if (!order) await limitNewCheckout(request, env);
    const priceId = order?.price_id || priceFor(photo, config.mode);
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.type !== 'one_time' || price.recurring || price.unit_amount !== AMOUNT
      || price.currency !== CURRENCY || price.livemode !== (config.mode === 'live') || price.id !== priceId) fail(409, 'PHOTO_UNAVAILABLE', 'Esta fotografia ainda não está disponível para compra.');
    if (!order) {
      const time = now();
      await env.DB.prepare(`INSERT OR IGNORE INTO orders
        (id, request_id, buyer_token_hash, photo_id, title, price_id, file_key, filename, width, height, amount, currency, mode, edition, created_at, expires_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), requestId, buyerHash, photo.id, photo.title, priceId, photo.fileKey, photo.filename,
          photo.width, photo.height, AMOUNT, CURRENCY, config.mode, body.edition, time, time + TOKEN_LIFETIME, time).run();
      order = await env.DB.prepare('SELECT * FROM orders WHERE request_id = ?').bind(requestId).first();
      if (order.photo_id !== photo.id || order.edition !== body.edition || order.mode !== config.mode || !sameHash(order.buyer_token_hash, buyerHash)) fail(409, 'REQUEST_CONFLICT', 'Esta tentativa de compra já foi utilizada.');
    }
    if (now() - order.created_at >= 23 * 60 * 60) fail(409, 'CHECKOUT_EXPIRED', 'Inicie uma nova compra.');
    const success = new URL(order.edition === 'v2' ? 'v2/compra.html' : 'compra.html', checkoutSite);
    success.searchParams.set('pedido', order.id);
    const cancel = new URL(success);
    cancel.searchParams.set('cancelado', '1');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', line_items: [{ price: order.price_id, quantity: 1 }],
      client_reference_id: order.id, metadata: { order_id: order.id, photo_id: order.photo_id },
      payment_intent_data: { metadata: { order_id: order.id, photo_id: order.photo_id } },
      success_url: success.href, cancel_url: cancel.href,
      custom_text: { submit: { message: 'Licença da fotografia: uso pessoal e comercial. Download digital após a confirmação do pagamento.' } },
      integration_identifier: 'fotocordel_phmwrqst',
      adaptive_pricing: { enabled: false }, allow_promotion_codes: false,
    }, { idempotencyKey: `fotocordel:${config.mode}:${order.id}` });
    let checkoutUrl;
    try {
      checkoutUrl = new URL(session.url);
      if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com' || checkoutUrl.username || checkoutUrl.password) throw new Error();
    } catch { fail(502, 'CHECKOUT_UNAVAILABLE', 'Não foi possível abrir o pagamento. Tente novamente.'); }
    if (session.livemode !== (config.mode === 'live')) fail(502, 'CHECKOUT_UNAVAILABLE', 'Não foi possível abrir o pagamento. Tente novamente.');
    await env.DB.prepare(`UPDATE orders SET stripe_session_id = ?, stripe_checkout_url = ?, updated_at = ?
      WHERE id = ? AND (stripe_session_id IS NULL OR stripe_session_id = ?)`)
      .bind(session.id, checkoutUrl.href, now(), order.id, session.id).run();
    return json({ orderId: order.id, url: checkoutUrl.href, mode: config.mode }, 201);
  }

  async function eventOrder(env, stripe, event) {
    const object = event.data.object;
    if (event.type.startsWith('checkout.session.')) {
      const order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').bind(object.id).first();
      if (order) return order;
      const candidate = object.metadata?.order_id;
      if (UUID.test(candidate || '')) {
        const pending = await getOrder(env, candidate);
        // A payment webhook can arrive before checkout's database write finishes.
        if (pending && !pending.stripe_session_id && object.client_reference_id === pending.id) {
          await env.DB.prepare('UPDATE orders SET stripe_session_id = ?, updated_at = ? WHERE id = ? AND stripe_session_id IS NULL')
            .bind(object.id, now(), pending.id).run();
          return getOrder(env, pending.id);
        }
      }
      return null;
    }
    let intentId = idOf(object.payment_intent);
    if (!intentId && object.charge) {
      // Refunds and disputes normally include payment_intent. Retrieve only when omitted.
      const charge = await stripe.charges.retrieve(idOf(object.charge));
      intentId = idOf(charge.payment_intent);
    }
    if (!intentId) return null;
    let order = await env.DB.prepare('SELECT * FROM orders WHERE stripe_payment_intent_id = ?').bind(intentId).first();
    if (!order) {
      const intent = await stripe.paymentIntents.retrieve(intentId);
      const candidate = intent.metadata?.order_id;
      if (UUID.test(candidate || '')) order = await getOrder(env, candidate);
    }
    return order;
  }

  async function webhook(request, env, config, stripe) {
    if (!config.ready) fail(503, 'UNAVAILABLE', 'O serviço está temporariamente indisponível.');
    const bytes = await boundedBody(request, 256 * 1024);
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        bytes, request.headers.get('Stripe-Signature') || '', env.STRIPE_WEBHOOK_SECRET,
        300, Stripe.createSubtleCryptoProvider(),
      );
    } catch { fail(400, 'INVALID_SIGNATURE', 'Assinatura do evento inválida.'); }
    if (event.livemode !== (config.mode === 'live')) fail(400, 'INVALID_EVENT_MODE', 'Modo do evento inválido.');
    if (!EVENTS.has(event.type)) return json({ received: true });
    if (typeof event.id !== 'string' || !event.data?.object) fail(400, 'INVALID_EVENT', 'Evento inválido.');
    await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (id, type, object_id, received_at) VALUES (?, ?, ?, ?)')
      .bind(event.id, event.type, idOf(event.data.object) || null, now()).run();
    const previous = await env.DB.prepare('SELECT processed_at FROM stripe_events WHERE id = ?').bind(event.id).first();
    if (previous.processed_at !== null) return json({ received: true, duplicate: true });
    // A failed reconciliation leaves processed_at null, so Stripe's retry can finish it.
    const order = await eventOrder(env, stripe, event);
    if (order) {
      if (order.mode !== config.mode) fail(400, 'INVALID_EVENT_MODE', 'Modo do evento inválido.');
      await reconcile(env, stripe, order);
    }
    await env.DB.prepare('UPDATE stripe_events SET processed_at = ? WHERE id = ? AND processed_at IS NULL').bind(now(), event.id).run();
    return json({ received: true });
  }

  async function route(request, env, config, path) {
    if (path === '/catalog' && request.method === 'GET') {
      const list = await Promise.all([...products.values()].map(async photo => ({
        ...publicPhoto(photo), available: selectable(photo, config) && await exists(env, photo.fileKey),
      })));
      return json({ mode: config.mode, products: list });
    }
    if (path === '/health' && request.method === 'GET') return json({ ok: true, mode: config.mode, salesEnabled: config.sales });
    if (!config.ready) fail(503, 'UNAVAILABLE', 'A loja está temporariamente indisponível.');
    const stripe = stripeClient(env);
    if (path === '/checkout' && request.method === 'POST') return checkout(request, env, config, stripe);
    if (path === '/stripe/webhook' && request.method === 'POST') return webhook(request, env, config, stripe);
    const match = /^\/orders\/([0-9a-f-]{36})(\/download)?$/i.exec(path);
    if (match && UUID.test(match[1]) && ((!match[2] && request.method === 'GET') || (match[2] && request.method === 'POST'))) {
      let order = await authenticate(request, env, match[1]);
      if (order.mode !== config.mode) fail(403, 'INVALID_ORDER_ACCESS', 'Não foi possível acessar este pedido.');
      order = await reconcile(env, stripe, order);
      if (match[2]) {
        if (order.status !== 'paid') fail(409, 'DOWNLOAD_UNAVAILABLE', 'O download só fica disponível após a confirmação do pagamento e sem reembolso ou contestação.');
        const object = await env.ORIGINALS.get(order.file_key);
        if (!object?.body) fail(503, 'FILE_UNAVAILABLE', 'O arquivo está temporariamente indisponível. Tente novamente em instantes.');
        const authorization = await env.DB.prepare(`UPDATE orders SET downloaded_at = ?, download_count = download_count + 1
          WHERE id = ? AND status = 'paid' AND revision = ?`)
          .bind(now(), order.id, order.revision).run();
        if (authorization.meta.changes !== 1) fail(409, 'DOWNLOAD_UNAVAILABLE', 'O estado do pedido mudou. Atualize a página antes de baixar.');
        return new Response(object.body, { headers: {
          'Content-Type': 'image/jpeg', 'Content-Length': String(object.size),
          'Content-Disposition': `attachment; filename="${order.filename}"`,
        } });
      }
      return json({
        orderId: order.id, status: order.status, mode: order.mode, edition: order.edition,
        photo: publicPhoto({ ...order, id: order.photo_id }),
        downloadAvailable: order.status === 'paid' && await exists(env, order.file_key),
        expiresAt: new Date(order.expires_at * 1000).toISOString(),
      });
    }
    fail(404, 'NOT_FOUND', 'Recurso não encontrado.');
  }

  return {
    async fetch(request, env) {
      let config;
      let response;
      let corsOrigin;
      try {
        config = configuration(env);
        const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
        const origin = request.headers.get('Origin');
        if (path !== '/stripe/webhook' && origin) {
          if (!config.origins.has(origin)) fail(403, 'ORIGIN_FORBIDDEN', 'Origem não autorizada.');
          corsOrigin = origin;
        }
        if (request.method === 'OPTIONS') {
          if (!origin || !config.origins.has(origin)) fail(403, 'ORIGIN_FORBIDDEN', 'Origem não autorizada.');
          corsOrigin = origin;
          response = new Response(null, { status: 204, headers: {
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '600',
          } });
        } else response = await route(request, env, config, path);
      } catch (error) {
        // Never return Stripe messages, request bodies, credentials, or buyer data.
        response = error instanceof ApiError
          ? json({ error: { code: error.code, message: error.message } }, error.status)
          : json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Não foi possível concluir agora. Tente novamente em instantes.' } }, 503);
        if (error instanceof ApiError && error.code === 'RATE_LIMITED') response.headers.set('Retry-After', '60');
      }
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store, private');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      headers.set('Vary', 'Origin');
      if (corsOrigin) {
        headers.set('Access-Control-Allow-Origin', corsOrigin);
        headers.set('Access-Control-Expose-Headers', 'Content-Disposition');
      }
      return new Response(response.body, { status: response.status, headers });
    },
  };
}
