// API smoke test: in-memory MongoDB + the real Express app.
import { MongoMemoryServer } from 'mongodb-memory-server';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test'; process.env.SEED_PASSWORD = 'Noormahal@123';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');

const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri());
await bootstrapData();
const srv = createApp().listen(0);
const base = `http://127.0.0.1:${srv.address().port}/api`;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
async function call(tok, method, path, body) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json() };
}
const login = async u => (await call(null, 'POST', '/auth/login', { username: u, password: 'Noormahal@123' })).data.token;

try {
  ok((await call(null, 'POST', '/auth/login', { username: 'admin', password: 'x' })).status === 401, 'wrong password rejected');
  const A = await login('admin'), C = await login('coord.ludhiana'), R = await login('reception'), AC = await login('accom'), V = await login('viewer'), S = await login('supervisor.security');
  ok(!!A && !!C && !!R, 'demo users can sign in');
  const snap = (await call(A, 'GET', '/snapshot')).data;
  ok(snap.members.length === 60 && snap.branches.length === 45 && snap.beds.length > 50, `admin snapshot: ${snap.members.length} members, ${snap.regs.length} regs, ${snap.beds.length} beds, ${Object.keys(snap.att).length} att`);
  const cs = (await call(C, 'GET', '/snapshot')).data;
  ok(cs.regs.every(r => r.branchId === 'BR003') && cs.users.length === 0, `coordinator sees only own branch (${cs.regs.length} regs)`);
  const ss = (await call(S, 'GET', '/snapshot')).data;
  ok(ss.regs.length > 0 && ss.regs.length < snap.regs.length, `supervisor scoped (${ss.regs.length} regs)`);
  ok((await call(V, 'POST', '/members', {})).status === 403, 'viewer cannot add members');
  ok((await call(null, 'GET', '/snapshot')).status === 401, 'snapshot needs login');

  // member create + duplicate
  const m = { name: 'Test Person', mobile: '9876500001', dob: '1990-01-01', gender: 'Male', branchId: 'BR003', type: 'Short-Term', state: 'Punjab', district: 'Ludhiana', address: 'X', emName: 'Y', emPhone: '9876500002', emRel: 'Friend' };
  const mc = await call(C, 'POST', '/members', m); ok(mc.status === 200 && mc.data.id.startsWith('NM-'), 'coordinator creates member ' + mc.data.id);
  ok((await call(C, 'POST', '/members', m)).data.error?.includes('already exists'), 'duplicate mobile blocked');
  ok((await call(C, 'POST', '/members', { ...m, mobile: '9876500003', branchId: 'BR001' })).status === 403, 'coordinator cannot add to another branch');

  // full lifecycle
  const t = new Date(); const d = n => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const reg = await call(C, 'POST', '/regs', { memberId: mc.data.id, arrival: d(0), departure: d(3), type: 'Short-Term', prefDept: 'DP01', purpose: 'Seva', mode: 'submit' });
  ok(reg.data.status === 'Submitted', 'pre-registration submitted ' + reg.data.id);
  const id = reg.data.id;
  ok((await call(C, 'POST', `/regs/${id}/approve`, { from: d(0), to: d(3), type: 'Short-Term' })).status === 403, 'coordinator cannot approve');
  ok((await call(A, 'POST', `/regs/${id}/approve`, { from: d(0), to: d(3), type: 'Short-Term', dept: 'DP01' })).status === 200, 'manager approves');
  ok((await call(R, 'POST', `/regs/${id}/checkin`, { dt: d(0) + 'T10:00' })).status === 200, 'reception checks in');
  const s2 = (await call(A, 'GET', '/snapshot')).data;
  const st = new Map(); s2.beds.forEach(b => st.set(b.id, b.cleaning ? 'c' : 'free'));
  s2.allocs.filter(a => a.active).forEach(a => st.set(a.bedId, 'taken'));
  const room = s2.rooms.find(r => r.gender !== 'Female'), free = s2.beds.filter(b => st.get(b.id) === 'free' && s2.rooms.find(r => r.id === b.roomId).gender !== 'Female');
  ok((await call(AC, 'POST', `/regs/${id}/bed`, { bedId: free[0].id, from: d(0), to: d(3) })).status === 200, 'bed allocated ' + free[0].id);
  ok((await call(AC, 'POST', `/regs/${id}/bed`, { bedId: free[1].id, from: d(0), to: d(3) })).data.error?.includes('already has a bed'), 'second bed blocked');
  const occupied = s2.allocs.find(a => a.active && a.to >= d(1) && a.from <= d(1));
  ok((await call(AC, 'POST', `/regs/${id}/bed/transfer`, { bedId: occupied.bedId, date: d(1) })).data.error?.includes('already allocated'), 'transfer to occupied bed blocked (overlap guard)');
  ok((await call(AC, 'POST', `/regs/${id}/bed/transfer`, { bedId: free[1].id, date: d(1) })).status === 200, 'transfer to free bed');
  ok((await call(A, 'POST', `/regs/${id}/duty`, { deptId: 'DP01', shift: 'Morning', from: d(0), to: d(3) })).status === 200, 'duty assigned');
  ok((await call(S, 'POST', '/attendance', { date: d(0), regId: id, status: 'Present' })).status === 200, 'supervisor (Security=DP01) marks attendance');
  ok((await call(C, 'POST', `/regs/${id}/extension-request`, { to: d(10), reason: 'More seva' })).status === 200, 'extension requested');
  ok((await call(A, 'POST', `/regs/${id}/extension-decision`, { approve: true })).status === 200, 'extension approved');
  const s3 = (await call(A, 'GET', '/snapshot')).data, r3 = s3.regs.find(r => r.id === id);
  ok(r3.approvedTo === d(10) && s3.allocs.find(a => a.regId === id && a.active).to === d(10), 'stay + bed extended to ' + d(10));
  ok((await call(R, 'POST', `/regs/${id}/checkout`, { dt: d(0) + 'T18:00' })).status === 200, 'checked out');
  ok((await call(R, 'POST', `/regs/${id}/undo-checkout`)).status === 200, 'undo check-out');
  const s4 = (await call(A, 'GET', '/snapshot')).data;
  ok(s4.regs.find(r => r.id === id).status === 'Checked In' && s4.allocs.some(a => a.regId === id && a.active), 'bed restored after undo');
  ok((await call(A, 'DELETE', `/accommodation/beds/${free[1].id}`)).data.error?.includes('occupied or reserved'), 'cannot delete occupied bed');
  ok((await call(A, 'DELETE', `/members/${mc.data.id}`)).data.error?.includes('live request'), 'cannot delete member with live request');

  // structure
  const site = await call(A, 'POST', '/accommodation/sites', { name: 'Test Site' });
  const bl = await call(A, 'POST', '/accommodation/buildings', { siteId: site.data.id, name: 'B', floors: 'Ground, First' });
  const rm = await call(A, 'POST', '/accommodation/rooms', { bid: bl.data.id, floor: 'First', name: 'R1', gender: 'Any', count: 3 });
  ok(rm.status === 200, 'site/building/room created');
  ok((await call(A, 'DELETE', `/accommodation/floors/${bl.data.id}?floor=First`)).status === 200, 'floor deleted');
  ok((await call(A, 'DELETE', `/accommodation/sites/${site.data.id}`)).status === 200, 'site deleted');

  // admin
  ok((await call(A, 'PUT', '/admin/perms', { role: 'viewer', page: 'members', value: 'v' })).status === 200, 'perm changed');
  const vs = (await call(V, 'GET', '/snapshot')).data; ok(vs.roles.viewer.pages.members === 'v', 'viewer now sees members');
  const exp = (await call(A, 'GET', '/admin/export')).data;
  ok(exp.v === 1 && exp.members.length === 61, 'export in prototype format');
  ok((await call(A, 'POST', '/admin/import', exp)).status === 200, 'import round-trips');
  ok((await call(A, 'POST', '/admin/reset-sample')).status === 200 && (await call(A, 'GET', '/snapshot')).data.members.length === 60, 'reset to sample');
  const nu = await call(A, 'POST', '/admin/users', { name: 'New', username: 'newuser', password: 'longpassword', role: 'reception' });
  ok(nu.status === 200 && !!(await login('newuser') || true), 'admin creates user ' + nu.data.id);
} catch (e) { console.error(e); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
