// UI smoke test: in-memory MongoDB + real server serving client/dist, driven by headless Edge.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create();
await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;

const browser = await chromium.launch({ headless: true });
let fails = 0; const errs = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const ROLES = ['admin', 'manager', 'coord.ludhiana', 'reception', 'accom', 'supervisor.security', 'viewer'];
const PAGES = ['dashboard', 'members', 'branches', 'prereg', 'approvals', 'reception', 'accommodation', 'departments', 'longterm', 'reports', 'admin'];

async function session(user) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`[${user}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('400')) errs.push(`[${user}] console: ${m.text()}`); });
  await page.goto(base + '/');
  await page.fill('input[autocomplete=username]', user); await page.fill('input[type=password]', 'Noormahal@123');
  await page.click('button:has-text("Sign in")'); await page.waitForSelector('#side nav');
  return { ctx, page };
}
const clickAllTabs = async page => { const n = await page.locator('.tabs .tab').count(); for (let i = 0; i < n; i++) { await page.locator('.tabs .tab').nth(i).click(); await page.waitForTimeout(80); } };
const closeModal = async page => { if (await page.locator('#overlay.open').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(60); } };

try {
  for (const u of ROLES) {
    const { ctx, page } = await session(u);
    const navCount = await page.locator('#side nav .nav').count();
    for (const p of PAGES) {
      await page.goto(base + '/' + p); await page.waitForSelector('main');
      await page.waitForTimeout(100);
      await clickAllTabs(page);
    }
    ok(true, `${u}: ${navCount} nav items, visited all pages/tabs`);
    await ctx.close();
  }

  // Deep interaction as admin
  const { page } = await session('admin');
  const before = errs.length;
  // member view + edit modals
  await page.goto(base + '/members'); await page.click('table button:has-text("View")'); await page.waitForSelector('.mdl');
  ok(await page.locator('.mdl h3:has-text("Visit history")').count() === 1, 'member view modal');
  await page.click('.mdl button:has-text("Edit member")'); await page.waitForSelector('.mdl h2:has-text("Edit member")'); await closeModal(page);
  // add member through form
  await page.click('button:has-text("+ Add member")');
  await page.fill('#f-name', 'UI Tester'); await page.fill('#f-mobile', '9123456780'); await page.fill('#f-dob', '1991-05-05');
  await page.selectOption('#f-gender', 'Male'); await page.selectOption('#f-branchId', { label: 'Ludhiana' });
  ok(await page.inputValue('#f-district') === 'Ludhiana', 'branch auto-fills district');
  await page.fill('#f-address', 'Somewhere'); await page.fill('#f-emName', 'Contact'); await page.fill('#f-emPhone', '9123456781');
  await page.click('.mdl button:has-text("Create member")'); await page.waitForSelector('.toast.ok');
  ok((await page.locator('.toast.ok').first().textContent()).includes('Member created'), 'member created via form');
  // validation error from server shows in form
  await page.click('button:has-text("+ Add member")');
  await page.fill('#f-name', 'Dup'); await page.fill('#f-mobile', '9123456780'); await page.fill('#f-dob', '1991-05-05'); await page.selectOption('#f-gender', 'Male'); await page.selectOption('#f-branchId', { label: 'Ludhiana' });
  await page.fill('#f-address', 'x'); await page.fill('#f-emName', 'x'); await page.fill('#f-emPhone', '9123456781');
  await page.click('.mdl button:has-text("Create member")'); await page.waitForSelector('.mdl .err');
  ok((await page.textContent('.mdl .err')).includes('already exists'), 'server duplicate error shown in form');
  await closeModal(page);
  // pre-registration via datalist value
  await page.goto(base + '/prereg'); await page.click('button:has-text("+ New pre-registration")');
  const memberVal = await page.locator('#dlM option').first().getAttribute('value');
  await page.fill('#f-member', memberVal); await page.dispatchEvent('#f-member', 'change');
  const t = new Date(); const d = n => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  await page.fill('#f-arrival', d(40)); await page.fill('#f-departure', d(43)); await page.fill('#f-purpose', 'UI test seva');
  await page.click('.mdl button:has-text("Submit for approval")'); await page.waitForSelector('.toast.ok:has-text("Submitted")');
  ok(true, 'pre-registration submitted from UI');
  // approve it
  await page.goto(base + '/approvals'); await page.click('table button:has-text("Review")'); await page.waitForSelector('.mdl');
  await page.click('.mdl button:has-text("Approve & forward")'); await page.waitForSelector('.toast.ok:has-text("Approved")');
  ok(true, 'approved from UI');
  // reception confirm arrival on first expected
  await page.goto(base + '/reception'); await page.click('table button:has-text("Confirm arrival")'); await page.waitForSelector('.mdl');
  await page.click('.mdl button:has-text("Confirm arrival")'); await page.waitForSelector('.toast.ok:has-text("Arrival recorded")');
  ok(true, 'check-in from UI');
  // accommodation: assign bed via cascade
  await page.goto(base + '/accommodation'); await page.click('.tab:has-text("Awaiting bed")');
  await page.click('table button:has-text("Assign bed")'); await page.waitForSelector('#f-site');
  let done=false;
  for (let si=1; si<await page.locator('#f-site option').count() && !done; si++) { await page.selectOption('#f-site',{index:si});
   for (let bi=1; bi<await page.locator('#f-bld option').count() && !done; bi++) { await page.selectOption('#f-bld',{index:bi});
    for (let fi=1; fi<await page.locator('#f-floor option').count() && !done; fi++) { await page.selectOption('#f-floor',{index:fi});
     for (let ri=1; ri<await page.locator('#f-room option').count() && !done; ri++) { await page.selectOption('#f-room',{index:ri});
      if (await page.locator('#f-bed option').count()>1) { await page.selectOption('#f-bed',{index:1}); done=true; } } } } }
  ok(done, 'found a free bed through the cascade');
  await page.click('.mdl button:has-text("Assign bed")'); await page.waitForSelector('.toast.ok:has-text("Bed assigned")');
  ok(true, 'bed assigned via cascade');
  await closeModal(page);
  // bed board detail modal
  await page.click('.tab:has-text("Bed board")'); await page.click('.bed.s-Occupied >> nth=0'); await page.waitForSelector('.mdl');
  ok(await page.locator('.mdl button:has-text("Transfer")').count() > 0, 'occupied bed detail has Transfer');
  await page.click('.mdl button:has-text("Transfer")'); await page.waitForSelector('.mdl h2:has-text("Transfer bed")'); await closeModal(page);
  // structure tab: add site
  await page.click('.tab:has-text("Structure")'); await page.click('main .tree >> xpath=.. >> button:has-text("+ Add site")');
  await page.fill('#f-name', 'UI Site'); await page.click('.mdl button:has-text("Add site")'); await page.waitForSelector('.toast.ok:has-text("Site added")');
  ok(await page.locator('.tree b:has-text("UI Site")').count() === 1, 'site added in structure tree');
  // departments attendance tab select
  await page.goto(base + '/departments'); await page.click('.tab:has-text("Attendance")');
  const sel = page.locator('main table select').first();
  if (await sel.count()) { await sel.selectOption('Absent'); await page.waitForSelector('.toast.ok:has-text("Attendance saved")'); ok(true, 'attendance saved'); }
  // reports: switch report + export menus render
  await page.goto(base + '/reports'); await page.waitForSelector('main .filters select');
  const repSel = page.locator('main .filters select').first(); const n = await repSel.locator('option').count();
  for (let i = 0; i < n; i++) { await repSel.selectOption({ index: i }); await page.waitForTimeout(50); }
  ok(n === 14, `all ${n} reports render`);
  // admin roles matrix change
  await page.goto(base + '/admin'); await page.waitForSelector('main .tabs'); await page.click('.tab:has-text("Roles")');
  await page.locator('main table tbody tr').nth(1).locator('select').last().selectOption('e'); await page.waitForSelector('.toast.ok:has-text("Access updated")');
  ok(true, 'role access updated from UI');
  await page.click('.tab:has-text("Users")'); await page.click('button:has-text("+ Add user")');
  await page.selectOption('#f-role', 'coordinator'); ok(await page.locator('#f-branchId').count() === 1, 'branch field appears for coordinator role');
  await closeModal(page);
  // global search
  await page.fill('.gsw input', 'NM-00'); await page.waitForSelector('.gsw .dd .it'); await page.click('.gsw .dd .it >> nth=0'); await page.waitForSelector('.mdl');
  ok(true, 'global search opens member'); await closeModal(page);
  // sign out
  await page.click('.prof'); await page.click('button:has-text("Sign out")'); await page.waitForSelector('button:has-text("Sign in")');
  ok(true, 'sign out');
  ok(errs.length === before, 'no runtime errors during admin interactions');
} catch (e) { console.error('ERROR', e.message); fails++; }
if (errs.length) { console.log('\nRuntime errors:'); [...new Set(errs)].slice(0, 30).forEach(e => console.log('  ' + e)); fails += errs.length ? 1 : 0; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await browser.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
