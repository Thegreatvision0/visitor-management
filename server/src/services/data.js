/* Whole-database operations: snapshot for the browser, backup export / import, sample reset, demo users. */
import bcrypt from 'bcryptjs';
import { DATA_MODELS, Attendance, AuditLog, Settings, User, Registration, Member, Allocation, Duty, Branch, Department } from '../models/index.js';
import { getSettings, syncCounters, out, fail, getRev } from '../lib/core.js';
import { defaultLists, resolveRoles, resolveVisitCaps, STATES_DEF, OFFICES_DEF } from '../../../shared/constants.js';
import { scopeRegIds } from './domain.js';
import { branchFamily, notificationsFor } from './notify.js';
import { DEMO_USERS } from './sample.js';

const strip = list => list.map(out);
const toDocs = list => (list || []).map(({ id, ...rest }) => ({ _id: id, ...rest }));
const attMap = rows => { const m = {}; rows.forEach(a => { m[a.date + '|' + a.regId] = { status: a.status, deptId: a.deptId || null }; }); return m; };
const publicUser = u => ({ id: u._id, name: u.name, username: u.username, role: u.role, branchId: u.branchId || '', deptId: u.deptId || '', visitCaps: u.visitCaps || [] });

/** Everything the signed-in user may see, in the shape the React app works with. */
export async function snapshot(user) {
  const ids = await scopeRegIds(user), byReg = ids ? { regId: { $in: ids } } : {};
  const regs = await Registration.find(ids ? { _id: { $in: ids } } : {}).lean();
  let members;
  if (user.role === 'coordinator') members = await Member.find({ $or: [{ branchId: { $in: await branchFamily(user.branchId) } }, { _id: { $in: regs.map(r => r.memberId) } }] }).lean();
  else if (user.role === 'supervisor') members = await Member.find({ _id: { $in: regs.map(r => r.memberId) } }).lean();
  else members = await Member.find().lean();
  const [allocs, duties, att, branches, depts, sites, buildings, rooms, beds] = await Promise.all([
    Allocation.find(byReg).lean(), Duty.find(byReg).lean(), Attendance.find(byReg).lean(),
    Branch.find().lean(), Department.find().lean(),
    DATA_MODELS.sites.find().lean(), DATA_MODELS.buildings.find().lean(), DATA_MODELS.rooms.find().lean(), DATA_MODELS.beds.find().lean()
  ]);
  const s = await getSettings();
  const showLog = !['coordinator', 'supervisor'].includes(user.role);
  const log = showLog ? (await AuditLog.find().sort({ at: -1, _id: -1 }).limit(user.role === 'superadmin' ? 200 : 8).lean()).map(({ _id, ...l }) => l) : [];
  const users = user.role === 'superadmin' ? (await User.find().lean()).map(publicUser) : [];
  return {
    regs: strip(regs), members: strip(members), allocs: strip(allocs), duties: strip(duties), att: attMap(att),
    branches: strip(branches), depts: strip(depts), sites: strip(sites), buildings: strip(buildings), rooms: strip(rooms), beds: strip(beds),
    lists: s.lists, tomb: s.tomb || {}, roles: resolveRoles(s.perms), log, users,
    myPages: user.pages, vcaps: user.vcaps || [], // this user's effective page access and guest visit permissions
    visitCaps: user.role === 'superadmin' ? resolveVisitCaps(s.visitCaps) : undefined,
    family: user.role === 'coordinator' ? await branchFamily(user.branchId) : null,
    visits: await visitsFor(user),
    publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''), // address guests use for registration links
    notifications: await notificationsFor(user), rev: await getRev()
  };
}

/** Guest visits this user may see. The guest link (token) only goes to the host and management. */
async function visitsFor(user) {
  if (!user.pages.visitors) return [];
  /* 'all' (and Main Office / gate) see every visit; an in-charge sees their department's; everyone sees the guests they invited */
  const c = user.vcaps || [], all = ['all', 'office', 'gate'].some(x => c.includes(x));
  const q = all ? {} : c.includes('incharge') && user.deptId ? { $or: [{ deptId: user.deptId }, { hostId: user.id }] } : { hostId: user.id };
  const mgmt = ['superadmin', 'manager'].includes(user.role);
  return (await DATA_MODELS.visits.find(q).sort({ date: -1, time: -1 }).limit(2000).lean())
    .map(({ _id, token, ...v }) => ({ id: _id, ...v, token: mgmt || v.hostId === user.id ? token : undefined }));
}

/** Full backup in the prototype's JSON format (v: 1), so old browser backups and new ones are interchangeable. */
export async function exportAll() {
  const D = { v: 1 };
  for (const [k, M] of Object.entries(DATA_MODELS)) D[k] = strip(await M.find().lean());
  D.att = attMap(await Attendance.find().lean());
  const s = await getSettings();
  Object.assign(D, { lists: s.lists, perms: s.perms, tomb: s.tomb || {} });
  D.log = (await AuditLog.find().sort({ at: -1, _id: -1 }).limit(200).lean()).map(({ _id, ...l }) => l);
  D.users = (await User.find().lean()).map(publicUser); // no password hashes
  return D;
}

/** Replace all sewadar data with `D` (backup format). Sign-in users are kept; links to removed branches / departments are cleared. */
export async function replaceAll(D) {
  if (!D || D.v !== 1 || !Array.isArray(D.members) || !Array.isArray(D.regs) || !Array.isArray(D.beds) || !Array.isArray(D.branches)) fail('Not a valid backup file.');
  for (const [k, M] of Object.entries(DATA_MODELS)) { await M.deleteMany({}); const docs = toDocs(D[k]); if (docs.length) await M.insertMany(docs); }
  await Attendance.deleteMany({});
  const att = Object.entries(D.att || {}).map(([key, v]) => { const [date, regId] = key.split('|'); return { date, regId, status: v.status, deptId: v.deptId || null }; });
  if (att.length) await Attendance.insertMany(att);
  await AuditLog.deleteMany({});
  if (Array.isArray(D.log) && D.log.length) await AuditLog.insertMany(D.log.slice(0, 200).map(l => ({ at: l.at, by: l.by, text: l.text })));
  /* lists: fill anything an older file lacks, and keep every state a branch uses */
  const lists = D.lists && D.lists.states ? D.lists : defaultLists();
  (D.branches || []).forEach(b => { if (b.state && !lists.states.includes(b.state)) lists.states.push(b.state); });
  await Settings.replaceOne({ _id: 'app' }, { _id: 'app', lists, perms: D.perms || null, tomb: D.tomb || {} }, { upsert: true });
  const brIds = new Set((D.branches || []).map(b => b.id)), dpIds = new Set((D.depts || []).map(x => x.id));
  for (const u of await User.find()) {
    let ch = false;
    if (u.branchId && !brIds.has(u.branchId)) { u.branchId = ''; ch = true; }
    if (u.deptId && !dpIds.has(u.deptId)) { u.deptId = ''; ch = true; }
    if (ch) await u.save();
  }
  await ensureAllStates();
  await syncCounters();
}

/** Add any Indian state / UT missing from the saved states list (kept in front of 'Other'). */
export async function ensureAllStates() {
  const s = await getSettings(), cur = s.lists.states.slice();
  if (!s.lists.offices || !s.lists.offices.length) await Settings.updateOne({ _id: 'app' }, { $set: { 'lists.offices': OFFICES_DEF.slice() } }); // meeting offices for guest visits
  const missing = STATES_DEF.filter(x => !cur.includes(x));
  if (!missing.length) return;
  const i = cur.indexOf('Other'), next = i >= 0 ? [...cur.slice(0, i), ...missing.filter(x => x !== 'Other'), ...cur.slice(i)] : [...cur, ...missing];
  await Settings.updateOne({ _id: 'app' }, { $set: { 'lists.states': next } });
}

/** Create the demo sign-in accounts when no user exists yet. */
export async function ensureDemoUsers() {
  if (await User.countDocuments()) return false;
  const hash = await bcrypt.hash(process.env.SEED_PASSWORD || 'Noormahal@123', 10);
  for (const u of DEMO_USERS) {
    const br = u.branchName ? await Branch.findOne({ name: u.branchName }).lean() : null;
    const dp = u.deptName ? await Department.findOne({ name: u.deptName }).lean() : null;
    await User.create({ _id: u.id, name: u.name, username: u.username, passwordHash: hash, role: u.role, branchId: br ? br._id : '', deptId: dp ? dp._id : '' });
  }
  await syncCounters();
  return true;
}

export const isEmpty = async () => !(await Member.exists({})) && !(await Branch.exists({})) && !(await DATA_MODELS.beds.exists({}));
