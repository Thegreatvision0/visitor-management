/* Registrations (visits): pre-registration, walk-in, approval, reception, extensions, beds and sewa duties. */
import { Router } from 'express';
import { Registration, Member, Branch, Department } from '../models/index.js';
import { need, isMgmt, canEdit } from '../middleware/auth.js';
import { nid, log, hist, fail, forbidden, getRoles } from '../lib/core.js';
import { body, check, oneOf, isDate, isDateTime } from '../lib/validate.js';
import * as D from '../services/domain.js';
import { today, nowLocal, fd } from '../../../shared/dates.js';
import { TYPES, stayEnd, pendingExt, stayTypeFor } from '../../../shared/constants.js';
import { notify } from '../services/notify.js';

const r = Router();

/** Loads :id into req.reg and checks the user's branch / department scope. */
const loadReg = async (req, res, next) => { req.reg = await D.getReg(req.params.id); await D.assertRegScope(req.user, req.reg); next(); };
const ok = res => res.json({ ok: true });

/* ---------- create / edit (pre-registration and walk-in) ---------- */
async function saveReg(req, id) {
  const u = req.user, v = body(req, ['memberId', 'branchId', 'arrival', 'departure', 'type', 'prefDept', 'purpose', 'mode']);
  const walk = v.mode === 'walkin', submit = v.mode === 'submit';
  if (walk ? !canEdit(u, 'reception') : !canEdit(u, 'prereg')) forbidden('Your role does not allow this action.');
  const ex = id ? await D.getReg(id) : null;
  if (ex) { await D.assertRegScope(u, ex); if (ex.status !== 'Draft') fail('Only a draft can be edited.'); v.memberId = ex.memberId; }
  const isC = u.role === 'coordinator';
  const m = v.memberId && await Member.findById(v.memberId).lean();
  if (!m) fail('Select an existing member from the list, or create a new member first.');
  const fam = isC ? await D.branchFamily(u.branchId) : null;
  if (isC && !fam.includes(m.branchId)) fail('You can only register members of your own branch and its sub-branches.');
  const branchId = isC ? (fam.includes(v.branchId) ? v.branchId : m.branchId) : v.branchId;
  check({ ...v, branchId }, [['branchId', 'Registering branch', 'req'], ['arrival', 'Arrival date', 'req'], ['departure', 'Expected departure date', 'req'], ['purpose', 'Purpose of visit', 'req']]);
  isDate(v.arrival, 'Arrival date'); isDate(v.departure, 'Expected departure date');
  if (v.arrival && v.departure && v.departure >= v.arrival) v.type = stayTypeFor(v.arrival, v.departure); // type always follows the number of days
  if (!(await Branch.exists({ _id: branchId }))) fail('Select a valid branch.');
  if (v.prefDept && !(await Department.exists({ _id: v.prefDept }))) fail('Select a valid department.');
  if (v.departure < v.arrival) fail('Departure date cannot be before arrival.');
  if (submit || walk) { const c = await D.memberClash(m._id, v.arrival, v.departure, id); if (c) fail(`${m.name} already has request ${c._id} (${c.status}) overlapping these dates.`); }
  const auto = walk && isMgmt(u);
  const roles = await getRoles();
  const reg = ex || new Registration({ _id: await nid('reg'), memberId: m._id, history: [], exts: [], remarks: '', createdOn: today(), createdBy: roles[u.role].label });
  Object.assign(reg, { branchId, arrival: v.arrival, departure: v.departure, type: v.type, prefDept: v.prefDept, purpose: v.purpose, source: walk ? 'Walk-in' : 'Pre-registration' });
  if (auto) {
    Object.assign(reg, { status: 'Approved', approvedFrom: v.arrival, approvedTo: v.departure, approvedType: v.type, approvedDept: v.prefDept, approvedBy: u.name });
    hist(u, reg, 'Walk-in registered and approved by management');
  } else {
    reg.status = submit || walk ? 'Submitted' : 'Draft';
    if (reg.status === 'Submitted') reg.submittedOn = nowLocal();
    hist(u, reg, walk ? 'Walk-in registered at reception — sent for approval' : submit ? 'Submitted for approval' : (ex ? 'Draft updated' : 'Draft created'));
  }
  await reg.save();
  await log(u, `${reg._id} ${reg.status} (${m.name})`);
  if (reg.status === 'Submitted') await notifyApprovers(u, reg, m.name, walk ? 'Walk-in' : 'New request');
  if (auto) await notify(u, { text: `Walk-in ${m.name} (${reg._id}) approved — expected ${fd(reg.arrival)}`, page: 'reception', level: 'e', regId: reg._id, branchId: reg.branchId });
  return { id: reg._id, status: reg.status, type: reg.type };
}
/** Tell everyone who can approve that a request is waiting. */
async function notifyApprovers(u, g, name, what) {
  const b = await Branch.findById(g.branchId).lean();
  await notify(u, { text: `${what} ${g._id} — ${name} (${b ? b.name : '?'}), ${fd(g.arrival)} – ${fd(g.departure)}, awaiting approval`, page: 'approvals', level: 'e', regId: g._id, branchId: g.branchId });
}
/** Tell the coordinators of the request's branch about a decision. */
const notifyBranch = (u, g, text) => notify(u, { text, page: 'prereg', roles: ['coordinator'], regId: g._id, branchId: g.branchId });
r.post('/', async (req, res) => res.json(await saveReg(req, null)));
r.put('/:id', async (req, res) => res.json(await saveReg(req, req.params.id)));

/* ---------- pre-registration status changes ---------- */
r.post('/:id/submit', need('prereg'), loadReg, async (req, res) => {
  const g = req.reg; if (g.status !== 'Draft') fail('Only a draft can be submitted.');
  const c = await D.memberClash(g.memberId, g.arrival, g.departure, g._id);
  if (c) fail(`Overlaps with ${c._id} (${c.status}) for this member.`);
  g.type = stayTypeFor(g.arrival, g.departure);
  g.status = 'Submitted'; g.submittedOn = nowLocal(); hist(req.user, g, 'Submitted for approval'); await g.save(); await log(req.user, `${g._id} submitted`);
  await notifyApprovers(req.user, g, await D.memberName(g.memberId), 'New request'); ok(res);
});
r.post('/:id/withdraw', need('prereg'), loadReg, async (req, res) => {
  const g = req.reg; if (g.status !== 'Submitted') fail('Only a submitted request can be withdrawn.');
  g.status = 'Draft'; hist(req.user, g, 'Withdrawn back to draft for correction'); await g.save(); await log(req.user, g._id + ' withdrawn'); ok(res);
});
r.post('/:id/reopen', need('prereg'), loadReg, async (req, res) => {
  const g = req.reg; if (!['Rejected', 'Cancelled'].includes(g.status)) fail('Only a rejected or cancelled request can be re-opened.');
  g.status = 'Draft'; hist(req.user, g, 'Re-opened as draft for correction'); await g.save(); ok(res);
});
r.post('/:id/cancel', need('prereg'), loadReg, async (req, res) => { await D.cancelReg(req.user, req.reg._id, body(req, ['why']).why); ok(res); });
r.delete('/:id', need('prereg'), loadReg, async (req, res) => {
  if (!['Draft', 'Rejected', 'Cancelled'].includes(req.reg.status) && !isMgmt(req.user)) fail('Only the Super Admin or Sewadar Manager can delete a processed request.');
  await D.deleteReg(req.user, req.reg._id); ok(res);
});
r.post('/:id/extension-request', need(['prereg', 'longterm']), loadReg, async (req, res) => {
  const g = req.reg, v = body(req, ['to', 'reason']);
  check(v, [['to', 'New end date', 'req'], ['reason', 'Reason', 'req']]); isDate(v.to, 'New end date');
  if (!['Approved', 'Checked In'].includes(g.status)) fail('Extensions can be requested only for an approved or current stay.');
  if (pendingExt(g)) fail('An extension request is already pending.');
  if (v.to <= stayEnd(g)) fail('New end date must be after the current end date.');
  const roles = await getRoles();
  g.exts.push({ to: v.to, reason: v.reason, status: 'Pending', by: roles[req.user.role].label, byName: req.user.name, on: nowLocal() });
  hist(req.user, g, `Extension requested to ${fd(v.to)} — ${v.reason}`); await g.save();
  const name = await D.memberName(g.memberId), b = await Branch.findById(g.branchId).lean();
  await log(req.user, `Extension requested: ${name}`);
  await notify(req.user, { text: `Extension request: ${name} (${b ? b.name : '?'}) to ${fd(v.to)} — by ${req.user.name}`, page: 'approvals', level: 'e', regId: g._id, branchId: g.branchId });
  ok(res);
});

/* ---------- approvals ---------- */
r.post('/:id/approve', need('approvals'), loadReg, async (req, res) => {
  const g = req.reg, v = body(req, ['from', 'to', 'type', 'dept', 'remarks']);
  if (g.status !== 'Submitted') fail('Only a pending request can be approved.');
  check(v, [['from', 'Approved stay from', 'req'], ['to', 'Approved stay to', 'req']]);
  isDate(v.from, 'Approved stay from'); isDate(v.to, 'Approved stay to');
  if (v.to < v.from) fail('Stay end cannot be before start.');
  v.type = stayTypeFor(v.from, v.to); // type always follows the number of days
  const c = await D.memberClash(g.memberId, v.from, v.to, g._id);
  if (c) fail(`${await D.memberName(g.memberId)} has another live request (${c._id}) overlapping these dates.`);
  const dp = v.dept ? await Department.findById(v.dept).lean() : null;
  if (v.dept && !dp) fail('Select a valid department.');
  Object.assign(g, { status: 'Approved', approvedFrom: v.from, approvedTo: v.to, approvedType: v.type, approvedDept: v.dept, approvedBy: req.user.name, remarks: v.remarks });
  hist(req.user, g, `Approved (${fd(v.from)} – ${fd(v.to)}, ${v.type}, ${dp ? dp.name : 'no dept'}) — forwarded to reception${v.remarks ? '. ' + v.remarks : ''}`);
  await g.save(); await log(req.user, `${g._id} Approved`);
  const name = await D.memberName(g.memberId);
  await notifyBranch(req.user, g, `Approved: ${g._id} — ${name}, ${fd(v.from)} – ${fd(v.to)} (${v.type})`);
  await notify(req.user, { text: `${name} (${g._id}) approved — expected ${fd(v.from)}`, page: 'reception', level: 'e', regId: g._id, branchId: g.branchId });
  ok(res);
});
r.post('/:id/reject', need('approvals'), loadReg, async (req, res) => {
  const g = req.reg, v = body(req, ['remarks']);
  if (g.status !== 'Submitted') fail('Only a pending request can be rejected.');
  if (!v.remarks) fail('Remarks are required when rejecting a request.');
  g.status = 'Rejected'; g.remarks = v.remarks; hist(req.user, g, 'Rejected — ' + v.remarks); await g.save();
  await log(req.user, `${g._id} Rejected`);
  await notifyBranch(req.user, g, `Rejected: ${g._id} — ${await D.memberName(g.memberId)}. Remarks: ${v.remarks}`);
  ok(res);
});
r.post('/:id/revert', need('approvals'), loadReg, async (req, res) => {
  await D.revertApproval(req.user, req.reg._id);
  await Registration.updateOne({ _id: req.reg._id }, { submittedOn: nowLocal() }); ok(res);
});
r.post('/:id/reconsider', need('approvals'), loadReg, async (req, res) => {
  const g = req.reg; if (g.status !== 'Rejected') fail('Only a rejected request can be reconsidered.');
  g.status = 'Submitted'; g.submittedOn = nowLocal(); hist(req.user, g, 'Rejection reconsidered — back to pending'); await g.save(); await log(req.user, g._id + ' reconsidered'); ok(res);
});
r.post('/:id/extension-decision', need('approvals'), loadReg, async (req, res) => {
  const approve = !!(req.body || {}).approve;
  const e = pendingExt(req.reg); if (!e) fail('There is no pending extension request.');
  if (approve) await D.extendStay(req.user, req.reg._id, e.to, e.reason);
  const g = await D.getReg(req.reg._id), pe = pendingExt(g); // reload: extendStay saved the document
  pe.status = approve ? 'Approved' : 'Rejected'; pe.decidedBy = req.user.name;
  if (!approve) hist(req.user, g, 'Extension request rejected');
  const name = await D.memberName(g.memberId);
  await g.save(); await log(req.user, `Extension ${pe.status}: ${name}`);
  await notifyBranch(req.user, g, `Extension ${pe.status.toLowerCase()}: ${name} (${g._id})${approve ? ' — now until ' + fd(pe.to) : ''}`);
  ok(res);
});

/* ---------- reception ---------- */
r.post('/:id/checkin', need('reception'), loadReg, async (req, res) => { const { dt } = body(req, ['dt']); isDateTime(dt, 'Date & time'); await D.checkIn(req.user, req.reg._id, dt); ok(res); });
r.post('/:id/checkout', need('reception'), loadReg, async (req, res) => { const { dt } = body(req, ['dt']); isDateTime(dt, 'Date & time'); await D.checkOut(req.user, req.reg._id, dt); ok(res); });
r.post('/:id/undo-checkin', need('reception'), loadReg, async (req, res) => { await D.undoCheckIn(req.user, req.reg._id); ok(res); });
r.post('/:id/undo-checkout', need('reception'), loadReg, async (req, res) => { await D.undoCheckOut(req.user, req.reg._id); ok(res); });

/* ---------- accommodation ---------- */
/* direct extension (no request needed): accommodation managers and approvers, e.g. for an overdue stay */
r.post('/:id/extend', need(['accommodation', 'approvals']), loadReg, async (req, res) => {
  const v = body(req, ['to', 'note']); check(v, [['to', 'New end date', 'req'], ['note', 'Reason', 'req']]); isDate(v.to, 'New end date');
  await D.extendStay(req.user, req.reg._id, v.to, v.note); ok(res);
});
r.post('/:id/bed', need('accommodation'), loadReg, async (req, res) => {
  const v = body(req, ['bedId', 'from', 'to']); isDate(v.from, 'Bed from'); isDate(v.to, 'Bed until');
  await D.allocate(req.user, req.reg._id, v.bedId, v.from, v.to, 'Allocation'); ok(res);
});
r.post('/:id/bed/transfer', need('accommodation'), loadReg, async (req, res) => {
  const v = body(req, ['bedId', 'date']); isDate(v.date, 'Move on'); await D.transferBed(req.user, req.reg._id, v.bedId, v.date); ok(res);
});
r.post('/:id/bed/release', need('accommodation'), loadReg, async (req, res) => { await D.releaseBed(req.user, req.reg._id); ok(res); });

/* ---------- sewa duties ---------- */
r.post('/:id/duty', need('departments'), loadReg, async (req, res) => {
  const v = body(req, ['deptId', 'shift', 'supervisor', 'from', 'to']); isDate(v.from, 'Duty start'); isDate(v.to, 'Duty end');
  await D.giveDuty(req.user, req.reg._id, v, !!(req.body || {}).replace); ok(res);
});
r.post('/:id/duty/end', need('departments'), loadReg, async (req, res) => { await D.endDuty(req.user, req.reg._id); ok(res); });
/** Extend the active sewa duty; when the new date is past the approved stay, the stay is extended too (needs that permission). */
r.post('/:id/duty/extend', need('departments'), loadReg, async (req, res) => {
  const v = body(req, ['to', 'note']); check(v, [['to', 'New end date', 'req']]); isDate(v.to, 'New end date');
  const du = await D.activeDuty(req.reg._id); if (!du) fail('This member has no active sewa duty.');
  if (!D.canDept(req.user, du.deptId)) forbidden('This duty is in another department.');
  if (v.to <= du.to) fail(`New end date must be after the current duty end (${fd(du.to)}).`);
  if (v.to > stayEnd(req.reg)) {
    if (!canEdit(req.user, 'accommodation') && !canEdit(req.user, 'approvals')) fail(`The approved stay ends ${fd(stayEnd(req.reg))}. Ask the Sewadar Manager to extend the stay first.`);
    await D.extendStay(req.user, req.reg._id, v.to, v.note || 'Sewa extended');
  }
  const d = await D.activeDuty(req.reg._id), g = await D.getReg(req.reg._id), old = d.to;
  if (d.to < v.to) { d.to = v.to; await d.save(); }
  hist(req.user, g, `Sewa extended: ${fd(old)} → ${fd(v.to)}${v.note ? ' — ' + v.note : ''}`); await g.save();
  await log(req.user, `Sewa extended: ${await D.memberName(g.memberId)} → ${fd(v.to)}`); ok(res);
});

export default r;
