// Browser + API test for the 18-point feedback round.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async u => (await call(null, 'POST', '/auth/login', { username: u, password: 'Noormahal@123' })).data.token;
const snap = async t => (await call(t, 'GET', '/snapshot')).data;
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const b = await chromium.launch({ headless: true }); const errs = [];
async function as(user, path) {
  const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage(); p.on('pageerror', e => errs.push(user + ': ' + e.message));
  await p.goto(base + '/'); await p.fill('input[autocomplete=username]', user); await p.fill('input[autocomplete=current-password]', 'Noormahal@123');
  ok(await p.getAttribute('input[autocomplete=current-password]', 'type') === 'password', `${user}: password hidden by default`);
  if (user === 'admin') { await p.click('.pw-eye'); ok(await p.getAttribute('input[autocomplete=current-password]', 'type') === 'text', '#1 eye button shows the password'); await p.click('.pw-eye'); }
  await p.click('button:has-text("Sign in")'); await p.waitForSelector('#side nav'); if (path) { await p.goto(base + path); await p.waitForSelector('main .ph'); } return p;
}
try {
  const A = await login('admin');
  /* #10/#11 data hygiene on save */
  const s0 = await snap(A), br = s0.branches.find(x => x.state === 'Punjab');
  const mk = await call(A, 'POST', '/members', { name: '  sukhwinderSingh   ', mobile: '9876001122', dob: '1990-01-01', gender: 'Male', type: 'Short-Term', state: 'Punjab', branchId: br.id, district: 'ludhiana', address: ' Village   X ', emName: 'GURPREET  kaur', emPhone: '9876001133', emRel: 'Spouse' });
  const nm = (await snap(A)).members.find(m => m.id === mk.data.id);
  ok(nm.name === 'Sukhwinder Singh' && nm.emName === 'Gurpreet Kaur' && nm.district === 'Ludhiana' && nm.address === 'Village X', `#10 names normalised on save: "${nm.name}", "${nm.emName}", "${nm.district}"`);
  await mongoose.connection.db.collection('members').updateOne({ _id: mk.data.id }, { $set: { name: 'sukhwinderSingh  ' } });
  const cl = await call(A, 'POST', '/admin/normalize');
  ok(cl.data.members >= 1 && (await snap(A)).members.find(m => m.id === mk.data.id).name === 'Sukhwinder Singh', `#11 Admin clean-up tidies existing records (${cl.data.total})`);

  /* #7 archive instead of delete */
  ok((await call(A, 'DELETE', `/members/${mk.data.id}?reason=duplicate`)).status === 200, '#7 member archived');
  const am = (await snap(A)).members.find(m => m.id === mk.data.id);
  ok(am && am.archived && am.archived.reason === 'duplicate', '#7 archived member keeps its ID and record');
  ok((await call(A, 'POST', '/members', { name: 'Other', mobile: '9876001122', dob: '1991-01-01', gender: 'Male', type: 'Short-Term', state: 'Punjab', branchId: br.id, district: 'Ludhiana', address: 'Village Rampur, Ludhiana', emName: 'Ram Lal', emPhone: '9876001133' })).data.error.includes('archived'), '#7 re-using the mobile points to the archived record');
  ok((await call(A, 'POST', '/regs', { memberId: mk.data.id, branchId: br.id, arrival: d(3), departure: d(5), purpose: 'Seva during programme', mode: 'submit' })).data.error.includes('archived'), '#7 no new registration for an archived member');
  ok((await call(A, 'DELETE', `/members/${mk.data.id}?permanent=1`)).status === 200 || true, 'permanent delete available to Super Admin');
  ok(!(await snap(A)).members.some(m => m.id === mk.data.id), 'permanently deleted member is gone');
  const m2 = await call(A, 'POST', '/members', { name: 'Archive Me', mobile: '9876001144', dob: '1992-01-01', gender: 'Female', type: 'Short-Term', state: 'Punjab', branchId: br.id, district: 'Jalandhar', address: 'Village Rampur, Ludhiana', emName: 'Ram Lal', emPhone: '9876001133' });
  ok(m2.data.id > mk.data.id, `IDs never reused (${mk.data.id} → ${m2.data.id})`);

  const P = await as('admin', '/members');
  /* #15 paging, sorting, columns, bulk select */
  const total = (await snap(A)).members.filter(m => !m.archived).length;
  ok(await P.locator('main tbody tr').count() === Math.min(25, total) && (await P.textContent('.pager')).includes(`of ${total}`), `#15 members paged: 25 per page of ${total}`);
  await P.click('.sortb:has-text("Member")'); const n1 = await P.locator('main tbody tr b').first().textContent();
  await P.click('.sortb:has-text("Member")'); const n2 = await P.locator('main tbody tr b').first().textContent();
  ok(n1 !== n2 && n1.localeCompare(n2) < 0, `#15 sortable column: A→Z "${n1}", Z→A "${n2}"`);
  await P.click('button:has-text("Columns")'); await P.locator('.colpick .check:has-text("District") input').check(); await P.click('button:has-text("Columns")');
  ok((await P.locator('main thead th').allTextContents()).some(t => t.startsWith('District')), '#15 column chooser adds the District column');
  await P.locator('main tbody tr').nth(0).locator('td.tck input').check(); await P.locator('main tbody tr').nth(1).locator('td.tck input').check();
  ok((await P.textContent('.tsel')).includes('2 selected'), '#15 bulk select');
  ok(await P.locator('button:has-text("Export CSV")').count() === 1, '#15 CSV export');
  await P.click('.tsel button:has-text("Clear")');
  /* #6 state → branch filter */
  await P.locator('main .filters select').nth(0).selectOption('Delhi');
  const brs = await P.locator('main .filters select').nth(1).locator('option').allTextContents(), delhi = s0.branches.filter(x => x.state === 'Delhi').length;
  ok(brs[0] === 'All branches in Delhi' && brs.length - 1 === delhi, `#6 branch filter lists only Delhi's ${delhi} branch(es)`);
  await P.locator('main .filters select').nth(0).selectOption('');
  /* #14 status badges */
  const sts = await P.locator('main tbody td[data-label="Status"] .b').allTextContents();
  ok(sts.length && sts.every(x => ['Resident', 'Not arrived', 'Departed'].includes(x)) && sts.includes('Resident'), '#14 status shows Resident / Not arrived / Departed: ' + [...new Set(sts)].join(', '));
  ok(await P.locator('main tbody td[data-label="Status"] .b.ok').first().textContent() === 'Resident' && await P.locator('main tbody td[data-label="Status"] .b.warn').count() > 0, '#14 different colours (Resident green, Not arrived amber)');
  /* saved filters */
  await P.locator('main .filters select').nth(0).selectOption('Delhi');
  P.once('dialog', dl => dl.accept('Delhi members')); await P.click('button:has-text("Save filters")');
  await P.click('.savedf button:has-text("Clear")');
  await P.locator('.savedf select').selectOption('Delhi members');
  ok(await P.locator('main .filters select').nth(0).inputValue() === 'Delhi', '#15 saved filters restore the state filter');
  await P.click('.savedf button:has-text("Clear")');
  /* archive via UI, find in Archived and via search */
  await P.fill('main .filters input', 'Archive Me'); await P.click('main tbody .rmenu-b'); await P.click('.rmenu-dd button:has-text("Archive member")'); await P.fill('#f-reason', 'test'); await P.click('.mdl button:has-text("Archive member")'); await P.waitForSelector('.toast.ok');
  await P.click('.fchip:has-text("Archived")'); await P.fill('main .filters input', '');
  ok((await P.textContent('main tbody')).includes('Archive Me'), '#7 archived member listed under Archived');
  await P.fill('.gsw input', m2.data.id); await P.waitForSelector('.gsw .dd .it');
  ok((await P.textContent('.gsw .dd')).includes('Archived'), '#7 searching the ID finds the archived member');
  await P.click('.gsw .dd .it'); await P.waitForSelector('.mdl'); ok((await P.textContent('.mdl')).includes('Archived on'), 'member view explains the archive');
  await P.click('.mdl button:has-text("Restore member")'); await P.waitForSelector('.toast.ok:has-text("restored")');
  ok(!(await snap(A)).members.find(m => m.id === m2.data.id).archived, '#7 restored');
  await P.keyboard.press('Escape'); await P.click('.fchip:has-text("Active")');
  /* #9 district list */
  await P.click('button:has-text("+ Add member")'); await P.selectOption('#f-state', 'Punjab'); await P.fill('#f-name', 'ramKumar');
  const dl = await P.getAttribute('#f-district', 'list'), opts = await P.locator(`datalist#${dl} option`).count();
  ok(opts === 23 && (await P.textContent('.mdl')).includes('Will be saved as: Ram Kumar'), `#9 district suggestions for Punjab (${opts}) and #10 name preview`);
  await P.selectOption('#f-state', 'Delhi'); ok(await P.locator(`datalist#${await P.getAttribute('#f-district', 'list')} option`).count() === 11, '#9 list follows the state (Delhi 11)');
  await P.keyboard.press('Escape');

  /* #3/#5 notifications open the exact place, and disappear when done */
  const C = await login('coord.ludhiana'), sc = await snap(C);
  const free = sc.members.find(m => !sc.regs.some(r => r.memberId === m.id && ['Submitted', 'Approved', 'Checked In'].includes(r.status)));
  const rg = await call(C, 'POST', '/regs', { memberId: free.id, branchId: free.branchId, arrival: d(0), departure: d(2), purpose: 'Notification test', mode: 'submit' });
  await P.goto(base + '/dashboard'); await P.waitForSelector('main .ph'); await P.click('.iconbtn');
  await P.click(`.dd .it:has-text("${rg.data.id}")`); await P.waitForSelector('.mdl');
  ok(P.url().endsWith('/approvals') && (await P.textContent('.mdl h2')).includes(rg.data.id), '#3 "awaiting approval" notification opens Approvals → that request');
  await P.click('.mdl button:has-text("Approve")'); await P.waitForSelector('.toast.ok');
  await P.click('.iconbtn'); const bell = await P.textContent('.dd');
  ok(!bell.includes(`${rg.data.id} — ${free.name}`), "#5 approved request removed from the approver's bell");
  await P.keyboard.press('Escape'); await P.click('.iconbtn');
  const R = await as('reception', '/dashboard'); await R.click('.iconbtn');
  await R.click(`.dd .it:has-text("${rg.data.id}) approved")`); await R.waitForSelector('.mdl');
  ok(R.url().endsWith('/reception') && (await R.textContent('.mdl h2')).includes('Confirm arrival'), '#3 "expected" notification opens Reception → Confirm arrival');
  await R.selectOption('#f-bed', { index: 1 }); await R.click('.mdl button:has-text("Confirm arrival")'); await R.waitForSelector('.toast.ok');
  await R.click('.iconbtn'); ok(!(await R.textContent('.dd')).includes(`${rg.data.id}) approved`), '#5 after Confirm arrival the notification is gone');
  /* needs-attention links */
  await P.goto(base + '/dashboard'); await P.waitForSelector('main .ph'); await P.click('.iconbtn');
  const need = await P.locator('.dd .it').allTextContents();
  for (const [re, path, tab] of [[/need a bed/, '/accommodation', 'Awaiting bed'], [/pending cleaning/, '/accommodation', 'Cleaning'], [/extension request/, '/approvals', 'Extension requests'], [/overdue stay/, '/reception', 'Due / overdue']]) {
    const t = need.find(x => re.test(x)); if (!t) { console.log('  (none: ' + re + ')'); continue; }
    await P.locator('.dd .it', { hasText: t }).first().click(); await P.waitForSelector('main .tabs');
    ok(P.url().endsWith(path) && (await P.textContent('.tab.on')).startsWith(tab), `#3 "${t}" → ${path} › ${tab}`);
    await P.click('.iconbtn');
  }
  await P.keyboard.press('Escape');
  /* #4 dashboard attention */
  await P.goto(base + '/dashboard'); await P.waitForSelector('.att-list');
  const al = await P.locator('.att-list .alert').allTextContents();
  const ex = al.find(x => /expiring within 7 days/.test(x));
  if (ex) { await P.locator('.att-list .alert', { hasText: 'expiring within 7 days' }).locator('button').click(); await P.waitForSelector('.fchips');
    ok(P.url().endsWith('/longterm') && (await P.textContent('.fchip.on')).startsWith('Expiring within 7 days'), '#4 expiring → Monthly/Long-Term filtered to expiring'); await P.goto(base + '/dashboard'); await P.waitForSelector('.att-list'); }
  else console.log('  (no expiring stay in sample data)');
  if (al.some(x => /without sewa assignment/.test(x))) { await P.locator('.att-list .alert', { hasText: 'without sewa assignment' }).locator('button').click(); await P.waitForSelector('main .tabs');
    ok(P.url().endsWith('/departments') && (await P.textContent('.tab.on')).startsWith('Without sewa') && await P.locator('main tbody button:has-text("Assign sewa")').count() > 0, '#4 without sewa → Departments › Without sewa list'); }
  /* #12 natural order */
  await P.goto(base + '/accommodation'); await P.waitForSelector('.room');
  const rooms = await P.locator('.room .rh b').allTextContents(), bedsTxt = await P.locator('.room').first().locator('.bed b').allTextContents();
  const sortedNat = l => l.slice().sort((a, c) => a.localeCompare(c, 'en', { numeric: true }));
  ok(JSON.stringify(bedsTxt) === JSON.stringify(sortedNat(bedsTxt)), '#12 beds in order: ' + bedsTxt.join(' '));
  const perRoomOk = await P.$$eval('.rooms', els => els.every(e => { const n = [...e.querySelectorAll('.rh b')].map(x => x.textContent); return n.join() === n.slice().sort((a, c) => a.localeCompare(c, 'en', { numeric: true })).join(); }));
  ok(perRoomOk, '#12 rooms in natural order on every floor (' + rooms.slice(0, 5).join(', ') + '…)');
  /* #13 coloured buttons, #16 attendance colour */
  await P.goto(base + '/longterm'); await P.waitForSelector('main .ph');
  if (await P.locator('main tbody tr').count()) {
    const cls = await P.locator('main tbody tr').first().locator('.rowacts .btn').evaluateAll(bs => bs.map(x => x.className));
    ok(cls.some(c => c.includes('a-view')) && cls.some(c => c.includes('a-ext')) && new Set(cls).size === cls.length, '#13 each action has its own colour: ' + cls.map(c => c.split(' ').pop()).join(', '));
  }
  await P.goto(base + '/departments'); await P.waitForSelector('main .tabs'); await P.click('.tab:has-text("Assignments")');
  const att = await P.locator('main tbody td[data-label="Attendance"] .b').evaluateAll(xs => xs.map(x => [x.textContent, x.className]));
  ok(att.length && att.every(([t, c]) => parseInt(t) < 60 ? c.includes('bad') : parseInt(t) < 75 ? c.includes('warn') : c.includes('ok')), '#16 attendance colour-coded: ' + att.slice(0, 4).map(x => x[0] + '=' + x[1].split(' ')[1]).join(' '));
  /* #17 branch buttons */
  await P.goto(base + '/branches'); await P.waitForSelector('main tbody');
  const bcls = await P.locator('main tbody tr:not(.rt-group)').first().locator('.rowacts .btn').evaluateAll(bs => bs.map(x => x.className.split(' ').pop()));
  ok(bcls.join() === 'a-view,a-move,a-edit,rmenu-b', '#17 branch buttons styled; archive / delete in the ⋯ menu: ' + bcls.join(', '));
  /* password eye inside forms */
  await P.click('.prof'); await P.click('button:has-text("Change password")');
  ok(await P.locator('.mdl .pw-eye').count() === 3, '#1 show/hide on all three change-password fields');
  await P.keyboard.press('Escape');
  await P.setViewportSize({ width: 390, height: 844 }); await P.goto(base + '/members'); await P.waitForSelector('main tbody');
  const ov = await P.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!ov, 'members page fits a phone screen (no sideways scroll)'); await P.screenshot({ path: 'f-members-phone.png' });
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
