// DEMO mode: separate database name, demo data on every screen, ribbon, danger zone with typed DELETE.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test'; process.env.DEMO_MODE = 'true'; delete process.env.FEATURES; process.env.SEED_ON_EMPTY = 'false'; // demo seeds even so
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const { dbOptions } = await import(SERVER + 'src/lib/config.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), dbOptions()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async u => (await call(null, 'POST', '/auth/login', { username: u, password: 'Noormahal@123' })).data.token;
const b = await chromium.launch({ headless: true }); const errs = [];
try {
  ok(mongoose.connection.name === 'noormahal_demo', 'DEMO data lives in its own database: ' + mongoose.connection.name);
  const meta = (await call(null, 'GET', '/meta')).data;
  ok(meta.demo === true && meta.features.dangerZone === true, '/api/meta: demo on, danger zone available');
  const A = await login('admin'), s = (await call(A, 'GET', '/snapshot')).data;
  ok(s.members.length >= 50 && s.branches.length >= 30 && s.regs.length >= 40 && s.beds.length >= 50 && Object.keys(s.att).length > 50, `demo data: ${s.members.length} members, ${s.branches.length} branches, ${s.regs.length} requests, ${s.beds.length} beds, ${Object.keys(s.att).length} attendance marks`);
  const st = new Set(s.visits.map(v => v.status));
  ok(s.visits.length === 6 && ['Submitted', 'Accepted', 'Awaiting office', 'Confirmed', 'Arrived', 'Completed'].every(x => st.has(x)), 'demo guest visits in every step: ' + [...st].join(', '));
  ok(!!(await login('mainoffice')) && !!(await login('gate')), 'demo Main Office and Gate accounts sign in');
  ok((await call(A, 'POST', '/admin/reset-sample', { confirm: 'DELETE' })).status === 200 && (await call(A, 'GET', '/snapshot')).data.visits.length === 6, 'reset to demo data (with DELETE) keeps the demo guest visits');

  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/'); await p.waitForSelector('.demo-ribbon');
  ok((await p.textContent('.demo-ribbon')).includes('DEMO'), 'DEMO ribbon on the sign-in page');
  await p.fill('input[autocomplete=username]', 'admin'); await p.fill('input[autocomplete=current-password]', 'Noormahal@123'); await p.click('button:has-text("Sign in")'); await p.waitForSelector('#side nav');
  await p.goto(base + '/admin'); await p.waitForSelector('main .tabs');
  ok(await p.locator('button:has-text("Delete everything")').count() === 1, 'danger zone visible in DEMO mode');
  await p.click('button:has-text("Reset to sample data")'); await p.fill('#f-confirm', 'delete'); await p.click('.mdl button:has-text("Continue")'); await p.waitForSelector('.mdl .err');
  ok((await p.textContent('.mdl .err')).includes('DELETE'), 'wrong confirmation word refused');
  await p.fill('#f-confirm', 'DELETE'); await p.click('.mdl button:has-text("Continue")'); await p.waitForSelector('.mdl h2:has-text("Are you sure")');
  ok(true, 'second confirmation dialog shown'); await p.keyboard.press('Escape');
  /* Accept / Decline: Decline asks for the note only when pressed */
  const S = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); S.on('pageerror', e => errs.push(e.message));
  await S.goto(base + '/'); await S.fill('input[autocomplete=username]', 'supervisor.security'); await S.fill('input[autocomplete=current-password]', 'Noormahal@123'); await S.click('button:has-text("Sign in")'); await S.waitForSelector('#side nav');
  await S.goto(base + '/visitors'); await S.waitForSelector('main .tabs');
  const btn = S.locator('main tbody button:has-text("Accept / decline")').first();
  if (await btn.count()) {
    await btn.click(); await S.waitForSelector('.mdl');
    ok(await S.locator('.mdl button:has-text("Accept appointment")').isEnabled() && await S.locator('.mdl button:has-text("Decline")').isEnabled(), '1.8 Accept and Decline both enabled');
    await S.click('.mdl button:has-text("Decline")'); await S.waitForSelector('.mdl .err');
    ok((await S.textContent('.mdl .err')).includes('write a short reason') && await S.evaluate(() => document.activeElement.id) === 'f-note', '1.8 Decline without a note explains what to do and focuses the note');
  } else console.log('  (no appointment for this department head in demo data)');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
