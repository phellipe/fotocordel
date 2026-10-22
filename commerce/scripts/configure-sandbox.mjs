// Configure only the published test Worker. Credentials never enter source or stdout.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const credentialPath = value('--secrets-file');
if (!credentialPath || !value('--api')) throw new Error('Informe --api e --secrets-file.');
const api = new URL(value('--api'));
if (api.protocol !== 'https:' || !api.hostname.endsWith('.workers.dev') || api.username || api.password || api.search || api.hash || api.pathname !== '/') throw new Error('Use a origem HTTPS do Worker de teste.');
const key = (await readFile(credentialPath, 'utf8')).match(/\b(?:sk|rk)_test_[A-Za-z0-9]+\b/)?.[0];
if (!key) throw new Error('Este comando aceita apenas chave Stripe de teste.');
// Use the OS TLS stack on Windows; certificate verification remains enabled.
let health;
if (process.platform === 'win32') {
  const result = spawnSync('curl.exe', ['--fail', '--silent', '--show-error', '--max-time', '15', new URL('health', api).href], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Não foi possível validar o HTTPS do Worker.');
  health = JSON.parse(result.stdout);
} else {
  health = await fetch(new URL('health', api), { signal: AbortSignal.timeout(15000) }).then(r => r.json());
}
if (health.mode !== 'test') throw new Error('O destino não confirmou o modo de teste.');
const endpointURL = new URL('stripe/webhook', api).href;
const privateDir = new URL('../../.commerce-local/', import.meta.url);
await mkdir(privateDir, { recursive: true });
const receiptPath = new URL(`webhook-${api.hostname}.json`, privateDir);
let receipt;
try { receipt = JSON.parse(await readFile(receiptPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }

async function stripe(path, params, idempotency) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotency ? { 'Idempotency-Key': idempotency } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Stripe HTTP ${response.status}: ${data.error?.code || data.error?.type || 'request_failed'}`);
  return data;
}

if (receipt) {
  const endpoint = await stripe(`webhook_endpoints/${encodeURIComponent(receipt.id)}`);
  if (receipt.url !== endpointURL || endpoint.url !== endpointURL || endpoint.livemode || endpoint.status !== 'enabled' || !receipt.secret?.startsWith('whsec_')) throw new Error('O endpoint salvo precisa de revisão manual.');
} else {
  const existing = await stripe('webhook_endpoints?limit=100');
  if (existing.has_more || existing.data.some(e => e.url === endpointURL)) throw new Error('Revise os endpoints existentes; não é seguro criar outro sem o segredo correspondente.');
  const events = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'refund.created', 'refund.updated', 'refund.failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed'];
  const params = { url: endpointURL, api_version: '2026-09-30.endive', description: 'Fotocordel — sandbox público', 'metadata[project]': 'fotocordel', 'metadata[mode]': 'test' };
  events.forEach((event, i) => { params[`enabled_events[${i}]`] = event; });
  const digest = createHash('sha256').update(endpointURL).digest('hex').slice(0, 32);
  const endpoint = await stripe('webhook_endpoints', params, `fotocordel-test-webhook-${digest}`);
  if (endpoint.livemode || !endpoint.secret?.startsWith('whsec_')) throw new Error('Resposta de webhook inesperada. Nenhum segredo será publicado.');
  receipt = { id: endpoint.id, url: endpointURL, secret: endpoint.secret };
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}

const cwd = fileURLToPath(new URL('../', import.meta.url));
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const output = spawnSync(process.execPath, [wrangler, 'secret', 'bulk', '--config', 'wrangler.sandbox.jsonc'], {
  cwd, encoding: 'utf8', input: JSON.stringify({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: receipt.secret }),
});
const safeLog = `${output.stdout || ''}${output.stderr || ''}`.replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g, '[segredo omitido]');
console.log(safeLog);
if (output.status !== 0) throw new Error('Não foi possível configurar os secrets do Worker.');
console.log(`Sandbox configurado. Webhook: ${receipt.id}. Nenhuma cobrança real.`);
