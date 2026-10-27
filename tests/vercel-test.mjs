// Simulates Vercel: VERCEL=1, no TZ, the exported handler behind a plain http server.
import { MongoMemoryServer } from 'mongodb-memory-server';
import http from 'node:http';
const mongo = await MongoMemoryServer.create();
Object.assign(process.env, { VERCEL: '1', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'x'.repeat(40) }); delete process.env.TZ;
const { default: handler } = await import(new URL('../api/index.mjs', import.meta.url).href);
const srv = http.createServer(handler).listen(0); const base = `http://127.0.0.1:${srv.address().port}/api`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body, ip = '1.2.3.4') => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-real-ip': ip, ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
try {
  ok(process.env.TZ === 'Asia/Kolkata' && new Date().getTimezoneOffset() === -330, 'Indian time zone applied');
  const lg = await call(null, 'POST', '/auth/login', { username: 'admin', password: 'Noormahal@123' });
  ok(lg.status === 200, 'first request connects, seeds and signs in');
  const A = lg.data.token, r1 = (await call(A, 'GET', '/rev')).data.rev;
  await call(A, 'POST', '/visits', { guestName: 'Rev Test' });
  const r2 = (await call(A, 'GET', '/rev')).data.rev;
  ok(r2 === r1 + 1, `write bumps the shared revision (${r1} → ${r2})`);
  ok((await call(A, 'GET', '/snapshot')).data.rev === r2, 'snapshot carries the same revision');
  for (let i = 0; i < 9; i++) await call(null, 'POST', '/auth/login', { username: 'admin', password: 'bad' }, '9.9.9.9');
  ok((await call(null, 'POST', '/auth/login', { username: 'admin', password: 'Noormahal@123' }, '9.9.9.9')).status === 429, 'attacker IP is locked out');
  ok((await call(null, 'POST', '/auth/login', { username: 'admin', password: 'Noormahal@123' }, '5.5.5.5')).status === 200, 'other visitors (different x-real-ip) still sign in');
} catch (e) { console.error(e); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
srv.close(); process.exit(fails ? 1 : 0);
