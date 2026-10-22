import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const index = args.indexOf('--secrets-file');
if (index < 0 || !args[index + 1]) throw new Error('Informe --secrets-file com o caminho privado.');
const input = await readFile(args[index + 1], 'utf8');
const key = input.match(/\b(?:sk|rk)_test_[A-Za-z0-9]+\b/)?.[0];
if (!key) throw new Error('A configuração local exige chave Stripe de teste.');
const env = {
  STRIPE_SECRET_KEY: key,
  STRIPE_WEBHOOK_SECRET: `whsec_${randomBytes(32).toString('hex')}`,
  STRIPE_MODE: 'test',
  SALES_ENABLED: args.includes('--enable-checkout') ? 'true' : 'false',
  SITE_URL: 'http://127.0.0.1:4173/',
  ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:4173'
};
await writeFile(new URL('../.dev.vars', import.meta.url), Object.entries(env).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join('\n') + '\n', { mode: 0o600 });
console.log('Ambiente local configurado em .dev.vars (ignorado pelo Git).');
console.log('O segredo de webhook local serve para testes assinados; configure o segredo do endpoint real ao publicar.');
