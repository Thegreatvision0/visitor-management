// Browser tests for the requested changes.
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
async function session(user) {
  const ctx = await browser.newContext({ bypassCSP: true }); const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(`[${user}] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('40')) errs.push(`[${user}] ${m.text()}`); });
  await page.goto(base + '/'); await page.fill('input[autocomplete=username]', user); await page.fill('input[type=password]', 'Noormahal@123');
  await page.click('button:has-text("Sign in")'); await page.waitForSelector('#side nav'); return page;
}
const goto = async (p, path) => { await p.goto(base + path); await p.waitForSelector('main .ph'); };
try {
  const M = await session('manager'), C = await session('coord.ludhiana');
  // #1 member form: state first, branches of that state
  await goto(M, '/members'); await M.click('button:has-text("+ Add member")');
  await M.selectOption('#f-state', 'Haryana');
  const opts = await M.locator('#f-branchId option').allTextContents();
  ok(opts.includes('Karnal') && !opts.includes('Ludhiana'), '#1 branch list follows the chosen state: ' + opts.join(', '));
  ok((await M.locator('#f-state option').count()) > 30, '#1 all states offered');
  await M.keyboard.press('Escape');
  // #4 branches page grouped by state, coordinator adds sub-branch
  await goto(C, '/branches');
  ok(await C.locator('tbody tr td b:has-text("Punjab")').count() === 1, '#4 coordinator sees state group');
  await C.click('button:has-text("+ Add sub-branch")'); await C.waitForSelector('.mdl');
  await C.fill('#f-name', 'Ludhiana East'); await C.fill('#f-district', 'Ludhiana'); await C.fill('#f-coordinator', 'East Coord'); await C.fill('#f-phone', '9876500099');
  await C.click('.mdl button:has-text("Save")'); await C.waitForSelector('.toast.ok');
  ok(await C.locator('td:has-text("Sub-branch of Ludhiana")').count() >= 1, '#4 sub-branch listed under parent');
  // #2 duplicate name via UI
  await goto(M, '/branches'); await M.click('button:has-text("+ Add branch")');
  await M.fill('#f-name', 'Ludhiana East'); await M.fill('#f-district', 'Ludhiana'); await M.fill('#f-coordinator', 'Ravi Kumar'); await M.fill('#f-phone', '9876500098');
  await M.click('.mdl button:has-text("Save")'); await M.waitForSelector('.mdl .err');
  ok((await M.textContent('.mdl .err')).includes('must be unique'), '#2 duplicate branch name shown as error'); await M.keyboard.press('Escape');
  // #6 auto-refresh: manager is on approvals; coordinator submits; manager page updates without reload
  await goto(M, '/approvals');
  const before = await M.locator('main tbody tr').count();
  await goto(C, '/prereg'); await C.click('button:has-text("+ New pre-registration")');
  const val = await C.locator('#dlM option').nth(5).getAttribute('value');
  await C.fill('#f-member', val); await C.dispatchEvent('#f-member', 'change');
  const t = new Date(), d = n => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  await C.fill('#f-arrival', d(60)); await C.fill('#f-departure', d(62));
  ok(await C.inputValue('#f-type') === 'Short-Term', '#9 3-day stay shows Short-Term automatically');
  await C.fill('#f-departure', d(80)); ok(await C.inputValue('#f-type') === 'Monthly', '#9 21-day stay switches to Monthly');
  await C.fill('#f-departure', d(100)); ok(await C.inputValue('#f-type') === 'Long-Term', '#9 41-day stay switches to Long-Term');
  await C.fill('#f-purpose', 'Auto refresh test'); await C.click('.mdl button:has-text("Submit for approval")'); await C.waitForSelector('.toast.ok');
  await M.waitForFunction(n => document.querySelectorAll('main tbody tr').length > n, before, { timeout: 15000 });
  ok(true, '#6 manager approvals list updated without page refresh');
  // #5 newest first with Received column
  const first = await M.locator('main tbody tr').first().textContent();
  ok(first.includes('Today') && first.includes('Auto refresh test'), '#5 newest request on top, Received = Today');
  // #7 bell for manager has the new request notification
  await M.click('.iconbtn'); await M.waitForSelector('.dd .ddh');
  ok(await M.locator('.dd .it.unread:has-text("awaiting approval")').count() >= 1, '#7 manager notification shown as unread');
  await M.click('.iconbtn');
  // #3 extension request tab shows branch + requester
  await goto(C, '/prereg');
  await C.locator('tr:has(span.b:has-text("Checked In")) button:has-text("Request extension")').first().click();
  await C.fill('#f-to', d(90)); await C.fill('#f-reason', 'More seva'); await C.click('.mdl button:has-text("Send request")'); await C.waitForSelector('.toast.ok');
  await goto(M, '/approvals'); await M.click('.tab:has-text("Extension requests")');
  const row = await M.locator('main tbody tr').first().textContent();
  ok(row.includes('Coordinator – Ludhiana') && row.includes('Ludhiana'), '#3 extension shows branch & coordinator: ' + row.slice(0, 120));
  // #11 department overview tiles clickable
  await goto(M, '/departments');
  await M.locator('.stat.click').first().click();
  ok(await M.locator('.tab.on:has-text("Assignments")').count() === 1, '#11 tile opens Assignments tab');
  const deptSel = await M.locator('main .filters select').first().inputValue();
  ok(deptSel === 'DP01', '#11 filtered to the clicked department');
  // #10 extend sewa button
  await M.locator('main tbody button:has-text("Extend")').first().click(); await M.waitForSelector('.mdl h2:has-text("Extend sewa")');
  ok(true, '#10 Extend sewa dialog opens'); await M.keyboard.press('Escape');
  await goto(M, '/reception'); await M.click('.tab:has-text("Due / overdue")');
  ok(await M.locator('main tbody button:has-text("Extend stay")').count() > 0, '#10 manager can extend overdue stays at reception');
  // #8 member attendance & performance
  await goto(M, '/members'); await M.fill('main .filters input', 'NM-0001'); await M.click('main tbody button:has-text("View")');
  await M.waitForSelector('.mdl h3:has-text("Attendance & performance")');
  ok(await M.locator('.mdl .stat .l:has-text("Performance")').count() === 1, '#8 member view shows attendance & performance');
  await M.keyboard.press('Escape');
  await goto(M, '/reports'); await M.locator('main .filters select').first().selectOption('attendance');
  ok((await M.locator('main tbody tr').count()) > 5, '#8 attendance & performance report has rows');
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
if (errs.length) { console.log('Runtime errors:'); [...new Set(errs)].forEach(e => console.log('  ' + e)); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await browser.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
