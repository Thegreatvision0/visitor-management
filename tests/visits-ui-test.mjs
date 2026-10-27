// Browser test: the full guest-visit journey across roles, plus phone screenshots.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium, devices } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const api = async (tok, method, path, body) => (await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
const A = (await api(null, 'POST', '/auth/login', { username: 'admin', password: 'Noormahal@123' })).token;
for (const [u, role] of [['office1', 'office'], ['security1', 'security']]) {
  await api(A, 'POST', '/admin/users', { name: role === 'office' ? 'Main Office' : 'Gate Security', username: u, password: 'Temp#Pass1', role });
  const t = (await api(null, 'POST', '/auth/login', { username: u, password: 'Temp#Pass1' })).token;
  await api(t, 'POST', '/auth/password', { current: 'Temp#Pass1', next: 'Real#Pass123' });
}
const pad = n => String(n).padStart(2, '0'), d0 = new Date(), tomorrow = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; })();
const today = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;
const b = await chromium.launch({ headless: true }); const errs = [];
async function as(user, pass = 'Noormahal@123', path = '/visitors', opts = { viewport: { width: 1300, height: 900 } }) {
  const p = await (await b.newContext(opts)).newPage();
  p.on('pageerror', e => errs.push(user + ': ' + e.message));
  await p.goto(base + '/'); await p.fill('input[autocomplete=username]', user); await p.fill('input[type=password]', pass); await p.click('button:has-text("Sign in")');
  await p.waitForSelector('#side nav'); await p.goto(base + path); await p.waitForSelector('main .ph'); return p;
}
try {
  // 1. host invites
  const H = await as('reception');
  ok(await H.locator('#side .nav:has-text("Guest Visits")').count() === 1, 'Guest Visits in the menu');
  const SUP = (await api(A, 'GET', '/snapshot')).depts.find(x => x.id === 'DP01').supervisor;
  await H.click('button:has-text("+ Invite guest")'); await H.fill('#f-guestName', 'Rajesh Kumar'); await H.fill('#f-guestMobile', '9876512345');
  await H.fill('#f-meetWith', 'Swami Nareshanand');
  ok(await H.locator('#f-vehicleType').count() === 1, 'invite form has vehicle type'); await H.selectOption('#f-vehicleType', 'Car'); await H.fill('#f-vehicleNumber', 'pb 10 ab 1234');
  ok(await H.locator('#meetList option').count() > 3, 'invite form suggests department in-charges');
  await H.click('.mdl button:has-text("Create link")'); await H.waitForSelector('.mdl h2:has-text("Share the registration link")');
  const link = await H.inputValue('.mdl input.in');
  ok(/\/guest\/[A-Za-z0-9_-]{20,}$/.test(link) && (await H.getAttribute('.mdl a:has-text("WhatsApp")', 'href')).startsWith('https://wa.me/919876512345'), 'link created with WhatsApp share to the guest');
  await H.keyboard.press('Escape');
  // 2. guest registers (phone, not signed in)
  const Gp = await (await b.newContext(devices['iPhone 13'])).newPage(); Gp.on('pageerror', e => errs.push('guest: ' + e.message));
  await Gp.goto(link); await Gp.waitForSelector('form.f2');
  ok((await Gp.textContent('.note')).includes('Reception Staff'), 'guest page shows the host');
  ok(await Gp.inputValue('input[autocomplete=name]') === 'Rajesh Kumar', 'guest name pre-filled');
  ok(await Gp.inputValue('input[list=meetList]') === 'Swami Nareshanand', 'person typed by the host is pre-filled for the guest');
  await Gp.fill('input[list=meetList]', SUP); await Gp.waitForTimeout(100);
  ok(await Gp.inputValue('input[list=deptList]') === 'Security', 'typing the in-charge name (' + SUP + ') fills the Security department');
  ok(await Gp.inputValue('form select >> nth=0') === 'Car' && (await Gp.inputValue('input[placeholder^="e.g. PB"]')).toUpperCase().replace(/ /g, '') === 'PB10AB1234', 'vehicle type and number visible and pre-filled from the invite');
  await Gp.fill('input[list=meetList]', 'Swami Nareshanand');
  await Gp.screenshot({ path: 'v-guest-form.png', fullPage: true });
  await Gp.fill('input[autocomplete=tel-national]', '9876512345');
  await Gp.fill('input[type=date]', tomorrow); await Gp.fill('input[type=time]', '10:00'); await Gp.fill('textarea', 'Discuss seva programme');
  ok(await Gp.locator('form select').count() === 1 && await Gp.locator('form option:has-text("Baikunth Dwar")').count() === 0, 'guest cannot choose parking (only vehicle type is a choice)');
  ok((await Gp.textContent('form')).includes('parking will be assigned by the DJJS office'), 'guest is told parking will be assigned');
  await Gp.click('button:has-text("Book appointment")'); await Gp.waitForSelector('.gsteps');
  ok((await Gp.textContent('.lg')).includes('sent to the department in-charge'), 'guest sees "request sent"');
  ok((await Gp.textContent('.lg')).includes('Will be assigned by the DJJS office'), 'status page: parking not yet assigned');
  // 3. in-charge accepts
  const S = await as('supervisor.security');
  ok((await S.locator('.tab.on').textContent()).includes('Appointments'), 'in-charge lands on Appointments');
  await S.click('main tbody button:has-text("Accept / decline")'); await S.fill('#f-time', '11:00'); await S.click('.mdl button:has-text("Accept appointment")'); await S.waitForSelector('.toast.ok');
  ok(true, 'in-charge accepted (moved to 11:00)');
  // 4. host finalises (auto-refresh brings the change in)
  await H.reload(); await H.waitForSelector('main tbody');
  await H.click('main tbody button:has-text("Finalise")'); await H.waitForSelector('#f-office');
  await H.selectOption('#f-parking', 'Baikunth Dwar'); await H.selectOption('#f-office', 'Office 2'); await H.selectOption('#f-golfCart', 'Yes');
  await H.click('.mdl button:has-text("Finalise")'); await H.waitForSelector('.toast.ok:has-text("Main Office")');
  ok(true, 'host finalised Baikunth Dwar + Office 2 + golf car → sent to Main Office');
  // 5. Main Office approves
  const O = await as('office1', 'Real#Pass123');
  ok((await O.locator('.tab.on').textContent()).includes('Office approvals'), 'Main Office lands on approvals');
  await O.click('.iconbtn'); ok(await O.locator('.dd .it.unread:has-text("Approval needed: Rajesh Kumar")').count() === 1, 'Main Office got the notification'); await O.click('.iconbtn');
  await O.click('main tbody button:has-text("Approve / reject")'); await O.fill('#f-cartNote', 'Cart 2'); await O.click('.mdl button:has-text("Approve")'); await O.waitForSelector('.mdl .err'); ok((await O.textContent('.mdl .err')).includes('full name'), 'approval dialog refuses to approve without the approver name'); ok(await O.inputValue('#f-parking') === 'Baikunth Dwar' && await O.inputValue('#f-office') === 'Office 2', 'parking and office pre-filled from the host request'); await O.fill('#f-approverName', 'Swami Ramanand'); await O.click('.mdl button:has-text("Approve")'); await O.waitForSelector('.toast.ok');
  await O.selectOption('main .filters select', 'ok'); await O.waitForSelector('main tbody tr');
  const oh = await O.locator('main thead th').allTextContents(), orow = await O.textContent('main tbody tr');
  ok(oh.includes('Office') && oh.includes('Parking') && oh.includes('Golf car') && orow.includes('Office 2') && orow.includes('Approved by Swami Ramanand'), 'approved visit stays visible in Office approvals with its office: ' + orow.replace(/s+/g, ' ').slice(0, 140));
  await O.screenshot({ path: 'v-office.png' });
  // guest sees confirmation
  await Gp.reload(); await Gp.waitForSelector('.gsteps');
  const gtxt = await Gp.textContent('.lg');
  ok(gtxt.includes('confirmed') && gtxt.includes('Baikunth Dwar') && gtxt.includes('Office 2') && gtxt.includes('11:00'), 'guest page shows confirmed time, office and parking');
  await Gp.screenshot({ path: 'v-guest-confirmed.png', fullPage: true });
  // 6. security at the gate (tomorrow's date)
  const G = await as('security1', 'Real#Pass123');
  ok((await G.locator('.tab.on').textContent()).includes('Gate'), 'security lands on the Gate tab');
  await G.click('.iconbtn'); ok(await G.locator('.dd .it:has-text("PB10AB1234")').count() === 1, 'security notified with the vehicle number'); await G.click('.iconbtn');
  await G.click('main .filters button:has-text("Tomorrow")'); await G.waitForSelector('.vno');
  ok((await G.textContent('.vno')) === 'PB10AB1234', 'gate list shows the vehicle number');
  ok((await G.textContent('main tbody')).includes('Swami Nareshanand (Security)'), 'gate list shows whom the guest is meeting');
  await G.click('main tbody button:has-text("Entry")'); await G.click('.mdl button:has-text("Record entry")'); await G.waitForSelector('.toast.ok');
  ok((await G.textContent('main')).includes('inside the campus now'), 'guest shown as inside the campus');
  await G.click('main tbody button:has-text("Exit")'); await G.click('.mdl button:has-text("Record exit")'); await G.waitForSelector('.toast.ok:has-text("Exit")');
  await G.screenshot({ path: 'v-gate.png' });
  const heads = await G.locator('main thead th').allTextContents();
  ok(heads.includes('Vehicle number') && heads.includes('Vehicle type'), 'gate list has separate Vehicle number and Vehicle type columns');
  // host notified of arrival; timeline complete
  await H.reload(); await H.click('.iconbtn');
  ok(await H.locator('.dd .it:has-text("Guest arrived: Rajesh Kumar")').count() === 1, 'host notified of arrival'); await H.click('.iconbtn');
  await H.selectOption('main .filters select', 'all'); await H.click('main tbody button:has-text("View")'); await H.waitForSelector('.mdl .tl');
  const tl = await H.locator('.mdl .tl > div').count();
  ok(tl >= 6, `visit timeline has ${tl} steps (invite → registered → accepted → finalised → approved → entry → exit)`);
  await H.keyboard.press('Escape');
  // schedule + report + dashboard tile
  await H.click('.tab:has-text("Office schedule")'); await H.fill('main .filters input[type=date]', tomorrow); await H.waitForTimeout(150);
  ok((await H.textContent('main .grid')).includes('11:00–12:00 Rajesh Kumar'), 'office schedule shows Office 2 booking 11:00–12:00');
  const Ad = await as('admin', 'Noormahal@123', '/reports');
  await Ad.locator('.flabel').filter({ hasText: /^Report/ }).locator('select').selectOption('visits');
  const rh = await Ad.locator('main thead th').allTextContents();
  ok(rh.includes('Vehicle type') && rh.includes('Vehicle number'), 'report has separate Vehicle type and Vehicle number columns');
  ok((await Ad.textContent('main table')).includes('PB10AB9999') || (await Ad.textContent('main table')).includes('PB10AB1234'), 'Guest visits report lists the visit');
  await Ad.goto(base + '/dashboard'); await Ad.waitForSelector('.kpis');
  ok((await Ad.textContent('.kpis')).includes('Guests today'), 'dashboard has a Guests today tile');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
