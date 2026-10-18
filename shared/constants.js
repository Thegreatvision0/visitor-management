/* Constants, role defaults and stay helpers shared by server and client. */

export const TYPES = ['Short-Term', 'Monthly', 'Long-Term'];
/* All Indian states and union territories, so branches anywhere in India can be registered. */
export const STATES_DEF = ['Punjab', 'Delhi', 'Haryana', 'Chandigarh', 'Himachal Pradesh', 'Jammu & Kashmir', 'Ladakh', 'Uttarakhand', 'Uttar Pradesh', 'Rajasthan', 'Maharashtra', 'Bihar', 'Madhya Pradesh', 'Gujarat', 'West Bengal', 'Karnataka', 'Tamil Nadu',
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Chhattisgarh', 'Goa', 'Jharkhand', 'Kerala', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Sikkim', 'Telangana', 'Tripura',
  'Andaman & Nicobar Islands', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep', 'Puducherry', 'Other'];
export const RELS_DEF = ['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Other'];
export const SHIFTS_DEF = [{ name: 'Morning', time: '05:00–13:00' }, { name: 'Day', time: '09:00–17:00' }, { name: 'Evening', time: '13:00–21:00' }, { name: 'Night', time: '21:00–05:00' }];
export const ATT = ['Present', 'Absent', 'Leave', 'Not Marked'];
export const PURPOSES = ['Seva during programme', 'Seva — langar', 'Seva — maintenance work', 'Spiritual stay & seva', 'Seva — security duty', 'Seva — cleaning drive'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const ROOM_GENDERS = ['Male', 'Female', 'Any'];
export const REG_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Cancelled', 'Checked In', 'Checked Out'];
export const LIVE = ['Submitted', 'Approved', 'Checked In'];

/* ---- Guest visits (appointments, parking, offices, golf car) ---- */
export const OFFICES_DEF = ['Office 2', 'Office 3', 'Office 4', 'Office 5'];
export const PARKINGS = ['Abhinandan Dwar', 'Baikunth Dwar']; // Abhinandan Dwar: open to all · Baikunth Dwar: needs Main Office approval
export const APPROVAL_PARKING = 'Baikunth Dwar';
export const VEHICLE_TYPES = ['Car', 'SUV / Jeep', 'Two-wheeler', 'Tempo Traveller', 'Bus', 'Auto-rickshaw', 'Other'];
export const VISIT_STATUSES = ['Invited', 'Submitted', 'Accepted', 'Declined', 'Awaiting office', 'Office rejected', 'Confirmed', 'Arrived', 'Completed', 'Cancelled'];
export const VISIT_LIVE = ['Invited', 'Submitted', 'Accepted', 'Awaiting office', 'Office rejected', 'Confirmed', 'Arrived'];
/** Main Office approval is needed for Baikunth Dwar parking, an office booking, a golf car or a residence (overnight stay). */
export const visitNeedsApproval = v => v.parking === APPROVAL_PARKING || !!v.office || !!v.golfCart || !!(v.stay && v.stay.needed);

/* Guest visit permissions — given per role (Admin → Guest visit access) and, as extras, per user. */
export const VISIT_CAPS = [
  ['invite', 'Invite guests & arrange parking, office, residence'],
  ['incharge', 'Accept appointments for own department'],
  ['office', 'Main Office approval'],
  ['gate', 'Gate entry & exit (Abhinandan Dwar)'],
  ['all', 'See all guest visits']
];
export const VISIT_CAP_KEYS = VISIT_CAPS.map(c => c[0]);
export const VISIT_CAPS_DEFAULT = {
  superadmin: VISIT_CAP_KEYS, manager: VISIT_CAP_KEYS, office: ['invite', 'office', 'all'], security: ['gate', 'all'],
  supervisor: ['invite', 'incharge'], reception: ['invite', 'all'], accom: ['all'], viewer: ['all'], coordinator: []
};
/** Role → permissions: the matrix the admin saved, else the defaults. Super Admin always has all. */
export function resolveVisitCaps(saved) {
  const out = {};
  Object.keys(VISIT_CAPS_DEFAULT).forEach(r => { out[r] = r === 'superadmin' ? VISIT_CAP_KEYS.slice() : ((saved && saved[r]) || VISIT_CAPS_DEFAULT[r]).filter(c => VISIT_CAP_KEYS.includes(c)); });
  return out;
}
export const vehicleNo = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const timeAdd = (t, min) => { const [h, m] = t.split(':').map(Number), x = h * 60 + m + min; return String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'); };

export const defaultLists = () => ({ states: STATES_DEF.slice(), rels: RELS_DEF.slice(), shifts: SHIFTS_DEF.map(x => ({ ...x })), offices: OFFICES_DEF.slice() });

/* Page keys in sidebar order. */
export const PAGE_KEYS = ['dashboard', 'members', 'branches', 'prereg', 'approvals', 'reception', 'accommodation', 'departments', 'longterm', 'visitors', 'reports', 'admin'];

/* Role → page access. e = view + edit, v = view only. Enforced by the API. */
export const ROLE_DEFAULTS = {
  superadmin: { label: 'Super Admin / IT Admin', pages: { dashboard: 'e', members: 'e', branches: 'e', prereg: 'e', approvals: 'e', reception: 'e', accommodation: 'e', departments: 'e', longterm: 'e', visitors: 'e', reports: 'e', admin: 'e' } },
  manager: { label: 'Nurmahal Sewadar Manager', pages: { dashboard: 'e', members: 'e', branches: 'e', prereg: 'e', approvals: 'e', reception: 'v', accommodation: 'v', departments: 'e', longterm: 'e', visitors: 'e', reports: 'v' } },
  coordinator: { label: 'Branch Coordinator', pages: { dashboard: 'v', members: 'e', branches: 'e', prereg: 'e', longterm: 'v', reports: 'v' } },
  reception: { label: 'Reception Staff', pages: { dashboard: 'v', members: 'e', prereg: 'v', reception: 'e', accommodation: 'v', departments: 'v', visitors: 'e', reports: 'v' } },
  accom: { label: 'Accommodation Manager', pages: { dashboard: 'v', members: 'v', reception: 'v', accommodation: 'e', longterm: 'v', visitors: 'v', reports: 'v' } },
  supervisor: { label: 'Department Head / In-charge', pages: { dashboard: 'v', departments: 'e', visitors: 'e', reports: 'v' } },
  viewer: { label: 'Management / Report Viewer', pages: { dashboard: 'v', branches: 'v', accommodation: 'v', longterm: 'v', visitors: 'v', reports: 'v' } },
  office: { label: 'Main Office (guest approvals)', pages: { dashboard: 'v', visitors: 'e', reports: 'v' } },
  security: { label: 'Security – Abhinandan Dwar', pages: { dashboard: 'v', visitors: 'e' } }
};

/** Role access = built-in defaults, or the matrix the admin saved. Dashboard is always visible; Super Admin is always full access; only Super Admin opens Admin. */
export function resolveRoles(perms) {
  const out = {};
  Object.keys(ROLE_DEFAULTS).forEach(r => {
    if (r === 'superadmin') { out[r] = { label: ROLE_DEFAULTS[r].label, pages: { ...ROLE_DEFAULTS[r].pages } }; return; }
    /* a saved matrix wins; pages added later (e.g. Guest Visits) fall back to the role's default */
    const p = { ...ROLE_DEFAULTS[r].pages, ...(perms && perms[r] ? perms[r] : {}) };
    delete p.admin;
    if (!p.dashboard) p.dashboard = 'v';
    Object.keys(p).forEach(k => { if (!p[k]) delete p[k]; });
    out[r] = { label: ROLE_DEFAULTS[r].label, pages: p };
  });
  return out;
}

export const stayStart = r => r.approvedFrom || r.arrival;
export const stayEnd = r => r.approvedTo || r.departure;
export const stayType = r => r.approvedType || r.type;
export const pendingExt = r => (r.exts || []).find(e => e.status === 'Pending');
export const isMobile = v => /^[6-9]\d{9}$/.test(v);

/* Stay type follows the length of the stay: up to 10 days Short-Term, 11–30 days Monthly, 31+ days Long-Term. */
export const SHORT_MAX_DAYS = 10, MONTHLY_MAX_DAYS = 30;
export const stayDays = (from, to) => Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 864e5) + 1;
export const stayTypeFor = (from, to) => { const n = stayDays(from, to); return n <= SHORT_MAX_DAYS ? 'Short-Term' : n <= MONTHLY_MAX_DAYS ? 'Monthly' : 'Long-Term'; };
