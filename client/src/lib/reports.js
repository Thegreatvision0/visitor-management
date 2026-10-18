/* Report definitions — computed in the browser from the user's (already scoped) snapshot.
   Every report takes the same filter context: a period window (daily / weekly / monthly / quarterly /
   annual / financial year / custom), branch (including its sub-branches), state, department and search. */
import { fd, fdt, today, addDays, diffDays, dayOf, overlaps, MON, pad } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';
import { perfRating } from './domain.js';

/* ---------- periods ---------- */
export const PERIODS = [
  { v: 'all', l: 'All time' }, { v: 'day', l: 'Daily' }, { v: 'week', l: 'Weekly' }, { v: 'month', l: 'Monthly' },
  { v: 'quarter', l: 'Quarterly' }, { v: 'year', l: 'Annually (Jan – Dec)' }, { v: 'fy', l: 'Financial year (Apr – Mar)' }, { v: 'custom', l: 'Custom dates' }
];
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m is 1-12
const parts = s => s.split('-').map(Number);

/** The period of `kind` that contains the date `at`: { from, to, label }. Weeks run Monday – Sunday. */
export function periodRange(kind, at) {
  const [y, m] = parts(at);
  if (kind === 'day') return { from: at, to: at, label: fd(at) };
  if (kind === 'week') { const dow = (new Date(at + 'T00:00:00').getDay() + 6) % 7, from = addDays(at, -dow), to = addDays(from, 6); return { from, to, label: `Week ${fd(from)} – ${fd(to)}` }; }
  if (kind === 'month') return { from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)), label: `${MON[m - 1]} ${y}` };
  if (kind === 'quarter') { const q = Math.floor((m - 1) / 3), s = q * 3 + 1; return { from: ymd(y, s, 1), to: ymd(y, s + 2, lastDay(y, s + 2)), label: `Q${q + 1} ${y} (${MON[s - 1]} – ${MON[s + 1]})` }; }
  if (kind === 'year') return { from: ymd(y, 1, 1), to: ymd(y, 12, 31), label: String(y) };
  if (kind === 'fy') { const s = m >= 4 ? y : y - 1; return { from: ymd(s, 4, 1), to: ymd(s + 1, 3, 31), label: `FY ${s}–${String(s + 1).slice(2)} (Apr ${s} – Mar ${s + 1})` }; }
  return { from: '', to: '', label: 'All time' };
}
/** Move `at` to the same kind of period before (dir = -1) or after (dir = 1). */
export function shiftPeriod(kind, at, dir) {
  if (kind === 'day') return addDays(at, dir);
  if (kind === 'week') return addDays(at, 7 * dir);
  const months = { month: 1, quarter: 3, year: 12, fy: 12 }[kind] || 0;
  const [y, m] = parts(at), t = (y * 12 + (m - 1)) + months * dir;
  return ymd(Math.floor(t / 12), (t % 12) + 1, 1);
}

/** Filter context from the page's filter state. */
export function reportCtx(f, D) {
  const per = f['rp.per'] || 'all', at = f['rp.at'] || today();
  let from = '', to = '', label = 'All time';
  if (per === 'custom') { from = f['rp.from'] || ''; to = f['rp.to'] || ''; label = from || to ? `${from ? fd(from) : 'start'} – ${to ? fd(to) : 'today'}` : 'All time'; }
  else if (per !== 'all') ({ from, to, label } = periodRange(per, at));
  /* a branch includes all of its sub-branches */
  let brs = null;
  if (f['rp.br']) { brs = new Set([f['rp.br']]); D.data.branches.forEach(() => D.data.branches.forEach(b => { if (brs.has(b.parentId)) brs.add(b.id); })); }
  return { per, at, from, to, label, br: f['rp.br'] || '', brs, st: f['rp.st'] || '', dp: f['rp.dp'] || '', q: (f['rp.q'] || '').toLowerCase(), grp: f['rp.grp'] || 'branch' };
}

export function makeReports(D) {
  const { data, me } = D;
  const bState = id => (D.branch(id) || {}).state;
  /* shared filters */
  const inBr = (c, id) => (!c.brs || c.brs.has(id)) && (!c.st || bState(id) === c.st);
  const inWin = (c, d) => !!d && (!c.from || d >= c.from) && (!c.to || d <= c.to);
  const ovWin = (c, a, b) => (!c.from && !c.to) || overlaps(a, b, c.from || '0000-01-01', c.to || '9999-12-31');
  const matchQ = (c, mid) => { if (!c.q) return true; const m = D.member(mid) || {}; return ((m.name || '') + mid + (m.mobile || '')).toLowerCase().includes(c.q); };
  /* was on site at some point in the window (arrived, and not gone before it started) */
  const stayedIn = (c, r) => !!r.actualIn && (!c.to || dayOf(r.actualIn) <= c.to) && (!c.from || !r.actualOut || dayOf(r.actualOut) >= c.from);
  const approvedAt = r => (r.history.filter(h => /^Approved|approved by management/.test(h.text)).pop() || {}).at || '';
  const bedCols = r => { const a = D.activeAlloc(r.id); if (!a) return ['', '', '']; const b = D.bedO(a.bedId), rm = D.room(b.roomId); return [(D.bldg(rm.buildingId) || {}).name, rm.floor + ' / ' + rm.name, 'Bed ' + b.label]; };
  const deptOf = r => { const d = D.activeDuty(r.id); return d ? D.dName(d.deptId) : ''; };
  const mob = id => (D.member(id) || {}).mobile || '';

  return [
    { id: 'summary', name: 'Summary — branch, state or period wise', uses: ['period', 'branch', 'state', 'group'], run(c) {
      const R = D.regs().filter(r => r.status !== 'Draft' && inBr(c, r.branchId));
      /* time buckets inside the window (for "group by month / week / day") */
      const timeGroup = ['month', 'week', 'day'].includes(c.grp);
      let buckets = [];
      if (timeGroup) {
        const dates = R.flatMap(r => [dayOf(r.createdOn), dayOf(r.actualIn), dayOf(r.actualOut)]).filter(Boolean).sort();
        let at = c.from || dates[0] || today(); const end = c.to || today();
        for (let i = 0; at <= end && i < 400; i++) { const p = periodRange(c.grp, at); buckets.push({ key: p.from, label: p.label, from: p.from, to: p.to }); at = addDays(p.to, 1); }
      }
      const keyOf = (r, date) => c.grp === 'state' ? (bState(r.branchId) || '—') : c.grp === 'branch' ? r.branchId : (buckets.find(b => date >= b.from && date <= b.to) || {}).key;
      const rows = new Map(), row = k => { if (!rows.has(k)) rows.set(k, { req: 0, app: 0, arr: 0, dep: 0, stay: new Set(), P: 0, n: 0 }); return rows.get(k); };
      buckets.forEach(b => row(b.key));
      const tot = { req: 0, app: 0, arr: 0, dep: 0, stay: new Set(), P: 0, n: 0 };
      const add = (r, date, f) => { const k = keyOf(r, date); if (k == null) return; f(row(k)); f(tot); };
      R.forEach(r => {
        const sub = dayOf(D.submittedAt(r)); if (inWin(c, sub)) add(r, sub, x => x.req++);
        const ap = dayOf(approvedAt(r)); if (ap && inWin(c, ap)) add(r, ap, x => x.app++);
        if (inWin(c, dayOf(r.actualIn))) add(r, dayOf(r.actualIn), x => x.arr++);
        if (inWin(c, dayOf(r.actualOut))) add(r, dayOf(r.actualOut), x => x.dep++);
        if (timeGroup) buckets.forEach(b => { if (stayedIn({ from: b.from, to: b.to }, r)) { row(b.key).stay.add(r.memberId); tot.stay.add(r.memberId); } });
        else if (stayedIn(c, r)) add(r, '', x => x.stay.add(r.memberId));
      });
      Object.keys(data.att).forEach(k => {
        const [dt, rid] = k.split('|'), r = D.reg(rid);
        if (!r || r.status === 'Draft' || !inBr(c, r.branchId) || !inWin(c, dt)) return;
        add(r, dt, x => { x.n++; if (data.att[k].status === 'Present') x.P++; });
      });
      const pct = x => x.n ? Math.round(x.P / x.n * 100) + '%' : '—';
      const line = (label, x) => [label, x.req, x.app, x.arr, x.dep, x.stay.size, x.P, pct(x)];
      let out = [...rows.entries()];
      if (!timeGroup) out = out.filter(([, x]) => x.req || x.app || x.arr || x.dep || x.stay.size || x.n);
      const label = k => c.grp === 'branch' ? D.bName(k) : c.grp === 'state' ? k : (buckets.find(b => b.key === k) || {}).label;
      const list = out.map(([k, x]) => ({ k, sort: timeGroup ? k : label(k), cells: line(label(k), x) }))
        .sort((a, b) => timeGroup ? a.sort.localeCompare(b.sort) : a.sort.localeCompare(b.sort)).map(x => x.cells);
      const head = { branch: 'Branch', state: 'State', month: 'Month', week: 'Week', day: 'Day' }[c.grp];
      return { cols: [head, 'Requests received', 'Approved', 'Arrivals', 'Departures', 'Sewadar stayed', 'Sewa days present', 'Attendance %'], rows: list,
        total: line('Total', tot),
        note: (timeGroup ? '' : `${head === 'Branch' ? 'Branches' : 'States'} with no activity in the period are not listed. `) + 'Sewadar stayed = members on site at any time in the period.' };
    } },
    { id: 'resident', name: 'Resident register', uses: ['period', 'branch', 'state', 'dept', 'q'], run(c) {
      /* "All time" = who is residing now; a period = everyone who stayed during it */
      const L = D.regs().filter(r => (c.from || c.to ? stayedIn(c, r) : r.status === 'Checked In') && inBr(c, r.branchId) && (!c.dp || (D.activeDuty(r.id) || {}).deptId === c.dp) && matchQ(c, r.memberId))
        .sort((a, b) => (b.actualIn || '').localeCompare(a.actualIn || ''));
      return { cols: ['Member ID', 'Name', 'Mobile', 'Branch', 'Type', 'Arrived', 'Departed / expected out', 'Building', 'Floor / Room', 'Bed', 'Department'],
        rows: L.map(r => [r.memberId, D.mName(r.memberId), mob(r.memberId), D.bName(r.branchId), stayType(r), fdt(r.actualIn), r.actualOut ? fdt(r.actualOut) : fd(stayEnd(r)), ...bedCols(r), deptOf(r)]),
        note: c.from || c.to ? 'Everyone who stayed at any time in the period.' : 'Sewadar residing right now. Choose a period to see who stayed then.' };
    } },
    { id: 'today', name: 'Arrivals & departures', uses: ['period', 'branch', 'state', 'q'], run(c) {
      const w = c.from || c.to ? c : { from: today(), to: today() }; // no period chosen → today
      const rows = [];
      D.regs().filter(r => inBr(c, r.branchId) && matchQ(c, r.memberId)).forEach(r => {
        const arrD = r.actualIn ? dayOf(r.actualIn) : stayStart(r);
        if (inWin(w, arrD) && ['Approved', 'Checked In', 'Checked Out'].includes(r.status)) rows.push([arrD, r.memberId, D.mName(r.memberId), D.bName(r.branchId), 'Arrival', r.actualIn ? fdt(r.actualIn) : fd(stayStart(r)), r.actualIn ? 'Arrived' : 'Expected']);
        const depD = r.actualOut ? dayOf(r.actualOut) : stayEnd(r);
        if (inWin(w, depD) && ['Checked In', 'Checked Out'].includes(r.status)) rows.push([depD, r.memberId, D.mName(r.memberId), D.bName(r.branchId), 'Departure', r.actualOut ? fdt(r.actualOut) : fd(stayEnd(r)), r.actualOut ? 'Departed' : 'Expected']);
      });
      rows.sort((a, b) => b[0].localeCompare(a[0]));
      return { cols: ['Member ID', 'Name', 'Branch', 'Movement', 'Date / time', 'Status'], rows: rows.map(r => r.slice(1)), note: c.from || c.to ? '' : 'Showing today. Choose a period for other days.' };
    } },
    { id: 'branch', name: 'Branch-wise sewadar', uses: ['period', 'branch', 'state'], run(c) {
      return { cols: ['Branch', 'State', 'Members', 'Requests', 'Approved', 'Arrived', 'Stayed in period', 'Residing now'],
        rows: data.branches.filter(b => D.inScope(b.id) && inBr(c, b.id)).sort((a, b) => D.bName(a.id).localeCompare(D.bName(b.id))).map(b => {
          const R = D.regs().filter(r => r.branchId === b.id && ovWin(c, stayStart(r), stayEnd(r)));
          return [D.bName(b.id), b.state, data.members.filter(m => m.branchId === b.id).length, R.length, R.filter(r => r.approvedFrom).length, R.filter(r => inWin(c, dayOf(r.actualIn)) || (!c.from && !c.to && r.actualIn)).length, R.filter(r => stayedIn(c, r)).length, R.filter(r => r.status === 'Checked In').length];
        }) };
    } },
    { id: 'state', name: 'State-wise sewadar', uses: ['period', 'state'], run(c) {
      const g = {};
      data.branches.filter(b => inBr(c, b.id)).forEach(b => { g[b.state] = g[b.state] || { b: 0, m: 0, r: 0, a: 0, s: 0, n: 0 }; g[b.state].b++; g[b.state].m += data.members.filter(m => m.branchId === b.id).length; });
      D.regs().filter(r => ovWin(c, stayStart(r), stayEnd(r))).forEach(r => {
        const s = g[bState(r.branchId)]; if (!s) return;
        s.r++; if (inWin(c, dayOf(r.actualIn)) || (!c.from && !c.to && r.actualIn)) s.a++; if (stayedIn(c, r)) s.s++; if (r.status === 'Checked In') s.n++;
      });
      return { cols: ['State', 'Branches', 'Members', 'Requests', 'Arrived', 'Stayed in period', 'Residing now'], rows: Object.keys(g).sort().map(k => [k, g[k].b, g[k].m, g[k].r, g[k].a, g[k].s, g[k].n]) };
    } },
    { id: 'dept', name: 'Department-wise allocation & attendance', uses: ['period', 'branch', 'state', 'dept', 'q'], run(c) {
      const from = c.from || addDays(today(), -6), to = c.to || today(), rows = [];
      data.duties.filter(d => { const r = D.reg(d.regId); return r && inBr(c, r.branchId) && (me.role !== 'supervisor' || d.deptId === me.deptId) && (!c.dp || d.deptId === c.dp) && overlaps(d.from, d.to, from, to) && matchQ(c, d.memberId); })
        .sort((a, b) => D.dName(a.deptId).localeCompare(D.dName(b.deptId))).forEach(d => {
          const n = { Present: 0, Absent: 0, Leave: 0 };
          Object.keys(data.att).forEach(k => { const [dt, rid] = k.split('|'), a = data.att[k]; if (rid === d.regId && dt >= from && dt <= to && dt >= d.from && dt <= d.to && a.deptId === d.deptId && n[a.status] != null) n[a.status]++; });
          rows.push([D.dName(d.deptId), D.mName(d.memberId), D.bName(D.reg(d.regId).branchId), d.shift, fd(d.from) + ' – ' + fd(d.to), d.status, n.Present, n.Absent, n.Leave]);
        });
      return { cols: ['Department', 'Member', 'Branch', 'Shift', 'Duty period', 'Status', 'Present', 'Absent', 'Leave'], rows, note: `Attendance counted ${fd(from)} – ${fd(to)}${c.from || c.to ? '' : ' (last 7 days — choose a period to change)'}` };
    } },
    { id: 'attendance', name: 'Member attendance & performance', uses: ['period', 'branch', 'state', 'dept', 'q'], run(c) {
      /* one row per member: attendance over all their visits (or within the period), with a rating */
      const by = new Map();
      Object.keys(data.att).forEach(k => {
        const [dt, rid] = k.split('|'), a = data.att[k], r = D.reg(rid);
        if (!r || !inWin(c, dt) || !inBr(c, r.branchId) || (c.dp && a.deptId !== c.dp)) return;
        if (me.role === 'supervisor' && a.deptId !== me.deptId) return;
        const x = by.get(r.memberId) || { regs: new Set(), Present: 0, Absent: 0, Leave: 0, last: '' };
        x.regs.add(rid); if (x[a.status] != null) x[a.status]++; if (dt > x.last) x.last = dt;
        by.set(r.memberId, x);
      });
      const rows = [...by.entries()].filter(([mid]) => matchQ(c, mid)).map(([mid, x]) => {
        const tot = x.Present + x.Absent + x.Leave, pct = tot ? Math.round(x.Present / tot * 100) : null, m = D.member(mid) || {};
        return [mid, D.mName(mid), D.bName(m.branchId), x.regs.size, tot, x.Present, x.Absent, x.Leave, pct == null ? '—' : pct + '%', perfRating(pct), fd(x.last), pct == null ? -1 : pct];
      }).sort((a, b) => b[11] - a[11] || b[4] - a[4]).map(r => r.slice(0, 11));
      return { cols: ['Member ID', 'Name', 'Branch', 'Visits', 'Days marked', 'Present', 'Absent', 'Leave', '% Present', 'Performance', 'Last marked'], rows,
        note: 'Performance: Excellent ≥ 90% present · Good ≥ 75% · Average ≥ 50% · Poor below 50%. Open a member (Member Master → View) for their day-by-day record.' };
    } },
    { id: 'visits', name: 'Guest visits & parking', uses: ['period', 'q'], run(c) {
      const L = (data.visits || []).filter(v => v.date && inWin(c, v.date) && (!c.q || [v.id, v.guest && v.guest.name, v.guest && v.guest.mobile, v.vehicle && v.vehicle.number, v.hostName, v.meetWith, v.deptName, D.dName(v.deptId)].join(' ').toLowerCase().includes(c.q)))
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      const vt = v => v.vehicle && v.vehicle.has ? v.vehicle.type : '', vn = v => v.vehicle && v.vehicle.has ? v.vehicle.number : '';
      return { cols: ['Date', 'Time', 'Visit', 'Guest', 'Organisation', 'People', 'Meeting with', 'Department', 'Host', 'Vehicle type', 'Vehicle number', 'Parking', 'Office', 'Golf car', 'Residence', 'Status', 'Entry', 'Exit'],
        rows: L.map(v => [fd(v.date), v.time, v.id, (v.guest && v.guest.name) || '', (v.guest && v.guest.organisation) || '', (v.guest && v.guest.people) || '', v.meetWith || '', v.deptId ? D.dName(v.deptId) : (v.deptName || ''), v.hostName, vt(v), vn(v), v.parking || '', v.office || '', v.golfCart ? 'Yes' : '', v.stay && v.stay.needed ? `${v.stay.beds} bed(s), ${(D.room(v.stay.roomId) || {}).name || ''}, ${fd(v.stay.from)} – ${fd(addDays(v.stay.to, 1))}` : '', v.status, v.entryAt ? fdt(v.entryAt) : '', v.exitAt ? fdt(v.exitAt) : '']),
        note: `${L.filter(v => v.parking === 'Baikunth Dwar').length} at Baikunth Dwar · ${L.filter(v => v.parking === 'Abhinandan Dwar').length} at Abhinandan Dwar · ${L.filter(v => v.office).length} office booking(s) · ${L.filter(v => v.golfCart).length} golf car(s) · ${L.filter(v => v.stay && v.stay.needed).reduce((a, v) => a + (v.stay.beds || 0), 0)} residence bed(s)` };
    } },
    { id: 'occ', name: 'Accommodation occupancy (current)', uses: [], run() {
      const st = D.bedStates();
      return { cols: ['Site', 'Building', 'Floor', 'Room', 'Beds', 'Occupied', 'Reserved', 'Cleaning', 'Vacant'], rows: data.rooms.map(rm => {
        const bl = D.bldg(rm.buildingId) || {}, bs = data.beds.filter(b => b.roomId === rm.id), n = k => bs.filter(b => st.get(b.id).status === k).length;
        return [(D.site(bl.siteId) || {}).name, bl.name, rm.floor, rm.name, bs.length, n('Occupied'), n('Reserved'), n('Cleaning'), n('Available')];
      }), note: 'Current bed status — the period, branch and state filters do not apply.' };
    } },
    { id: 'vacant', name: 'Vacant beds (current)', uses: [], run() {
      const st = D.bedStates();
      return { cols: ['Site', 'Building', 'Floor', 'Room', 'Intended for', 'Bed'], rows: data.beds.filter(b => st.get(b.id).status === 'Available').map(b => { const rm = D.room(b.roomId), bl = D.bldg(rm.buildingId) || {}; return [(D.site(bl.siteId) || {}).name, bl.name, rm.floor, rm.name, rm.gender, b.label]; }),
        note: 'Current bed status — the period, branch and state filters do not apply.' };
    } },
    { id: 'pending', name: 'Pending approvals', uses: ['period', 'branch', 'state', 'q'], run(c) {
      const L = D.regs().filter(r => r.status === 'Submitted' && inBr(c, r.branchId) && matchQ(c, r.memberId) && (!c.from && !c.to || inWin(c, dayOf(D.submittedAt(r)))))
        .sort((a, b) => D.submittedAt(b).localeCompare(D.submittedAt(a)));
      return { cols: ['Received', 'Request', 'Member', 'Branch', 'Requested stay', 'Type', 'Source', 'Status'], rows: L.map(r => [fdt(D.submittedAt(r)), r.id, D.mName(r.memberId), D.bName(r.branchId), fd(r.arrival) + ' – ' + fd(r.departure), r.type, r.source, r.status]),
        note: c.from || c.to ? 'Requests received in the period that are still waiting.' : '' };
    } },
    { id: 'overdue', name: 'Overdue stays & extension requests (current)', uses: ['branch', 'state'], run(c) {
      const t = today(), rows = [];
      D.regs().filter(r => inBr(c, r.branchId)).forEach(r => {
        if (r.status === 'Checked In' && stayEnd(r) < t) rows.push([r.memberId, D.mName(r.memberId), D.bName(r.branchId), 'Overdue stay', fd(stayEnd(r)), (-diffDays(t, stayEnd(r))) + ' day(s) overdue', 'Overdue']);
        const e = pendingExt(r); if (e) rows.push([r.memberId, D.mName(r.memberId), D.bName(r.branchId), 'Extension request', fd(e.to), e.reason, 'Pending']);
      });
      return { cols: ['Member ID', 'Name', 'Branch', 'Item', 'Date', 'Detail', 'Status'], rows };
    } },
    { id: 'history', name: 'Member visit & stay history', uses: ['period', 'branch', 'state', 'q'], run(c) {
      return { cols: ['Member ID', 'Name', 'Branch', 'Request', 'Stay', 'Type', 'Arrived', 'Departed', 'Bed', 'Department', 'Status'],
        rows: D.regs().filter(r => r.status !== 'Draft' && inBr(c, r.branchId) && matchQ(c, r.memberId) && ovWin(c, stayStart(r), stayEnd(r)))
          .sort((a, b) => b.memberId.localeCompare(a.memberId) || stayStart(b).localeCompare(stayStart(a))).map(r => {
            const al = data.allocs.filter(a => a.regId === r.id).pop(), du = data.duties.filter(x => x.regId === r.id).pop();
            return [r.memberId, D.mName(r.memberId), D.bName(r.branchId), r.id, fd(stayStart(r)) + ' – ' + fd(stayEnd(r)), stayType(r), fdt(r.actualIn), fdt(r.actualOut), al ? D.allocBedText(al) : '', du ? D.dName(du.deptId) : '', r.status];
          }) };
    } },
    { id: 'lt', name: 'Monthly & long-term sewadar', uses: ['period', 'branch', 'state', 'q'], run(c) {
      return { cols: ['Member ID', 'Name', 'Branch', 'Type', 'Approved stay', 'Days left', 'Bed', 'Department', 'Status'],
        rows: D.regs().filter(r => ['Monthly', 'Long-Term'].includes(stayType(r)) && ['Approved', 'Checked In', 'Checked Out'].includes(r.status) && inBr(c, r.branchId) && matchQ(c, r.memberId) && ovWin(c, stayStart(r), stayEnd(r))).map(r => {
          const a = D.activeAlloc(r.id);
          return [r.memberId, D.mName(r.memberId), D.bName(r.branchId), stayType(r), fd(stayStart(r)) + ' – ' + fd(stayEnd(r)), r.status === 'Checked Out' ? '—' : diffDays(today(), stayEnd(r)), a ? D.bedShort(D.bedO(a.bedId)) : '', deptOf(r), r.status];
        }) };
    } }
  ];
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Download the report as CSV (UTF-8 with BOM, opens in Excel) or as an .xls HTML table. The filters are written above the table. */
export function exportReport(rep, out, kind, meta) {
  const slug = meta && meta.short ? '_' + meta.short.replace(/\(.*\)/, '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
  const name = `nurmahal_${rep.id}${slug}_${today()}`;
  const rows = out.total ? out.rows.concat([out.total]) : out.rows;
  const info = meta ? [[rep.name], ['Period: ' + meta.period], ['Filters: ' + meta.filters], ['Exported: ' + fdt(today() + 'T' + new Date().toTimeString().slice(0, 5))], []] : [];
  let blob;
  if (kind === 'csv') { const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`; blob = new Blob(['﻿' + info.concat([out.cols], rows).map(r => r.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }); }
  else blob = new Blob([`<html><head><meta charset="utf-8"></head><body>${info.filter(r => r.length).map(r => `<div>${esc(r[0])}</div>`).join('')}<br><table border="1"><tr>${out.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + (kind === 'csv' ? '.csv' : '.xls');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
