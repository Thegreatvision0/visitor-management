import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'x'.repeat(64); process.env.NODE_ENV = 'production'; process.env.SEED_ON_EMPTY = 'true';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const post = (p, b, tok, h = {}) => fetch(base + '/api' + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...h }, body: JSON.stringify(b) });
const get = (p, tok) => fetch(base + '/api' + p, { headers: tok ? { authorization: 'Bearer ' + tok } : {} });
try {
  const idx = await fetch(base + '/');
  ok(idx.headers.get('content-security-policy')?.includes("frame-ancestors 'none'") && idx.headers.get('x-frame-options') === 'DENY' && !idx.headers.get('x-powered-by'), 'security headers set, x-powered-by hidden');
  ok(idx.headers.get('cache-control') === 'no-cache', 'index.html revalidated on every load');
  const asset = (await idx.text()).match(/\/assets\/[^"]+\.js/)[0];
  const a = await fetch(base + asset, { headers: { 'accept-encoding': 'gzip' } });
  ok(a.headers.get('cache-control').includes('immutable') && a.headers.get('content-encoding') === 'gzip', 'hashed assets cached 1 year and gzip-compressed');
  ok((await fetch(base + '/members')).headers.get('content-type').includes('text/html'), 'deep link /members serves the app');
  // forced password change for demo password
  const l = await (await post('/auth/login', { username: 'manager', password: 'Noormahal@123' })).json();
  ok(l.mustChangePassword === true, 'demo password → must change password');
  ok((await get('/snapshot', l.token)).status === 403, 'data blocked until password changed');
  ok((await get('/auth/me', l.token)).status === 200, '/auth/me still allowed');
  ok((await (await post('/auth/password', { current: 'Noormahal@123', next: 'Noormahal@123' }, l.token)).json()).error, 'cannot keep the demo password');
  ok((await post('/auth/password', { current: 'Noormahal@123', next: 'Strong#Pass2026' }, l.token)).status === 200, 'new password accepted');
  ok((await get('/snapshot', l.token)).status === 200, 'data available after change');
  const l2 = await (await post('/auth/login', { username: 'manager', password: 'Strong#Pass2026' })).json();
  ok(l2.mustChangePassword === false, 'next sign-in normal');
  // admin-set password is temporary
  const adm = (await (await post('/auth/login', { username: 'admin', password: 'Noormahal@123' })).json()).token;
  await post('/auth/password', { current: 'Noormahal@123', next: 'Admin#Pass2026' }, adm);
  await post('/admin/users', { name: 'Desk', username: 'desk1', password: 'TempPass#1', role: 'reception' }, adm);
  ok((await (await post('/auth/login', { username: 'desk1', password: 'TempPass#1' })).json()).mustChangePassword === true, 'user created by admin must change password at first sign-in');
  // rate limiting (spoofed CF header from a non-loopback is ignored; from loopback the header is trusted)
  let last;
  for (let i = 0; i < 9; i++) last = await post('/auth/login', { username: 'viewer', password: 'wrong' + i }, null, { 'cf-connecting-ip': '203.0.113.9' });
  ok(last.status === 429 && (await last.json()).error.includes('Too many'), '9th wrong password → locked out (429)');
  ok((await post('/auth/login', { username: 'viewer', password: 'Noormahal@123' }, null, { 'cf-connecting-ip': '203.0.113.9' })).status === 429, 'even correct password waits during lockout');
  ok((await post('/auth/login', { username: 'viewer', password: 'Noormahal@123' }, null, { 'cf-connecting-ip': '198.51.100.7' })).status === 200, 'other visitors unaffected');
} catch (e) { console.error(e); fails++; }
srv.close(); await mongoose.disconnect(); await mongo.stop();
// start-up refusal with unsafe settings
const r = spawnSync(process.execPath, ['src/index.js'], { cwd: fileURLToPath(new URL('../server', import.meta.url)), env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'change-me-to-a-long-random-string', SEED_ON_EMPTY: 'true' }, encoding: 'utf8', timeout: 20000 });
ok(r.status === 1 && r.stderr.includes('Refusing to start'), 'production refuses weak JWT_SECRET / sample data');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
