import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const cwd = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../catalog.json', import.meta.url), 'utf8'));
for (const photo of catalog) {
  const file = fileURLToPath(new URL(`../../.commerce-local/files/${photo.fileKey}`, import.meta.url));
  await access(file);
  await execute(process.execPath, [cli, 'r2', 'object', 'put', `fotocordel-originals-test/${photo.fileKey}`, '--file', file, '--content-type', 'image/jpeg', '--local'], {cwd, env: {...process.env, WRANGLER_SEND_METRICS:'false'}, maxBuffer: 1024 * 1024});
  console.log(`Local R2: ${photo.id}`);
}
console.log('17 arquivos de teste locais. Nenhum upload remoto realizado.');
