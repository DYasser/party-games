// Runs every scripts/e2e-<game>.mjs in sequence against one server (E2E_URL, default :3001).
// Usage: node scripts/e2e-all.mjs            (requires the server to be running)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scripts = readdirSync(dir)
  .filter((f) => /^e2e-.*\.mjs$/.test(f) && !['e2e-all.mjs', 'e2e-lib.mjs'].includes(f))
  .sort();

const results = [];
for (const script of scripts) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [path.join(dir, script)], { stdio: 'inherit', env: process.env });
  results.push({ script, ok: res.status === 0, ms: Date.now() - started });
}

console.log('\n==== E2E SUMMARY ====');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.script.padEnd(26)} ${(r.ms / 1000).toFixed(1)}s`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
process.exit(failed.length ? 1 : 0);
