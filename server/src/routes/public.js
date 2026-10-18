/* Public guest registration (no sign-in). The guest opens /guest/<token> from the link the host shared,
   fills in the appointment and vehicle details, and can come back to the same link to see the status. */
import { Router } from 'express';
import { GuestVisit, Department } from '../models/index.js';
import { HttpError, fail, log } from '../lib/core.js';
import { body, check, isDate } from '../lib/validate.js';
import { clientIp, rateLimited } from '../lib/security.js';
import { today, fd } from '../../../shared/dates.js';
import { PARKINGS, VEHICLE_TYPES, vehicleNo, isMobile } from '../../../shared/constants.js';
import * as V from '../services/visits.js';

const r = Router();
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

async function byToken(token) {
  const g = token && token.length >= 20 ? await GuestVisit.findOne({ token }) : null;
  const expired = g && g.status === 'Invited' && g.tokenExpires && today() > g.tokenExpires;
  if (!g || g.status === 'Cancelled' || expired) throw new HttpError(404, 'This link is not valid any more. Please ask your host for a new one.');
  return g;
}
/** Only what the guest needs to see — no other visits, no internal notes. */
async function view(g) {
  const depts = (await Department.find({ active: true }).lean()).map(d => ({ id: d._id, name: d.name, incharge: d.supervisor })).sort((a, b) => a.name.localeCompare(b.name));
  const done = ['Confirmed', 'Arrived', 'Completed'].includes(g.status);
  return {
    id: g._id, status: g.status, hostName: g.hostName, deptId: g.deptId, deptName: g.deptName || '', meetWith: g.meetWith || '', lockMeeting: !!g.lockMeeting, depts, today: today(),
    editable: ['Invited', 'Submitted'].includes(g.status),
    guest: g.guest, date: g.date, time: g.time, duration: g.duration, vehicle: g.vehicle,
    parking: done ? g.parking : '', office: done ? g.office : '', golfCart: done ? !!g.golfCart : false,
    vehicleTypes: VEHICLE_TYPES
  };
}

r.get('/visits/:token', async (req, res) => res.json(await view(await byToken(req.params.token))));

r.post('/visits/:token', async (req, res) => {
  if (rateLimited('guest:' + clientIp(req), 20, 15 * 60 * 1000)) throw new HttpError(429, 'Too many attempts. Please try again in a few minutes.');
  const g = await byToken(req.params.token);
  if (!['Invited', 'Submitted'].includes(g.status)) fail('Your appointment is already being processed. Please contact your host for changes.');
  const v = body(req, ['name', 'mobile', 'email', 'organisation', 'city', 'people', 'purpose', 'meetWith', 'deptId', 'deptName', 'date', 'time', 'vehicleType', 'vehicleNumber', 'parking']);
  /* a vehicle is coming when a type other than 'No vehicle' is chosen (older clients send hasVehicle) */
  const hv = (req.body || {}).hasVehicle, hasVehicle = hv !== undefined ? !!hv : !!v.vehicleType && v.vehicleType !== 'No vehicle';
  if (g.lockMeeting) { v.meetWith = g.meetWith; v.deptName = g.deptName; v.deptId = g.deptId; } // fixed by the inviting department head
  check(v, [['name', 'Your name', 'req'], ['mobile', 'Mobile number', 'req tel'], ['meetWith', 'Whom you are meeting', 'req'], ['deptName', 'Department', 'req'], ['date', 'Date', 'req'], ['time', 'Time', 'req'], ['purpose', 'Purpose of the visit', 'req']]);
  isDate(v.date, 'Date'); if (v.date < today()) fail('The date cannot be in the past.');
  if (!TIME.test(v.time)) fail('Enter the time as HH:MM.');
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) fail('Enter a valid email address.');
  const people = Number(v.people) || 1; if (people < 1 || people > 50) fail('Number of people must be between 1 and 50.');
  const dep = await V.resolveDept(v.deptName, v.deptId); // typed department; matched to the list when it exists
  const vehicle = { has: hasVehicle };
  if (hasVehicle) {
    if (!VEHICLE_TYPES.includes(v.vehicleType)) fail('Choose the vehicle type.');
    const num = vehicleNo(v.vehicleNumber); if (num.length < 6 || num.length > 11) fail('Enter the vehicle number, e.g. PB 10 AB 1234.');
    /* parking is never chosen by the guest: the host assigns it (Baikunth Dwar with Main Office approval) */
    Object.assign(vehicle, { type: v.vehicleType, number: num, preferred: '' });
  }
  const again = g.status === 'Submitted';
  Object.assign(g, {
    guest: { name: v.name, mobile: v.mobile, email: v.email, organisation: v.organisation, city: v.city, people, purpose: v.purpose },
    deptId: dep.deptId, deptName: dep.deptName, meetWith: v.meetWith, date: v.date, time: v.time, duration: g.duration || 60, vehicle, status: 'Submitted'
  });
  V.vhist(g, v.name + ' (guest)', again ? 'Guest updated the registration' : `Guest registered — meeting ${V.meetingText(v, dep.deptName)} on ${fd(v.date)} ${v.time}`);
  await g.save();
  const msg = `${again ? 'Updated' : 'New'} appointment request: ${v.name}${v.organisation ? ' (' + v.organisation + ')' : ''} to meet ${v.meetWith} on ${fd(v.date)} ${v.time} — ${v.purpose}`;
  await V.toDecider(null, g, msg); await V.toHost(null, g, msg);
  await log({ name: v.name + ' (guest)' }, `Guest registration ${g._id}`);
  res.json(await view(g));
});

export default r;
