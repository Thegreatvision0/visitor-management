// Phase 1 — safety and data correctness (API + browser).
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test'; delete process.env.FEATURES; delete process.env.DEMO_MODE;
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const { allocate } = await import(SERVER + 'src/services/domain.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async u => (await call(null, 'POST', '/auth/login', { username: u, password: 'Noormahal@123' })).data.token;
const snap = async t => (await call(t, 'GET', '/snapshot')).data;
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const b = await chromium.launch({ headless: true }); const errs = [];
async function as(user, path, vp = { width: 1366, height: 900 }) {
  const p = await (await b.newContext({ viewport: vp })).newPage(); p.on('pageerror', e => errs.push(user + ': ' + e.message));
  await p.goto(base + '/'); await p.fill('input[autocomplete=username]', user); await p.fill('input[autocomplete=current-password]', 'Noormahal@123');
  await p.click('button:has-text("Sign in")'); await p.waitForSelector('#side nav'); if (path) { await p.goto(base + path); await p.waitForSelector('main .ph'); } return p;
}
try {
  const A = await login('admin');
  ok((await call(null, 'GET', '/meta')).data.features.archive === true && (await call(null, 'GET', '/meta')).data.demo === false, '0 feature switches and DEMO flag published at /api/meta');
  ok((await call(null, 'GET', '/health')).data.db === 'up', '0 /api/health reports the database');

  /* 1.1 danger zone */
  ok((await call(A, 'POST', '/admin/clear-all', { confirm: 'DELETE' })).status === 403, '1.1 "Delete everything" refused on a live system');
  process.env.FEATURES = 'dangerZone=on';
  ok((await call(A, 'POST', '/admin/clear-people', {})).data.error === 'Type DELETE to confirm.', '1.1 with the switch on, DELETE must still be typed');
  delete process.env.FEATURES;

  /* Zod: junk text refused */
  const s0 = await snap(A), br = s0.branches.find(x => x.name === 'Ludhiana');
  const junk = await call(A, 'POST', '/members', { name: 'dfdf', mobile: '9811122233', dob: '1990-01-01', gender: 'Male', type: 'Short-Term', state: 'Punjab', branchId: br.id, district: 'Ludhiana', address: 'Village Rampur', emName: 'Ram Lal', emPhone: '9811122234' });
  ok(junk.status === 400 && junk.data.error.includes('placeholder'), '0 server refuses placeholder text: ' + junk.data.error);

  /* 1.2 archive / restore */
  const used = new Set(s0.regs.map(r => r.branchId).concat(s0.users.map(u => u.branchId)));
  const idle = s0.branches.find(x => !used.has(x.id) && !s0.branches.some(y => y.parentId === x.id));
  const brLive = s0.branches.find(x => s0.regs.some(r => r.branchId === x.id && ['Submitted', 'Approved', 'Checked In'].includes(r.status)) && !s0.users.some(u => u.branchId === x.id));
  ok((await call(A, 'POST', `/branches/${brLive.id}/archive`, {})).data.error.includes('open request'), `1.2 a branch with open requests (${brLive.name}) cannot be archived`);
  ok((await call(A, 'POST', `/branches/${idle.id}/archive`, { reason: 'merged' })).status === 200, `1.2 branch ${idle.name} archived`);
  const s1 = await snap(A);
  ok(s1.branches.find(x => x.id === idle.id).archived.reason === 'merged', '1.2 archived branch kept with reason');
  ok((await call(A, 'POST', '/members', { name: 'Kamal Preet', mobile: '9811122299', dob: '1990-01-01', gender: 'Male', type: 'Short-Term', state: idle.state, branchId: idle.id, district: 'Ludhiana', address: 'Village Rampur', emName: 'Ram Lal', emPhone: '9811122298' })).data.error.includes('archived'), '1.2 archived branch cannot be chosen for a new member');
  ok((await call(A, 'POST', `/branches/${idle.id}/restore`)).status === 200, '1.2 branch restored');
  const busyDept = s0.duties.find(x => x.status === 'Active').deptId, freeDept = s0.depts.find(x => !s0.duties.some(u => u.deptId === x.id && u.status === 'Active'));
  ok((await call(A, 'POST', `/depts/${busyDept}/archive`, {})).data.error.includes('assigned'), '1.2 a department with active sewadar cannot be archived');
  if (freeDept) { ok((await call(A, 'POST', `/depts/${freeDept.id}/archive`, {})).status === 200, '1.2 department archived'); ok((await call(A, 'POST', `/depts/${freeDept.id}/restore`)).status === 200, '1.2 department restored'); }
  const draft = s0.regs.find(r => r.status === 'Draft');
  ok((await call(A, 'POST', `/regs/${draft.id}/archive`, { reason: 'duplicate' })).status === 200 && (await snap(A)).regs.find(r => r.id === draft.id).archived, '1.2 draft request archived');
  ok((await call(A, 'POST', `/regs/${s0.regs.find(r => r.status === 'Approved').id}/archive`, {})).status === 400, '1.2 a live request cannot be archived');
  const stayed = s0.members.find(m => s0.regs.some(r => r.memberId === m.id && r.status === 'Checked Out') && !s0.regs.some(r => r.memberId === m.id && ['Submitted', 'Approved', 'Checked In'].includes(r.status)));
  await call(A, 'DELETE', `/members/${stayed.id}?reason=test`);
  ok((await call(A, 'DELETE', `/members/${stayed.id}?permanent=1`)).data.error.includes('stayed'), '1.2 a member with stay history can never be deleted permanently');
  await call(A, 'POST', `/members/${stayed.id}/restore`);

  /* 1.4 bed lock: four requests race for one bed (called directly, without the server's write queue) */
  const s2 = await snap(A), allocated = new Set(s2.allocs.filter(a => a.active).map(a => a.regId)), bedBusy = new Set(s2.allocs.filter(a => a.active).map(a => a.bedId));
  const racers = s2.regs.filter(r => r.status === 'Approved' && !allocated.has(r.id) && r.approvedFrom <= d(1)).slice(0, 4);
  const bed = s2.beds.find(x => !bedBusy.has(x.id) && !x.cleaning);
  const results = await Promise.allSettled(racers.map(r => allocate({ name: 'Race test' }, r.id, bed.id, r.approvedFrom, r.approvedTo, 'race')));
  const won = results.filter(x => x.status === 'fulfilled').length;
  ok(racers.length >= 2 && won === 1, `1.4 ${racers.length} simultaneous bookings of one bed → exactly ${won} succeeded`);

  /* 1.5 stay rules */
  ok((await call(A, 'PUT', '/admin/stay-rules', { shortMax: 30, monthlyMax: 10 })).status === 400, '1.5 invalid limits refused');
  ok((await call(A, 'PUT', '/admin/stay-rules', { shortMax: 5, monthlyMax: 20 })).status === 200, '1.5 limits changed to 5 / 20 days');
  const fm = s2.members.find(m => !s2.regs.some(r => r.memberId === m.id && ['Submitted', 'Approved', 'Checked In'].includes(r.status)));
  const nr = await call(A, 'POST', '/regs', { memberId: fm.id, branchId: fm.branchId, arrival: d(20), departure: d(27), purpose: 'Seva during programme', mode: 'submit' });
  ok((await snap(A)).regs.find(r => r.id === nr.data.id).type === 'Monthly', '1.5 an 8-day stay is Monthly under the new limits');
  await call(A, 'PUT', '/admin/stay-rules', { shortMax: 10, monthlyMax: 30 });

  /* 1.6 arrival needs a bed */
  const s3 = await snap(A), al3 = new Set(s3.allocs.filter(a => a.active).map(a => a.regId));
  const arr = s3.regs.find(r => r.status === 'Approved' && !al3.has(r.id) && r.approvedFrom <= d(0)), am = s3.members.find(m => m.id === arr.memberId);
  ok((await call(A, 'POST', `/regs/${arr.id}/checkin`, { dt: d(0) + 'T10:00' })).data.error.includes('Assign a bed'), '1.6 arrival without a bed refused');
  const busy3 = new Set(s3.allocs.filter(a => a.active).map(a => a.bedId)), roomOf = id => s3.rooms.find(r => r.id === id);
  const wrong = s3.beds.find(x => !busy3.has(x.id) && !x.cleaning && !['Any', am.gender].includes(roomOf(x.roomId).gender));
  if (wrong) ok((await call(A, 'POST', `/regs/${arr.id}/checkin`, { dt: d(0) + 'T10:00', bedId: wrong.id })).data.error.includes('room'), '1.6 bed in a room for the other gender refused');
  const right = s3.beds.find(x => !busy3.has(x.id) && !x.cleaning && ['Any', am.gender].includes(roomOf(x.roomId).gender));
  ok((await call(A, 'POST', `/regs/${arr.id}/checkin`, { dt: d(0) + 'T10:00', bedId: right.id })).status === 200, '1.6 arrival with a valid bed accepted');
  const s4 = await snap(A);
  ok(s4.regs.find(r => r.id === arr.id).status === 'Checked In' && s4.allocs.some(a => a.regId === arr.id && a.active && a.bedId === right.id), '1.6 checked in and the bed is booked in one step');

  /* 1.9 masked mobiles */
  const V = await login('viewer'), sv = await snap(V);
  const anyM = (sv.members || []).find(m => m.mobile);
  if (anyM) ok(/^\d{2}X+\d{3}$/.test(anyM.mobile), '1.9 viewer sees masked numbers: ' + anyM.mobile);
  ok(/^\d{10}$/.test(s4.members[0].mobile), '1.9 admin sees full numbers');
  await call(A, 'PUT', '/admin/perms', { role: 'accom', page: 'mobiles', value: '' });
  const AC = await login('accom'), sa = await snap(AC), mm = sa.members[0];
  ok(/X/.test(mm.mobile), '1.9 after removing "See mobile numbers", Accommodation sees ' + mm.mobile);
  const rv = await call(AC, 'POST', `/members/${mm.id}/reveal`);
  ok(/^\d{10}$/.test(rv.data.mobile), '1.9 Reveal returns the full number');
  ok((await snap(A)).log.some(l => l.text.includes(`Revealed mobile numbers of ${mm.id}`) && l.by === 'Accommodation Manager'), '1.9 Reveal written to the audit log');

  /* ---------- browser ---------- */
  const P = await as('admin', '/dashboard');
  /* 1.3 same numbers everywhere */
  const kpi = async l => (await P.locator('.kpi', { hasText: l }).locator('.kval').textContent()).trim();
  const kRes = await kpi('Currently residing'), kExp = await kpi('Expected arrivals'), kDue = await kpi('Due to depart'), kOcc = (await P.locator('.kpi', { hasText: 'Bed occupancy' }).locator('.ks').textContent()).match(/^(\d+) of/)[1];
  ok(await P.locator('.kpi', { hasText: 'Expected arrivals' }).getAttribute('title') !== null && await P.locator('.kpi .help').count() >= 4, '1.3 KPI definitions shown as ⓘ tooltips');
  await P.locator('.kpi', { hasText: 'Expected arrivals' }).click(); await P.waitForSelector('main .tabs');
  const tabN = async l => (await P.locator('.tab', { hasText: l }).locator('.cnt').textContent()).trim();
  ok(P.url().endsWith('/reception') && (await P.textContent('.tab.on')).startsWith('Expected arrivals') && await tabN('Expected arrivals') === kExp && await P.locator('main tbody tr').count() === +kExp, `1.3 Expected arrivals ${kExp} = Reception tab and list`);
  ok(await tabN('Current residents') === kRes, `1.3 Currently residing ${kRes} = Reception "Current residents"`);
  await P.click('.tab:has-text("Due / overdue")'); await P.click('.fchip:has-text("Due today")');
  ok(await P.locator('main tbody tr').count() === +kDue || (+kDue === 0), `1.3 Due to depart ${kDue} = Reception "Due today"`);
  await P.goto(base + '/accommodation'); await P.waitForSelector('.legend');
  ok((await P.locator('.legend span', { hasText: 'Occupied' }).locator('b').textContent()) === kOcc, `1.3 occupied beds ${kOcc} = Accommodation legend`);
  /* 1.8 chart ticks, sidebar, KPI labels */
  await P.goto(base + '/dashboard'); await P.waitForSelector('.viz');
  const ticks = (await P.locator('.viz').first().locator('text.tick[text-anchor=end]').allTextContents()).map(Number);
  const steps = ticks.slice(1).map((t, i) => t - ticks[i]);
  ok(ticks[0] === 0 && steps.length && steps.every(x => x === steps[0] && x >= 1), '1.8 chart Y axis in even whole steps: ' + ticks.join(' '));
  const navOn = await P.locator('.nav.on').evaluate(e => getComputedStyle(e).backgroundColor), navOff = await P.locator('.nav:not(.on)').first().evaluate(e => getComputedStyle(e).backgroundColor);
  ok(navOn !== navOff, '1.8 active page clearly marked in the sidebar');
  const ph = await as('admin', '/dashboard', { width: 360, height: 780 });
  const cut = await ph.$$eval('.kpi .kl', els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  ok(!cut.length, '1.8 KPI labels not cut off on a small phone' + (cut.length ? ': ' + cut.join(', ') : ''));
  /* 1.1 UI */
  await P.goto(base + '/admin'); await P.waitForSelector('main .tabs');
  ok((await P.textContent('main')).includes('switched off on the live system') && await P.locator('button:has-text("Delete everything")').count() === 0, '1.1 destructive buttons hidden on a live system');
  await P.click('.tab:has-text("Roles & access")'); ok((await P.textContent('main table')).includes('See mobile numbers'), '1.9 "See mobile numbers" in Roles & access');
  await P.click('.tab:has-text("Lists & options")'); ok((await P.textContent('main')).includes('Stay types') && (await P.textContent('main')).includes('up to 10 days'), '1.5 stay-type limits shown in Lists & options');
  /* 1.5 override flagged in review */
  await P.goto(base + '/approvals'); await P.waitForSelector('main tbody'); await P.locator('main tbody button:has-text("Review")').first().click(); await P.waitForSelector('#f-type');
  const cur = await P.inputValue('#f-type'); await P.selectOption('#f-type', cur === 'Long-Term' ? 'Short-Term' : 'Long-Term');
  ok((await P.textContent('.mdl')).includes('Manual override'), '1.5 changing the suggested type shows a manual-override warning');
  await P.keyboard.press('Escape');
  /* 1.7 duplicate mobile while typing */
  await P.goto(base + '/members'); await P.waitForSelector('main tbody'); await P.click('button:has-text("+ Add member")');
  await P.fill('#f-mobile', s4.members[3].mobile); ok((await P.textContent('.mdl')).includes('Already used by ' + s4.members[3].name), '1.7 duplicate mobile warned while typing');
  await P.fill('#f-name', 'asdf'); await P.fill('#f-mobile', '9811100001'); await P.fill('#f-dob', '1990-02-02'); await P.selectOption('#f-gender', 'Male'); await P.selectOption('#f-branchId', { index: 1 });
  await P.fill('#f-district', 'Ludhiana'); await P.fill('#f-address', 'Village Rampur'); await P.fill('#f-emName', 'Ram Lal'); await P.fill('#f-emPhone', '9811100002');
  await P.click('.mdl button:has-text("Create member")'); await P.waitForSelector('.mdl .err');
  ok((await P.textContent('.mdl .err')).includes('placeholder'), '0 the form refuses placeholder text before sending');
  await P.keyboard.press('Escape');
  /* 1.2 row menu + archived view */
  await P.goto(base + '/branches'); await P.waitForSelector('main tbody');
  await P.locator('main tbody tr:not(.rt-group)').first().locator('.rmenu-b').click();
  ok((await P.locator('.rmenu-dd').textContent()).includes('Archive branch') && (await P.locator('.rmenu-dd').textContent()).includes('Delete branch'), '1.2 Archive and Delete in the ⋯ row menu');
  await P.keyboard.press('Escape');
  await P.goto(base + '/prereg'); await P.waitForSelector('main .fchips'); await P.click('.fchip:has-text("Archived")');
  ok((await P.textContent('main tbody')).includes(draft.id) && await P.locator('main tbody button:has-text("Restore")').count() > 0, '1.2 archived request listed with Restore');
  /* 1.6 Reception dialog */
  const R = await as('reception', '/reception'); await R.click('.fchip:has-text("All approved")');
  const rowNoBed = R.locator('main tbody tr', { hasText: 'Not allocated' }).first();
  if (await rowNoBed.count()) { await rowNoBed.locator('button:has-text("Confirm arrival")').click(); await R.waitForSelector('#f-bed');
    ok((await R.textContent('.mdl')).includes('No bed is assigned yet') && await R.locator('#f-bed option').count() > 1, '1.6 Confirm arrival offers a bed picker (' + (await R.locator('#f-bed option').count() - 1) + ' free beds)'); await R.keyboard.press('Escape'); }
  /* 1.9 Reveal in the UI */
  const AU = await as('accom', '/members'); const rb = AU.locator('main tbody .masked button').first();
  ok(await rb.count() === 1, '1.9 masked number with Reveal in Member Master');
  await rb.click(); await AU.waitForTimeout(400);
  ok(/^\d{10}$/.test((await AU.locator('main tbody td[data-label="Mobile"]').first().textContent()).trim()), '1.9 Reveal shows the full number');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
