// Copy non-TypeScript runtime assets into the server build.
//
// `tsc` only emits .js from .ts, so data files the server reads at runtime
// (the Word Race dictionaries) never reach dist/ and the production server
// crashes on boot. This mirrors them into the compiled tree.
import { cp, mkdir, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Directories of runtime data, relative to the repo root. */
const ASSET_DIRS = ['shared/wordrace/dict'];

let copied = 0;
for (const rel of ASSET_DIRS) {
  const from = path.join(root, rel);
  const to = path.join(root, 'dist/server', rel);
  try {
    await access(from);
  } catch {
    console.warn(`[copy-assets] skipped missing ${rel} (run "npm run build:dict"?)`);
    continue;
  }
  await mkdir(to, { recursive: true });
  await cp(from, to, { recursive: true });
  const files = await readdir(to);
  copied += files.length;
  console.log(`[copy-assets] ${rel} -> dist/server/${rel} (${files.length} files)`);
}
console.log(`[copy-assets] ${copied} file(s) copied`);
