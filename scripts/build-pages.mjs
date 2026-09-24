import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerSource = resolve(root, 'worker/index.js');
const pagesWorker = resolve(root, 'public/_worker.js');

await mkdir(dirname(pagesWorker), { recursive: true });
await copyFile(workerSource, pagesWorker);
console.log('Cloudflare Pages Worker generated at public/_worker.js');

