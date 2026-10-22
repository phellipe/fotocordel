import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createWorker } from '../src/worker.js';

export const BUYER_TOKEN = 'a'.repeat(64);
export const WEBHOOK_SECRET = 'whsec_automated_test_fixture_only';
export const PHOTO = {
  id: '01-mar', title: 'Mar', amount: 999, currency: 'brl',
  fileKey: 'originals/01-mar.jpg', filename: '01-mar.jpg', width: 6000, height: 4000,
  testPriceId: 'price_testfixture', livePriceId: null, readyForLive: false,
};

export class D1TestAdapter {
  constructor() {
    this.database = new DatabaseSync(':memory:');
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
      this.database.exec(readFileSync(new URL(file, directory), 'utf8'));
    }
  }
  prepare(query) {
    const statement = this.database.prepare(query);
    const wrap = values => ({
      bind: (...next) => wrap(next),
      first: async () => statement.get(...values) ?? null,
      all: async () => ({ results: statement.all(...values), success: true }),
      run: async () => { const result = statement.run(...values); return { success: true, meta: { changes: result.changes } }; },
    });
    return wrap([]);
  }
  close() { this.database.close(); }
}

export function fixture(options = {}) {
  const db = new D1TestAdapter();
  const files = new Map([[PHOTO.fileKey, new Uint8Array([255, 216, 255, 224, 70, 79, 84, 79, 255, 217])]]);
  const calls = { create: [], retrieve: 0, price: 0, intent: 0 };
  const sessions = new Map();
  const intents = new Map();
  const refundItems = [];
  const idempotency = new Map();
  let clock = Math.floor(Date.now() / 1000);
  let failRetrieve = false;
  const stripeVerifier = new Stripe('sk_test_fixture_only');
  const price = { id: PHOTO.testPriceId, active: true, type: 'one_time', recurring: null, unit_amount: 999, currency: 'brl', livemode: false };
  const stripe = {
    prices: { retrieve: async () => { calls.price++; return structuredClone(price); } },
    checkout: { sessions: {
      create: async (parameters, settings) => {
        calls.create.push({ parameters: structuredClone(parameters), settings: structuredClone(settings) });
        if (idempotency.has(settings.idempotencyKey)) return structuredClone(idempotency.get(settings.idempotencyKey));
        const id = `cs_test_${parameters.client_reference_id.replaceAll('-', '')}`;
        const session = {
          id, livemode: false, mode: 'payment', status: 'open', payment_status: 'unpaid',
          payment_intent: null, currency: 'brl', amount_total: 999, metadata: parameters.metadata,
          client_reference_id: parameters.client_reference_id, url: `https://checkout.stripe.com/c/pay/${id}`,
        };
        sessions.set(id, session); idempotency.set(settings.idempotencyKey, session);
        return structuredClone(session);
      },
      retrieve: async id => { calls.retrieve++; if (failRetrieve) throw new Error('Sensitive Stripe error must not be exposed'); return structuredClone(sessions.get(id)); },
      listLineItems: async id => ({ data: [{ price: { id: sessions.get(id).itemPrice || PHOTO.testPriceId }, quantity: sessions.get(id).itemQuantity ?? 1, amount_total: 999, currency: 'brl' }], has_more: false }),
    } },
    paymentIntents: { retrieve: async id => { calls.intent++; return structuredClone(intents.get(id)); } },
    refunds: { list: async () => ({ data: structuredClone(refundItems), has_more: false }) },
    charges: { retrieve: async id => structuredClone([...intents.values()].find(intent => intent.latest_charge.id === id)?.latest_charge) },
    webhooks: stripeVerifier.webhooks,
  };
  const env = {
    STRIPE_SECRET_KEY: 'rk_test_fixtureonly', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_MODE: 'test', SALES_ENABLED: 'true', SITE_URL: 'https://phellipe.eti.br/fotocordel/',
    DB: db, ORIGINALS: {
      async head(key) { return files.has(key) ? { key, size: files.get(key).byteLength } : null; },
      async get(key) { return files.has(key) ? { key, size: files.get(key).byteLength, body: new Blob([files.get(key)]).stream() } : null; },
    },
    ...options.env,
  };
  const worker = (options.workerFactory || createWorker)({ catalog: options.catalog || [PHOTO], stripeFactory: () => stripe, now: () => clock });
  const api = (path, init = {}) => worker.fetch(new Request(`https://commerce.test${path}`, init), env);
  const authorized = (path, method = 'GET', token = BUYER_TOKEN) => api(path, { method, headers: { Authorization: `Bearer ${token}` } });
  const checkout = (overrides = {}) => api('/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://phellipe.eti.br' },
    body: JSON.stringify({ photoId: PHOTO.id, edition: 'v2', requestId: randomUUID(), buyerToken: BUYER_TOKEN, ...overrides }),
  });
  const pay = orderId => {
    const session = [...sessions.values()].find(session => session.client_reference_id === orderId);
    const id = `pi_${orderId.replaceAll('-', '')}`;
    Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: id });
    const charge = { id: `ch_${orderId}`, payment_intent: id, livemode: false, paid: true, captured: true, status: 'succeeded', amount: 999, amount_refunded: 0, refunded: false, disputed: false, currency: 'brl' };
    const intent = { id, status: 'succeeded', livemode: false, metadata: { order_id: orderId }, amount: 999, amount_received: 999, currency: 'brl', latest_charge: charge };
    intents.set(id, intent);
    return { session, intent, charge };
  };
  const sendEvent = (type, object, overrides = {}) => {
    const event = { id: `evt_${randomUUID()}`, type, livemode: false, data: { object }, ...overrides };
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest('hex');
    return api('/stripe/webhook', { method: 'POST', body: payload, headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}`, 'Content-Type': 'application/json' } });
  };
  return {
    db, files, calls, price, sessions, intents, refundItems, env, api, authorized, checkout, pay, sendEvent,
    advance: seconds => { clock += seconds; }, failStripe: value => { failRetrieve = value; },
  };
}
