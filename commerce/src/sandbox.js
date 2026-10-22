import catalog from '../catalog.json' with { type: 'json' };
import { createWorker } from './worker.js';

const MAX_TEST_FILE_SIZE = 2 * 1024 * 1024;

async function measuredBody(asset) {
  if (!asset.body) throw new Error('Private sandbox file unavailable.');
  const reader = asset.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TEST_FILE_SIZE) {
        await reader.cancel();
        throw new Error('Sandbox file exceeds the test-file limit.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('Private sandbox file unavailable.');
  return new Blob(chunks);
}

const response = (status, code, message) => new Response(JSON.stringify({ error: { code, message } }), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  },
});

// This adapter is internal only. The browser's URL, headers and credentials
// are never forwarded to Static Assets, and only catalogued JPEGs are readable.
export function privateFilesStore(binding, allowedKeys) {
  const read = async (key, method) => {
    if (!allowedKeys.has(key) || !/^originals\/[a-z0-9][a-z0-9-]{0,100}\.jpg$/.test(key)) return null;
    let asset = await binding.fetch(new Request(`https://private-files.internal/${key}`, { method }));
    if (method === 'HEAD' && asset.status === 200 && !asset.headers.has('Content-Length')) {
      asset = await binding.fetch(new Request(`https://private-files.internal/${key}`));
    }
    if (asset.status === 404) return null;
    const length = asset.headers.get('Content-Length');
    let size = length === null ? null : Number(length);
    if (asset.status !== 200 || (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(size) || size < 1 || size > MAX_TEST_FILE_SIZE))
      || asset.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') {
      await asset.body?.cancel();
      throw new Error('Private sandbox file unavailable.');
    }
    // Static Assets may omit Content-Length, including on HEAD. Measure the
    // small test file with a bound; production originals keep the R2 adapter.
    let body = asset.body;
    if (size === null) {
      const measured = await measuredBody(asset);
      size = measured.size;
      body = method === 'GET' ? measured.stream() : null;
    } else if (method === 'HEAD') await body?.cancel();
    return { key, size, ...(method === 'GET' ? { body } : {}) };
  };
  return { head: key => read(key, 'HEAD'), get: key => read(key, 'GET') };
}

export function createSandboxWorker(options) {
  const worker = createWorker(options);
  const keys = new Set(options.catalog.map(photo => photo.fileKey));
  return {
    async fetch(request, env, context) {
      const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
      const apiPath = ['/catalog', '/health', '/checkout', '/stripe/webhook'].includes(path)
        || /^\/orders\/[0-9a-f-]{36}(\/download)?$/i.test(path);
      // Never fall through to PRIVATE_FILES or passThroughOnException. Together
      // with run_worker_first:true, this also blocks direct asset navigation.
      if (!apiPath) return response(404, 'NOT_FOUND', 'Recurso não encontrado.');
      if (env.STRIPE_MODE !== 'test' || /^(rk|sk)_live_/.test(env.STRIPE_SECRET_KEY || '')) {
        return response(503, 'SANDBOX_ONLY', 'Este ambiente permite somente pagamentos de teste.');
      }
      return worker.fetch(request, {
        ...env,
        ORIGINALS: env.PRIVATE_FILES?.fetch ? privateFilesStore(env.PRIVATE_FILES, keys) : undefined,
      }, context);
    },
  };
}

export default createSandboxWorker({ catalog });
