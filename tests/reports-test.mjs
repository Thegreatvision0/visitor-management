// Browser test: report period / branch / state filters and Summary totals.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const tok = (await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Noormahal@123' }) })).json()).token;
const H = { 'content-type': 'application/json', authorization: 'Bearer ' + tok };
await fetch(base + '/api/branches', { method: 'POST', headers: H, body: JSON.stringify({ name: 'Ludhiana East', parentId: 'BR003', district: 'Ludhiana', coordinator: 'Ravi Kumar', phone: '9876500001', state: 'Punjab' }) });
const S = await (await fetch(base + '/api/snapshot', { headers: H })).json();
const pad = n => String(n).padStart(2, '0');
const td = new Date(), iso = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`, today = iso(td);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(base + '/'); await p.fill('input[autocomplete=username]', 'admin'); await p.fill('input[type=password]', 'Noormahal@123');
await p.click('button:has-text("Sign in")'); await p.waitForSelector('#side nav');
await p.goto(base + '/reports'); await p.waitForSelector('.rp-meta');
const sel = label => p.locator(".flabel").filter({ hasText: new RegExp("^" + label) }).locator("select");
const meta = () => p.textContent('.rp-meta');
const total = () => p.locator('tfoot td').allTextContents();
try {
  ok((await sel('Report').inputValue()) === 'summary', 'Summary is the default report');
  let t = await total();
  const nd = S.regs.filter(r => r.status !== 'Draft');
  const expArr = nd.filter(r => r.actualIn).length, expDep = nd.filter(r => r.actualOut).length;
  ok(+t[3] === expArr && +t[4] === expDep, `all-time totals: arrivals ${t[3]}=${expArr}, departures ${t[4]}=${expDep}`);
  let sum = 0; for (const v of await p.locator('tbody tr td:nth-child(4)').allTextContents()) sum += +v;
  ok(sum === +t[3], `branch rows add up to the Total row (${sum})`);

  await sel('Period').selectOption('month'); await p.waitForTimeout(100);
  const mName = MON[td.getMonth()] + ' ' + td.getFullYear();
  ok((await meta()).includes(mName), 'Monthly shows the current month: ' + mName);
  const first = iso(new Date(td.getFullYear(), td.getMonth(), 1)), last = iso(new Date(td.getFullYear(), td.getMonth() + 1, 0));
  t = await total();
  const expM = nd.filter(r => r.actualIn && r.actualIn.slice(0, 10) >= first && r.actualIn.slice(0, 10) <= last).length;
  ok(+t[3] === expM, `monthly arrivals ${t[3]} = ${expM}`);
  await p.click('button[aria-label="Previous period"]'); await p.waitForTimeout(100);
  const prev = new Date(td.getFullYear(), td.getMonth() - 1, 1), pm = MON[prev.getMonth()] + ' ' + prev.getFullYear();
  ok((await meta()).includes(pm), 'previous-period button moves to ' + pm);
  await p.click('.pstep button:has-text("Current")'); await p.waitForTimeout(100);

  for (const [v, needle] of [['day', MON[td.getMonth()]], ['week', 'Week'], ['quarter', 'Q'], ['year', String(td.getFullYear())], ['fy', 'FY']]) {
    await sel('Period').selectOption(v); await p.waitForTimeout(80);
    const m = (await p.locator('.rp-meta .chip').first().textContent());
    ok(m.includes(needle), `${v}: ${m}`);
  }
  await sel('Period').selectOption('year'); await sel('Group by').selectOption('month'); await p.waitForTimeout(100);
  ok((await p.locator('tbody tr').count()) === 12, 'annual report grouped month-wise has 12 rows');
  await sel('Period').selectOption('week'); await sel('Group by').selectOption('day'); await p.waitForTimeout(100);
  ok((await p.locator('tbody tr').count()) === 7, 'weekly report grouped day-wise has 7 rows');

  await sel('Period').selectOption('all'); await sel('Group by').selectOption('state'); await sel('State').selectOption('Punjab'); await p.waitForTimeout(100);
  const states = await p.locator('tbody tr td:first-child').allTextContents();
  ok(states.length === 1 && states[0] === 'Punjab', 'state filter keeps only Punjab: ' + states.join(','));
  await sel('State').selectOption('');
  await sel('Group by').selectOption('branch'); await sel('Branch').selectOption('BR003'); await p.waitForTimeout(100);
  ok((await meta()).includes('with sub-branches'), 'Ludhiana filter includes its sub-branches');

  await sel('Period').selectOption('custom');
  await p.locator(".flabel").filter({ hasText: /^From/ }).locator("input").fill('2026-01-01'); await p.locator(".flabel").filter({ hasText: /^To/ }).locator("input").fill(today); await p.waitForTimeout(100);
  ok((await meta()).includes('01 Jan 2026'), 'custom range label');

  await sel('Branch').selectOption(''); await sel('Period').selectOption('month');
  const ids = await sel('Report').locator('option').evaluateAll(o => o.map(x => x.value));
  for (const id of ids) { await sel('Report').selectOption(id); await p.waitForTimeout(60); }
  ok(ids.length === 14 && !errs.length, `all ${ids.length} reports render with a monthly period`);

  await sel('Report').selectOption('summary');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("Export CSV")')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  ok(csv.includes('Period: ') && csv.includes('"Total"') && /^nurmahal_summary_/.test(dl.suggestedFilename()), 'CSV has title, period, filters and Total: ' + dl.suggestedFilename());
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
if (errs.length) console.log('page errors:', errs);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
