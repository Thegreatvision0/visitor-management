/* Members and branches. */
import { Router } from 'express';
import { Member, Branch, Registration, Settings, User } from '../models/index.js';
import { feature } from '../lib/config.js';
import { need } from '../middleware/auth.js';
import { nid, log, fail, notFound, forbidden, getSettings, archiveStamp } from '../lib/core.js';
import { body, check, oneOf, isDate, zfail } from '../lib/validate.js';
import { memberSchema, branchSchema } from '../../../shared/schemas.js';
import { deleteMember, deleteBranch, branchFamily } from '../services/domain.js';
import { today, nowLocal } from '../../../shared/dates.js';
import { TYPES, GENDERS, LIVE, isMasked } from '../../../shared/constants.js';
import { personName, placeName, cleanText } from '../../../shared/text.js';

const r = Router();

/* ---------- members ---------- */
const MEMBER_FIELDS = ['name', 'mobile', 'dob', 'gender', 'branchId', 'type', 'state', 'district', 'address', 'emName', 'emPhone', 'emRel', 'photo'];
async function saveMember(req, id) {
  const v = body(req, MEMBER_FIELDS), u = req.user;
  /* a masked number sent back unchanged (98XXXXX280) keeps the saved one */
  if (id && (isMasked(v.mobile) || isMasked(v.emPhone))) { const cur = await Member.findById(id).lean(); if (cur) { if (isMasked(v.mobile)) v.mobile = cur.mobile; if (isMasked(v.emPhone)) v.emPhone = cur.emPhone; } }
  /* data hygiene: names in proper case with single spaces, placeholders such as "null" dropped */
  Object.assign(v, { name: personName(v.name), emName: personName(v.emName), district: placeName(v.district), address: cleanText(v.address), mobile: String(v.mobile).replace(/\D/g, '').slice(-10), emPhone: String(v.emPhone).replace(/\D/g, '').slice(-10) });
  zfail(memberSchema, v);
  check(v, [['name', 'Full name', 'req'], ['mobile', 'Mobile number', 'req tel'], ['dob', 'Date of birth', 'req'], ['gender', 'Gender', 'req'], ['branchId', 'Branch', 'req'],
    ['type', 'Member type', 'req'], ['state', 'State', 'req'], ['district', 'District', 'req'], ['address', 'Address', 'req'], ['emName', 'Emergency contact name', 'req'], ['emPhone', 'Emergency contact mobile', 'req tel']]);
  isDate(v.dob, 'Date of birth'); oneOf(v.gender, GENDERS, 'gender'); oneOf(v.type, TYPES, 'member type');
  if (v.photo && (!String(v.photo).startsWith('data:image/') || v.photo.length > 400000)) fail('The photo is not a valid image or is too large.');
  if (v.dob > today()) fail('Date of birth cannot be in the future.');
  if (!(await Branch.exists({ _id: v.branchId, archived: null }))) fail('Select a valid branch (archived branches cannot be chosen).');
  const ex = id ? await Member.findById(id) : null;
  if (id && !ex) notFound('Member');
  if (u.role === 'coordinator') {
    const fam = await branchFamily(u.branchId);
    if (!fam.includes(v.branchId) || (ex && !fam.includes(ex.branchId))) forbidden('You can only manage members of your own branch and its sub-branches.');
  }
  if (ex && ex.archived) fail(`${ex.name} (${ex._id}) is archived. Restore the member first.`);
  const arch = d => d.archived ? ' It is archived — open it from Member Master → Archived and restore it instead of creating a new member.' : '';
  const dup = await Member.findOne({ _id: { $ne: id || null }, mobile: v.mobile }).lean();
  if (dup) fail(`A member with this mobile number already exists (${dup._id}, ${dup.name}). One permanent Member ID per person — use the existing record.${arch(dup)}`);
  const dup2 = (await Member.find({ _id: { $ne: id || null }, dob: v.dob }).lean()).find(m => m.name.toLowerCase() === v.name.toLowerCase());
  if (dup2) fail(`A member with the same name and date of birth already exists (${dup2._id}).${arch(dup2)}`);
  const m = ex || new Member({ _id: await nid('mem'), createdOn: today() });
  Object.assign(m, { ...v, photo: v.photo || null });
  await m.save();
  await log(u, `${ex ? 'Updated' : 'Created'} member ${m._id} (${m.name})`);
  return m._id;
}
/* Reveal a masked member's numbers — written to the audit log (who, whose, when). */
r.post('/members/:id/reveal', need('dashboard', 'v'), async (req, res) => { // anyone signed in; every reveal is in the audit log
  const m = await memberInScope(req);
  await log(req.user, `Revealed mobile numbers of ${m._id} (${m.name})`);
  res.json({ mobile: m.mobile, emPhone: m.emPhone });
});
r.post('/members', need('members'), async (req, res) => res.json({ id: await saveMember(req, null) }));
r.put('/members/:id', need('members'), async (req, res) => res.json({ id: await saveMember(req, req.params.id) }));
/* "Delete" archives the member: the Member ID, visits, bed and sewa history are kept, the ID is never reused,
   and the member can be found (Member Master → Archived, or by searching the ID) and restored.
   ?permanent=1 (Super Admin only, archived members only) erases the member and their history for good. */
async function memberInScope(req) {
  const m = await Member.findById(req.params.id); if (!m) notFound('Member');
  if (req.user.role === 'coordinator' && !(await branchFamily(req.user.branchId)).includes(m.branchId)) forbidden('You can only manage members of your own branch and its sub-branches.');
  return m;
}
r.delete('/members/:id', need('members'), async (req, res) => {
  const m = await memberInScope(req);
  if (req.query.permanent === '1') {
    if (req.user.role !== 'superadmin') forbidden('Only the Super Admin can permanently delete a member.');
    if (!m.archived) fail('Archive the member first; only archived members can be deleted permanently.');
    if (await Registration.exists({ memberId: m._id, actualIn: { $nin: [null, ''] } })) fail(`${m.name} has stayed at Nurmahal — members with stay history are kept for the records and can only be archived.`);
    await deleteMember(req.user, m._id);
    return res.json({ ok: true });
  }
  const live = await Registration.findOne({ memberId: m._id, status: { $in: LIVE } }).lean();
  if (live) fail(`${m.name} has a live request (${live._id}, ${live.status}). Reject or cancel it, or check the member out, first.`);
  const why = cleanText((req.body || {}).reason || req.query.reason || '');
  m.archived = { on: nowLocal(), by: req.user.name, reason: why };
  await m.save();
  await log(req.user, `Archived member ${m._id} (${m.name})${why ? ' — ' + why : ''}`);
  res.json({ ok: true });
});
r.post('/members/:id/restore', need('members'), async (req, res) => {
  const m = await memberInScope(req);
  if (!m.archived) fail('This member is not archived.');
  const dup = await Member.findOne({ _id: { $ne: m._id }, mobile: m.mobile, archived: null }).lean();
  if (dup) fail(`Another active member already uses mobile ${m.mobile} (${dup._id}, ${dup.name}). Change that record first.`);
  m.archived = undefined; await m.save();
  await log(req.user, `Restored member ${m._id} (${m.name})`);
  res.json({ ok: true });
});

/* ---------- branches ---------- */
const normName = s => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
async function saveBranch(req, id) {
  const u = req.user, v = body(req, ['name', 'state', 'district', 'coordinator', 'phone', 'parentId', 'address', 'email', 'phones']);
  Object.assign(v, { name: cleanText(v.name), district: placeName(v.district), coordinator: personName(v.coordinator), address: cleanText(v.address), phones: cleanText(v.phones), email: cleanText(v.email).toLowerCase() });
  let b = id ? await Branch.findById(id) : null;
  if (id && !b) notFound('Branch');
  /* coordinators: only sub-branches under their own branch family, and edits within it */
  if (u.role === 'coordinator') {
    const fam = await branchFamily(u.branchId);
    if (b && !fam.includes(b._id)) forbidden('You can only edit your own branch and its sub-branches.');
    if (b && b._id === u.branchId) v.parentId = b.parentId || ''; // own branch stays where it is
    else if (!fam.includes(v.parentId)) forbidden('Choose your branch (or one of its sub-branches) as the parent branch.');
  }
  if (v.parentId) {
    const p = await Branch.findById(v.parentId).lean();
    if (!p) fail('Select a valid parent branch.');
    if (p.archived) fail('The parent branch is archived — restore it first.');
    if (b && (await branchFamily(b._id)).includes(p._id)) fail('A branch cannot be placed under itself or one of its own sub-branches.');
    v.state = p.state; // a sub-branch is always in its parent's state
  }
  check(v, [['name', 'Branch name', 'req'], ['state', 'State', 'req'], ['district', 'District', 'req'], ['coordinator', 'Coordinator name', 'req'], ['phone', 'Coordinator mobile', 'req tel']]);
  zfail(branchSchema, v);
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) fail('Enter a valid email address.');
  v.sample = false; // edited by a person → no longer sample data
  /* branch names are unique across the whole system (any state, branch or sub-branch) */
  const same = (await Branch.find({ _id: { $ne: id || null } }, { name: 1, state: 1 }).lean()).find(x => normName(x.name) === normName(v.name));
  if (same) fail(`A branch named “${same.name}” already exists (${same.state}). Branch names must be unique — use the existing branch or add a sub-branch under it.`);
  if (!b) b = new Branch({ _id: await nid('br') });
  Object.assign(b, v); await b.save();
  const subs = (await branchFamily(b._id)).slice(1);
  if (subs.length) await Branch.updateMany({ _id: { $in: subs } }, { state: v.state }); // sub-branches follow their parent's state
  const s = await getSettings();
  if (!s.lists.states.includes(v.state)) await Settings.updateOne({ _id: 'app' }, { $push: { 'lists.states': v.state } });
  await log(req.user, `${id ? 'Updated' : 'Added'} branch ${v.name}`);
  return b._id;
}
/* archive / restore a branch: hidden from lists and forms, members and history stay linked */
r.post('/branches/:id/archive', need('branches'), async (req, res) => {
  if (!feature('archive')) forbidden('Archiving is switched off.');
  const b = await Branch.findById(req.params.id); if (!b) notFound('Branch');
  if (req.user.role === 'coordinator' && (b._id === req.user.branchId || !(await branchFamily(req.user.branchId)).includes(b._id))) forbidden('You can only archive sub-branches of your own branch.');
  const subs = await Branch.find({ parentId: b._id, archived: null }, { name: 1 }).lean();
  if (subs.length) fail(`${b.name} has sub-branch(es) in use: ${subs.map(x => x.name).join(', ')}. Archive or move them first.`);
  const live = await Registration.countDocuments({ branchId: b._id, status: { $in: LIVE }, archived: null });
  if (live) fail(`${b.name} has ${live} open request(s). Finish, reject or cancel them first.`);
  const users = await User.find({ branchId: b._id }, { name: 1 }).lean();
  if (users.length) fail(`Sign-in user(s) belong to ${b.name}: ${users.map(x => x.name).join(', ')}. Move them to another branch first (Admin → Users).`);
  b.archived = archiveStamp(req.user, (req.body || {}).reason); await b.save();
  await log(req.user, `Archived branch ${b.name}`); res.json({ ok: true });
});
r.post('/branches/:id/restore', need('branches'), async (req, res) => {
  const b = await Branch.findById(req.params.id); if (!b) notFound('Branch');
  if (req.user.role === 'coordinator' && !(await branchFamily(req.user.branchId)).includes(b._id)) forbidden('You can only manage your own branch family.');
  if (b.parentId && (await Branch.exists({ _id: b.parentId, archived: { $ne: null } }))) fail('Restore its parent branch first.');
  b.archived = undefined; await b.save();
  await log(req.user, `Restored branch ${b.name}`); res.json({ ok: true });
});
r.post('/branches', need('branches'), async (req, res) => res.json({ id: await saveBranch(req, null) }));
r.put('/branches/:id', need('branches'), async (req, res) => res.json({ id: await saveBranch(req, req.params.id) }));
r.delete('/branches/:id', need('branches'), async (req, res) => {
  if (req.user.role === 'coordinator') {
    if (req.params.id === req.user.branchId || !(await branchFamily(req.user.branchId)).includes(req.params.id)) forbidden('You can only delete sub-branches of your own branch.');
    const to = String(req.query.moveTo || '');
    if (to && !(await branchFamily(req.user.branchId)).includes(to)) forbidden('Records can only be moved to your own branch or its sub-branches.');
  }
  await deleteBranch(req.user, req.params.id, String((req.body || {}).moveTo || req.query.moveTo || ''));
  res.json({ ok: true });
});

export default r;
