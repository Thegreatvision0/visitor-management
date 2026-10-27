// Phase 2 — UI / UX: list tools, row menus, stay badges, Today's tasks, global search, dark mode, page states, Zod on more forms.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test'; delete process.env.FEATURES; delete process.env.DEMO_MODE;
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async u => (await call(null, 'POST', '/auth/login', { username: u, password: 'Noormahal@123' })).data.token;
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const b = await chromium.launch({ headless: true }); const errs = [];
async function as(user, path, vp = { width: 1366, height: 900 }) {
  const ctx = await b.newContext({ viewport: vp, acceptDownloads: true }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(user + ': ' + e.message));
  await p.goto(base + '/'); await p.fill('input[autocomplete=username]', user); await p.fill('input[autocomplete=current-password]', 'Noormahal@123');
  await p.click('button:has-text("Sign in")'); await p.waitForSelector('#side nav'); if (path) { await p.goto(base + path); await p.waitForSelector('main .ph'); } return p;
}
try {
  const A = await login('admin');
  const meta = (await call(null, 'GET', '/meta')).data.features;
  ok(['stayBadges', 'rowMenus', 'todayTasks', 'globalSearch', 'displayPrefs', 'tableTools', 'pageStates'].every(k => meta[k] === true), '2.0 Phase 2 feature switches published and on');

  /* Zod on the user, department and guest forms (server) */
  ok(/test or placeholder/.test((await call(A, 'POST', '/admin/users', { name: 'dfdf', username: 'gate2', password: 'Password@1', role: 'reception' })).data.error), '2.Z user with a junk name refused');
  ok((await call(A, 'POST', '/admin/users', { name: 'Harjit Kaur', username: 'gate2', password: 'Password@1', role: 'reception' })).status === 200, '2.Z user with a real name saved');
  ok(/test or placeholder/.test((await call(A, 'POST', '/depts', { name: 'asdf', supervisor: 'Ram Lal', active: 'Yes' })).data.error), '2.Z department with a junk name refused');
  ok(/test or placeholder/.test((await call(A, 'POST', '/depts', { name: 'Garden Sewa', supervisor: 'qwerty', active: 'Yes' })).data.error), '2.Z department with a junk supervisor refused');
  ok(/test or placeholder/.test((await call(A, 'POST', '/visits', { guestName: 'dfdf' })).data.error), '2.Z invitation with a junk guest name refused');
  const inv = (await call(A, 'POST', '/visits', { guestName: 'Rajesh Kumar' })).data;
  ok(!!inv.token, '2.Z invitation with a real guest name created');
  const reg = v => call(null, 'POST', '/public/visits/' + inv.token, { name: 'Rajesh Kumar', mobile: '9876500011', meetWith: 'Swami Ji', deptName: 'Langar', date: d(2), time: '11:00', purpose: 'Meeting about sewa', people: 2, ...v });
  ok(/test or placeholder/.test((await reg({ purpose: 'test' })).data.error), '2.Z guest registration with a junk purpose refused');
  ok(/between 1 and 50/.test((await reg({ people: 80 })).data.error), '2.Z guest registration: number of people checked');
  ok((await reg({})).status === 200, '2.Z guest registration with real values accepted');

  /* Dashboard: Today's tasks + 7 / 30 day trend */
  const P = await as('admin', '/dashboard');
  ok(await P.locator('.tasks h3:has-text("Today\'s tasks")').count() === 1, "2.4 Today's tasks panel on the dashboard");
  const groups = await P.locator('.tasks .tgroup h4').allTextContents();
  ok(groups.length >= 1, '2.4 task groups shown: ' + groups.map(x => x.replace(/\s+/g, ' ')).join(' | '));
  const cleanG = P.locator('.tgroup:has(h4:has-text("Beds to clean"))');
  if (await cleanG.count()) {
    const before = Number(await cleanG.locator('h4 b').textContent());
    await cleanG.locator('button:has-text("Mark cleaned")').first().click(); await P.waitForSelector('.toast.ok');
    const after = await cleanG.count() ? Number(await cleanG.locator('h4 b').textContent()) : 0;
    ok(after === before - 1, `2.4 one-click "Mark cleaned" from the panel (${before} → ${after})`);
  } else console.log('  (no beds waiting for cleaning in sample data)');
  await P.click('.seg button:has-text("30 days")');
  ok((await P.textContent('.chart-card, .card:has(.seg)')).includes('Last 30 days'), '2.4 trend toggle switches the chart to 30 days');

  /* global search, Ctrl+K */
  const s = (await call(A, 'GET', '/snapshot')).data, m = s.members[3], r = s.regs[0];
  await P.locator('main').click(); await P.keyboard.press('Control+k');
  ok(await P.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label') === 'Search'), '2.5 Ctrl+K puts the cursor in the search box');
  await P.keyboard.type(m.id);
  await P.waitForSelector('.gsearch .ddh');
  ok((await P.locator('.gsearch .ddh').allTextContents()).includes('Members'), '2.5 member found by ID, grouped under "Members"');
  await P.keyboard.press('Enter'); await P.waitForSelector('.mdl');
  ok((await P.textContent('.mdl')).includes(m.name), '2.5 Enter opens the first result');
  await P.keyboard.press('Escape');
  await P.fill('.gsw input', r.id); await P.waitForSelector('.gsearch .ddh');
  ok((await P.locator('.gsearch .ddh').allTextContents()).includes('Requests'), '2.5 request found by its ID');
  const veh = (s.visits || []).find(v => v.vehicle && v.vehicle.has && v.vehicle.number);
  if (veh) { await P.fill('.gsw input', veh.vehicle.number.slice(-4)); await P.waitForSelector('.gsearch .ddh'); ok((await P.locator('.gsearch .ddh').allTextContents()).includes('Guests & vehicles'), '2.5 guest found by vehicle number'); }
  await P.fill('.gsw input', 'zzqx'); await P.waitForSelector('.gsearch .empty'); ok(true, '2.5 "Nothing found" when there are no matches');
  await P.fill('.gsw input', ''); await P.keyboard.press('Escape');

  /* dark mode and bigger text, remembered after reload */
  await P.click('.prof'); await P.check('.prefs input >> nth=0');
  const bg = await P.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(await P.evaluate(() => document.documentElement.dataset.theme) === 'dark' && bg !== 'rgb(243, 245, 249)', '2.6 dark mode on: ' + bg);
  await P.check('.prefs input >> nth=1');
  ok(await P.evaluate(() => document.documentElement.classList.contains('big-text')), '2.6 bigger text on');
  await P.reload(); await P.waitForSelector('#side nav');
  ok(await P.evaluate(() => document.documentElement.dataset.theme === 'dark' && document.documentElement.classList.contains('big-text')), '2.6 both remembered after reload');
  /* badge contrast in dark mode (WCAG AA 4.5:1 for small text) */
  await P.goto(base + '/prereg'); await P.waitForSelector('main .b');
  const worst = await P.$$eval('main .b', els => {
    const lum = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    return Math.min(...els.map(e => { const s = getComputedStyle(e), a = lum(s.color), b = lum(s.backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }));
  });
  ok(worst >= 4.5, '2.6 every badge readable in dark mode (lowest contrast ' + worst.toFixed(2) + ':1)');
  await P.click('.prof'); await P.uncheck('.prefs input >> nth=0'); await P.uncheck('.prefs input >> nth=1');
  const worstL = await P.$$eval('main .b', els => {
    const lum = c => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    return Math.min(...els.map(e => { const s = getComputedStyle(e), a = lum(s.color), b = lum(s.backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }));
  });
  ok(worstL >= 4.5, '2.6 every badge readable in light mode (lowest contrast ' + worstL.toFixed(2) + ':1)');

  /* list tools */
  ok(await P.locator('main button:has-text("Columns")').count() === 1 && await P.locator('main button:has-text("Export CSV")').count() === 1 && await P.locator('main button:has-text("Save filters")').count() === 1, '2.1 Pre-Registration: columns, CSV export and saved filters');
  const [dl] = await Promise.all([P.waitForEvent('download'), P.click('main button:has-text("Export CSV")')]);
  ok(dl.suggestedFilename() === 'pre-registrations.csv', '2.1 Pre-Registration CSV downloaded');
  await P.click('main th button:has-text("Request")'); ok(await P.locator('main th[aria-sort]').count() === 1, '2.1 Pre-Registration sorts by a column');
  for (const [path, what] of [['/approvals', 'Approvals'], ['/reception', 'Reception']]) {
    await P.goto(base + path); await P.waitForSelector('main .ph');
    ok(await P.locator('main button:has-text("Columns")').count() + await P.locator('main .empty').count() >= 1, `2.1 ${what}: column chooser (or empty state)`);
  }
  await P.goto(base + '/branches'); await P.waitForSelector('main .ph');
  const [bdl] = await Promise.all([P.waitForEvent('download'), P.click('main button:has-text("Export CSV")')]);
  ok(bdl.suggestedFilename() === 'branches.csv' && (await (await import('node:fs')).promises.readFile(await bdl.path(), 'utf8')).split('\n').length > 5, '2.1 Branches CSV export with rows');

  /* Monthly / Long-Term: one main action + "⋯", stay badges, attendance colours */
  await P.goto(base + '/longterm'); await P.waitForSelector('main .ph');
  const rowsN = await P.locator('main tbody tr').count();
  if (rowsN) {
    const most = await P.$$eval('main tbody tr', trs => Math.max(...trs.map(tr => tr.querySelectorAll('.rowacts > .btn').length)));
    ok(most === 1, '2.2 each row shows one main action button');
    await P.locator('main tbody tr .rmenu-b').first().click();
    const items = await P.locator('.rmenu-dd button').allTextContents();
    ok(items.length >= 1, '2.2 "⋯" menu holds the other actions: ' + items.join(', ')); await P.keyboard.press('Escape');
    const st = await P.locator('main td[data-label="Status"] .b').allTextContents();
    ok(st.length === rowsN && st.every(x => ['Not arrived', 'Resident', 'Overdue', 'Departed'].includes(x)), '2.3 stay status badge on every row: ' + [...new Set(st)].join(', '));
    const att = await P.$$eval('main td[data-label="Attendance"] .b', els => els.map(e => [parseInt(e.textContent), e.className]));
    ok(att.every(([n, c]) => c.includes(n < 60 ? 'bad' : n <= 80 ? 'warn' : 'ok')), '2.3 attendance colours: red < 60, amber 60–80, green > 80 (' + att.length + ' checked)');
  } else console.log('  (no monthly / long-term rows in sample data)');

  /* connection lost → bar with Retry; back → bar gone */
  await P.route('**/api/rev', rt => rt.abort());
  await P.evaluate(() => window.dispatchEvent(new Event('focus'))); await P.waitForSelector('.netbar');
  ok((await P.textContent('.netbar')).includes('Connection to the server lost'), '2.S connection-lost bar shown when the server cannot be reached');
  await P.unroute('**/api/rev'); await P.click('.netbar button'); await P.waitForSelector('.netbar', { state: 'detached' });
  ok(true, '2.S "Retry now" reconnects and hides the bar');

  /* department form refuses junk in the browser too */
  await P.goto(base + '/departments'); await P.waitForSelector('main .ph');
  await P.click('main button:has-text("Add department")'); await P.fill('#f-name', 'dfdf'); await P.fill('#f-supervisor', 'Ram Lal');
  await P.click('.mdl button:has-text("Save")'); await P.waitForSelector('.mdl .err');
  ok((await P.textContent('.mdl .err')).includes('placeholder'), '2.Z department form refuses junk before sending');

  /* phone width: no sideways scrolling on the dashboard with the tasks panel */
  const ph = await as('admin', '/dashboard', { width: 360, height: 780 });
  ok(await ph.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '2.R dashboard fits a 360 px phone');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
} catch (e) { console.error('ERROR', e.message.split('\n')[0]); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
