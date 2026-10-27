// Tests for the 11 requested changes (API level).
import { MongoMemoryServer } from 'mongodb-memory-server';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}/api`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async u => (await (await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'Noormahal@123' }) })).json()).token;
const t = new Date(); const d = n => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
try {
  const A = await login('admin'), C = await login('coord.ludhiana'), C2 = await login('coord.amritsar'), R = await login('reception'), S = await login('supervisor.security');
  const snap = (await call(A, 'GET', '/snapshot')).data;
  ok(['Kerala', 'Assam', 'Ladakh', 'Puducherry'].every(s => snap.lists.states.includes(s)), '#1 all Indian states/UTs in list (' + snap.lists.states.length + ')');
  // #2 unique names
  ok((await call(A, 'POST', '/branches', { name: 'ludhiana ', state: 'Kerala', district: 'X', coordinator: 'Y', phone: '9876543210' })).data.error?.includes('already exists'), '#2 duplicate branch name blocked across states/case');
  // #4 sub-branches
  ok((await call(C, 'POST', '/branches', { name: 'Top Level', state: 'Punjab', district: 'X', coordinator: 'Y', phone: '9876543210' })).status === 403, '#4 coordinator cannot create a main branch');
  const sb = await call(C, 'POST', '/branches', { name: 'Ludhiana – Model Town', parentId: 'BR003', state: 'Kerala', district: 'Ludhiana', coordinator: 'Sub Coord', phone: '9876543211' });
  ok(sb.status === 200, '#4 coordinator creates sub-branch ' + sb.data.id);
  const s1 = (await call(C, 'GET', '/snapshot')).data;
  ok(s1.branches.find(b => b.id === sb.data.id).state === 'Punjab' && s1.family.includes(sb.data.id), '#4 sub-branch takes parent state and is in coordinator family');
  ok((await call(C, 'POST', '/branches', { name: 'Sneaky', parentId: 'BR001', state: 'Punjab', district: 'X', coordinator: 'Y', phone: '9876543210' })).status === 403, '#4 coordinator cannot add under another branch');
  const mem = await call(C, 'POST', '/members', { name: 'Sub Member', mobile: '9876511111', dob: '1990-01-01', gender: 'Male', branchId: sb.data.id, type: 'Monthly', state: 'Punjab', district: 'Ludhiana', address: 'x', emName: 'y', emPhone: '9876511112' });
  ok(mem.status === 200, '#4 coordinator adds member to sub-branch');
  ok((await call(C, 'DELETE', '/branches/BR003')).status === 403, '#4 coordinator cannot delete own main branch');
  ok((await call(A, 'DELETE', '/branches/BR003?moveTo=BR001')).data.error?.includes('sub-branch'), '#4 branch with sub-branches cannot be deleted');
  // #9 auto type
  const r1 = await call(C, 'POST', '/regs', { memberId: mem.data.id, branchId: sb.data.id, arrival: d(5), departure: d(8), type: 'Monthly', purpose: 'x', mode: 'draft' });
  ok(r1.data.type === 'Short-Term', '#9 4-day stay registered as Monthly → Short-Term');
  const r2 = await call(C, 'PUT', '/regs/' + r1.data.id, { arrival: d(5), departure: d(24), type: 'Short-Term', purpose: 'x', mode: 'draft' });
  ok(r2.data.type === 'Monthly', '#9 20-day stay → Monthly');
  const r3 = await call(C, 'PUT', '/regs/' + r1.data.id, { arrival: d(5), departure: d(45), type: 'Short-Term', purpose: 'x', mode: 'submit', branchId: sb.data.id });
  ok(r3.data.type === 'Long-Term' && r3.data.status === 'Submitted', '#9 41-day stay → Long-Term, submitted');
  // #6 rev + #7 notifications
  const rev1 = (await call(A, 'GET', '/rev')).data.rev;
  const sA = (await call(A, 'GET', '/snapshot')).data;
  ok(sA.notifications.some(n => n.text.includes(r1.data.id) && n.text.includes('awaiting approval')), '#7 approver notified of new request');
  ok(!(await call(C2, 'GET', '/snapshot')).data.notifications.some(n => n.text.includes(r1.data.id)), '#7 other branch coordinator not notified');
  ok(!(await call(R, 'GET', '/snapshot')).data.notifications.some(n => n.text.includes('awaiting approval')), '#7 reception does not get approval notices');
  ok(sA.regs.find(r => r.id === r1.data.id).submittedOn?.length === 16, '#5 submittedOn recorded');
  await call(A, 'POST', `/regs/${r1.data.id}/approve`, { from: d(5), to: d(9), type: 'Long-Term' });
  ok((await call(A, 'GET', '/rev')).data.rev !== rev1, '#6 data revision changes after a write');
  const sAp = (await call(A, 'GET', '/snapshot')).data.regs.find(r => r.id === r1.data.id);
  ok(sAp.approvedType === 'Short-Term', '#9 approval type follows approved dates (5 days → Short-Term)');
  const cn = (await call(C, 'GET', '/snapshot')).data.notifications;
  ok(cn.some(n => n.text.startsWith('Approved: ' + r1.data.id)), '#7 coordinator notified of approval');
  ok((await call(R, 'GET', '/snapshot')).data.notifications.some(n => n.text.includes(r1.data.id) && n.text.includes('expected')), '#7 reception notified of expected arrival');
  const nid = cn.find(n => n.text.startsWith('Approved')).id;
  await call(C, 'POST', '/notifications/read', { ids: [nid, 'bad-id'] });
  ok((await call(C, 'GET', '/snapshot')).data.notifications.find(n => n.id === nid).read, '#7 mark as read');
  // #3 extension request shows requester
  const resid = sA.regs.find(r => r.status === 'Checked In' && r.branchId === 'BR003' && !(r.exts || []).some(e => e.status === 'Pending'));
  await call(C, 'POST', `/regs/${resid.id}/extension-request`, { to: d(60), reason: 'more seva' });
  const ext = (await call(A, 'GET', '/snapshot')).data.regs.find(r => r.id === resid.id).exts.find(e => e.status === 'Pending');
  ok(ext.byName === 'Coordinator – Ludhiana', '#3 extension stores coordinator name: ' + ext.byName);
  // #10 extend sewa past stay end (manager) and direct overdue stay extension
  const over = sA.regs.find(r => r.status === 'Checked In' && r.approvedTo < d(0) && sA.duties.some(x => x.regId === r.id && x.status === 'Active'));
  ok((await call(A, 'POST', `/regs/${over.id}/extend`, { to: d(10), note: 'still doing seva' })).status === 200, '#10 manager extends an overdue stay directly');
  const du = (await call(A, 'GET', '/snapshot')).data.duties.find(x => x.regId === over.id && x.status === 'Active');
  ok(du.to === d(10), '#10 active sewa extended with the stay');
  const e2 = await call(A, 'POST', `/regs/${over.id}/duty/extend`, { to: d(20), note: 'x' });
  const s5 = (await call(A, 'GET', '/snapshot')).data;
  ok(e2.status === 200 && s5.duties.find(x => x.regId === over.id && x.status === 'Active').to === d(20) && s5.regs.find(r => r.id === over.id).approvedTo === d(20), '#10 extend sewa beyond stay also extends stay' + (e2.data.error ? ' — ' + e2.data.error : ''));
  // supervisor notification for duty assignment
  const ap = s5.regs.find(r => r.status === 'Checked In' && !s5.duties.some(x => x.regId === r.id && x.status === 'Active'));
  if (ap) { await call(A, 'POST', `/regs/${ap.id}/duty`, { deptId: 'DP01', shift: 'Morning', from: d(0), to: ap.approvedTo }); ok((await call(S, 'GET', '/snapshot')).data.notifications.some(n => n.text.includes('Security')), '#7 security supervisor notified of new assignment'); }
} catch (e) { console.error(e); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
