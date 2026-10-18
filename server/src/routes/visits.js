/* Guest visits — staff side (signed in). Public guest registration is in routes/public.js. */
import { Router } from 'express';
import { GuestVisit, Department, Room, Building } from '../models/index.js';
import { need } from '../middleware/auth.js';
import { nid, log, fail, getSettings } from '../lib/core.js';
import { body, check, isDate } from '../lib/validate.js';
import { today, addDays, nowLocal, fd } from '../../../shared/dates.js';
import { PARKINGS, VEHICLE_TYPES, visitNeedsApproval, vehicleNo, isMobile } from '../../../shared/constants.js';
import * as V from '../services/visits.js';

const r = Router();
r.use(need('visitors', 'v'));
const ok = (res, extra) => res.json({ ok: true, ...extra });
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const load = async (req, res, next) => { req.visit = await V.getVisit(req.params.id); next(); };

/* Office bookings on a day (times only, no guest details) — so any host can see which offices are free */
r.get('/office-slots', async (req, res) => {
  const date = String(req.query.date || ''); isDate(date, 'Date');
  const list = await GuestVisit.find({ date, office: { $nin: ['', null] }, status: { $in: ['Awaiting office', 'Confirmed', 'Arrived'] } }, { office: 1, time: 1, duration: 1, status: 1 }).lean();
  res.json(list.map(x => ({ id: x._id, office: x.office, time: x.time, duration: x.duration || 60, status: x.status })));
});

/* Rooms with free beds for a residence (check-in → check-out), for the host's finalise form */
r.get('/bed-availability', async (req, res) => {
  const from = String(req.query.from || ''), to = String(req.query.to || ''); isDate(from, 'Check-in'); isDate(to, 'Check-out');
  if (!from || !to || to <= from) return res.json([]);
  const free = await V.freeBeds(from, addDays(to, -1), String(req.query.visit || ''));
  const rooms = await Room.find().lean(), blds = await Building.find().lean(), byId = Object.fromEntries(blds.map(b => [b._id, b]));
  res.json(rooms.map(r => ({ roomId: r._id, room: r.name, building: (byId[r.buildingId] || {}).name || '', floor: r.floor, gender: r.gender, free: (free[r._id] || []).length }))
    .filter(r => r.free > 0).sort((a, b) => (a.building + a.room).localeCompare(b.building + b.room)));
});

/* 1. Host creates an invitation → a link for the guest */
r.post('/', need('visitors'), async (req, res) => {
  const u = req.user, v = body(req, ['guestName', 'guestMobile', 'meetWith', 'deptId', 'deptName', 'date', 'time', 'note', 'vehicleType', 'vehicleNumber']);
  V.must(V.has(u, 'invite'), 'You do not have permission to invite guests (Admin → Guest visit access).');
  if (v.guestMobile && !isMobile(v.guestMobile)) fail('Guest mobile must be a valid 10-digit mobile number.');
  if (v.date) { isDate(v.date, 'Date'); if (v.date < today()) fail('The visit date cannot be in the past.'); }
  if (v.time && !TIME.test(v.time)) fail('Enter the time as HH:MM.');
  /* a department head's guests are their own: the meeting is fixed to the head and their department,
     so the visit never goes to (or shows for) another department head */
  const lock = V.has(u, 'incharge') && !!u.deptId && !V.isMgmt(u);
  const dep = lock ? await V.resolveDept('', u.deptId) : await V.resolveDept(v.deptName, v.deptId);
  if (lock) v.meetWith = v.meetWith || u.name;
  const vno = vehicleNo(v.vehicleNumber), vtype = VEHICLE_TYPES.includes(v.vehicleType) ? v.vehicleType : '';
  if (vno && (vno.length < 6 || vno.length > 11)) fail('Enter the vehicle number, e.g. PB 10 AB 1234.');
  const g = new GuestVisit({
    _id: await nid('gv'), token: V.newToken(), tokenExpires: addDays(today(), 14), status: 'Invited',
    hostId: u.id, hostName: u.name, lockMeeting: lock, deptId: dep.deptId, deptName: dep.deptName, meetWith: v.meetWith, note: v.note, date: v.date || '', time: v.time || '', duration: 60,
    guest: { name: v.guestName, mobile: v.guestMobile }, vehicle: vtype || vno ? { has: true, type: vtype || 'Car', number: vno, preferred: '' } : { has: false }, history: [], createdOn: nowLocal()
  });
  V.vhist(g, u.name, 'Invitation created — registration link shared with the guest');
  await g.save(); await log(u, `Guest invitation ${g._id}${v.guestName ? ' for ' + v.guestName : ''}`);
  res.json({ id: g._id, token: g.token });
});

/* New link (e.g. the old one expired or was shared by mistake) */
r.post('/:id/link', need('visitors'), load, async (req, res) => {
  const g = req.visit; V.must(V.canHost(req.user, g), 'Only the host can share a new link.');
  V.statusIn(g, ['Invited', 'Submitted'], 'The guest has already been processed; a new link is not needed.');
  g.token = V.newToken(); g.tokenExpires = addDays(today(), 14); V.vhist(g, req.user.name, 'New registration link created'); await g.save();
  res.json({ token: g.token });
});

r.post('/:id/cancel', need('visitors'), load, async (req, res) => {
  const g = req.visit, why = body(req, ['why']).why;
  V.must(V.canHost(req.user, g) || V.canIncharge(req.user, g), 'Only the host or the department in-charge can cancel.');
  V.statusIn(g, ['Invited', 'Submitted', 'Accepted', 'Awaiting office', 'Office rejected', 'Confirmed'], 'This visit can no longer be cancelled.');
  const wasConfirmed = g.status === 'Confirmed';
  const freed = await V.releaseStayBeds(g, 'Guest visit cancelled', false);
  g.status = 'Cancelled'; V.vhist(g, req.user.name, 'Cancelled' + (why ? ' — ' + why : '') + (freed ? ` — ${freed} reserved bed(s) released` : '')); await g.save();
  if (freed) await V.toAccommodation(req.user, g, `Guest stay cancelled: ${g.guest.name} — ${freed} bed(s) released`);
  if (g.hostId !== req.user.id) await V.toHost(req.user, g, `Guest visit cancelled: ${g.guest.name || g._id}${why ? ' — ' + why : ''}`);
  if (wasConfirmed) await V.toSecurity(req.user, g, 'CANCELLED');
  await log(req.user, `Guest visit ${g._id} cancelled`); ok(res);
});

/* 3. Department in-charge accepts (optionally with another time) or declines */
r.post('/:id/incharge', need('visitors'), load, async (req, res) => {
  const g = req.visit, u = req.user, v = body(req, ['date', 'time', 'duration', 'note']), accept = !!(req.body || {}).accept;
  V.must(V.canIncharge(u, g), 'Only the in-charge of the department being visited can decide.');
  V.statusIn(g, ['Submitted'], 'The appointment is not waiting for the in-charge.');
  if (!accept) {
    if (!v.note) fail('Please give a reason for declining.');
    g.status = 'Declined'; g.inchargeName = u.name; V.vhist(g, u.name, 'Appointment declined — ' + v.note); await g.save();
    await V.toHost(u, g, `Appointment declined by ${u.name}: ${g.guest.name} — ${v.note}`);
    return ok(res);
  }
  check(v, [['date', 'Date', 'req'], ['time', 'Time', 'req']]); isDate(v.date, 'Date');
  if (!TIME.test(v.time)) fail('Enter the time as HH:MM.');
  if (v.date < today()) fail('The appointment date cannot be in the past.');
  const dur = Number(v.duration) || 60; if (dur < 15 || dur > 480) fail('Duration must be between 15 minutes and 8 hours.');
  const moved = v.date !== g.date || v.time !== g.time;
  Object.assign(g, { date: v.date, time: v.time, duration: dur, status: 'Accepted', inchargeName: u.name });
  V.vhist(g, u.name, `Appointment accepted for ${V.when(g)} (${dur} min)${moved ? ' — time changed by the in-charge' : ''}${v.note ? ' — ' + v.note : ''}`);
  await g.save();
  await V.toHost(u, g, `Appointment accepted: ${g.guest.name} on ${V.when(g)} with ${u.name}. Please finalise parking, office and golf car.`);
  ok(res);
});

/* 4. Host finalises parking, office and golf car → Main Office approval when needed, otherwise confirmed */
r.post('/:id/finalize', need('visitors'), load, async (req, res) => {
  const g = req.visit, u = req.user, v = body(req, ['parking', 'office', 'cartNote', 'stayFrom', 'stayTo', 'stayBeds', 'stayRoom']), golfCart = !!(req.body || {}).golfCart, stayNeeded = !!(req.body || {}).stayNeeded;
  V.must(V.canHost(u, g), 'Only the host can finalise the visit.');
  V.statusIn(g, ['Accepted', 'Office rejected', 'Awaiting office', 'Confirmed'], 'The appointment must be accepted by the in-charge first.');
  if (g.vehicle && g.vehicle.has && !PARKINGS.includes(v.parking)) fail('Choose the parking for the guest’s vehicle.');
  if (v.parking && !PARKINGS.includes(v.parking)) fail('Choose a valid parking.');
  const offices = (await getSettings()).lists.offices || [];
  if (v.office && !offices.includes(v.office)) fail('Choose a valid office.');
  const clash = await V.officeClash(g, v.office, g._id);
  if (clash) fail(`${v.office} is already booked ${fd(clash.date)} ${clash.time} (${clash.guest.name}). Choose another office or time.`);
  /* residence (overnight stay): room with enough free beds for the nights requested */
  let stay = { needed: false };
  if (stayNeeded) {
    isDate(v.stayFrom, 'Check-in'); isDate(v.stayTo, 'Check-out');
    if (!v.stayFrom || !v.stayTo) fail('Enter the check-in and check-out dates for the residence.');
    if (v.stayTo <= v.stayFrom) fail('Check-out must be after check-in.');
    if (v.stayFrom < today()) fail('Check-in cannot be in the past.');
    const beds = Number(v.stayBeds) || 1; if (beds < 1 || beds > 30) fail('Number of beds must be between 1 and 30.');
    const lastNight = addDays(v.stayTo, -1), free = (await V.freeBeds(v.stayFrom, lastNight, g._id))[v.stayRoom] || [];
    if (!v.stayRoom) fail('Choose a room for the residence.');
    if (free.length < beds) fail(`That room has only ${free.length} free bed(s) for these nights. Choose another room or fewer beds.`);
    stay = { needed: true, from: v.stayFrom, to: lastNight, beds, roomId: v.stayRoom, bedIds: [] }; // stored as nights: check-in … night before check-out
  }
  /* changing a confirmed visit sends it back for approval, so beds reserved earlier are released */
  const freed = await V.releaseStayBeds(g, 'Residence changed by host', false);
  Object.assign(g, { parking: g.vehicle && g.vehicle.has ? v.parking : '', office: v.office, golfCart, cartNote: v.cartNote, stay });
  const needs = visitNeedsApproval(g), summary = [g.parking && g.parking + ' parking', g.office, g.golfCart && 'golf car', await V.stayText(g)].filter(Boolean).join(', ') || 'no parking / office / golf car';
  if (freed) V.vhist(g, u.name, `${freed} reserved bed(s) released for the change`);
  if (needs) {
    g.status = 'Awaiting office'; g.approval = { needed: true };
    V.vhist(g, u.name, `Finalised by host (${summary}) — sent to Main Office for approval`); await g.save();
    await V.toOffice(u, g, `Approval needed: ${g.guest.name} on ${V.when(g)} — ${summary} (host ${u.name})`);
  } else {
    g.status = 'Confirmed'; g.approval = { needed: false };
    V.vhist(g, u.name, `Finalised by host (${summary}) — confirmed, no office approval needed`); await g.save();
    await V.toSecurity(u, g); await V.toIncharge(u, g, `Visit confirmed: ${g.guest.name} on ${V.when(g)}`);
  }
  await log(u, `Guest visit ${g._id} finalised (${summary})`);
  ok(res, { status: g.status });
});

/* 5. Main Office approves or rejects parking / office / golf car */
r.post('/:id/office', need('visitors'), load, async (req, res) => {
  const g = req.visit, u = req.user, v = body(req, ['remarks', 'cartNote', 'approverName', 'parking', 'office']), approve = !!(req.body || {}).approve;
  V.must(V.canOffice(u), 'Only the Main Office can approve.');
  V.statusIn(g, ['Awaiting office'], 'This visit is not waiting for office approval.');
  /* the approver must write their own name on every decision */
  const name = String(v.approverName || '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) fail('Write your full name to sign this decision.');
  const signed = name.toLowerCase() === String(u.name).toLowerCase() ? name : `${name} (signed in as ${u.name})`;
  if (!approve) {
    if (!v.remarks) fail('Please give a reason for rejecting.');
    g.status = 'Office rejected'; g.approval = { needed: true, by: name, user: u.name, at: nowLocal(), remarks: v.remarks };
    V.vhist(g, signed, 'Main Office rejected — ' + v.remarks); await g.save();
    await V.toHost(u, g, `Main Office (${name}) did not approve ${g.guest.name}'s visit: ${v.remarks}. Change parking / office and send again.`);
    return ok(res);
  }
  /* parking and office number are confirmed explicitly by the approver (they may change the host's request) */
  const hasVeh = g.vehicle && g.vehicle.has;
  if (hasVeh && !PARKINGS.includes(v.parking)) fail('Choose the approved parking.');
  const offices = (await getSettings()).lists.offices || [];
  if (g.office && !v.office) fail(`The host requested an office — choose the approved office number.`);
  if (v.office && !offices.includes(v.office)) fail('Choose a valid office.');
  const changed = [hasVeh && v.parking !== g.parking && `parking ${g.parking || '—'} → ${v.parking}`, (v.office || '') !== (g.office || '') && `office ${g.office || '—'} → ${v.office || 'none'}`].filter(Boolean);
  g.parking = hasVeh ? v.parking : ''; g.office = v.office || '';
  const clash = await V.officeClash(g, g.office, g._id);
  if (clash) fail(`${g.office} is already booked for ${clash.guest.name} at ${clash.time}. Choose another office.`);
  if (v.cartNote) g.cartNote = v.cartNote;
  const stayRoom = g.stay && g.stay.needed ? await V.reserveStayBeds(u, g) : null; // real beds are reserved now
  g.status = 'Confirmed'; g.approval = { needed: true, by: name, user: u.name, at: nowLocal(), remarks: v.remarks, parking: g.parking, office: g.office };
  V.vhist(g, signed, `Approved by Main Office — parking: ${g.parking || 'none'}, office: ${g.office || 'none'}${g.golfCart ? ', golf car' : ''}${changed.length ? ' (changed: ' + changed.join('; ') + ')' : ''}${v.remarks ? ' — ' + v.remarks : ''}`); await g.save();
  await V.toHost(u, g, `Approved by ${name}: ${g.guest.name} on ${V.when(g)} — ${[g.parking, g.office, g.golfCart && 'golf car'].filter(Boolean).join(', ')}`);
  await V.toIncharge(u, g, `Visit confirmed: ${g.guest.name} on ${V.when(g)}${g.office ? ' in ' + g.office : ''}`);
  await V.toSecurity(u, g);
  if (stayRoom) await V.toAccommodation(u, g, `Guest stay booked: ${g.guest.name} — ${g.stay.beds} bed(s) in ${stayRoom.name}, ${fd(g.stay.from)} – ${fd(addDays(g.stay.to, 1))} (beds reserved)`);
  await log(u, `Guest visit ${g._id} approved by Main Office — signed ${name}`); ok(res);
});

/* 6. Security at Abhinandan Dwar records entry and exit */
r.post('/:id/entry', need('visitors'), load, async (req, res) => {
  const g = req.visit, u = req.user, v = body(req, ['vehicleNumber', 'remarks']);
  V.must(V.canGate(u), 'Only security can record entry.');
  V.statusIn(g, ['Confirmed'], 'Only a confirmed visit can be checked in at the gate.');
  const seen = vehicleNo(v.vehicleNumber), booked = g.vehicle && g.vehicle.has ? g.vehicle.number : '';
  let note = v.remarks || '';
  if (seen && seen !== booked) { note = `Vehicle at gate ${seen} (booked ${booked || 'none'})${note ? ' — ' + note : ''}`; g.vehicle.has = true; g.vehicle.number = seen; }
  Object.assign(g, { status: 'Arrived', entryAt: nowLocal(), entryBy: u.name, gateRemarks: note });
  V.vhist(g, u.name, `Entered at Abhinandan Dwar${g.parking ? ' → ' + g.parking + ' parking' : ''}${note ? ' — ' + note : ''}`); await g.save();
  const msg = `Guest arrived: ${g.guest.name}${g.vehicle && g.vehicle.has ? ' (' + g.vehicle.number + ')' : ''}${g.office ? ' → ' + g.office : ''}`;
  await V.toHost(u, g, msg); await V.toIncharge(u, g, msg);
  await log(u, `Gate entry: ${g.guest.name} (${g._id})`); ok(res);
});
r.post('/:id/exit', need('visitors'), load, async (req, res) => {
  const g = req.visit, u = req.user;
  V.must(V.canGate(u), 'Only security can record exit.');
  V.statusIn(g, ['Arrived'], 'The guest has not entered yet.');
  const freed = await V.releaseStayBeds(g, 'Guest left', true);
  Object.assign(g, { status: 'Completed', exitAt: nowLocal(), exitBy: u.name });
  if (freed) await V.toAccommodation(u, g, `Guest ${g.guest.name} left — ${freed} bed(s) need cleaning`);
  V.vhist(g, u.name, 'Left the campus'); await g.save();
  await V.toHost(u, g, `Guest left: ${g.guest.name}`);
  await log(u, `Gate exit: ${g.guest.name} (${g._id})`); ok(res);
});

export default r;
