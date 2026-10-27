// API test: guest visit permissions (role matrix + user extras) and residence booking.
import { MongoMemoryServer } from 'mongodb-memory-server';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}/api`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async (u, p = 'Noormahal@123') => (await call(null, 'POST', '/auth/login', { username: u, password: p })).data.token;
const fresh = async (u, p) => { const t = await login(u, p); await call(t, 'POST', '/auth/password', { current: p, next: p + 'x' }); return login(u, p + 'x'); };
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const snap = async t => (await call(t, 'GET', '/snapshot')).data;
try {
  const A = await login('admin');
  // ---- permissions ----
  const sa = await snap(A);
  ok(sa.visitCaps && sa.visitCaps.supervisor.includes('invite') && sa.visitCaps.supervisor.includes('incharge'), 'default: department head (supervisor) can invite and accept');
  ok((await call(A, 'PUT', '/admin/visit-caps', { role: 'reception', cap: 'invite', on: false })).status === 200, 'admin removes "invite" from Reception');
  const R = await login('reception');
  ok((await call(R, 'POST', '/visits', {})).status === 403, 'Reception can no longer invite');
  await call(A, 'PUT', '/admin/visit-caps', { role: 'reception', cap: 'invite', on: true });
  ok((await call(R, 'POST', '/visits', {})).status === 200, '…and can again after it is ticked back');
  // user extra: a viewer gets "gate"
  const vu = await call(A, 'POST', '/admin/users', { name: 'Gate Helper', username: 'gatehelper', password: 'Temp#Pass1', role: 'viewer', visitCaps: ['gate'] });
  ok(vu.status === 200, 'user created with an extra "gate" permission');
  const GH = await fresh('gatehelper', 'Temp#Pass1');
  const gs = await snap(GH);
  ok(gs.vcaps.includes('gate') && gs.vcaps.includes('all') && gs.myPages.visitors === 'e', 'viewer + extra gate → can act on Guest Visits');
  ok((await call(A, 'POST', '/admin/users', { name: 'X', username: 'xinch', password: 'Temp#Pass1', role: 'viewer', visitCaps: ['incharge'] })).data.error?.includes('department'), 'in-charge permission needs a department');
  // a coordinator given "invite" as an extra
  const cu = (await snap(A)).users.find(u => u.username === 'coord.ludhiana');
  await call(A, 'PUT', '/admin/users/' + cu.id, { name: cu.name, username: cu.username, role: 'coordinator', branchId: cu.branchId, visitCaps: ['invite'] });
  ok((await call(await login('coord.ludhiana'), 'POST', '/visits', {})).status === 200, 'coordinator with extra "invite" can invite');

  // ---- department head runs the full flow incl. residence ----
  const S = await login('supervisor.security');
  const inv = await call(S, 'POST', '/visits', { guestName: 'Dr. Mehta', meetWith: 'Navdeep Sharma', deptName: 'Security' });
  ok(inv.status === 200, 'department head invites a guest');
  await call(null, 'POST', '/public/visits/' + inv.data.token, { name: 'Dr. Mehta', mobile: '9876543210', meetWith: 'Navdeep Sharma', deptName: 'Security', date: d(2), time: '10:00', purpose: 'Seminar', people: 2, vehicleType: 'Car', vehicleNumber: 'DL01CA1111' });
  ok((await call(S, 'POST', `/visits/${inv.data.id}/incharge`, { accept: true, date: d(2), time: '10:00' })).status === 200, 'department head accepts own department appointment');
  const av = (await call(S, 'GET', `/visits/bed-availability?from=${d(2)}&to=${d(4)}`)).data;
  const room = av.find(r => r.free >= 2);
  ok(av.length > 0 && !!room, `bed availability: ${av.length} room(s) with free beds, e.g. ${room.building} ${room.room} (${room.free} free)`);
  ok((await call(S, 'POST', `/visits/${inv.data.id}/finalize`, { parking: 'Baikunth Dwar', office: 'Office 3', golfCart: true, stayNeeded: true, stayFrom: d(2), stayTo: d(4), stayBeds: room.free + 1, stayRoom: room.roomId })).data.error?.includes('free bed'), 'asking for more beds than free is refused');
  const fin = await call(S, 'POST', `/visits/${inv.data.id}/finalize`, { parking: 'Baikunth Dwar', office: 'Office 3', golfCart: true, stayNeeded: true, stayFrom: d(2), stayTo: d(4), stayBeds: 2, stayRoom: room.roomId });
  ok(fin.data.status === 'Awaiting office', 'department head finalises parking + office + golf car + residence → Main Office');
  const v1 = (await snap(A)).visits.find(v => v.id === inv.data.id);
  ok(v1.stay.needed && v1.stay.beds === 2 && v1.stay.from === d(2) && v1.stay.to === d(3), 'residence stored as nights (check-in ' + d(2) + ', last night ' + d(3) + ')');
  // Main Office approval (admin has office permission) reserves real beds
  ok((await call(A, 'POST', `/visits/${inv.data.id}/office`, { approve: true, parking: 'Abhinandan Dwar', office: 'Office 3', approverName: 'Admin Signer' })).status === 200, 'Main Office approves');
  const s2 = await snap(A), al = s2.allocs.filter(a => a.regId === inv.data.id && a.active);
  ok(al.length === 2 && al.every(a => a.guestName === 'Dr. Mehta' && a.from === d(2) && a.to === d(3)), '2 beds reserved in Accommodation for the guest');
  ok(s2.visits.find(v => v.id === inv.data.id).stay.bedIds.length === 2, 'visit records which beds');
  ok((await snap(await login('accom'))).notifications.some(n => n.text.startsWith('Guest stay booked: Dr. Mehta')), 'accommodation manager notified');
  // a sewadar cannot get those beds
  /* a sewadar approved for the same nights (walk-in registered by the manager is approved at once) */
  const free = s2.members.find(m => !s2.regs.some(r => r.memberId === m.id && ['Submitted', 'Approved', 'Checked In'].includes(r.status)));
  const w = await call(A, 'POST', '/regs', { memberId: free.id, branchId: free.branchId, arrival: d(2), departure: d(4), purpose: 'Seva', mode: 'walkin' });
  const AC = await login('accom');
  const clash = await call(AC, 'POST', `/regs/${w.data.id}/bed`, { bedId: al[0].bedId, from: d(2), to: d(3) });
  ok(clash.status === 400 && clash.data.error.includes('guest Dr. Mehta'), 'sewadar allocation blocked: ' + (clash.data.error || '').slice(0, 70));
  // gate helper (viewer + gate extra) records entry, sees notification
  ok((await snap(GH)).notifications.some(n => n.text.startsWith('Expected: Dr. Mehta')), 'user with extra gate permission is notified');
  ok((await call(GH, 'POST', `/visits/${inv.data.id}/entry`, {})).status === 200, 'user with extra gate permission records entry');
  ok((await call(GH, 'POST', `/visits/${inv.data.id}/exit`)).status === 200, 'and exit');
  const s3 = await snap(A);
  ok(!s3.allocs.some(a => a.regId === inv.data.id && a.active) && al.every(a => s3.beds.find(b => b.id === a.bedId).cleaning), 'on exit the beds are released and marked for cleaning');
  // cancel releases reserved beds
  const inv2 = await call(S, 'POST', '/visits', {});
  await call(null, 'POST', '/public/visits/' + inv2.data.token, { name: 'Guest Two', mobile: '9876543211', meetWith: 'Navdeep Sharma', deptName: 'Security', date: d(5), time: '10:00', purpose: 'Seva during programme' });
  await call(S, 'POST', `/visits/${inv2.data.id}/incharge`, { accept: true, date: d(5), time: '10:00' });
  const room2 = (await call(S, 'GET', `/visits/bed-availability?from=${d(5)}&to=${d(6)}`)).data[0];
  await call(S, 'POST', `/visits/${inv2.data.id}/finalize`, { stayNeeded: true, stayFrom: d(5), stayTo: d(6), stayBeds: 1, stayRoom: room2.roomId });
  await call(A, 'POST', `/visits/${inv2.data.id}/office`, { approve: true, approverName: 'Admin Signer' });
  ok((await snap(A)).allocs.some(a => a.regId === inv2.data.id && a.active), 'residence-only visit: bed reserved after approval');
  await call(S, 'POST', `/visits/${inv2.data.id}/cancel`, { why: 'postponed' });
  ok(!(await snap(A)).allocs.some(a => a.regId === inv2.data.id && a.active), 'cancelling releases the reserved bed');
} catch (e) { console.error(e); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
