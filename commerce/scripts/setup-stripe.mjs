// Provision this project's catalogue only. Secrets are read in memory and never logged.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const mode = value('--mode') || 'test';
if (!['test', 'live'].includes(mode)) throw new Error('Use --mode test ou live.');
if (mode === 'live' && !args.includes('--allow-live')) throw new Error('Produção exige --allow-live explícito.');
const credentialFile = value('--secrets-file');
const credentialText = credentialFile ? await readFile(credentialFile, 'utf8') : process.env.STRIPE_SECRET_KEY || '';
const key = credentialText.match(new RegExp(`\\b(?:sk|rk)_${mode}_[A-Za-z0-9]+\\b`))?.[0];
if (!key) throw new Error(`Credencial ${mode} não encontrada. Nenhum recurso alterado.`);
const catalogPath = fileURLToPath(new URL('../catalog.json', import.meta.url));
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (mode === 'live' && catalog.some(p => !p.readyForLive)) throw new Error('Revise os arquivos de entrega e readyForLive antes de criar o catálogo de produção.');

async function stripe(path, params, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: params ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`Stripe HTTP ${response.status}: ${data.error?.code || data.error?.type || 'request_failed'}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

for (const photo of catalog) {
  if (photo.amount !== 999 || photo.currency !== 'brl') throw new Error('O preço autorizado é BRL 999 centavos.');
  const productId = `fotocordel_${photo.id.replaceAll('-', '_')}`;
  let product;
  try { product = await stripe(`products/${productId}`); }
  catch (error) { if (error.status !== 404) throw error; }
  if (!product) product = await stripe('products', {
    id: productId,
    name: `Fotocordel · ${photo.title}`,
    description: `Arquivo digital JPEG da fotopoesia. Uso pessoal e comercial. ${photo.width} × ${photo.height} pixels.`,
    'metadata[project]': 'fotocordel',
    'metadata[photo_id]': photo.id
  }, `fotocordel-product-${photo.id}-v1`);
  if (product.metadata?.project !== 'fotocordel' || product.metadata?.photo_id !== photo.id || !product.active) throw new Error('Produto existente não corresponde ao catálogo autorizado.');
  const lookup = `fotocordel_${photo.id}_brl_999_v1`;
  const found = await stripe(`prices?active=true&lookup_keys[]=${encodeURIComponent(lookup)}&limit=10`);
  const price = found.data[0] || await stripe('prices', {
    product: product.id,
    unit_amount: '999',
    currency: 'brl',
    lookup_key: lookup,
    'metadata[project]': 'fotocordel',
    'metadata[photo_id]': photo.id
  }, `fotocordel-price-${photo.id}-brl-999-v1`);
  if (price.product !== product.id || price.unit_amount !== 999 || price.currency !== 'brl' || price.type !== 'one_time' || price.livemode !== (mode === 'live')) throw new Error('Preço existente divergente. Nenhum preço foi substituído.');
  photo[`${mode}PriceId`] = price.id;
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  console.log(`${mode}: ${photo.id} · BRL 9,99 · ${price.id}`);
}
console.log('Catálogo configurado. Nenhuma cobrança foi realizada.');
