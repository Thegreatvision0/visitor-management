/* Sample data — the same deterministic data set the prototype generated in the browser.
   Builds plain objects in the backup format (ids in `id`); data.js writes them to MongoDB. */
import { today, addDays, pad } from '../../../shared/dates.js';
import { defaultLists, PURPOSES, RELS_DEF, SHIFTS_DEF } from '../../../shared/constants.js';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function buildSample() {
  const rnd = mulberry32(20261009), pick = a => a[Math.floor(rnd() * a.length)], ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const t = today(), d = n => addDays(t, n);
  const seq = {}, nid = (k, pre, len) => { seq[k] = (seq[k] || 0) + 1; return pre + pad(seq[k], len); };
  const DB = { v: 1, branches: [], members: [], regs: [], allocs: [], duties: [], att: {}, depts: [], sites: [], buildings: [], rooms: [], beds: [], log: [], lists: defaultLists(), tomb: {}, perms: null };
  const SHIFTS = SHIFTS_DEF.map(x => x.name), RELS = RELS_DEF;
  const byId = (a, id) => a.find(x => x.id === id);
  const room = id => byId(DB.rooms, id), bldg = id => byId(DB.buildings, id), dept = id => byId(DB.depts, id);
  const bedShort = b => { const rm = room(b.roomId), bl = bldg(rm.buildingId); return `${bl.name} · ${rm.name} · Bed ${b.label}`; };
  const attKey = (date, regId) => date + '|' + regId;

  const MF = 'Gurpreet,Harjinder,Manjit,Balwinder,Sukhdev,Jaswant,Kuldeep,Rajinder,Amarjit,Parminder,Tarsem,Satnam,Davinder,Lakhwinder,Ranjit,Mohinder,Baljit,Charanjit,Surinder,Navdeep,Rakesh,Vikram,Sandeep,Pawan,Anil,Deepak,Ajay,Mahesh,Gagandeep,Jagdish'.split(',');
  const FF = 'Simran,Harpreet,Manpreet,Jasleen,Kiran,Sunita,Rajni,Paramjit,Amandeep,Navneet,Sarbjit,Gurleen,Pooja,Meena,Anita,Seema,Rekha,Neha,Komal,Ritu'.split(',');
  const SN = 'Singh,Sharma,Verma,Gill,Sidhu,Kumar,Bansal,Mehta,Arora,Walia,Bedi,Sethi,Khanna,Chopra,Bajwa,Dhillon,Grewal,Sandhu,Mann,Joshi'.split(',');
  const used = new Set();
  const mob = () => { let s; do { s = pick(['98', '97', '99', '94', '88', '62']) + pad(ri(0, 99999999), 8); } while (used.has(s)); used.add(s); return s; };
  const cname = () => { const f = rnd() < .7; return pick(f ? MF : FF) + ' ' + (f ? pick(SN) : (rnd() < .6 ? 'Kaur' : pick(SN))); };

  /* Branches: 33 Punjab (sample list) + other states */
  'Amritsar,Jalandhar,Ludhiana,Patiala,Bathinda,Hoshiarpur,Gurdaspur,Pathankot,Kapurthala,Ferozepur,Faridkot,Moga,Sangrur,Barnala,Mansa,Sri Muktsar Sahib,Fatehgarh Sahib,Rupnagar,Mohali,Nawanshahr,Tarn Taran,Fazilka,Malerkotla,Batala,Phagwara,Khanna,Abohar,Zirakpur,Rajpura,Nabha,Dhuri,Samana,Jagraon'.split(',')
    .forEach(n => DB.branches.push({ id: nid('br', 'BR', 3), name: n, state: 'Punjab', district: n, coordinator: cname(), phone: mob(), sample: true }));
  [['Delhi (Patel Nagar)', 'Delhi', 'New Delhi'], ['Karnal', 'Haryana', 'Karnal'], ['Chandigarh', 'Chandigarh', 'Chandigarh'], ['Shimla', 'Himachal Pradesh', 'Shimla'], ['Jammu', 'Jammu & Kashmir', 'Jammu'], ['Dehradun', 'Uttarakhand', 'Dehradun'], ['Lucknow', 'Uttar Pradesh', 'Lucknow'], ['Jaipur', 'Rajasthan', 'Jaipur'], ['Mumbai', 'Maharashtra', 'Mumbai'], ['Patna', 'Bihar', 'Patna'], ['Indore', 'Madhya Pradesh', 'Indore'], ['Ahmedabad', 'Gujarat', 'Ahmedabad']]
    .forEach(o => DB.branches.push({ id: nid('br', 'BR', 3), name: o[0], state: o[1], district: o[2], coordinator: cname(), phone: mob(), sample: true }));
  const brByName = n => DB.branches.find(b => b.name === n);

  ['Security', 'Langar Serving', 'Langar Cooking', 'Cleaning / Safai', 'Kitchen', 'Maintenance', 'Stores & Library (Other)'].forEach(n => DB.depts.push({ id: nid('dp', 'DP', 2), name: n, supervisor: cname(), active: true }));
  const deptIds = DB.depts.map(x => x.id);

  /* Accommodation: Site → Building → Floor → Room → Bed */
  DB.sites.push({ id: 'ST1', name: 'Main Campus' }, { id: 'ST2', name: 'Annexe Campus' }); seq.st = 2;
  const BL = [['BL1', 'ST1', 'Mangal Bhawan', ['Ground', 'First', 'Second'], 'M', 'Male', 4], ['BL2', 'ST1', 'Shakti Bhawan', ['Ground', 'First', 'Second'], 'S', 'Female', 4], ['BL3', 'ST2', 'Seva Sadan', ['Ground', 'First'], 'V', 'Any', 6]];
  seq.bl = 3;
  BL.forEach(b => {
    DB.buildings.push({ id: b[0], siteId: b[1], name: b[2], floors: b[3] });
    b[3].forEach((fl, fi) => {
      for (let k = 1; k <= 3; k++) {
        const rid = nid('rm', 'RM', 3); DB.rooms.push({ id: rid, buildingId: b[0], floor: fl, name: b[4] + fi + '0' + k, gender: b[5] });
        for (let j = 0; j < (fi === 0 && b[0] === 'BL3' ? 6 : 4); j++) DB.beds.push({ id: nid('bd', 'BD', 3), roomId: rid, label: String.fromCharCode(65 + j), cleaning: false });
      }
    });
  });
  const pool = { Male: [], Female: [] };
  DB.beds.forEach(b => { const g = room(b.roomId).gender; if (g === 'Male' || g === 'Any') pool.Male.push(b); if (g === 'Female' || g === 'Any') pool.Female.push(b); });
  const takeBed = g => { const b = pool[g === 'Female' ? 'Female' : 'Male'].shift(); if (b) { ['Male', 'Female'].forEach(k => { const i = pool[k].indexOf(b); if (i >= 0) pool[k].splice(i, 1); }); } return b; };

  /* Members */
  const hoods = ['Model Town', 'Civil Lines', 'Gandhi Nagar', 'Rishi Nagar', 'Shastri Nagar', 'Sector 15', 'Guru Nanak Colony'];
  for (let i = 0; i < 60; i++) {
    const male = rnd() < .6, br = rnd() < .8 ? DB.branches[ri(0, 32)] : DB.branches[ri(33, DB.branches.length - 1)];
    const name = male ? pick(MF) + ' ' + (rnd() < .5 ? 'Singh' : pick(SN)) : pick(FF) + ' ' + (rnd() < .6 ? 'Kaur' : pick(SN));
    DB.members.push({
      id: nid('mem', 'NM-', 4), name, photo: null, mobile: mob(), dob: ri(1958, 2003) + '-' + pad(ri(1, 12)) + '-' + pad(ri(1, 28)), gender: male ? 'Male' : 'Female',
      address: `House ${ri(1, 480)}, ${pick(hoods)}, ${br.district}`, state: br.state, district: br.district, branchId: br.id, type: rnd() < .72 ? 'Short-Term' : (rnd() < .7 ? 'Monthly' : 'Long-Term'),
      emName: cname(), emPhone: mob(), emRel: pick(RELS), createdOn: d(-ri(30, 400)), sample: true
    });
  }
  const M = DB.members;
  const setBr = (i, n) => { const b = brByName(n); Object.assign(M[i], { branchId: b.id, state: b.state, district: b.district }); };
  [0, 1, 2, 46, 47, 48, 53, 56].forEach(i => setBr(i, 'Ludhiana')); [3, 4, 49, 50].forEach(i => setBr(i, 'Amritsar'));
  const mkReg = (m, o) => { const r = Object.assign({ id: nid('reg', 'PR-', 4), memberId: m.id, branchId: m.branchId, source: 'Pre-registration', purpose: pick(PURPOSES), prefDept: pick(deptIds), type: m.type, status: 'Draft', remarks: '', history: [], exts: [], createdBy: 'Branch Coordinator', createdOn: d(-5) }, o); DB.regs.push(r); return r; };
  const H = (r, steps) => steps.forEach(s => r.history.push({ at: s[0], by: s[1], text: s[2] }));

  /* A) 24 current residents */
  for (let i = 0; i < 24; i++) {
    const m = M[i];
    if ([2, 5, 9, 13].includes(i)) m.type = 'Monthly'; else if ([7, 16].includes(i)) m.type = 'Long-Term'; else m.type = 'Short-Term';
    let a, e;
    if (m.type === 'Short-Term') { a = -ri(1, 8); e = ri(1, 6); } else if (m.type === 'Monthly') { a = -ri(8, 25); e = ri(5, 25); } else { a = -ri(40, 120); e = ri(30, 120); }
    if ([0, 1, 3].includes(i)) e = 0; if (i === 4) e = -2; if (i === 6) e = -1; if (i === 2) e = 3; if (i === 5) e = 6;
    const r = mkReg(m, { status: 'Checked In', arrival: d(a), departure: d(e), approvedFrom: d(a), approvedTo: d(e), approvedType: m.type, approvedDept: deptIds[i % 7], approvedBy: 'Sewadar Manager', actualIn: d(a) + 'T' + pad(ri(6, 18)) + ':' + pad(ri(0, 59)), createdOn: d(a - 6) });
    H(r, [[r.createdOn + 'T10:00', 'Branch Coordinator', 'Pre-registration created'], [d(a - 5) + 'T11:00', 'Branch Coordinator', 'Submitted for approval'], [d(a - 3) + 'T15:30', 'Sewadar Manager', 'Approved — forwarded to reception'], [r.actualIn, 'Reception Staff', 'Arrival confirmed at reception']]);
    const bed = [10, 11].includes(i) ? null : takeBed(m.gender);
    if (bed) { DB.allocs.push({ id: nid('al', 'AL', 5), regId: r.id, memberId: m.id, bedId: bed.id, from: d(a), to: d(e), active: true, reason: 'Allocation', createdOn: r.actualIn, by: 'Accommodation Manager' }); H(r, [[r.actualIn, 'Accommodation Manager', 'Bed allocated: ' + bedShort(bed)]]); }
    if (![10, 12].includes(i)) {
      const dp = dept(deptIds[i % 7]); DB.duties.push({ id: nid('du', 'DU', 5), regId: r.id, memberId: m.id, deptId: dp.id, shift: SHIFTS[i % 4], supervisor: dp.supervisor, from: d(a), to: d(e), status: 'Active', createdOn: r.actualIn, by: 'Sewadar Manager' });
      for (let k = Math.max(a, -6); k <= 0; k++) { if (k === 0 && i % 2) continue; const x = rnd(); DB.att[attKey(d(k), r.id)] = { status: x < .8 ? 'Present' : x < .9 ? 'Absent' : 'Leave', deptId: dp.id }; }
    }
    if (i === 2) r.exts.push({ to: d(33), reason: 'Seva commitments for Diwali programme', status: 'Pending', by: 'Branch Coordinator', on: d(-1) + 'T10:00' });
    if (i === 7) r.exts.push({ to: d(e + 60), reason: 'Continuing seva in langar department', status: 'Pending', by: 'Branch Coordinator', on: d(-2) + 'T10:00' });
  }
  /* B) past visits (history) */
  const freeBeds = () => DB.beds.filter(b => !DB.allocs.some(a => a.active && a.bedId === b.id));
  const fb = freeBeds(); let k = 0;
  const past = (m, a, e) => {
    const r = mkReg(m, { status: 'Checked Out', arrival: d(a), departure: d(e), approvedFrom: d(a), approvedTo: d(e), approvedType: m.type, approvedDept: pick(deptIds), approvedBy: 'Sewadar Manager', actualIn: d(a) + 'T09:15', actualOut: d(e) + 'T' + pad(ri(8, 17)) + ':30', createdOn: d(a - 4) });
    H(r, [[d(a - 4) + 'T10:00', 'Branch Coordinator', 'Pre-registration created'], [d(a - 3) + 'T10:00', 'Branch Coordinator', 'Submitted for approval'], [d(a - 2) + 'T10:00', 'Sewadar Manager', 'Approved'], [r.actualIn, 'Reception Staff', 'Arrival confirmed'], [r.actualOut, 'Reception Staff', 'Checked out']]);
    const b = fb[(k * 5) % fb.length];
    DB.allocs.push({ id: nid('al', 'AL', 5), regId: r.id, memberId: m.id, bedId: b.id, from: d(a), to: d(e), active: false, endedOn: d(e), endReason: 'Checked out', reason: 'Allocation', createdOn: r.actualIn, by: 'Accommodation Manager' });
    const dp = dept(pick(deptIds)); DB.duties.push({ id: nid('du', 'DU', 5), regId: r.id, memberId: m.id, deptId: dp.id, shift: pick(SHIFTS), supervisor: dp.supervisor, from: d(a), to: d(e), status: 'Ended', endedOn: d(e), createdOn: r.actualIn, by: 'Sewadar Manager' });
    k++; return b;
  };
  for (let i = 24; i < 38; i++) { const recent = i < 28; const a = recent ? -ri(3, 6) : -ri(12, 60); const e = recent ? (i % 2 ? 0 : -1) : a + ri(2, 10); const b = past(M[i], a, e); if (recent) b.cleaning = true; }
  for (let i = 0; i < 5; i++) { const a = -ri(120, 200); past(M[i], a, a + ri(2, 10)); }
  /* C) approved, awaiting arrival; some with reserved beds */
  [0, 0, 0, 1, 1, 1, 3, 5].forEach((o, j) => {
    const i = 38 + j, m = M[i]; if (j === 3) m.type = 'Monthly';
    const e = m.type === 'Monthly' ? o + 30 : o + ri(2, 7);
    const r = mkReg(m, { status: 'Approved', arrival: d(o), departure: d(e), approvedFrom: d(o), approvedTo: d(e), approvedType: m.type, approvedDept: pick(deptIds), approvedBy: 'Sewadar Manager', createdOn: d(-6) });
    H(r, [[d(-6) + 'T10:00', 'Branch Coordinator', 'Pre-registration created'], [d(-5) + 'T10:00', 'Branch Coordinator', 'Submitted for approval'], [d(-2) + 'T16:00', 'Sewadar Manager', 'Approved — forwarded to reception']]);
    if ([0, 3, 6, 7].includes(j)) { const bed = takeBed(m.gender); DB.allocs.push({ id: nid('al', 'AL', 5), regId: r.id, memberId: m.id, bedId: bed.id, from: d(o), to: d(e), active: true, reason: 'Allocation', createdOn: d(-1) + 'T12:00', by: 'Accommodation Manager' }); H(r, [[d(-1) + 'T12:00', 'Accommodation Manager', 'Bed reserved: ' + bedShort(bed)]]); }
  });
  /* D) submitted / draft / rejected */
  for (let i = 46; i < 53; i++) {
    const walk = i === 52, m = M[i];
    const r = mkReg(m, { status: 'Submitted', arrival: d(walk ? 0 : ri(2, 10)), departure: d(walk ? 4 : ri(8, 16)), source: walk ? 'Walk-in' : 'Pre-registration', createdBy: walk ? 'Reception Staff' : 'Branch Coordinator', createdOn: d(-ri(0, 3)) });
    H(r, [[r.createdOn + 'T10:00', r.createdBy, walk ? 'Walk-in registered at reception' : 'Pre-registration created'], [r.createdOn + 'T10:30', r.createdBy, 'Submitted for approval']]);
  }
  for (let i = 53; i < 56; i++) { const r = mkReg(M[i], { status: 'Draft', arrival: d(ri(10, 20)), departure: d(ri(21, 26)), createdOn: d(-1) }); H(r, [[d(-1) + 'T09:00', 'Branch Coordinator', 'Draft created']]); }
  for (let i = 56; i < 58; i++) {
    const r = mkReg(M[i], { status: 'Rejected', arrival: d(2), departure: d(6), remarks: i === 56 ? 'Dates clash with a major event; kindly re-apply after the 20th.' : 'Please attach coordinator confirmation and re-submit.', createdOn: d(-4) });
    H(r, [[d(-4) + 'T10:00', 'Branch Coordinator', 'Pre-registration created'], [d(-4) + 'T11:00', 'Branch Coordinator', 'Submitted for approval'], [d(-3) + 'T14:00', 'Sewadar Manager', 'Rejected — ' + r.remarks]]);
  }
  DB.log.push({ at: t + 'T00:00', by: 'System', text: 'Sample data loaded' });
  return DB;
}

/* Demo sign-in accounts (password from SEED_PASSWORD). */
export const DEMO_USERS = [
  { id: 'u1', username: 'admin', name: 'IT Admin', role: 'superadmin' },
  { id: 'u2', username: 'manager', name: 'Sewadar Manager', role: 'manager' },
  { id: 'u3', username: 'coord.ludhiana', name: 'Coordinator – Ludhiana', role: 'coordinator', branchName: 'Ludhiana' },
  { id: 'u4', username: 'coord.amritsar', name: 'Coordinator – Amritsar', role: 'coordinator', branchName: 'Amritsar' },
  { id: 'u5', username: 'reception', name: 'Reception Staff', role: 'reception' },
  { id: 'u6', username: 'accom', name: 'Accommodation Manager', role: 'accom' },
  { id: 'u7', username: 'supervisor.security', name: 'Supervisor – Security', role: 'supervisor', deptName: 'Security' },
  { id: 'u8', username: 'viewer', name: 'Management Viewer', role: 'viewer' }
];
