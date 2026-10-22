import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, PHOTO, BUYER_TOKEN } from './helpers.js';

test('catalog only exposes public fields and respects setup, files and live readiness', async t => {
  const f = fixture(); t.after(() => f.db.close());
  let response = await f.api('/catalog');
  assert.equal(response.status, 200);
  let data = await response.json();
  assert.equal(data.mode, 'test'); assert.equal(data.products[0].available, true);
  assert.equal(data.products[0].license, 'Uso pessoal e comercial');
  assert.equal(JSON.stringify(data).includes('fileKey'), false);
  assert.equal(JSON.stringify(data).includes('price_testfixture'), false);
  f.files.clear(); data = await (await f.api('/catalog')).json();
  assert.equal(data.products[0].available, false);
  f.env.SALES_ENABLED = 'false';
  assert.equal((await f.checkout()).status, 503);
  const live = fixture({ env: { STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'rk_live_fixtureonly' }, catalog: [{ ...PHOTO, livePriceId: 'price_livefixture' }] });
  t.after(() => live.db.close());
  assert.equal((await (await live.api('/catalog')).json()).products[0].available, false);
  assert.equal((await live.checkout()).status, 409);
});

test('checkout validates identity, file and Stripe price before creating a session', async t => {
  const f = fixture(); t.after(() => f.db.close());
  assert.equal((await f.checkout({ photoId: 'missing' })).status, 409);
  assert.equal((await f.checkout({ amount: 1 })).status, 400);
  assert.equal((await f.checkout({ buyerToken: 'weak' })).status, 400);
  f.price.unit_amount = 1;
  assert.equal((await f.checkout()).status, 409);
  f.price.unit_amount = 999;
  f.files.clear();
  assert.equal((await f.checkout()).status, 409);
  assert.equal(f.calls.create.length, 0);
});

test('checkout uses fixed prices, server URLs, no buyer token and durable idempotency', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const requestId = randomUUID();
  const firstResponse = await f.checkout({ requestId });
  assert.equal(firstResponse.status, 201);
  const first = await firstResponse.json();
  const repeat = await (await f.checkout({ requestId })).json();
  assert.deepEqual(repeat, first); assert.equal(f.calls.create.length, 1);
  const { parameters, settings } = f.calls.create[0];
  assert.equal(parameters.line_items[0].price, PHOTO.testPriceId);
  assert.equal(parameters.line_items[0].quantity, 1);
  assert.equal(parameters.success_url, `https://phellipe.eti.br/fotocordel/v2/compra.html?pedido=${first.orderId}`);
  assert.equal(parameters.cancel_url, `${parameters.success_url}&cancelado=1`);
  assert.equal(parameters.payment_method_types, undefined);
  assert.equal(JSON.stringify(parameters).includes(BUYER_TOKEN), false);
  assert(settings.idempotencyKey.includes(first.orderId));
  const saved = await f.db.prepare('SELECT * FROM orders WHERE id = ?').bind(first.orderId).first();
  assert.notEqual(saved.buyer_token_hash, BUYER_TOKEN);
  assert.equal(saved.expires_at - saved.created_at, 30 * 86400);
  assert.equal((await f.checkout({ requestId, buyerToken: 'b'.repeat(64) })).status, 409);
});

test('checkout returns to its allowlisted origin and an existing session keeps its first return URL', async t => {
  const main = 'https://fotocordel.com.br/';
  const preview = 'https://fotocordel-preview.fotocordel-commerce.workers.dev/';
  const f = fixture({ env: { SITE_URL: main, CHECKOUT_SITE_URLS: [main, preview] } });
  t.after(() => f.db.close());
  const requestId = randomUUID();
  const send = (origin, id = randomUUID()) => f.api('/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ photoId: PHOTO.id, edition: 'v1', buyerToken: BUYER_TOKEN, requestId: id }),
  });
  const first = await (await send(new URL(preview).origin, requestId)).json();
  assert.equal(f.calls.create[0].parameters.success_url, `${preview}compra.html?pedido=${first.orderId}`);
  assert.equal(f.calls.create[0].parameters.cancel_url, `${preview}compra.html?pedido=${first.orderId}&cancelado=1`);
  const repeat = await send(new URL(main).origin, requestId);
  assert.equal(repeat.status, 200); assert.deepEqual(await repeat.json(), first);
  assert.equal(f.calls.create.length, 1);
  for (const origin of [new URL(main).origin, undefined]) {
    const result = await send(origin);
    assert.equal(result.status, 201);
    const order = await result.json();
    assert.equal(f.calls.create.at(-1).parameters.success_url, `${main}compra.html?pedido=${order.orderId}`);
  }
  const preflight = await f.api('/checkout', { method: 'OPTIONS', headers: { Origin: new URL(preview).origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), new URL(preview).origin);
});

test('each edition returns to its own receipt on both allowed origins and keeps the stored edition', async t => {
  const sites = ['https://fotocordel.com.br/', 'https://fotocordel-preview.fotocordel-commerce.workers.dev/'];
  const f = fixture({ env: { SITE_URL: sites[0], CHECKOUT_SITE_URLS: sites } });
  t.after(() => f.db.close());
  for (const site of sites) {
    for (const edition of ['v1', 'v2']) {
      const requestId = randomUUID();
      const send = requestedEdition => f.api('/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(site).origin },
        body: JSON.stringify({ photoId: PHOTO.id, edition: requestedEdition, requestId, buyerToken: BUYER_TOKEN }),
      });
      const result = await send(edition);
      assert.equal(result.status, 201);
      const order = await result.json();
      const parameters = f.calls.create.at(-1).parameters;
      const receipt = edition === 'v2' ? 'v2/compra.html' : 'compra.html';
      assert.equal(parameters.success_url, `${site}${receipt}?pedido=${order.orderId}`);
      assert.equal(parameters.cancel_url, `${site}${receipt}?pedido=${order.orderId}&cancelado=1`);
      const status = await (await f.authorized(`/orders/${order.orderId}`)).json();
      assert.equal(status.edition, edition);
      assert.equal(status.status, 'pending');
      const created = f.calls.create.length;
      const retry = await send(edition);
      assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), order);
      assert.equal(f.calls.create.length, created);
      assert.equal((await send(edition === 'v1' ? 'v2' : 'v1')).status, 409);
      assert.equal(f.calls.create.length, created);
    }
  }
});

test('checkout never accepts an attacker origin or a client-supplied return URL', async t => {
  const main = 'https://fotocordel.com.br/';
  const preview = 'https://fotocordel-preview.fotocordel-commerce.workers.dev/';
  const f = fixture({ env: { SITE_URL: main, CHECKOUT_SITE_URLS: [main, preview], ALLOWED_ORIGINS: 'https://read-only.example' } });
  t.after(() => f.db.close());
  const body = { photoId: PHOTO.id, edition: 'v2', buyerToken: BUYER_TOKEN, requestId: randomUUID() };
  for (const origin of ['https://fotocordel.com.br.evil.example', 'https://evil.example', 'null', 'https://www.fotocordel.com.br', 'https://phellipe.eti.br', 'https://read-only.example']) {
    const result = await f.api('/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
    assert.equal(result.status, 403, origin);
  }
  const injected = await f.api('/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(main).origin },
    body: JSON.stringify({ ...body, returnUrl: 'https://evil.example/' }),
  });
  assert.equal(injected.status, 400); assert.equal(f.calls.create.length, 0);
  assert.equal((await f.db.prepare('SELECT count(*) AS count FROM orders').first()).count, 0);
});

test('invalid checkout site lists halt the API, and JSON-string configuration is supported', async t => {
  const main = 'https://fotocordel.com.br/';
  const f = fixture({ env: { SITE_URL: main } });
  t.after(() => f.db.close());
  for (const roots of [null, {}, [], 'not json', [42], ['http://fotocordel.com.br/'], ['https://user:pass@fotocordel.com.br/'], [`${main}?x=1`], [`${main}#x`], [main, `${main}another/`], ['https://other.example/']]) {
    f.env.CHECKOUT_SITE_URLS = roots;
    const result = await f.api('/health');
    assert.equal(result.status, 503, JSON.stringify(roots));
    assert.equal((await result.json()).error.code, 'UNAVAILABLE');
  }
  f.env.CHECKOUT_SITE_URLS = JSON.stringify([main]);
  assert.equal((await f.api('/health')).status, 200);
  assert.equal(f.calls.create.length, 0);
});

test('unpaid checkout, wrong buyer, and expired token never deliver an original', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const order = await (await f.checkout()).json();
  assert.equal((await f.authorized(`/orders/${order.orderId}/download`, 'POST')).status, 409);
  const status = await (await f.authorized(`/orders/${order.orderId}`)).json();
  assert.equal(status.status, 'pending'); assert.equal(status.downloadAvailable, false);
  const before = f.calls.retrieve;
  assert.equal((await f.authorized(`/orders/${order.orderId}`, 'GET', 'b'.repeat(64))).status, 403);
  assert.equal(f.calls.retrieve, before);
  assert.equal((await f.api(`/orders/${order.orderId}`)).status, 401);
  f.advance(30 * 86400);
  assert.equal((await f.authorized(`/orders/${order.orderId}`)).status, 410);
});

test('verified payment downloads privately and still works when new sales are paused', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const order = await (await f.checkout()).json();
  f.pay(order.orderId);
  f.env.SALES_ENABLED = 'false';
  const response = await f.authorized(`/orders/${order.orderId}`);
  const status = await response.json();
  assert.equal(status.status, 'paid'); assert.equal(status.downloadAvailable, true);
  assert.equal(status.photo.id, PHOTO.id); assert.equal(status.photo.amount, 999);
  assert.equal(status.photo.license, 'Uso pessoal e comercial');
  assert.equal(JSON.stringify(status).includes('file_key'), false);
  const download = await f.authorized(`/orders/${order.orderId}/download`, 'POST');
  assert.equal(download.status, 200); assert.equal(download.headers.get('Content-Type'), 'image/jpeg');
  assert(download.headers.get('Content-Disposition').includes(PHOTO.filename));
  assert(download.headers.get('Cache-Control').includes('no-store'));
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), f.files.get(PHOTO.fileKey));
});

test('paid session with a substituted price or quantity is held for review', async t => {
  for (const change of [{ itemPrice: 'price_other' }, { itemQuantity: 2 }, { amount_total: 1 }, { livemode: true }]) {
    const f = fixture(); t.after(() => f.db.close());
    const order = await (await f.checkout()).json();
    const paid = f.pay(order.orderId); Object.assign(paid.session, change);
    const status = await (await f.authorized(`/orders/${order.orderId}`)).json();
    assert.equal(status.status, 'review');
    assert.equal((await f.authorized(`/orders/${order.orderId}/download`, 'POST')).status, 409);
  }
});

test('refunds, pending refunds and disputes deny a fresh download', async t => {
  for (const change of ['refunded', 'pending-refund', 'disputed']) {
    const f = fixture(); t.after(() => f.db.close());
    const order = await (await f.checkout()).json(); const paid = f.pay(order.orderId);
    assert.equal((await (await f.authorized(`/orders/${order.orderId}`)).json()).status, 'paid');
    if (change === 'refunded') paid.charge.amount_refunded = 1;
    if (change === 'pending-refund') f.refundItems.push({ id: 're_pending', status: 'pending' });
    if (change === 'disputed') paid.charge.disputed = true;
    assert.equal((await f.authorized(`/orders/${order.orderId}/download`, 'POST')).status, 409);
    assert.equal((await (await f.authorized(`/orders/${order.orderId}`)).json()).status, change === 'disputed' ? 'disputed' : change === 'pending-refund' ? 'refund_pending' : 'refunded');
  }
});

test('actual Stripe SDK verifies raw webhook signatures; tampering writes nothing', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const response = await f.api('/stripe/webhook', { method: 'POST', body: '{"id":"evt_fake"}', headers: { 'Stripe-Signature': 't=1,v1=fake' } });
  assert.equal(response.status, 400);
  const count = await f.db.prepare('SELECT count(*) AS count FROM stripe_events').first();
  assert.equal(count.count, 0);
  const order = await (await f.checkout()).json(); const { session } = f.pay(order.orderId);
  assert.equal((await f.sendEvent('checkout.session.completed', session)).status, 200);
  assert.equal((await (await f.authorized(`/orders/${order.orderId}`)).json()).status, 'paid');
});

test('duplicate and out-of-order webhooks do not double-process or restore a refunded order', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const order = await (await f.checkout()).json(); const { session, intent, charge } = f.pay(order.orderId);
  charge.refunded = true; charge.amount_refunded = 999;
  const refund = { id: 're_refund', payment_intent: intent.id, status: 'succeeded' };
  const eventId = 'evt_same_refund';
  assert.equal((await f.sendEvent('refund.created', refund, { id: eventId })).status, 200);
  const duplicate = await (await f.sendEvent('refund.created', refund, { id: eventId })).json();
  assert.equal(duplicate.duplicate, true);
  charge.refunded = false; charge.amount_refunded = 0; // A stale payment response must not undo recorded revocation.
  assert.equal((await f.sendEvent('checkout.session.completed', session)).status, 200);
  const saved = await f.db.prepare('SELECT status FROM orders WHERE id = ?').bind(order.orderId).first();
  assert.equal(saved.status, 'refunded');
  assert.equal((await f.authorized(`/orders/${order.orderId}/download`, 'POST')).status, 409);
});

test('webhook processing failures remain retryable and never leak upstream error details', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const order = await (await f.checkout()).json(); const { session } = f.pay(order.orderId);
  f.failStripe(true);
  const failed = await f.sendEvent('checkout.session.completed', session, { id: 'evt_retry' });
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('Sensitive Stripe'), false);
  assert.equal((await f.db.prepare('SELECT processed_at FROM stripe_events WHERE id = ?').bind('evt_retry').first()).processed_at, null);
  f.failStripe(false);
  assert.equal((await f.sendEvent('checkout.session.completed', session, { id: 'evt_retry' })).status, 200);
});

test('CORS, body limits, mode mismatch and public errors fail closed', async t => {
  const f = fixture(); t.after(() => f.db.close());
  assert.equal((await f.api('/catalog', { headers: { Origin: 'https://attacker.example' } })).status, 403);
  const good = await f.api('/catalog', { headers: { Origin: 'https://phellipe.eti.br' } });
  assert.equal(good.headers.get('Access-Control-Allow-Origin'), 'https://phellipe.eti.br');
  const preflight = await f.api('/checkout', { method: 'OPTIONS', headers: { Origin: 'https://phellipe.eti.br' } });
  assert.equal(preflight.status, 204);
  const huge = await f.api('/checkout', { method: 'POST', body: 'x'.repeat(2049), headers: { 'Content-Type': 'application/json' } });
  assert.equal(huge.status, 413);
  const wrongMode = await f.sendEvent('checkout.session.completed', { id: 'cs_fake' }, { livemode: true });
  assert.equal(wrongMode.status, 400);
  f.env.STRIPE_MODE = 'live';
  assert.equal((await f.api('/health')).status, 200);
  assert.equal((await (await f.api('/health')).json()).salesEnabled, false);
});

test('ten new checkouts per IP/minute are allowed; retries do not consume another slot', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const requestId = randomUUID();
  const first = await (await f.checkout({ requestId })).json();
  for (let i = 1; i < 10; i += 1) assert.equal((await f.checkout()).status, 201);
  const denied = await f.checkout();
  assert.equal(denied.status, 429); assert.equal(denied.headers.get('Retry-After'), '60');
  assert.equal(f.calls.create.length, 10);
  const retry = await (await f.checkout({ requestId })).json();
  assert.equal(retry.orderId, first.orderId); assert.equal(f.calls.create.length, 10);
  const bucket = await f.db.prepare('SELECT * FROM checkout_rate_limits').first();
  assert.equal(bucket.attempts, 10); assert.match(bucket.ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(bucket).includes('local-or-unknown'), false);
  f.advance(60);
  assert.equal((await f.checkout()).status, 201);
});

test('only a provider-expired Checkout Session asks for a new attempt', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const requestId = randomUUID();
  await f.checkout({ requestId });
  [...f.sessions.values()][0].status = 'expired';
  const response = await f.checkout({ requestId });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'CHECKOUT_EXPIRED');
  assert.equal(f.calls.create.length, 1);
  assert.equal((await f.db.prepare('SELECT count(*) AS count FROM orders').first()).count, 1);
});

test('a completed Session after 25 hours and a still-open Session keep the original order', async t => {
  for (const paid of [true, false]) {
    const f = fixture(); t.after(() => f.db.close());
    const requestId = randomUUID();
    const first = await (await f.checkout({ requestId })).json();
    if (paid) f.pay(first.orderId);
    f.advance(25 * 3600);
    const response = await f.checkout({ requestId });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), first);
    assert.equal(f.calls.create.length, 1);
    assert.equal((await f.db.prepare('SELECT count(*) AS count FROM orders').first()).count, 1);
  }
});

test('an uncertain existing Session remains retryable without creating another order', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const requestId = randomUUID();
  const first = await (await f.checkout({ requestId })).json();
  f.advance(25 * 3600);
  f.failStripe(true);
  const response = await f.checkout({ requestId });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(f.calls.create.length, 1);
  f.failStripe(false);
  assert.deepEqual(await (await f.checkout({ requestId })).json(), first);
});

test('failed pending refund is reconciled back to paid; succeeded refund remains revoked', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const order = await (await f.checkout()).json(); const paid = f.pay(order.orderId);
  const refund = { id: 're_pending_then_failed', payment_intent: paid.intent.id, status: 'pending' };
  f.refundItems.push(refund);
  await f.sendEvent('refund.created', refund);
  assert.equal((await (await f.authorized(`/orders/${order.orderId}`)).json()).status, 'refund_pending');
  refund.status = 'failed';
  assert.equal((await f.sendEvent('refund.failed', refund)).status, 200);
  assert.equal((await (await f.authorized(`/orders/${order.orderId}`)).json()).status, 'paid');
  assert.equal((await f.authorized(`/orders/${order.orderId}/download`, 'POST')).status, 200);
});

test('a concurrent refund committed before streaming prevents that download', async t => {
  const f = fixture(); t.after(() => f.db.close());
  const order = await (await f.checkout()).json(); f.pay(order.orderId);
  const originalGet = f.env.ORIGINALS.get;
  f.env.ORIGINALS.get = async key => {
    await f.db.prepare("UPDATE orders SET status = 'refunded', revision = revision + 1 WHERE id = ?").bind(order.orderId).run();
    return originalGet(key);
  };
  assert.equal((await f.authorized(`/orders/${order.orderId}/download`, 'POST')).status, 409);
});
