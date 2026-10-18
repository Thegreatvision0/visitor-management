/* Super Admin: users, role access, option lists, backup / restore and resets. */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Settings, Branch, Department, Member, Registration, Allocation, Duty, Attendance, Bed, DATA_MODELS } from '../models/index.js';
import { superOnly } from '../middleware/auth.js';
import { nid, log, fail, notFound, getSettings, syncCounters } from '../lib/core.js';
import { body, check, oneOf } from '../lib/validate.js';
import { exportAll, replaceAll } from '../services/data.js';
import { buildSample } from '../services/sample.js';
import { importDjjsBranches } from '../services/branches-import.js';
import { ROLE_DEFAULTS, PAGE_KEYS, resolveRoles, VISIT_CAP_KEYS, VISIT_CAPS_DEFAULT, resolveVisitCaps } from '../../../shared/constants.js';
import { sameName, today } from '../../../shared/dates.js';

const r = Router();
r.use(superOnly);
const ok = res => res.json({ ok: true });

/* ---------- users ---------- */
async function saveUser(req, id) {
  const v = body(req, ['name', 'username', 'password', 'role', 'branchId', 'deptId', 'deptName']);
  /* department may be typed: an existing one (any capitals) is used, a new name is created when the user is saved */
  let newDept = '';
  if (v.deptName) {
    const n = v.deptName.replace(/\s+/g, ' ').trim(), d = (await Department.find({}, { name: 1 }).lean()).find(x => x.name.toLowerCase() === n.toLowerCase());
    if (d) v.deptId = d._id; else { newDept = n; v.deptId = '__new__'; }
  }
  const deptOk = async () => v.deptId === '__new__' || (!!v.deptId && !!(await Department.exists({ _id: v.deptId })));
  const caps = [...new Set(((req.body || {}).visitCaps || []).map(String))]; // extra guest visit permissions for this user
  if (caps.some(c => !VISIT_CAP_KEYS.includes(c))) fail('Unknown guest visit permission.');
  if (caps.includes('incharge') && !(await deptOk())) fail('To accept appointments as an in-charge, the user needs a department.');
  check(v, [['name', 'Display name', 'req'], ['username', 'Username', 'req'], ['role', 'Role', 'req']]);
  oneOf(v.role, Object.keys(ROLE_DEFAULTS), 'role');
  v.username = v.username.toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(v.username)) fail('Username: 3–40 characters, letters, digits, dot, dash or underscore.');
  if (!id && !v.password) fail('Password is required for a new user.');
  if (v.password && String(v.password).length < 8) fail('Password must have at least 8 characters.');
  if (v.role === 'coordinator' && !(v.branchId && await Branch.exists({ _id: v.branchId }))) fail('A Branch Coordinator needs a branch.');
  if (v.role === 'supervisor' && !(await deptOk())) fail('A Department Supervisor needs a department.');
  if (await User.exists({ _id: { $ne: id || null }, username: v.username })) fail('This username is already taken.');
  const ex = id ? await User.findById(id) : null;
  if (id && !ex) notFound('User');
  if (ex && ex.role === 'superadmin' && v.role !== 'superadmin' && (await User.countDocuments({ role: 'superadmin' })) <= 1) fail('Keep at least one Super Admin.');
  /* a typed department that does not exist yet is created now (all checks passed), with this user as its head */
  if (v.deptId === '__new__') {
    if (v.role === 'supervisor' || caps.includes('incharge')) {
      const d = await Department.create({ _id: await nid('dp'), name: newDept, supervisor: v.name, active: true });
      v.deptId = d._id; await log(req.user, `Added department ${newDept} (head: ${v.name})`);
    } else v.deptId = '';
  }
  const u = ex || new User({ _id: await nid('us') });
  Object.assign(u, { name: v.name, username: v.username, role: v.role, branchId: v.role === 'coordinator' ? v.branchId : '', deptId: v.role === 'supervisor' || caps.includes('incharge') ? v.deptId : '', visitCaps: caps });
  /* a password set by an admin for someone else is temporary: they choose their own at first sign-in */
  if (v.password) { u.passwordHash = await bcrypt.hash(String(v.password), 10); u.mustChangePassword = u._id !== req.user.id; }
  await u.save(); await log(req.user, `${ex ? 'Updated' : 'Added'} user ${v.name}`);
  return u._id;
}
r.post('/users', async (req, res) => res.json({ id: await saveUser(req, null) }));
r.put('/users/:id', async (req, res) => res.json({ id: await saveUser(req, req.params.id) }));
r.delete('/users/:id', async (req, res) => {
  const u = await User.findById(req.params.id); if (!u) notFound('User');
  if (u._id === req.user.id) fail('You cannot delete the user you are signed in as.');
  if (u.role === 'superadmin' && (await User.countDocuments({ role: 'superadmin' })) <= 1) fail('Keep at least one Super Admin.');
  await User.deleteOne({ _id: u._id }); await log(req.user, `Deleted user ${u.name}`); ok(res);
});

/* ---------- role access ---------- */
r.put('/perms', async (req, res) => {
  const { role, page, value } = req.body || {};
  if (!ROLE_DEFAULTS[role] || role === 'superadmin') fail('Choose a valid role.');
  if (!PAGE_KEYS.includes(page) || page === 'admin') fail('Choose a valid page.');
  if (!['', 'v', 'e'].includes(value)) fail('Choose View, Edit or none.');
  const s = await getSettings(), perms = s.perms ? { ...s.perms } : {};
  const cur = resolveRoles(s.perms);
  perms[role] = { ...(perms[role] || cur[role].pages), [page]: value };
  await Settings.updateOne({ _id: 'app' }, { $set: { perms } });
  await log(req.user, `Access changed: ${role} / ${page} → ${value || 'none'}`); ok(res);
});
/* guest visit permissions per role */
r.put('/visit-caps', async (req, res) => {
  const { role, cap, on } = req.body || {};
  if (!VISIT_CAPS_DEFAULT[role] || role === 'superadmin') fail('Choose a valid role.');
  if (!VISIT_CAP_KEYS.includes(cap)) fail('Choose a valid permission.');
  const s = await getSettings(), cur = resolveVisitCaps(s.visitCaps), next = { ...(s.visitCaps || cur) };
  const set = new Set(cur[role]); if (on) set.add(cap); else set.delete(cap);
  next[role] = [...set];
  await Settings.updateOne({ _id: 'app' }, { $set: { visitCaps: next } });
  await log(req.user, `Guest visit access: ${role} ${on ? '+' : '−'} ${cap}`); ok(res);
});
r.post('/visit-caps/reset', async (req, res) => { await Settings.updateOne({ _id: 'app' }, { $set: { visitCaps: null } }); await log(req.user, 'Guest visit access reset to defaults'); ok(res); });
r.post('/perms/reset', async (req, res) => { await Settings.updateOne({ _id: 'app' }, { $set: { perms: null } }); await log(req.user, 'Role access reset to defaults'); ok(res); });

/* ---------- option lists ---------- */
const LISTS = ['states', 'rels', 'shifts', 'offices'];
r.post('/lists/:k', async (req, res) => {
  const k = req.params.k; if (!LISTS.includes(k)) fail('Unknown list.');
  const v = body(req, ['name', 'time']); check(v, [['name', 'Name', 'req']]);
  const s = await getSettings(), L = s.lists[k];
  if (L.some(x => sameName(k === 'shifts' ? x.name : x, v.name))) fail('This entry already exists.');
  await Settings.updateOne({ _id: 'app' }, { $push: { ['lists.' + k]: k === 'shifts' ? { name: v.name, time: v.time || '' } : v.name } });
  ok(res);
});
r.delete('/lists/:k', async (req, res) => {
  const k = req.params.k, v = String(req.query.name || ''); if (!LISTS.includes(k)) fail('Unknown list.');
  let used = 0, what = '';
  if (k === 'states') { used = (await Branch.countDocuments({ state: v })) + (await Member.countDocuments({ state: v })); what = 'branches and members use the state'; }
  if (k === 'rels') { used = await Member.countDocuments({ emRel: v }); what = 'members use the relation'; }
  if (k === 'shifts') { used = await Duty.countDocuments({ status: 'Active', shift: v }); what = 'active duties use the shift'; }
  if (k === 'offices') { used = await DATA_MODELS.visits.countDocuments({ office: v, status: { $in: ['Awaiting office', 'Confirmed', 'Arrived'] } }); what = 'upcoming guest visits use the office'; }
  if (used) fail(`${used} ${what} ${v}. Change those first.`);
  const s = await getSettings();
  if (s.lists[k].length <= 1) fail('Keep at least one entry in the list.');
  await Settings.updateOne({ _id: 'app' }, { $pull: { ['lists.' + k]: k === 'shifts' ? { name: v } : v } });
  ok(res);
});
r.put('/lists/shifts', async (req, res) => {
  const name = String(req.query.name || ''), v = body(req, ['time']);
  const s = await Settings.updateOne({ _id: 'app', 'lists.shifts.name': name }, { $set: { 'lists.shifts.$.time': v.time } });
  if (!s.matchedCount) notFound('Shift'); ok(res);
});

/* ---------- data ---------- */
r.get('/export', async (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="nurmahal_backup_${today()}.json"`);
  res.json(await exportAll());
});
r.post('/import', async (req, res) => { await replaceAll(req.body); await log(req.user, 'Backup imported'); ok(res); });
r.post('/import-djjs-branches', async (req, res) => res.json(await importDjjsBranches(req.user)));
r.post('/reset-sample', async (req, res) => { await replaceAll(buildSample()); await log(req.user, 'Reset to sample data'); ok(res); });
r.post('/clear-people', async (req, res) => {
  await Promise.all([Member.deleteMany({}), Registration.deleteMany({}), Allocation.deleteMany({}), Duty.deleteMany({}), Attendance.deleteMany({}), DATA_MODELS.visits.deleteMany({})]);
  await Bed.updateMany({}, { cleaning: false });
  await log(req.user, 'Cleared all members and visits'); ok(res);
});
r.post('/clear-all', async (req, res) => {
  for (const M of Object.values(DATA_MODELS)) await M.deleteMany({});
  await Attendance.deleteMany({});
  await Settings.updateOne({ _id: 'app' }, { $set: { tomb: {} } });
  await User.updateMany({}, { branchId: '', deptId: '' });
  await syncCounters();
  await log(req.user, 'Cleared everything'); ok(res);
});

export default r;
