/* Members and branches. */
import { Router } from 'express';
import { Member, Branch, Registration, Settings } from '../models/index.js';
import { need, isMgmt } from '../middleware/auth.js';
import { nid, log, fail, notFound, forbidden, getSettings } from '../lib/core.js';
import { body, check, oneOf, isDate } from '../lib/validate.js';
import { deleteMember, deleteBranch, branchFamily } from '../services/domain.js';
import { today } from '../../../shared/dates.js';
import { TYPES, GENDERS } from '../../../shared/constants.js';

const r = Router();

/* ---------- members ---------- */
const MEMBER_FIELDS = ['name', 'mobile', 'dob', 'gender', 'branchId', 'type', 'state', 'district', 'address', 'emName', 'emPhone', 'emRel', 'photo'];
async function saveMember(req, id) {
  const v = body(req, MEMBER_FIELDS), u = req.user;
  check(v, [['name', 'Full name', 'req'], ['mobile', 'Mobile number', 'req tel'], ['dob', 'Date of birth', 'req'], ['gender', 'Gender', 'req'], ['branchId', 'Branch', 'req'],
    ['type', 'Member type', 'req'], ['state', 'State', 'req'], ['district', 'District', 'req'], ['address', 'Address', 'req'], ['emName', 'Emergency contact name', 'req'], ['emPhone', 'Emergency contact mobile', 'req tel']]);
  isDate(v.dob, 'Date of birth'); oneOf(v.gender, GENDERS, 'gender'); oneOf(v.type, TYPES, 'member type');
  if (v.photo && (!String(v.photo).startsWith('data:image/') || v.photo.length > 400000)) fail('The photo is not a valid image or is too large.');
  if (v.dob > today()) fail('Date of birth cannot be in the future.');
  if (!(await Branch.exists({ _id: v.branchId }))) fail('Select a valid branch.');
  const ex = id ? await Member.findById(id) : null;
  if (id && !ex) notFound('Member');
  if (u.role === 'coordinator') {
    const fam = await branchFamily(u.branchId);
    if (!fam.includes(v.branchId) || (ex && !fam.includes(ex.branchId))) forbidden('You can only manage members of your own branch and its sub-branches.');
  }
  const dup = await Member.findOne({ _id: { $ne: id || null }, mobile: v.mobile }).lean();
  if (dup) fail(`A member with this mobile number already exists (${dup._id}). One permanent Member ID per person — use the existing record.`);
  const dup2 = (await Member.find({ _id: { $ne: id || null }, dob: v.dob }).lean()).find(m => m.name.toLowerCase() === v.name.toLowerCase());
  if (dup2) fail(`A member with the same name and date of birth already exists (${dup2._id}).`);
  const m = ex || new Member({ _id: await nid('mem'), createdOn: today() });
  Object.assign(m, { ...v, photo: v.photo || null });
  await m.save();
  await log(u, `${ex ? 'Updated' : 'Created'} member ${m._id} (${m.name})`);
  return m._id;
}
r.post('/members', need('members'), async (req, res) => res.json({ id: await saveMember(req, null) }));
r.put('/members/:id', need('members'), async (req, res) => res.json({ id: await saveMember(req, req.params.id) }));
r.delete('/members/:id', need('members'), async (req, res) => {
  const m = await Member.findById(req.params.id).lean(); if (!m) notFound('Member');
  if (req.user.role === 'coordinator' && !(await branchFamily(req.user.branchId)).includes(m.branchId)) forbidden('You can only manage members of your own branch and its sub-branches.');
  const n = await Registration.countDocuments({ memberId: m._id });
  if (n && !isMgmt(req.user) && !(await Registration.exists({ memberId: m._id, status: { $in: ['Submitted', 'Approved', 'Checked In'] } })))
    fail(`${m.name} has ${n} past visit record(s). Only the Super Admin or Sewadar Manager can delete a member together with their history.`);
  await deleteMember(req.user, m._id);
  res.json({ ok: true });
});

/* ---------- branches ---------- */
const normName = s => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
async function saveBranch(req, id) {
  const u = req.user, v = body(req, ['name', 'state', 'district', 'coordinator', 'phone', 'parentId', 'address', 'email', 'phones']);
  v.name = v.name.replace(/\s+/g, ' ');
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
    if (b && (await branchFamily(b._id)).includes(p._id)) fail('A branch cannot be placed under itself or one of its own sub-branches.');
    v.state = p.state; // a sub-branch is always in its parent's state
  }
  check(v, [['name', 'Branch name', 'req'], ['state', 'State', 'req'], ['district', 'District', 'req'], ['coordinator', 'Coordinator name', 'req'], ['phone', 'Coordinator mobile', 'req tel']]);
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
