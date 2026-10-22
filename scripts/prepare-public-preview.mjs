/** Stage only the approved public V1 for the temporary static Worker. Never deploys. */
import { copyFile, lstat, mkdir, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const output = path.join(root, '.commerce-local', 'preview');
const publicFiles = [
  'index.html', 'styles.css', 'app.js', 'sound.js', 'gallery-data.js',
  'shop-config.js', 'shop.css', 'shop.js', 'compra.html',
  'assets/favicon.svg', 'assets/og-cover.jpg',
  'assets/qr/fotocordel-qr.png', 'assets/qr/fotocordel-qr.svg',
  'assets/fonts/fraunces.ttf', 'assets/fonts/fraunces-OFL.txt',
  'assets/fonts/cormorant-italic.ttf', 'assets/fonts/cormorantgaramond-OFL.txt',
  'assets/fonts/dm-sans.ttf', 'assets/fonts/dmsans-OFL.txt',
  'assets/fonts/rye.ttf', 'assets/fonts/rye-OFL.txt',
];

const isWithin = (candidate, parent) => {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};
if (!isWithin(output, root) || path.dirname(output) !== path.join(root, '.commerce-local')) {
  throw new Error('Refusing an output directory outside the dedicated preview workspace.');
}

async function rejectSymlinkAncestors(target) {
  const relative = path.relative(root, target);
  if (!isWithin(target, root)) throw new Error('Path is outside the project.');
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing symlink: ${path.relative(root, current)}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

const photoDirectory = path.join(root, 'assets', 'photos');
await rejectSymlinkAncestors(photoDirectory);
for (const entry of await readdir(photoDirectory, { withFileTypes: true })) {
  // Only already-public WebP derivatives. Never originals, manifests, or arbitrary new formats.
  if (/^(?:\d{2}-[a-z0-9-]+|macrame)\.webp$/.test(entry.name)) {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error(`Invalid public derivative: ${entry.name}`);
    publicFiles.push(`assets/photos/${entry.name}`);
  }
}
const allowlist = new Set(publicFiles);
if (!allowlist.has('assets/photos/macrame.webp') || publicFiles.filter(file => file.startsWith('assets/photos/')).length !== 35) {
  throw new Error('Expected 17 thumbnails, 17 full-frame WebPs, and the macrame reference. Review the asset allowlist.');
}

async function stagedFiles(directory, prefix = '') {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in staged output: ${prefix}${entry.name}`);
    if (entry.isDirectory()) files.push(...await stagedFiles(path.join(directory, entry.name), `${prefix}${entry.name}/`));
    else if (entry.isFile()) files.push(`${prefix}${entry.name}`);
    else throw new Error(`Unsupported staged entry: ${prefix}${entry.name}`);
  }
  return files;
}

await rejectSymlinkAncestors(output);
for (const existing of await stagedFiles(output)) {
  if (!allowlist.has(existing)) throw new Error(`Unexpected file in preview staging: ${existing}. Inspect it before preparing a public deployment.`);
}

// Validate every input before copying. Nothing recursively copies assets/ or the repository.
for (const relative of publicFiles) {
  const source = path.join(root, relative);
  await rejectSymlinkAncestors(source);
  if (!(await lstat(source)).isFile() || !isWithin(await realpath(source), root)) {
    throw new Error(`Invalid public input: ${relative}`);
  }
}

let totalBytes = 0;
for (const relative of publicFiles) {
  const destination = path.join(output, relative);
  await rejectSymlinkAncestors(destination);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, relative), destination);
  totalBytes += (await stat(destination)).size;
}
const finalFiles = await stagedFiles(output);
if (finalFiles.length !== allowlist.size || finalFiles.some(file => !allowlist.has(file))) {
  throw new Error('Preview output differs from the approved allowlist. Do not deploy.');
}
console.log(JSON.stringify({
  output, files: finalFiles.length, bytes: totalBytes,
  expectedPreviewURL: 'https://fotocordel-preview.fotocordel-commerce.workers.dev/',
  edition: 'v1', deploymentPerformed: false,
  excluded: ['images/', 'commerce/', 'v2/', 'private originals', 'credentials', 'V2 QR codes', 'art source PNGs'],
}, null, 2));
