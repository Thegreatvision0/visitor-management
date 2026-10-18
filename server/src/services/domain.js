/* Business rules — ported from the prototype's domain helpers, now enforced on the server. */
import { Registration, Allocation, Duty, Bed, Room, Building, Site, Member, Branch, Department, User, Attendance, Settings } from '../models/index.js';
import { fail, notFound, forbidden, hist, log, nid } from '../lib/core.js';
import { today, nowLocal, fd, fdt, dayOf, addDays, overlaps } from '../../../shared/dates.js';
import { stayStart, stayEnd, LIVE, stayTypeFor } from '../../../shared/constants.js';
import { canEdit } from '../middleware/auth.js';
import { notify, branchFamily } from './notify.js';
export { branchFamily };

/* ---------- lookups ---------- */
export async function getReg(id) { const r = await Registration.findById(id); if (!r) notFound('Request'); return r; }
/** Who holds an allocation: the member, or 'guest <name>' for a guest visit's residence. */
export const holderName = async a => a.guestName ? 'guest ' + a.guestName : memberName(a.memberId);
export async function memberName(id) { const m = await Member.findById(id, { name: 1 }).lean(); return m ? m.name : '?'; }
export async function bedShort(bedId) {
  const b = await Bed.findById(bedId).lean(); if (!b) return 'Removed bed';
  const rm = await Room.findById(b.roomId).lean(), bl = rm && await Building.findById(rm.buildingId).lean();
  return `${bl ? bl.name : '?'} · ${rm ? rm.name : '?'} · Bed ${b.label}`;
}
export async function bedPath(bedId) {
  const b = await Bed.findById(bedId).lean(); if (!b) return 'Removed bed';
  const rm = await Room.findById(b.roomId).lean(), bl = await Building.findById(rm.buildingId).lean(), st = await Site.findById(bl.siteId).lean();
  return `${st.name} › ${bl.name} › ${rm.floor} Floor › ${rm.name} › Bed ${b.label}`;
}
export const activeAlloc = regId => Allocation.findOne({ regId, active: true });
export const activeDuty = regId => Duty.findOne({ regId, status: 'Active' });
async function deptName(id) { const d = await Department.findById(id).lean(); if (d) return d.name; const s = await Settings.findById('app').lean(); return (s && s.tomb && s.tomb[id]) ? s.tomb[id] + ' (removed)' : '?'; }

/* ---------- data scoping: coordinators see only their branch, supervisors only their department ---------- */
export async function scopeRegIds(user) {
  if (user.role === 'coordinator') return (await Registration.find({ branchId: { $in: await branchFamily(user.branchId) } }, { _id: 1 }).lean()).map(r => r._id);
  if (user.role === 'supervisor') return [...new Set((await Duty.find({ deptId: user.deptId }, { regId: 1 }).lean()).map(d => d.regId))];
  return null; // null = everything
}
export async function assertRegScope(user, r) {
  if (user.role === 'coordinator' && !(await branchFamily(user.branchId)).includes(r.branchId)) forbidden('This request belongs to another branch.');
  if (user.role === 'supervisor' && !(await Duty.exists({ regId: r._id, deptId: user.deptId }))) forbidden('This member is not in your department.');
}
export const canDept = (user, deptId) => canEdit(user, 'departments') && (user.role !== 'supervisor' || user.deptId === deptId);

/* ---------- guards ---------- */
/** Active allocations of the same bed with intersecting dates. */
export const conflicts = (bedId, from, to, ignore) =>
  Allocation.find({ active: true, bedId, _id: { $ne: ignore || null }, from: { $lte: to }, to: { $gte: from } }).lean();
/** A member may not have two overlapping live requests. */
export async function memberClash(memberId, from, to, ignore) {
  const rs = await Registration.find({ memberId, _id: { $ne: ignore || null }, status: { $in: LIVE } }).lean();
  return rs.find(r => overlaps(stayStart(r), stayEnd(r), from, to));
}

/* ---------- beds ---------- */
/** Allocate a bed to an approved / checked-in stay. */
export async function allocate(user, regId, bedId, from, to, reason) {
  const r = await getReg(regId), b = await Bed.findById(bedId);
  if (!['Approved', 'Checked In'].includes(r.status)) fail('Only approved members can be allocated accommodation.');
  if (await activeAlloc(regId)) fail('This stay already has a bed. Use Transfer instead.');
  if (!b) fail('Select a bed.');
  if (!from || !to || to < from) fail('Check the allocation dates.');
  if (to > stayEnd(r)) fail(`Allocation cannot run past the approved stay end (${fd(stayEnd(r))}). Extend the stay first.`);
  const minStart = r.actualIn && dayOf(r.actualIn) < stayStart(r) ? dayOf(r.actualIn) : stayStart(r);
  if (from < minStart) fail(`Allocation cannot start before the stay start (${fd(stayStart(r))}).`);
  if (b.cleaning) fail('This bed is marked for cleaning. Mark it cleaned first.');
  const c = await conflicts(bedId, from, to);
  if (c.length) fail(`Bed already allocated to ${await holderName(c[0])} (${fd(c[0].from)} – ${fd(c[0].to)}).`);
  await Allocation.create({ _id: await nid('al'), regId, memberId: r.memberId, bedId, from, to, active: true, reason: reason || 'Allocation', createdOn: nowLocal(), by: user.name });
  const bs = await bedShort(bedId);
  hist(user, r, `Bed allocated: ${bs} (${fd(from)} – ${fd(to)})`); await r.save();
  await log(user, `Bed ${bs} allocated to ${await memberName(r.memberId)}`);
}

/** Move a resident to another bed from `date`; the old allocation is kept as history. */
export async function transferBed(user, regId, newBedId, date) {
  const r = await getReg(regId), old = await activeAlloc(regId), nb = await Bed.findById(newBedId);
  if (!old) fail('No current bed to transfer from.');
  if (!nb) fail('Select the new bed.');
  if (nb._id === old.bedId) fail('Choose a different bed.');
  if (!date || date < old.from || date > old.to) fail(`Transfer date must be within ${fd(old.from)} – ${fd(old.to)}.`);
  if (nb.cleaning) fail('The new bed is marked for cleaning.');
  const c = await conflicts(newBedId, date, old.to);
  if (c.length) fail(`New bed is already allocated to ${await holderName(c[0])} (${fd(c[0].from)} – ${fd(c[0].to)}).`);
  const origTo = old.to, oldShort = await bedShort(old.bedId);
  Object.assign(old, { active: false, endedOn: date, endReason: 'Transferred', to: date }); await old.save();
  if (r.status === 'Checked In' && old.from <= today()) await Bed.updateOne({ _id: old.bedId }, { cleaning: true });
  await Allocation.create({ _id: await nid('al'), regId, memberId: r.memberId, bedId: newBedId, from: date, to: origTo, active: true, reason: 'Transfer', createdOn: nowLocal(), by: user.name });
  const ns = await bedShort(newBedId);
  hist(user, r, `Bed transfer: ${oldShort} → ${ns} from ${fd(date)}`); await r.save();
  await log(user, `Transfer ${await memberName(r.memberId)} to ${ns}`);
}

/** Release a reserved bed, or unassign the bed of a checked-in member. */
export async function releaseBed(user, regId) {
  const r = await getReg(regId), a = await activeAlloc(regId);
  if (!a) fail('This member has no bed assigned.');
  const inn = r.status === 'Checked In', txt = await bedShort(a.bedId);
  Object.assign(a, { active: false, endedOn: today(), endReason: inn ? 'Bed unassigned' : 'Reservation released' }); await a.save();
  hist(user, r, inn ? `Bed unassigned: ${txt}` : 'Bed reservation released'); await r.save();
  await log(user, `${inn ? 'Bed unassigned' : 'Reservation released'}: ${await memberName(r.memberId)}`);
}

/* ---------- stays ---------- */
/** Extend a stay; also stretches the active bed allocation if the bed stays free. */
export async function extendStay(user, regId, newTo, note) {
  const r = await getReg(regId), end = stayEnd(r), al = await activeAlloc(regId);
  if (!newTo || newTo <= end) fail(`New end date must be after the current end (${fd(end)}).`);
  if (al) {
    const c = await conflicts(al.bedId, al.from, newTo, al._id);
    if (c.length) fail(`The bed is reserved by ${await holderName(c[0])} from ${fd(c[0].from)}. Transfer this member to another bed first or choose an earlier date.`);
  }
  r.approvedTo = newTo; r.departure = newTo;
  if (r.approvedFrom) r.approvedType = stayTypeFor(stayStart(r), newTo); else r.type = stayTypeFor(r.arrival, newTo);
  if (al) { al.to = newTo; await al.save(); }
  await Duty.updateMany({ regId, status: 'Active', to: end }, { to: newTo });
  hist(user, r, `Stay extended to ${fd(newTo)}${note ? ' — ' + note : ''}`); await r.save();
  await log(user, `Stay extended: ${await memberName(r.memberId)} → ${fd(newTo)}`);
}

export async function checkIn(user, regId, dt) {
  const r = await getReg(regId);
  if (r.status !== 'Approved') fail('Only approved members can be checked in.');
  if (!dt) fail('Enter the arrival date and time.');
  r.status = 'Checked In'; r.actualIn = dt;
  hist(user, r, `Arrival confirmed at reception (${fdt(dt)})`); await r.save();
  const name = await memberName(r.memberId);
  await log(user, `Check-in: ${name}`);
  if (!(await activeAlloc(regId))) await notify(user, { text: `${name} has arrived and needs a bed`, page: 'accommodation', level: 'e', regId, branchId: r.branchId });
  if (!(await activeDuty(regId))) await notify(user, { text: `${name} has arrived — assign a sewa department`, page: 'departments', level: 'e', roles: ['superadmin', 'manager'], regId, branchId: r.branchId });
}

export async function checkOut(user, regId, dt) {
  const r = await getReg(regId);
  if (r.status !== 'Checked In') fail('This member is not checked in.');
  if (!dt || dt < r.actualIn) fail('Departure cannot be before arrival.');
  const d = dayOf(dt), al = await activeAlloc(regId), du = await activeDuty(regId);
  const bed = al && await Bed.findById(al.bedId);
  r.status = 'Checked Out'; r.actualOut = dt;
  r.undo = { allocId: al ? al._id : null, bedWasCleaning: bed ? !!bed.cleaning : false, dutyId: du ? du._id : null, dutyTo: du ? du.to : null };
  if (al) { Object.assign(al, { active: false, endedOn: d, endReason: 'Checked out' }); await al.save(); if (bed) { bed.cleaning = true; await bed.save(); } }
  if (du) { du.status = 'Ended'; du.endedOn = d; if (du.to > d) du.to = d; await du.save(); }
  hist(user, r, `Checked out (${fdt(dt)})${al ? ' — bed marked for cleaning' : ''}`); await r.save();
  const name = await memberName(r.memberId);
  await log(user, `Check-out: ${name}`);
  if (al) await notify(user, { text: `${name} checked out — ${await bedShort(al.bedId)} needs cleaning`, page: 'accommodation', level: 'e', regId, branchId: r.branchId });
  await notify(user, { text: `${name} (${r._id}) has checked out`, page: 'prereg', roles: ['coordinator'], regId, branchId: r.branchId });
}

/** Undo a wrongly recorded arrival (only while the member is still checked in). */
export async function undoCheckIn(user, regId) {
  const r = await getReg(regId);
  if (r.status !== 'Checked In') fail('This member is not checked in.');
  r.status = 'Approved'; r.actualIn = undefined;
  hist(user, r, 'Check-in undone — back to approved / expected'); await r.save();
  await log(user, `Check-in undone: ${await memberName(r.memberId)}`);
}

/** Undo a wrongly recorded departure: bed and sewa are restored where still possible. */
export async function undoCheckOut(user, regId) {
  const r = await getReg(regId);
  if (r.status !== 'Checked Out') fail('This visit is not checked out.');
  const u = r.undo || {}, notes = [];
  const al = u.allocId ? await Allocation.findById(u.allocId) : (await Allocation.find({ regId, endReason: 'Checked out' })).pop();
  if (al && !al.active && al.endReason === 'Checked out') {
    const bed = await Bed.findById(al.bedId);
    if (bed && !(await conflicts(al.bedId, al.from, al.to, al._id)).length) {
      al.active = true; al.endedOn = undefined; al.endReason = undefined; await al.save();
      if (!u.bedWasCleaning) { bed.cleaning = false; await bed.save(); }
      notes.push('bed restored');
    } else notes.push('bed could not be restored — assign a bed again');
  }
  const du = u.dutyId ? await Duty.findById(u.dutyId) : null;
  if (du && du.status === 'Ended') { du.status = 'Active'; du.endedOn = undefined; if (u.dutyTo) du.to = u.dutyTo; await du.save(); notes.push('sewa restored'); }
  r.status = 'Checked In'; r.actualOut = undefined; r.undo = undefined;
  hist(user, r, `Check-out undone${notes.length ? ' (' + notes.join(', ') + ')' : ''}`); await r.save();
  await log(user, `Check-out undone: ${await memberName(r.memberId)}`);
}

async function releaseFor(regId, reason) {
  const al = await activeAlloc(regId);
  if (al) { Object.assign(al, { active: false, endedOn: today(), endReason: reason }); await al.save(); }
  const du = await activeDuty(regId);
  if (du) { du.status = 'Ended'; du.endedOn = today(); await du.save(); }
}
/** Cancel a request that has not arrived yet; any reserved bed / planned sewa is released. */
export async function cancelReg(user, regId, why) {
  const r = await getReg(regId);
  if (!['Submitted', 'Approved'].includes(r.status)) fail('Only a request that has not arrived can be cancelled.');
  await releaseFor(regId, 'Request cancelled');
  r.status = 'Cancelled'; hist(user, r, 'Request cancelled' + (why ? ' — ' + why : '')); await r.save();
  await log(user, `${r._id} cancelled`);
}
/** Send an approved (not yet arrived) request back to pending. */
export async function revertApproval(user, regId) {
  const r = await getReg(regId);
  if (r.status !== 'Approved') fail('Only an approved request that has not arrived can be sent back.');
  await releaseFor(regId, 'Approval reverted');
  r.status = 'Submitted';
  ['approvedFrom', 'approvedTo', 'approvedType', 'approvedDept', 'approvedBy'].forEach(k => { r[k] = undefined; });
  hist(user, r, 'Approval reverted — back to pending'); await r.save();
  await log(user, `${r._id} approval reverted`);
}

/* ---------- deletes ---------- */
/** Permanently remove a request with its bed, sewa and attendance records (not allowed while checked in). */
export async function deleteReg(user, regId, quiet) {
  const r = await getReg(regId);
  if (r.status === 'Checked In') fail('This member is checked in. Check out (or undo the check-in) first.');
  await Promise.all([Allocation.deleteMany({ regId }), Duty.deleteMany({ regId }), Attendance.deleteMany({ regId }), Registration.deleteOne({ _id: regId })]);
  if (!quiet) await log(user, `Deleted request ${regId}`);
}
/** Permanently remove a member and all of their history (blocked while they have a live request). */
export async function deleteMember(user, id) {
  const m = await Member.findById(id); if (!m) notFound('Member');
  const live = await Registration.findOne({ memberId: id, status: { $in: LIVE } });
  if (live) fail(`${m.name} has a live request (${live._id}, ${live.status}). Reject or cancel it, or check the member out, first.`);
  for (const r of await Registration.find({ memberId: id }, { _id: 1 })) await deleteReg(user, r._id, true);
  await Member.deleteOne({ _id: id });
  await log(user, `Deleted member ${id} (${m.name})`);
}
/** Delete a branch; its members, requests and coordinator users are moved to another branch first. */
export async function deleteBranch(user, id, moveTo) {
  const b = await Branch.findById(id); if (!b) notFound('Branch');
  const subs = await Branch.countDocuments({ parentId: id });
  if (subs) fail(`${b.name} has ${subs} sub-branch(es). Delete or move those first.`);
  const n =(await Member.countDocuments({ branchId: id })) + (await Registration.countDocuments({ branchId: id }));
  if (n && !moveTo) fail('Choose a branch to move its members and requests to.');
  if (moveTo && (moveTo === id || !(await Branch.exists({ _id: moveTo })))) fail('Choose a different, valid branch.');
  if (moveTo) { await Member.updateMany({ branchId: id }, { branchId: moveTo }); await Registration.updateMany({ branchId: id }, { branchId: moveTo }); }
  await User.updateMany({ branchId: id }, { branchId: moveTo || '' });
  await Branch.deleteOne({ _id: id });
  await log(user, `Deleted branch ${b.name}`);
}
/** Delete a department (blocked while sewadar are assigned). Past duties keep its name via a tombstone. */
export async function deleteDept(user, id) {
  const d = await Department.findById(id); if (!d) notFound('Department');
  const act = await Duty.countDocuments({ deptId: id, status: 'Active' });
  if (act) fail(`${act} sewadar are assigned to ${d.name}. Change or end those duties first.`);
  await Settings.updateOne({ _id: 'app' }, { $set: { ['tomb.' + id]: d.name } });
  await Registration.updateMany({ prefDept: id }, { prefDept: '' });
  await Registration.updateMany({ approvedDept: id }, { approvedDept: '' });
  await User.updateMany({ deptId: id }, { deptId: '' });
  await Department.deleteOne({ _id: id });
  await log(user, `Deleted department ${d.name}`);
}

/* ---------- sewa duties ---------- */
export async function giveDuty(user, regId, o, replace) {
  const r = await getReg(regId);
  if (!['Approved', 'Checked In'].includes(r.status)) fail('Only approved members can be assigned sewa.');
  if (!o.deptId || !o.shift || !o.from || !o.to) fail('Fill in all duty fields.');
  if (!canDept(user, o.deptId)) forbidden('You can only assign sewa in your own department.');
  if (o.to < o.from) fail('Duty end cannot be before start.');
  if (o.to > stayEnd(r)) fail(`Duty cannot run past the approved stay end (${fd(stayEnd(r))}).`);
  const dp = await Department.findById(o.deptId); if (!dp) fail('Select a department.');
  const cur = await activeDuty(regId);
  if (cur && !replace) fail('This member already has an active duty. Use Change instead.');
  if (cur) {
    if (!canDept(user, cur.deptId)) forbidden('The current duty is in another department.');
    const dayBefore = addDays(o.from, -1);
    cur.status = 'Ended'; cur.endedOn = o.from; cur.to = dayBefore < cur.from ? cur.from : (dayBefore < cur.to ? dayBefore : cur.to);
    await cur.save();
  }
  await Duty.create({ _id: await nid('du'), regId, memberId: r.memberId, deptId: o.deptId, shift: o.shift, supervisor: o.supervisor || dp.supervisor || '', from: o.from, to: o.to, status: 'Active', createdOn: nowLocal(), by: user.name });
  hist(user, r, `${replace ? 'Duty changed' : 'Duty assigned'}: ${dp.name}, ${o.shift} shift`); await r.save();
  const name = await memberName(r.memberId);
  await log(user, `${replace ? 'Duty change' : 'Duty assign'}: ${name} → ${dp.name}`);
  await notify(user, { text: `${name} assigned to ${dp.name} (${o.shift} shift, ${fd(o.from)} – ${fd(o.to)})`, page: 'departments', roles: ['supervisor'], regId, deptId: dp._id });
}
export async function endDuty(user, regId) {
  const r = await getReg(regId), du = await activeDuty(regId);
  if (!du) fail('This member has no active duty.');
  if (!canDept(user, du.deptId)) forbidden('This duty is in another department.');
  du.status = 'Ended'; du.endedOn = today(); if (du.to > today()) du.to = today(); await du.save();
  hist(user, r, 'Duty ended: ' + await deptName(du.deptId)); await r.save();
}
/** The duty that covers `date` for a stay (the active one wins). */
export async function dutyOn(regId, date) {
  const l = await Duty.find({ regId, from: { $lte: date }, to: { $gte: date } }).lean();
  return l.find(d => d.status === 'Active') || l[0];
}
export const onSite = (r, date) => r.actualIn && dayOf(r.actualIn) <= date && (!r.actualOut || dayOf(r.actualOut) >= date);
