// Browser test: department head runs invite → parking → office → residence; admin permission screens.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const b = await chromium.launch({ headless: true }); const errs = [];
async function as(user, path) {
  const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage(); p.on('pageerror', e => errs.push(user + ': ' + e.message));
  await p.goto(base + '/'); await p.fill('input[autocomplete=username]', user); await p.fill('input[type=password]', 'Noormahal@123'); await p.click('button:has-text("Sign in")');
  await p.waitForSelector('#side nav'); await p.goto(base + path); await p.waitForSelector('main .ph'); return p;
}
try {
  // department head invites
  const S = await as('supervisor.security', '/visitors');
  const tabs = await S.locator('.tabs .tab').allTextContents();
  ok(tabs.some(t => t.startsWith('My guests')) && tabs.some(t => t.startsWith('Appointments')), 'department head sees My guests + Appointments: ' + tabs.join(' | '));
  await S.click('button:has-text("+ Invite guest")'); await S.fill('#f-guestName', 'Dr. Mehta');
  await S.click('.mdl button:has-text("Create link")'); await S.waitForSelector('.mdl h2:has-text("Share")');
  const link = await S.inputValue('.mdl input.in'); await S.keyboard.press('Escape');
  // guest registers (API, not part of this test)
  const tok = link.split('/guest/')[1];
  await fetch(base + '/api/public/visits/' + tok, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Dr. Mehta', mobile: '9876543210', meetWith: 'Navdeep Sharma', deptName: 'Security', date: d(2), time: '10:00', purpose: 'Seminar', people: 2, hasVehicle: true, vehicleType: 'Car', vehicleNumber: 'DL01CA1111' }) });
  await S.reload(); await S.waitForSelector('main tbody');
  // accept own department appointment (default tab for a department head is Appointments)
  await S.click('main tbody button:has-text("Accept / decline")'); await S.click('.mdl button:has-text("Accept appointment")'); await S.waitForSelector('.toast.ok');
  // finalise everything incl. residence from My guests
  await S.click('.tab:has-text("My guests")'); await S.click('main tbody button:has-text("Finalise")'); await S.waitForSelector('#f-stay');
  await S.selectOption('#f-parking', 'Baikunth Dwar'); await S.selectOption('#f-office', 'Office 4'); await S.selectOption('#f-golfCart', 'Yes');
  await S.selectOption('#f-stay', 'Yes'); await S.fill('#f-stayFrom', d(2)); await S.fill('#f-stayTo', d(4)); await S.fill('#f-stayBeds', '2');
  await S.waitForFunction(() => document.querySelectorAll('#f-stayRoom option').length > 1, null, { timeout: 8000 });
  const roomLabel = await S.locator('#f-stayRoom option').nth(1).textContent();
  ok(/bed\(s\) free/.test(roomLabel), 'residence: rooms listed with free beds — ' + roomLabel);
  await S.selectOption('#f-stayRoom', { index: 1 });
  await S.screenshot({ path: 'dh-finalise.png' });
  await S.click('.mdl button:has-text("Finalise")'); await S.waitForSelector('.toast.ok:has-text("Main Office")');
  const row = await S.textContent('main tbody tr');
  ok(row.includes('Baikunth Dwar') && row.includes('Office 4') && row.includes('2 bed(s)'), 'My guests shows parking, office, golf car and residence together');
  ok((await S.locator('main thead th').allTextContents()).includes('Residence'), 'Residence column present');
  // Main Office approves (admin)
  const A = await as('admin', '/visitors');
  await A.click('.tab:has-text("Office approvals")'); await A.click('main tbody button:has-text("Approve / reject")');
  ok((await A.textContent('.mdl .note')).includes('Residence:'), 'approval dialog shows the residence');
  await A.fill('#f-approverName', 'Swami Ramanand'); await A.click('.mdl button:has-text("Approve")'); await A.waitForSelector('.toast.ok');
  // bed board shows the guest
  await A.goto(base + '/accommodation'); await A.waitForSelector('.bed');
  ok(await A.locator('.bed:has-text("Guest: Dr. Mehta")').count() === 2, 'bed board shows 2 beds reserved for "Guest: Dr. Mehta"');
  await A.locator('.bed:has-text("Guest: Dr. Mehta")').first().click(); await A.waitForSelector('.mdl');
  ok((await A.textContent('.mdl')).includes('Reserved for guest Dr. Mehta'), 'bed detail explains the guest reservation');
  await A.keyboard.press('Escape');
  // host's view of the visit shows the reserved beds
  await S.reload(); await S.click('.tab:has-text("My guests")'); await S.click('main tbody button:has-text("View")'); await S.waitForSelector('.mdl');
  ok((await S.textContent('.mdl')).includes('beds reserved'), 'department head sees "beds reserved" on the visit');
  await S.keyboard.press('Escape');
  // admin: Guest visit access tab
  await A.goto(base + '/admin'); await A.waitForSelector('main .tabs'); await A.click('.tab:has-text("Guest visit access")');
  ok(await A.locator('main table input[type=checkbox]').count() >= 40, 'permission grid (roles × 5 permissions)');
  const cb = A.locator('main table tbody tr').filter({ hasText: 'Gate entry' }).locator('input[type=checkbox]').nth(5); // a role column
  const before = await cb.isChecked(); await cb.click(); await A.waitForSelector('.toast.ok:has-text("Guest visit access updated")');
  await A.waitForTimeout(400);
  ok((await cb.isChecked()) !== before, 'ticking a box changes the role permission');
  await cb.click(); await A.waitForTimeout(400);
  // user form extras
  await A.click('.tab:has-text("Users")'); await A.click('button:has-text("+ Add user")');
  await A.fill('#f-name', 'Desk Two'); await A.fill('#f-username', 'desk2'); await A.fill('#f-password', 'Temp#Pass1'); await A.selectOption('#f-role', 'viewer');
  const extras = await A.locator('.mdl .check').allTextContents();
  ok(extras.some(t => t.includes('Gate entry')) && !extras.some(t => t.includes('See all')), 'user form offers only permissions the role lacks: ' + extras.length);
  await A.locator('.mdl .check:has-text("Gate entry") input').check();
  await A.click('.mdl button:has-text("Save")'); await A.waitForSelector('.toast.ok:has-text("User saved")');
  ok((await A.textContent('main table')).includes('+ 1 extra for this user'), 'users list shows the extra permission');
  await A.screenshot({ path: 'dh-users.png' });
  await A.click('.tab:has-text("Guest visit access")'); await A.screenshot({ path: 'dh-access.png', fullPage: true });
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
