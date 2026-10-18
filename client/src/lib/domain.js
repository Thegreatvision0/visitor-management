/* Read-only view helpers over the snapshot the API returns (already scoped to the signed-in user).
   All writes go through the API, which re-checks every rule. */
import { overlaps, dayOf } from '@shared/dates.js';
import { stayStart, stayEnd, LIVE } from '@shared/constants.js';

/** Performance rating from % present. */
export const perfRating = pct => pct == null ? '—' : pct >= 90 ? 'Excellent' : pct >= 75 ? 'Good' : pct >= 50 ? 'Average' : 'Poor';

export function makeDomain(data, me) {
  const idx = list => new Map(list.map(x => [x.id, x]));
  const M = idx(data.members), R = idx(data.regs), B = idx(data.branches), DP = idx(data.depts);
  const BD = idx(data.beds), RM = idx(data.rooms), BL = idx(data.buildings), ST = idx(data.sites);
  const aByReg = new Map(), dByReg = new Map();
  data.allocs.forEach(a => { if (a.active) aByReg.set(a.regId, a); });
  data.duties.forEach(d => { if (d.status === 'Active') dByReg.set(d.regId, d); });
  const role = data.roles[me.role] || { label: me.role, pages: {} };

  const member = id => M.get(id), reg = id => R.get(id), branch = id => B.get(id);
  const dept = id => DP.get(id) || (id && data.tomb && data.tomb[id] ? { id, name: data.tomb[id] + ' (removed)', supervisor: '', active: false, removed: true } : undefined);
  const bedO = id => BD.get(id), room = id => RM.get(id), bldg = id => BL.get(id), site = id => ST.get(id);
  const bName = id => branchLabel(id), dName = id => (dept(id) || {}).name || '—';
  const mName = id => { const m = member(id); return m ? m.name : '?'; };
  const activeAlloc = regId => aByReg.get(regId), activeDuty = regId => dByReg.get(regId);
  const bedShort = b => { if (!b) return 'Removed bed'; const rm = room(b.roomId) || {}, bl = bldg(rm.buildingId) || {}; return `${bl.name} · ${rm.name} · Bed ${b.label}`; };
  const bedPath = b => { if (!b) return 'Removed bed'; const rm = room(b.roomId) || {}, bl = bldg(rm.buildingId) || {}, st = site(bl.siteId) || {}; return `${st.name} › ${bl.name} › ${rm.floor} Floor › ${rm.name} › Bed ${b.label}`; };
  /* a past allocation may point at a deleted bed: its text was saved on the record at deletion time */
  const allocBedText = a => bedO(a.bedId) ? bedShort(bedO(a.bedId)) : (a.bedPath || 'Removed bed');

  /* page access (the API enforces the same rules) */
  /* this user's effective access (role + any guest visit permissions given to the user) */
  const pages = data.myPages || role.pages, vcaps = data.vcaps || [];
  const can = p => !!pages[p], canEdit = p => pages[p] === 'e', hasCap = c => vcaps.includes(c);
  const canDept = id => canEdit('departments') && (me.role !== 'supervisor' || me.deptId === id);
  /* a coordinator works with their branch and every sub-branch below it */
  const family = new Set(data.family || []);
  const inScope = branchId => me.role !== 'coordinator' || family.has(branchId);
  const canEditMember = m => canEdit('members') && inScope(m.branchId);
  const isMgmt = ['superadmin', 'manager'].includes(me.role);

  const regs = () => data.regs;
  const members = () => me.role === 'coordinator' ? data.members.filter(m => family.has(m.branchId)) : data.members;

  /* Bed status: Cleaning > Occupied (checked-in allocation) > Reserved (approved, not yet in) > Available */
  let bs = null;
  const bedStates = () => {
    if (bs) return bs;
    bs = new Map();
    data.beds.forEach(b => bs.set(b.id, { status: b.cleaning ? 'Cleaning' : 'Available', alloc: null, reg: null, member: null }));
    data.allocs.filter(a => a.active).forEach(a => {
      const s = bs.get(a.bedId); if (!s) return; const r = reg(a.regId);
      s.alloc = a; s.reg = r; s.member = member(a.memberId);
      /* a bed reserved for a guest visit's residence: occupied once the guest has arrived */
      const gv = a.guestName ? (data.visits || []).find(x => x.id === a.regId) : null;
      if (a.guestName) s.guest = a.guestName;
      if (!bedO(a.bedId).cleaning) s.status = (r && r.status === 'Checked In') || (gv && gv.status === 'Arrived') ? 'Occupied' : 'Reserved';
    });
    return bs;
  };
  const conflicts = (bedId, from, to, ignore) => data.allocs.filter(a => a.active && a.bedId === bedId && a.id !== ignore && overlaps(a.from, a.to, from, to));
  const memberStatus = m => { for (const s of ['Checked In', 'Approved', 'Submitted']) { if (data.regs.some(r => r.memberId === m.id && r.status === s)) return s === 'Checked In' ? 'Resident' : s; } return ''; };
  const liveReg = mid => data.regs.find(r => r.memberId === mid && LIVE.includes(r.status));

  /* sewa & attendance */
  const dutyOn = (regId, date) => { const l = data.duties.filter(d => d.regId === regId && d.from <= date && date <= d.to); return l.find(d => d.status === 'Active') || l[0]; };
  const attStatus = (date, regId) => (data.att[date + '|' + regId] || {}).status || 'Not Marked';
  const attPct = regId => { let p = 0, n = 0; Object.keys(data.att).forEach(k => { if (k.split('|')[1] === regId) { n++; if (data.att[k].status === 'Present') p++; } }); return n ? Math.round(p / n * 100) : null; };
  const onSite = (r, date) => r && r.actualIn && dayOf(r.actualIn) <= date && (!r.actualOut || dayOf(r.actualOut) >= date);
  /** Attendance totals and records of one member across all visits (overall performance). */
  const memberAtt = memberId => {
    const rids = new Set(data.regs.filter(r => r.memberId === memberId).map(r => r.id)), rows = [], n = { Present: 0, Absent: 0, Leave: 0 };
    Object.keys(data.att).forEach(k => { const [date, regId] = k.split('|'); if (!rids.has(regId)) return; const a = data.att[k]; if (n[a.status] != null) n[a.status]++; rows.push({ date, regId, deptId: a.deptId, status: a.status }); });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const total = n.Present + n.Absent + n.Leave, pct = total ? Math.round(n.Present / total * 100) : null;
    return { ...n, total, pct, rating: perfRating(pct), rows };
  };

  /** When a request last entered the approval queue (newest-first sorting). */
  const submittedAt = r => r.submittedOn || (r.history.filter(h => /submitted|sent for approval|back to pending/i.test(h.text)).pop() || {}).at || r.createdOn || '';
  const lastActivity = r => (r.history[r.history.length - 1] || {}).at || r.createdOn || '';

  /* branches: sub-branches are shown as "Parent › Sub" */
  const branchLabel = id => { const b = branch(id); if (!b) return '—'; const p = b.parentId && branch(b.parentId); return p ? `${branchLabel(p.id)} › ${b.name}` : b.name; };

  /* options */
  const branchOpts = () => data.branches.filter(b => inScope(b.id)).map(b => ({ v: b.id, l: branchLabel(b.id), state: b.state })).sort((a, b) => a.l.localeCompare(b.l));
  const deptOpts = () => data.depts.filter(x => x.active).map(x => ({ v: x.id, l: x.name }));
  const L = data.lists, STATES = L.states, RELS = L.rels, SHIFTS = L.shifts.map(x => x.name);
  const SHIFT_LBL = {}; L.shifts.forEach(x => { SHIFT_LBL[x.name] = x.time ? `${x.name} (${x.time})` : x.name; });
  const shiftLbl = x => SHIFT_LBL[x] || x;

  return {
    data, me, role, roles: data.roles, member, reg, branch, dept, bedO, room, bldg, site, bName, dName, mName,
    activeAlloc, activeDuty, bedShort, bedPath, allocBedText, can, canEdit, hasCap, vcaps, canDept, canEditMember, isMgmt, family, inScope,
    regs, members, bedStates, conflicts, memberStatus, liveReg, dutyOn, attStatus, attPct, onSite, memberAtt, submittedAt, lastActivity, branchLabel,
    branchOpts, deptOpts, STATES, RELS, SHIFTS, shiftLbl, stayStart, stayEnd
  };
}
