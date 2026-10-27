// Test: department heads see only their own guests; guests of a head are locked to that head; Users quick-add.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium, devices } from 'playwright-core';
const SERVER = new URL('../server/', import.meta.url).href;
const { default: mongoose } = await import(SERVER + 'node_modules/mongoose/index.js');
process.env.JWT_SECRET = 'test';
const { createApp, bootstrapData } = await import(SERVER + 'src/index.js');
const mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await bootstrapData();
const srv = createApp().listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (tok, method, path, body) => { const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
const login = async (u, p = 'Noormahal@123') => (await call(null, 'POST', '/auth/login', { username: u, password: p })).data.token;
const pad = n => String(n).padStart(2, '0'), d = n => { const x = new Date(); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const snap = async t => (await call(t, 'GET', '/snapshot')).data;
const b = await chromium.launch({ headless: true }); const errs = [];
try {
  const A = await login('admin');
  // ---- Users quick-add (UI): a second department head for Langar Serving (DP02) ----
  const p = await (await b.newContext({ viewport: { width: 1360, height: 950 } })).newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(base + '/'); await p.fill('input[autocomplete=username]', 'admin'); await p.fill('input[type=password]', 'Noormahal@123'); await p.click('button:has-text("Sign in")'); await p.waitForSelector('#side nav');
  await p.goto(base + '/admin'); await p.waitForSelector('main .tabs'); await p.click('.tab:has-text("Users")');
  ok(await p.locator('button:has-text("+ Department head")').count() === 1 && await p.locator('button:has-text("+ Main Office")').count() === 1 && await p.locator('button:has-text("+ Abhinandan Dwar security")').count() === 1, 'Users has quick-add buttons for department head, Main Office, Abhinandan Dwar security');
  await p.click('button:has-text("+ Department head")'); await p.waitForSelector('.mdl h2:has-text("Add department head")');
  ok(await p.inputValue('#f-role') === 'supervisor' && await p.locator('#f-deptName').count() === 1, 'form opens with role Department Head and asks for the department (typed)');
  await p.fill('#f-name', 'Head Langar'); await p.fill('#f-username', 'head.langar'); await p.fill('#f-password', 'Temp#Pass1'); await p.fill('#f-deptName', 'langar serving');
  ok((await p.textContent('.mdl')).includes('Existing department.'), 'typing an existing name in other capitals matches it');
  await p.click('.mdl button:has-text("Save")'); await p.waitForSelector('.toast.ok:has-text("User saved")');
  /* a department typed by hand that does not exist yet */
  await p.click('button:has-text("+ Department head")'); await p.fill('#f-name', 'Head Accounts'); await p.fill('#f-username', 'head.accounts'); await p.fill('#f-password', 'Temp#Pass1'); await p.fill('#f-deptName', 'Accounts Office');
  ok((await p.textContent('.mdl')).includes('will be created'), 'a new department name is announced as new');
  await p.click('.mdl button:has-text("Save")'); await p.waitForSelector('.toast.ok:has-text("department")');
  const sx = await snap(A), dNew = sx.depts.find(x => x.name === 'Accounts Office'), uNew = sx.users.find(u => u.username === 'head.accounts');
  ok(dNew && dNew.supervisor === 'Head Accounts' && uNew.deptId === dNew.id, 'department created with the user as its head and assigned to the user');
  ok(sx.depts.filter(x => x.name.toLowerCase() === 'langar serving').length === 1 && sx.users.find(u => u.username === 'head.langar').deptId === 'DP02', 'existing department reused, no duplicate created');
  await p.click('button:has-text("+ Main Office")'); await p.fill('#f-name', 'Main Office 1'); await p.fill('#f-username', 'office1'); await p.fill('#f-password', 'Temp#Pass1'); await p.click('.mdl button:has-text("Save")'); await p.waitForSelector('.toast.ok:has-text("User saved")');
  await p.click('button:has-text("+ Abhinandan Dwar security")'); await p.fill('#f-name', 'Gate 1'); await p.fill('#f-username', 'gate1'); await p.fill('#f-password', 'Temp#Pass1'); await p.click('.mdl button:has-text("Save")'); await p.waitForSelector('.toast.ok:has-text("User saved")');
  await p.locator('main .filters select').selectOption('supervisor'); await p.waitForTimeout(150);
  const heads = await p.locator('main tbody tr').count();
  ok(heads === 3 && (await p.textContent('main tbody')).includes('own guests only'), `role filter lists the ${heads} department heads ("own guests only")`);
  const roles = (await snap(A)).users.map(u => u.role);
  ok(roles.includes('office') && roles.includes('security'), 'Main Office and security users created');

  // ---- two heads: Security (supervisor.security, DP01) and Langar (head.langar, DP02) ----
  const SA = await login('supervisor.security');
  let SB = await login('head.langar', 'Temp#Pass1'); await call(SB, 'POST', '/auth/password', { current: 'Temp#Pass1', next: 'Real#Pass123' }); SB = await login('head.langar', 'Real#Pass123');
  const inv = await call(SA, 'POST', '/visits', { guestName: 'Guest of A', meetWith: 'Someone Else', deptName: 'Langar Serving' });
  const vA = (await snap(A)).visits.find(v => v.id === inv.data.id);
  ok(vA.lockMeeting && vA.deptId === 'DP01' && vA.meetWith === 'Someone Else' && vA.deptName === 'Security', "head A's invite is fixed to A's own department (Security), whatever is typed");
  const pub = (await call(null, 'GET', '/public/visits/' + inv.data.token)).data;
  ok(pub.lockMeeting && pub.deptName === 'Security', 'guest link shows the fixed meeting');
  // guest tries to redirect to Langar (head B) — ignored
  await call(null, 'POST', '/public/visits/' + inv.data.token, { name: 'Guest of A', mobile: '9876500011', meetWith: 'Head Langar', deptName: 'Langar Serving', deptId: 'DP02', date: d(1), time: '10:00', purpose: 'Seva during programme' });
  const vA2 = (await snap(A)).visits.find(v => v.id === inv.data.id);
  ok(vA2.status === 'Submitted' && vA2.deptId === 'DP01', "guest cannot move the meeting to another department head");
  // isolation
  const sb = await snap(SB), sa = await snap(SA);
  ok(!sb.visits.some(v => v.id === inv.data.id), "head B does NOT see head A's guest");
  ok(!sb.notifications.some(n => n.text.includes('Guest of A')), "head B gets no notification about A's guest");
  ok(sa.visits.some(v => v.id === inv.data.id) && sa.notifications.some(n => n.text.includes('Guest of A')), 'head A sees and is notified about their own guest');
  ok((await call(SB, 'POST', `/visits/${inv.data.id}/incharge`, { accept: true, date: d(1), time: '10:00' })).status === 403, "head B cannot act on A's guest");
  ok((await call(SA, 'POST', `/visits/${inv.data.id}/incharge`, { accept: true, date: d(1), time: '10:00' })).status === 200, 'head A accepts their own guest');
  // B's own guest is invisible to A
  const invB = await call(SB, 'POST', '/visits', { guestName: 'Guest of B' });
  ok(!(await snap(SA)).visits.some(v => v.id === invB.data.id) && (await snap(SB)).visits.some(v => v.id === invB.data.id), "head B's guest is visible to B only, not to A");
  // Main Office still sees both
  const O = await login('office1', 'Temp#Pass1'); await call(O, 'POST', '/auth/password', { current: 'Temp#Pass1', next: 'Real#Pass123' });
  const so = await snap(await login('office1', 'Real#Pass123'));
  ok(so.visits.some(v => v.id === inv.data.id) && so.visits.some(v => v.id === invB.data.id), 'Main Office sees all guests');
  // guest page on a phone shows the fixed meeting
  const g = await (await b.newContext(devices['iPhone 13'])).newPage();
  const inv3 = await call(SA, 'POST', '/visits', { guestName: 'Phone Guest' });
  await g.goto(base + '/guest/' + inv3.data.token); await g.waitForSelector('form.f2');
  ok((await g.textContent('form')).includes('Meeting with') && (await g.textContent('form')).includes('Security') && await g.locator('input[list=deptList]').count() === 0, 'guest form shows "Meeting with" as fixed text (no department field)');
  await g.locator('text=Meeting with').scrollIntoViewIfNeeded(); await g.screenshot({ path: 'heads-guest.png' });
  ok(!errs.length, 'no page errors');
} catch (e) { console.error(e); fails++; }
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
await b.close(); srv.close(); await mongoose.disconnect(); await mongo.stop(); process.exit(fails ? 1 : 0);
