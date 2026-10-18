/* Guest visits: rules and notifications.
   Flow: Invited (host shares link) → Submitted (guest registered) → Accepted / Declined (department in-charge)
   → host finalises parking, office, golf car, residence → Awaiting office (Main Office approval, when needed)
   → Confirmed (beds reserved) → Arrived (security records entry) → Completed (exit). Cancelled at any point before arrival.
   Who may act is decided by guest visit permissions (role defaults + per-user extras, see shared/constants.js). */
import crypto from 'node:crypto';
import { GuestVisit, Department, Room, Bed, Allocation } from '../models/index.js';
import { fail, forbidden, notFound, nid } from '../lib/core.js';
import { notify } from './notify.js';
import { fd, nowLocal, today, overlaps } from '../../../shared/dates.js';
import { timeAdd } from '../../../shared/constants.js';

export const newToken = () => crypto.randomBytes(18).toString('base64url');
export const isMgmt = u => ['superadmin', 'manager'].includes(u.role);
export const has = (u, cap) => (u.vcaps || []).includes(cap);
/* the in-charge of the visited department decides; a typed department that is not in the list
   has no in-charge in the system → the host decides. Management may decide for any department. */
export const canIncharge = (u, v) => isMgmt(u) || (has(u, 'incharge') && !!v.deptId && u.deptId === v.deptId) || (!v.deptId && v.hostId === u.id);
export const canHost = (u, v) => isMgmt(u) || v.hostId === u.id;
export const canOffice = u => has(u, 'office');
export const canGate = u => has(u, 'gate');

export async function getVisit(id) { const v = await GuestVisit.findById(id); if (!v) notFound('Guest visit'); return v; }
export const vhist = (v, by, text) => v.history.push({ at: nowLocal(), by, text });
export const deptName = async id => ((await Department.findById(id).lean()) || {}).name || '—';
/** Department label of a visit: the matched department, else the name as typed. */
export const deptLabel = async v => v.deptId ? deptName(v.deptId) : (v.deptName || '—');
/** Match a typed department name (or an id) to a department: { deptId, deptName }. */
export async function resolveDept(name, id) {
  const all = await Department.find({}, { name: 1, active: 1 }).lean();
  const byId = id && all.find(d => d._id === id), n = String(name || '').trim().replace(/\s+/g, ' ');
  const d = byId && (!n || byId.name.toLowerCase() === n.toLowerCase()) ? byId : all.find(x => x.name.toLowerCase() === n.toLowerCase());
  return d ? { deptId: d._id, deptName: d.name } : { deptId: '', deptName: n };
}
export const when = v => `${fd(v.date)} ${v.time || ''}`.trim();
/** 'Navdeep Sharma (Security)', or just the department when no person was typed */
export const meetingText = (v, dept) => v.meetWith ? `${v.meetWith} (${dept})` : dept;
const vehicleText = v => v.vehicle && v.vehicle.has ? `${v.vehicle.number} (${v.vehicle.type})` : 'no vehicle';

/** Offices booked at an overlapping time on the same day (pending approval, confirmed or in use). */
export async function officeClash(v, office, ignoreId) {
  if (!office || !v.date || !v.time) return null;
  const end = timeAdd(v.time, v.duration || 60);
  const others = await GuestVisit.find({ _id: { $ne: ignoreId || null }, office, date: v.date, status: { $in: ['Awaiting office', 'Confirmed', 'Arrived'] } }).lean();
  return others.find(o => o.time < end && v.time < timeAdd(o.time, o.duration || 60)) || null;
}

/* ---- residence (overnight stay) ---- */
/** Free beds per room for the nights from–to: no active allocation (sewadar or guest) overlapping,
    and not held by another guest stay that is still waiting for approval. */
export async function freeBeds(from, to, ignoreVisitId) {
  const beds = await Bed.find().lean();
  const busy = new Set((await Allocation.find({ active: true, from: { $lte: to }, to: { $gte: from } }, { bedId: 1 }).lean()).map(a => a.bedId));
  if (from <= today()) beds.filter(b => b.cleaning).forEach(b => busy.add(b._id)); // needs cleaning before anyone can use it today
  const held = await GuestVisit.find({ _id: { $ne: ignoreVisitId || null }, status: 'Awaiting office', 'stay.needed': true }).lean();
  const heldPerRoom = {};
  held.filter(h => overlaps(h.stay.from, h.stay.to, from, to)).forEach(h => { heldPerRoom[h.stay.roomId] = (heldPerRoom[h.stay.roomId] || 0) + (h.stay.beds || 1); });
  const byRoom = {};
  beds.filter(b => !busy.has(b._id)).forEach(b => { (byRoom[b.roomId] = byRoom[b.roomId] || []).push(b._id); });
  Object.keys(heldPerRoom).forEach(r => { if (byRoom[r]) byRoom[r] = byRoom[r].slice(heldPerRoom[r]); });
  return byRoom; // roomId → [free bed ids]
}
/** Reserve real beds for an approved stay (they then show as Reserved in Accommodation and cannot be given to anyone else). */
export async function reserveStayBeds(user, v) {
  const s = v.stay, free = (await freeBeds(s.from, s.to, v._id))[s.roomId] || [];
  const room = await Room.findById(s.roomId).lean();
  if (free.length < s.beds) fail(`${room ? room.name : 'The room'} has only ${free.length} free bed(s) for ${fd(s.from)} – ${fd(s.to)} now. Reject with a note so the host can choose another room.`);
  const ids = free.slice(0, s.beds);
  for (const bedId of ids) await Allocation.create({ _id: await nid('al'), regId: v._id, memberId: '', guestName: v.guest.name, bedId, from: s.from, to: s.to, active: true, reason: 'Guest stay', createdOn: nowLocal(), by: user.name });
  s.bedIds = ids;
  return room;
}
/** End a guest's bed reservations (visit cancelled or guest left). Used beds are marked for cleaning. */
export async function releaseStayBeds(v, reason, used) {
  const als = await Allocation.find({ regId: v._id, active: true });
  for (const a of als) {
    Object.assign(a, { active: false, endedOn: today(), endReason: reason }); await a.save();
    if (used) await Bed.updateOne({ _id: a.bedId }, { cleaning: true });
  }
  return als.length;
}
export async function stayText(v) {
  if (!v.stay || !v.stay.needed) return '';
  const r = await Room.findById(v.stay.roomId).lean();
  return `residence ${v.stay.beds} bed(s)${r ? ' in ' + r.name : ''}, ${fd(v.stay.from)} – ${fd(v.stay.to)}`;
}

/* ---- notifications: they follow the guest visit permissions, so they reach whoever holds the step ---- */
export const toHost = (by, v, text) => notify(by, { text, page: 'visitors', userId: v.hostId, regId: v._id });
export const toIncharge = (by, v, text) => notify(by, { text, page: 'visitors', cap: 'incharge', deptId: v.deptId, regId: v._id });
export const toOffice = (by, v, text) => notify(by, { text, page: 'visitors', cap: 'office', regId: v._id });
export const toAccommodation = (by, v, text) => notify(by, { text, page: 'accommodation', level: 'e', regId: v._id });
/** Notify the department in-charge — or, when the typed department is unknown, management (the host is told separately). */
export const toDecider = (by, v, text) => v.deptId ? toIncharge(by, v, text) : notify(by, { text: text + ' (department not in the list — host / management to accept)', page: 'visitors', level: 'e', roles: ['superadmin', 'manager'], regId: v._id });
export async function toSecurity(by, v, prefix = 'Expected') {
  const text = `${prefix}: ${v.guest.name} — ${vehicleText(v)}${v.parking ? ' → ' + v.parking + ' parking' : ''}, ${when(v)}, meeting ${meetingText(v, await deptLabel(v))}${v.golfCart ? ' · golf car' : ''}`;
  await notify(by, { text, page: 'visitors', cap: 'gate', regId: v._id });
}
/** Throws unless the user may act at this step. */
export function must(ok, msg) { if (!ok) forbidden(msg); }
export function statusIn(v, list, msg) { if (!list.includes(v.status)) fail(msg || `Not possible while the visit is "${v.status}".`); }
