/* Mongoose models. Records keep the human-readable IDs of the prototype
   (NM-0001, PR-0001, BR001 …) as their _id, so references stay simple strings. */
import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const opts = { versionKey: false, minimize: false };
const S = { type: String };

const Branch = model('Branch', new Schema({
  _id: S, name: S, state: S, district: S, coordinator: S, phone: S, sample: Boolean,
  parentId: { type: String, default: '' }, // set on a sub-branch: the branch it was split from
  address: S, email: S, phones: S // contact details (phones = every number, as listed)
}, opts));

const Member = model('Member', new Schema({
  _id: S, name: S, photo: S, mobile: { type: String, index: true }, dob: S, gender: S, address: S,
  state: S, district: S, branchId: { type: String, index: true }, type: S,
  emName: S, emPhone: S, emRel: S, createdOn: S, sample: Boolean
}, opts));

const History = new Schema({ at: S, by: S, text: S }, { _id: false });
const Ext = new Schema({ to: S, reason: S, status: S, by: S, byName: S, on: S, decidedBy: S }, { _id: false });
const Registration = model('Registration', new Schema({
  _id: S, memberId: { type: String, index: true }, branchId: { type: String, index: true },
  source: S, purpose: S, prefDept: S, type: S, status: { type: String, index: true }, remarks: S,
  arrival: S, departure: S,
  approvedFrom: S, approvedTo: S, approvedType: S, approvedDept: S, approvedBy: S,
  actualIn: S, actualOut: S,
  submittedOn: S, // when it last entered the approval queue (newest-first sorting)
  undo: { type: new Schema({ allocId: S, bedWasCleaning: Boolean, dutyId: S, dutyTo: S }, { _id: false }), default: undefined },
  history: { type: [History], default: [] }, exts: { type: [Ext], default: [] },
  createdBy: S, createdOn: S
}, opts));

const Allocation = model('Allocation', new Schema({
  _id: S, regId: { type: String, index: true }, memberId: { type: String, index: true }, bedId: { type: String, index: true },
  from: S, to: S, active: { type: Boolean, index: true }, reason: S, createdOn: S, by: S,
  endedOn: S, endReason: S, bedPath: S,
  guestName: S // set when the bed is reserved for a guest visit (regId is then the visit id, GV-…)
}, opts));

const Duty = model('Duty', new Schema({
  _id: S, regId: { type: String, index: true }, memberId: S, deptId: { type: String, index: true }, shift: S, supervisor: S,
  from: S, to: S, status: S, endedOn: S, createdOn: S, by: S
}, opts));

const attSchema = new Schema({ date: S, regId: S, status: S, deptId: S }, opts);
attSchema.index({ date: 1, regId: 1 }, { unique: true });
const Attendance = model('Attendance', attSchema);

const Department = model('Department', new Schema({ _id: S, name: S, supervisor: S, active: Boolean }, opts));
const Site = model('Site', new Schema({ _id: S, name: S }, opts));
const Building = model('Building', new Schema({ _id: S, siteId: S, name: S, floors: [String] }, opts));
const Room = model('Room', new Schema({ _id: S, buildingId: { type: String, index: true }, floor: S, name: S, gender: S }, opts));
const Bed = model('Bed', new Schema({ _id: S, roomId: { type: String, index: true }, label: S, cleaning: Boolean }, opts));

const User = model('User', new Schema({
  _id: S, name: S, username: { type: String, unique: true, lowercase: true, trim: true },
  passwordHash: S, role: S, branchId: S, deptId: S,
  mustChangePassword: { type: Boolean, default: false }, // set for temporary / demo passwords
  visitCaps: { type: [String], default: [] } // extra guest visit permissions for this user, on top of the role
}, opts));

const AuditLog = model('AuditLog', new Schema({ at: { type: String, index: true }, by: S, text: S }, opts));

/* Single settings document (_id 'app'): editable lists, saved role access, names of deleted departments. */
const Settings = model('Settings', new Schema({
  _id: S,
  lists: { states: [String], rels: [String], shifts: [new Schema({ name: S, time: S }, { _id: false })], offices: [String] },
  perms: { type: Schema.Types.Mixed, default: null },
  visitCaps: { type: Schema.Types.Mixed, default: null }, // guest visit permissions per role (null = defaults)
  tomb: { type: Schema.Types.Mixed, default: {} }
}, opts));

const Counter = model('Counter', new Schema({ _id: S, seq: Number }, opts));

/* Guest visit: invitation link → guest registration → department in-charge → host finalises parking / office /
   golf car → Main Office approval (when needed) → security records vehicle entry and exit. */
const GuestVisit = model('GuestVisit', new Schema({
  _id: S, token: { type: String, index: true, unique: true }, tokenExpires: S, status: { type: String, index: true },
  hostId: S, hostName: S, lockMeeting: Boolean, // lockMeeting: invited by a department head → the guest meets that head (fixed)
  deptId: { type: String, index: true }, deptName: S, meetWith: S, note: S, // deptName: department as typed // meetWith: person the guest meets (typed)
  guest: { type: new Schema({ name: S, mobile: S, email: S, organisation: S, city: S, people: Number, purpose: S }, { _id: false }), default: () => ({}) },
  date: { type: String, index: true }, time: S, duration: Number,           // appointment (requested, then confirmed by the in-charge)
  vehicle: { type: new Schema({ has: Boolean, type: S, number: S, preferred: S }, { _id: false }), default: () => ({}) },
  parking: S, office: S, golfCart: Boolean, cartNote: S, inchargeName: S,
  /* residence (overnight stay): requested by the host, beds reserved when the Main Office approves */
  stay: { type: new Schema({ needed: Boolean, from: S, to: S, beds: Number, roomId: S, bedIds: [String] }, { _id: false }), default: undefined },
  approval: { type: new Schema({ needed: Boolean, by: S, user: S, at: S, remarks: S, parking: S, office: S }, { _id: false }), default: undefined }, // by = name typed by the approver, user = signed-in account
  entryAt: S, entryBy: S, exitAt: S, exitBy: S, gateRemarks: S,
  history: { type: [History], default: [] }, createdOn: S
}, opts));

/* Event notifications. Who sees one is decided when it is read (see services/notify.js):
   a direct user, or every user whose role has `level` access to `page` — narrowed by `roles`,
   by branch for coordinators and by department for supervisors. */
const notifSchema = new Schema({
  at: { type: String, index: true }, text: S, page: S, level: S, roles: [String],
  userId: S, branchId: S, deptId: S, regId: S, byUser: S, readBy: { type: [String], default: [] },
  cap: S // guest visit permission the reader must hold (e.g. 'office', 'gate', 'incharge')
}, opts);
const Notification = model('Notification', notifSchema);

export { Branch, Member, Registration, Allocation, Duty, Attendance, Department, Site, Building, Room, Bed, User, AuditLog, Settings, Counter, Notification, GuestVisit };

/* Collections holding sewadar data, keyed by the name used in the JSON backup format. */
export const DATA_MODELS = {
  branches: Branch, members: Member, regs: Registration, allocs: Allocation, duties: Duty,
  depts: Department, sites: Site, buildings: Building, rooms: Room, beds: Bed, visits: GuestVisit
};
