import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSandboxWorker, privateFilesStore } from '../src/sandbox.js';
import { fixture, PHOTO } from './helpers.js';

function sandbox(t) {
  const f = fixture({ workerFactory: createSandboxWorker });
  t.after(() => f.db.close());
  f.assetRequests = [];
  f.env.PRIVATE_FILES = {
    async fetch(request) {
      f.assetRequests.push(request);
      const bytes = f.files.get(new URL(request.url).pathname.slice(1));
      return bytes ? new Response(request.method === 'HEAD' ? null : bytes, {
        headers: { 'Content-Type': 'image/jpeg', ...(!f.omitLength ? { 'Content-Length': String(bytes.byteLength) } : {}) },
      }) : new Response(null, { status: 404 });
    },
  };
  return f;
}

test('sandbox never exposes direct assets, including navigation and encoded paths', async t => {
  const f = sandbox(t);
  for (const path of [`/${PHOTO.fileKey}`, `/${PHOTO.fileKey}?download=1`, '/originals/', '/%6friginals/01-mar.jpg', '/private-files.internal/originals/01-mar.jpg', '/.dev.vars']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const result = await f.api(path, { method, headers: { 'Sec-Fetch-Mode': 'navigate', Accept: 'image/jpeg' } });
      assert.equal(result.status, 404, `${method} ${path}`);
      assert.match(result.headers.get('Cache-Control'), /no-store/);
    }
  }
  assert.equal(f.assetRequests.length, 0);
});

test('sandbox assets require buyer authentication and verified paid test checkout', async t => {
  const f = sandbox(t);
  const catalog = await (await f.api('/catalog')).json();
  assert.equal(catalog.products[0].available, true);
  assert.equal(f.assetRequests.at(-1).method, 'HEAD');
  const order = await (await f.checkout()).json();
  const path = `/orders/${order.orderId}/download`;
  assert.equal((await f.api(path, { method: 'POST' })).status, 401);
  assert.equal((await f.authorized(path, 'POST', 'b'.repeat(64))).status, 403);
  assert.equal((await f.authorized(path, 'POST')).status, 409);
  assert.equal(f.assetRequests.filter(request => request.method === 'GET').length, 0);
  f.pay(order.orderId);
  const result = await f.authorized(path, 'POST');
  assert.equal(result.status, 200);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), f.files.get(PHOTO.fileKey));
  assert.match(result.headers.get('Content-Disposition'), /attachment/);
  assert.match(result.headers.get('Cache-Control'), /no-store/);
  const assetRequest = f.assetRequests.at(-1);
  assert.equal(assetRequest.url, `https://private-files.internal/${PHOTO.fileKey}`);
  assert.equal(assetRequest.headers.get('Authorization'), null);
  assert.equal(assetRequest.headers.get('Origin'), null);
});

test('sandbox refuses live, missing mode and live credentials before storage or Stripe access', async t => {
  const f = sandbox(t);
  for (const mode of ['live', '', undefined]) {
    f.env.STRIPE_MODE = mode;
    for (const path of ['/health', '/catalog', '/checkout', '/stripe/webhook']) {
      const result = await f.api(path, { method: path === '/checkout' ? 'POST' : 'GET' });
      assert.equal(result.status, 503);
      assert.equal((await result.json()).error.code, 'SANDBOX_ONLY');
    }
  }
  f.env.STRIPE_MODE = 'test'; f.env.STRIPE_SECRET_KEY = 'rk_live_fixtureonly';
  assert.equal((await f.checkout()).status, 503);
  assert.equal(f.assetRequests.length, 0); assert.equal(f.calls.create.length, 0);
});

test('sandbox handles the runtime binding without Content-Length and bounds fallback buffering', async t => {
  const f = sandbox(t);
  f.omitLength = true;
  const store = privateFilesStore(f.env.PRIVATE_FILES, new Set([PHOTO.fileKey]));
  assert.equal((await store.head(PHOTO.fileKey)).size, f.files.get(PHOTO.fileKey).byteLength);
  const object = await store.get(PHOTO.fileKey);
  assert.equal(object.size, f.files.get(PHOTO.fileKey).byteLength);
  assert.deepEqual(new Uint8Array(await new Response(object.body).arrayBuffer()), f.files.get(PHOTO.fileKey));
  f.files.set(PHOTO.fileKey, new Uint8Array(2 * 1024 * 1024 + 1));
  await assert.rejects(store.get(PHOTO.fileKey), /limit/);
});

test('sandbox treats missing private assets as unavailable and rejects non-catalogue paths', async t => {
  const f = sandbox(t);
  f.files.clear();
  assert.equal((await (await f.api('/catalog')).json()).products[0].available, false);
  assert.equal((await f.checkout()).status, 409);
  const store = privateFilesStore(f.env.PRIVATE_FILES, new Set([PHOTO.fileKey]));
  const count = f.assetRequests.length;
  for (const key of ['../.dev.vars', 'originals/unknown.jpg', 'https://example.com/image.jpg']) assert.equal(await store.get(key), null);
  assert.equal(f.assetRequests.length, count);
  delete f.env.PRIVATE_FILES;
  assert.equal((await (await f.api('/catalog')).json()).products[0].available, false);
});

test('sandbox deployment routes every request through worker and has no public asset fallback', () => {
  const config = JSON.parse(readFileSync(new URL('../wrangler.sandbox.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.main, 'src/sandbox.js');
  assert.equal(config.assets.binding, 'PRIVATE_FILES');
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.equal(config.assets.html_handling, 'none');
  assert.equal(config.assets.directory, '../.commerce-local/files');
  assert.equal(config.vars.STRIPE_MODE, 'test');
  assert.equal(config.vars.SITE_URL, 'https://fotocordel.com.br/');
  assert.deepEqual(config.vars.ALLOWED_ORIGINS.split(','), [
    'https://fotocordel.com.br', 'https://fotocordel-preview.fotocordel-commerce.workers.dev',
  ]);
  assert.deepEqual(config.vars.CHECKOUT_SITE_URLS, [
    'https://fotocordel.com.br/', 'https://fotocordel-preview.fotocordel-commerce.workers.dev/',
  ]);
  assert.equal(config.r2_buckets, undefined); assert.equal(config.env?.live, undefined);
});
