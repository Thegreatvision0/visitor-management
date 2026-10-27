// API test: guest visit flow end to end.
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
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const notes = async t => (await call(t, 'GET', '/snapshot')).data.notifications.map(n => n.text);
try {
  const A = await login('admin');
  await call(A, 'POST', '/admin/users', { name: 'Main Office', username: 'office1', password: 'Office#Pass1', role: 'office' });
  await call(A, 'POST', '/admin/users', { name: 'Gate Security', username: 'security1', password: 'Secure#Pass1', role: 'security' });
  const fresh = async (u, p) => { const t = await login(u, p); await call(t, 'POST', '/auth/password', { current: p, next: p + 'x' }); return t; }; // admin-set passwords are temporary
  const H = await login('reception'), S = await login('supervisor.security'), O = await fresh('office1', 'Office#Pass1'), G = await fresh('security1', 'Secure#Pass1'), C = await login('coord.ludhiana');
  ok(!!O && !!G, 'new roles Main Office and Security can sign in');
  ok((await call(C, 'POST', '/visits', {})).status === 403, 'coordinator (no Guest Visits page) cannot invite');

  // 1. host invites
  const inv = await call(H, 'POST', '/visits', { guestName: 'Rajesh Kumar', deptId: 'DP01' });
  ok(inv.status === 200 && inv.data.token.length >= 20, 'host creates invitation ' + inv.data.id);
  const id = inv.data.id, tk = inv.data.token;
  // 2. guest opens link
  const pv = await call(null, 'GET', '/public/visits/' + tk);
  ok(pv.status === 200 && pv.data.editable && pv.data.depts.some(x => x.name === 'Security') && pv.data.hostName === 'Reception Staff', 'public link shows host and departments');
  ok((await call(null, 'GET', '/public/visits/not-a-real-token-123456789')).status === 404, 'wrong link → 404');
  ok((await call(null, 'POST', '/public/visits/' + tk, { name: 'R' })).data.error?.includes('required'), 'guest form validated');
  const form = { name: 'Rajesh Kumar', mobile: '9876512345', organisation: 'ABC Trust', people: 3, purpose: 'Discuss seva programme', meetWith: 'Swami Nareshanand', deptName: 'security', date: d(1), time: '10:00', hasVehicle: true, vehicleType: 'Car', vehicleNumber: 'pb 10 ab 1234', parking: 'Baikunth Dwar' };
  ok((await call(null, 'POST', '/public/visits/' + tk, { ...form, meetWith: '' })).data.error?.includes('Whom you are meeting'), 'person to meet is required');
  const sub = await call(null, 'POST', '/public/visits/' + tk, form);
  ok(sub.status === 200 && sub.data.status === 'Submitted' && sub.data.vehicle.number === 'PB10AB1234', 'guest registers; vehicle number normalised');
  ok(sub.data.vehicle.preferred === '' && !sub.data.parkings && sub.data.parking === '', 'parking sent by the guest is ignored (host assigns it)');
  ok((await notes(S)).some(t => t.includes('New appointment request: Rajesh Kumar') && t.includes('to meet Swami Nareshanand')), 'department in-charge notified (with the person to meet)');
  ok((await notes(H)).some(t => t.includes('Rajesh Kumar')), 'host notified');
  ok(!(await notes(await login('manager'))).some(t => t.includes('New appointment request')), 'unrelated users not notified');
  // 3. in-charge
  ok((await call(H, 'POST', `/visits/${id}/incharge`, { accept: true, date: d(1), time: '11:00' })).status === 403, 'host cannot accept on behalf of the in-charge');
  ok((await call(S, 'POST', `/visits/${id}/incharge`, { accept: true, date: d(1), time: '11:00', duration: 60 })).status === 200, 'in-charge accepts (time moved to 11:00)');
  ok((await notes(H)).some(t => t.startsWith('Appointment accepted')), 'host told to finalise');
  ok((await call(null, 'POST', '/public/visits/' + tk, form)).data.error?.includes('already being processed'), 'guest cannot change after acceptance');
  // 4. host finalises → office approval
  ok((await call(H, 'POST', `/visits/${id}/finalize`, { parking: '' })).data.error?.includes('parking'), 'parking required for a vehicle');
  const fin = await call(H, 'POST', `/visits/${id}/finalize`, { parking: 'Baikunth Dwar', office: 'Office 2', golfCart: true });
  ok(fin.data.status === 'Awaiting office', 'Baikunth Dwar + Office 2 + golf car → Awaiting office');
  ok((await notes(O)).some(t => t.startsWith('Approval needed: Rajesh Kumar')), 'Main Office notified');
  // office double booking
  const inv2 = await call(H, 'POST', '/visits', { deptId: 'DP01' });
  await call(null, 'POST', '/public/visits/' + inv2.data.token, { ...form, name: 'Second Guest', mobile: '9876512346', date: d(1), time: '11:30', hasVehicle: false });
  await call(S, 'POST', `/visits/${inv2.data.id}/incharge`, { accept: true, date: d(1), time: '11:30', duration: 30 });
  ok((await call(H, 'POST', `/visits/${inv2.data.id}/finalize`, { office: 'Office 2' })).data.error?.includes('already booked'), 'Office 2 double booking at 11:30 blocked');
  const f2 = await call(H, 'POST', `/visits/${inv2.data.id}/finalize`, { office: 'Office 3' });
  ok(f2.data.status === 'Awaiting office', 'Office 3 is free');
  // 5. office decision
  ok((await call(H, 'POST', `/visits/${id}/office`, { approve: true })).status === 403, 'host cannot approve');
  ok((await call(O, 'POST', `/visits/${inv2.data.id}/office`, { approve: false, remarks: 'x' })).data.error?.includes('full name'), 'rejection must be signed with a name');
  ok((await call(O, 'POST', `/visits/${inv2.data.id}/office`, { approve: false, approverName: 'Sw. Ram' })).data.error?.includes('reason'), 'rejection needs a reason');
  await call(O, 'POST', `/visits/${inv2.data.id}/office`, { approve: false, remarks: 'Office 3 under repair', approverName: 'Swami Ramanand' });
  ok((await notes(H)).some(t => t.includes('Main Office (Swami Ramanand) did not approve Second Guest')), 'host told about rejection, with the signer');
  const ap = { approve: true, cartNote: 'Cart 2', parking: 'Baikunth Dwar', office: 'Office 2', approverName: 'Swami Ramanand' };
  ok((await call(O, 'POST', `/visits/${id}/office`, { ...ap, approverName: '' })).data.error?.includes('full name'), 'approval without a name refused');
  ok((await call(O, 'POST', `/visits/${id}/office`, { ...ap, parking: '' })).data.error?.includes('parking'), 'approval without parking refused');
  ok((await call(O, 'POST', `/visits/${id}/office`, { ...ap, office: '' })).data.error?.includes('office number'), 'approval without office number refused');
  ok((await call(O, 'POST', `/visits/${id}/office`, ap)).status === 200, 'Main Office approves parking + office, signed');
  const apv = (await call(A, 'GET', '/snapshot')).data.visits.find(v => v.id === id);
  ok(apv.approval.by === 'Swami Ramanand' && apv.approval.user === 'Main Office' && apv.approval.parking === 'Baikunth Dwar' && apv.approval.office === 'Office 2', 'approval stores typed name, account, parking and office');
  ok(apv.history.some(h => h.by.includes('Swami Ramanand (signed in as Main Office)') && h.text.includes('parking: Baikunth Dwar, office: Office 2')), 'timeline: ' + apv.history.at(-1).by + ' — ' + apv.history.at(-1).text);
  ok((await notes(H)).some(t => t.startsWith('Approved by Swami Ramanand: Rajesh Kumar')), 'host notified with the approver name');
  const gn = await notes(G);
  ok(gn.some(t => t.startsWith('Expected: Rajesh Kumar — PB10AB1234 (Car) → Baikunth Dwar parking')), 'security notified: ' + gn.find(t => t.startsWith('Expected')));
  const pub = (await call(null, 'GET', '/public/visits/' + tk)).data;
  ok(pub.status === 'Confirmed' && pub.parking === 'Baikunth Dwar' && pub.office === 'Office 2' && pub.time === '11:00', 'guest link shows confirmed parking, office and time');
  // 6. gate
  ok((await call(H, 'POST', `/visits/${id}/entry`, {})).status === 403, 'only security records entry');
  ok((await call(G, 'POST', `/visits/${id}/entry`, { vehicleNumber: 'PB10AB9999' })).status === 200, 'security records entry with a different number');
  const sv = (await call(A, 'GET', '/snapshot')).data.visits.find(v => v.id === id);
  ok(sv.status === 'Arrived' && sv.vehicle.number === 'PB10AB9999' && sv.gateRemarks.includes('booked PB10AB1234'), 'actual vehicle number kept and noted');
  ok((await notes(S)).some(t => t.startsWith('Guest arrived: Rajesh Kumar')), 'in-charge told the guest arrived');
  ok((await call(G, 'POST', `/visits/${id}/exit`)).status === 200, 'exit recorded');
  // typed department that is not in the list → host decides, management notified
  const inv4 = await call(H, 'POST', '/visits', { guestName: 'Typed Dept', vehicleType: 'SUV / Jeep', vehicleNumber: 'hr 26 dq 7777' });
  ok((await call(null, 'GET', '/public/visits/' + inv4.data.token)).data.vehicle.number === 'HR26DQ7777', 'vehicle given by the host is pre-filled for the guest');
  const s4 = await call(null, 'POST', '/public/visits/' + inv4.data.token, { ...form, name: 'Typed Dept', mobile: '9876512399', meetWith: 'Sh. Gupta', deptName: 'Accounts Office', time: '16:00', hasVehicle: undefined, vehicleType: 'No vehicle' });
  const v4 = (await call(A, 'GET', '/snapshot')).data.visits.find(v => v.id === inv4.data.id);
  ok(s4.status === 200 && v4.deptId === '' && v4.deptName === 'Accounts Office' && !v4.vehicle.has, 'unknown department kept as typed; "No vehicle" respected');
  ok((await notes(await login('manager'))).some(t => t.includes('Typed Dept') && t.includes('host / management to accept')), 'management notified for an unknown department');
  ok((await call(S, 'POST', `/visits/${inv4.data.id}/incharge`, { accept: true, date: d(1), time: '16:00' })).status === 403, 'an unrelated in-charge cannot accept it');
  ok((await call(H, 'POST', `/visits/${inv4.data.id}/incharge`, { accept: true, date: d(1), time: '16:00' })).status === 200, 'the host accepts it instead');
  ok((await call(A, 'GET', '/snapshot')).data.visits.find(v => v.id === id).deptId === 'DP01', 'typed "security" matched to the Security department');
  // Abhinandan Dwar only → confirmed without approval
  const inv3 = await call(H, 'POST', '/visits', {});
  await call(null, 'POST', '/public/visits/' + inv3.data.token, { ...form, name: 'Walk Guest', mobile: '9876512347', time: '15:00', vehicleNumber: 'HR26CQ1111' });
  await call(S, 'POST', `/visits/${inv3.data.id}/incharge`, { accept: true, date: d(1), time: '15:00' });
  ok((await call(H, 'POST', `/visits/${inv3.data.id}/finalize`, { parking: 'Abhinandan Dwar' })).data.status === 'Confirmed', 'Abhinandan Dwar only → confirmed without office approval');
  // scoping
  const gs = (await call(G, 'GET', '/snapshot')).data.visits;
  ok(gs.length >= 3 && gs.every(v => v.token === undefined), 'security sees visits but not guest links');
  ok((await call(H, 'GET', '/snapshot')).data.visits.every(v => v.token), 'host sees own guest links');
  // cancel → link dead
  await call(H, 'POST', `/visits/${inv3.data.id}/cancel`, { why: 'Guest postponed' });
  ok((await call(null, 'GET', '/public/visits/' + inv3.data.token)).status === 404, 'cancelled visit link no longer works');
  ok((await notes(G)).some(t => t.startsWith('CANCELLED: Walk Guest')), 'security told about cancellation');
} catch (e) { console.error(e); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
