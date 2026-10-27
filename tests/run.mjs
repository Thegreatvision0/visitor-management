/* Runs every *-test.mjs suite one after another (each starts its own in-memory database).
   Browser suites need a built client: npm run build at the project root.
   node run.mjs            → all suites
   node run.mjs ui visits  → only suites whose name contains "ui" or "visits" */
import { spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)), out = path.join(here, 'output');
mkdirSync(out, { recursive: true }); // screenshots land here
const pick = process.argv.slice(2);
const suites = readdirSync(here).filter(f => f.endsWith('-test.mjs') && (!pick.length || pick.some(p => f.includes(p)))).sort();
const env = { ...process.env, TZ: 'Asia/Kolkata', PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(here, '.browsers') };
const failed = [];
for (const f of suites) {
  const t = Date.now(), r = spawnSync(process.execPath, [path.join(here, f)], { cwd: out, env, encoding: 'utf8', timeout: 600000 });
  const text = (r.stdout || '') + (r.stderr || ''), fails = text.split('\n').filter(l => /^FAIL |^ERROR/.test(l));
  console.log(`${r.status === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(22)} ${((Date.now() - t) / 1000).toFixed(0)}s`);
  fails.forEach(l => console.log('        ' + l));
  if (r.status !== 0) { failed.push(f); if (!fails.length) console.log(text.split('\n').slice(-8).join('\n')); }
}
console.log(failed.length ? `\n${failed.length} suite(s) failed: ${failed.join(', ')}` : `\nAll ${suites.length} suites passed.`);
process.exit(failed.length ? 1 : 0);
