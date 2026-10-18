import { useApp } from '../context.jsx';
import { PageHead } from '../components/ui.jsx';
import { ChartCard, HBarChart, LineChart, PartBar, MiniPart, SERIES } from '../components/Charts.jsx';
import { today, fd, fdt, diffDays, dayOf, addDays, MON, relTime } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';

const Icon = ({ d }) => <svg className="ic" viewBox="0 0 24 24"><path d={d} /></svg>;
const I = {
  people: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  home: 'M3 11l9-8 9 8M5 10v10h14V10', inn: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3',
  out: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9', check: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  bed: 'M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8M2 16h20M6 10V7a1 1 0 011-1h4a1 1 0 011 1v3'
};

export default function Dashboard() {
  const { D, me, data, go, setTab, setFs } = useApp();
  const t = today(), R = D.regs(), M = D.members();
  const res = R.filter(r => r.status === 'Checked In'), overdue = res.filter(r => stayEnd(r) < t);
  const arr = R.filter(r => ['Approved', 'Checked In', 'Checked Out'].includes(r.status) && (r.actualIn ? dayOf(r.actualIn) : stayStart(r)) === t), arrived = arr.filter(r => r.actualIn);
  const depExp = R.filter(r => r.status === 'Checked In' && stayEnd(r) === t), depDone = R.filter(r => r.status === 'Checked Out' && dayOf(r.actualOut) === t);
  const subs = R.filter(r => r.status === 'Submitted'), exts = R.filter(r => pendingExt(r));
  const showBeds = D.can('accommodation');
  const sub = <>{D.role.label} · {fd(t)}{me.role === 'coordinator' ? ' · ' + ((D.branch(me.branchId) || {}).name || 'no branch set') + ' branch' : ''}{me.role === 'supervisor' ? ' · ' + ((D.dept(me.deptId) || {}).name || 'no department set') + ' department' : ''}</>;
  const openTab = (page, tab, f) => { if (f) setFs(f); if (tab) setTab(page, tab); go(page); };

  /* beds */
  const st = D.bedStates(), c = { Available: 0, Occupied: 0, Reserved: 0, Cleaning: 0 }; st.forEach(s => c[s.status]++);
  const tot = data.beds.length, occPct = tot ? Math.round(c.Occupied / tot * 100) : 0;
  const BED = [['Occupied', SERIES[0]], ['Reserved', SERIES[1]], ['Cleaning', SERIES[2]], ['Available', '#cbd5e1']];
  const blds = data.buildings.map(b => {
    const ids = new Set(data.rooms.filter(r => r.buildingId === b.id).map(r => r.id)), beds = data.beds.filter(x => ids.has(x.roomId));
    const n = k => beds.filter(x => st.get(x.id).status === k).length;
    return { b, total: beds.length, occ: n('Occupied'), resv: n('Reserved'), cl: n('Cleaning') };
  }).filter(x => x.total);

  /* arrivals & departures: last 14 days (actual) + next 7 days (expected) */
  const days = []; for (let i = -14; i <= 7; i++) days.push(addDays(t, i));
  const arrOn = d => R.filter(r => d <= t ? r.actualIn && dayOf(r.actualIn) === d : r.status === 'Approved' && stayStart(r) === d).length;
  const depOn = d => R.filter(r => d <= t ? r.actualOut && dayOf(r.actualOut) === d : r.status === 'Checked In' && stayEnd(r) === d).length;
  const arrV = days.map(arrOn), depV = days.map(depOn);
  const fmtDay = (d, long) => { const p = d.split('-'); return long ? fd(d) : `${+p[2]} ${MON[+p[1] - 1]}`; };

  /* residents by stay type */
  const ty = x => res.filter(r => stayType(r) === x).length;
  const TYPES3 = [['Short-Term', SERIES[0]], ['Monthly', SERIES[1]], ['Long-Term', SERIES[2]]];

  /* department-wise sewadar (active duties) */
  const depts = data.depts.map(x => ({ id: x.id, label: x.name, value: data.duties.filter(u => u.deptId === x.id && u.status === 'Active' && D.reg(u.regId)).length, sub: 'Supervisor: ' + x.supervisor }))
    .filter(x => me.role !== 'supervisor' || x.id === me.deptId).sort((a, b) => b.value - a.value)
    .map(x => ({ ...x, onClick: D.can('departments') ? () => openTab('departments', 'a', { 'du.dp': x.id, 'du.q': '', 'du.sh': '' }) : undefined }));
  const noDuty = res.filter(r => !D.activeDuty(r.id)).length;

  /* branches with most sewadar residing now */
  const byBr = new Map(); res.forEach(r => byBr.set(r.branchId, (byBr.get(r.branchId) || 0) + 1));
  const topBr = [...byBr.entries()].map(([id, v]) => ({ label: D.bName(id), value: v, sub: (D.branch(id) || {}).state })).sort((a, b) => b.value - a.value).slice(0, 8);

  /* attention list */
  const al = [];
  if (overdue.length) al.push(['bad', `${overdue.length} overdue stay(s): ${overdue.slice(0, 3).map(r => D.mName(r.memberId)).join(', ')}${overdue.length > 3 ? '…' : ''}`, () => openTab('reception', 'd')]);
  const ex = R.filter(r => r.status === 'Checked In' && ['Monthly', 'Long-Term'].includes(stayType(r)) && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7);
  if (ex.length) al.push(['', `${ex.length} monthly/long-term stay(s) expiring within 7 days`, () => go('longterm')]);
  if (showBeds) {
    const nb = R.filter(r => ['Approved', 'Checked In'].includes(r.status) && !D.activeAlloc(r.id)).length; if (nb) al.push(['info', `${nb} approved member(s) waiting for a bed`, () => openTab('accommodation', 'w')]);
    if (c.Cleaning) al.push(['info', `${c.Cleaning} bed(s) pending cleaning`, () => openTab('accommodation', 'c')]);
  }
  if (D.can('departments') && noDuty) al.push(['info', `${noDuty} resident(s) without sewa assignment`, () => openTab('departments', 'a')]);

  const Kpi = ({ label, value, sub, icon, onClick, hero }) => {
    const Tag = onClick ? 'button' : 'div';
    return <Tag type={onClick ? 'button' : undefined} className={'kpi' + (hero ? ' hero' : '')} onClick={onClick}>
      <span className="kicon"><Icon d={icon} /></span><span className="kl">{label}</span><span className="kval">{value}</span>{sub ? <span className="ks">{sub}</span> : null}
    </Tag>;
  };

  return <>
    <PageHead title="Dashboard" sub={sub} />
    <div className="kpis">
      <Kpi hero label="Currently residing" value={res.length} icon={I.home} onClick={() => openTab('reception', 'r')}
        sub={<>{overdue.length ? <span className="pill bad">{overdue.length} overdue</span> : 'None overdue'} · {ty('Short-Term')} short · {ty('Monthly')} monthly · {ty('Long-Term')} long</>} />
      <Kpi label="Registered sewadar" value={M.length.toLocaleString('en-IN')} icon={I.people} onClick={() => go('members')} sub="Member Master" />
      <Kpi label="Today's arrivals" value={<>{arrived.length}<small> / {arr.length}</small></>} icon={I.inn} onClick={() => openTab('reception', 'a')} sub="arrived / expected" />
      <Kpi label="Today's departures" value={<>{depDone.length}<small> / {depExp.length + depDone.length}</small></>} icon={I.out} onClick={() => openTab('reception', 'd')} sub="departed / due" />
      <Kpi label="Pending approvals" value={subs.length + exts.length} icon={I.check} onClick={() => go('approvals')}
        sub={<>{subs.length} registrations · {exts.length} extensions{subs.length + exts.length ? <span className="pill warn">action needed</span> : null}</>} />
      {D.can('visitors') ? (() => { const gv = (data.visits || []).filter(v => v.date === t && ['Confirmed', 'Arrived', 'Completed'].includes(v.status)), ins = gv.filter(v => v.status !== 'Confirmed').length;
        return <Kpi label="Guests today" value={<>{ins}<small> / {gv.length}</small></>} icon={I.inn} onClick={() => openTab('visitors', ['security'].includes(me.role) ? 'gate' : 'sched')} sub={`arrived / expected · ${gv.filter(v => v.vehicle && v.vehicle.has).length} vehicle(s)`} />; })() : null}
      {showBeds ? <Kpi label="Bed occupancy" value={<>{occPct}<small>%</small></>} icon={I.bed} onClick={() => go('accommodation')} sub={`${c.Occupied} of ${tot} beds · ${c.Available} free`} /> : null}
    </div>

    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,520px),1fr))', marginBottom: 0 }}>
      <ChartCard title="Arrivals & departures" sub="Last 14 days (actual) and next 7 days (expected)"
        table={{ cols: ['Date', 'Arrivals', 'Departures'], rows: days.map((d, i) => [fd(d) + (d === t ? ' (today)' : d > t ? ' (expected)' : ''), arrV[i], depV[i]]) }}>
        <LineChart x={days} marker={14} fmtX={fmtDay} series={[{ name: 'Arrivals', color: SERIES[0], values: arrV }, { name: 'Departures', color: SERIES[1], values: depV }]} />
      </ChartCard>
      <div className="grid" style={{ gap: 16 }}>
        {showBeds ? <ChartCard title="Bed availability" sub={`${tot} beds across ${data.buildings.length} building(s)`} className=""
          table={{ cols: ['Status', 'Beds', 'Share'], rows: BED.map(([k]) => [k, c[k], (tot ? Math.round(c[k] / tot * 100) : 0) + '%']) }}
          action={<button type="button" className="btn sm" onClick={() => go('accommodation')}>Bed board →</button>}>
          <PartBar total={tot} parts={BED.map(([k, col]) => ({ label: k, value: c[k], color: col }))} unitLabel=" beds" />
        </ChartCard> : null}
        <ChartCard title="Residents by stay type" sub={`${res.length} sewadar residing now`}
          table={{ cols: ['Stay type', 'Residents'], rows: TYPES3.map(([k]) => [k, ty(k)]) }}>
          {res.length ? <PartBar parts={TYPES3.map(([k, col]) => ({ label: k, value: ty(k), color: col }))} unitLabel=" residents" height={16} /> : <div className="empty">Nobody is residing right now.</div>}
        </ChartCard>
      </div>
    </div>

    <div className="grid g2">
      <ChartCard title="Sewadar by department" sub={`Active sewa assignments${noDuty ? ` · ${noDuty} resident(s) without a department` : ''}`}
        table={{ cols: ['Department', 'Sewadar', 'Supervisor'], rows: depts.map(x => [x.label, x.value, x.sub.replace('Supervisor: ', '')]) }}>
        <HBarChart data={depts} unit=" sewadar" empty="No departments yet." />
      </ChartCard>
      {showBeds ? <ChartCard title="Occupancy by building" sub="Occupied, reserved and cleaning beds as a share of each building"
        table={{ cols: ['Building', 'Beds', 'Occupied', 'Reserved', 'Cleaning', 'Free'], rows: blds.map(x => [x.b.name, x.total, x.occ, x.resv, x.cl, x.total - x.occ - x.resv - x.cl]) }}>
        {blds.length ? <>{blds.map(x => <MiniPart key={x.b.id} label={x.b.name} total={x.total} onClick={() => { setFs({ 'acc.bld': x.b.id, 'acc.site': x.b.siteId }); openTab('accommodation', 'b'); }}
          parts={[{ label: 'Occupied', value: x.occ, color: SERIES[0] }, { label: 'Reserved', value: x.resv, color: SERIES[1] }, { label: 'Cleaning', value: x.cl, color: SERIES[2] }]} />)}
          <div className="vlegend">{BED.slice(0, 3).map(([k, col]) => <span key={k} className="key"><i className="sw" style={{ background: col }} />{k}</span>)}<span className="key"><i className="sw" style={{ background: 'var(--track)' }} />Free</span></div></>
          : <div className="empty">No buildings yet.</div>}
      </ChartCard> : <ChartCard title="Branches with most sewadar residing" sub="Top branches right now"
        table={{ cols: ['Branch', 'State', 'Residing'], rows: topBr.map(x => [x.label, x.sub, x.value]) }}>
        <HBarChart data={topBr} unit=" residing" empty="Nobody is residing right now." />
      </ChartCard>}
    </div>

    <div className="grid g2">
      {showBeds ? <ChartCard title="Branches with most sewadar residing" sub="Top branches right now"
        table={{ cols: ['Branch', 'State', 'Residing'], rows: topBr.map(x => [x.label, x.sub, x.value]) }}>
        <HBarChart data={topBr} unit=" residing" empty="Nobody is residing right now." />
      </ChartCard> : null}
      <div className="card att-list"><h3>Needs attention</h3>
        {al.length ? al.map((a, i) => <div key={i} className={'alert ' + a[0]}><span>{a[1]}</span><button type="button" className="btn sm" onClick={a[2]}>Open</button></div>) : <div className="empty">Nothing needs attention.</div>}
      </div>
      {me.role !== 'coordinator' && me.role !== 'supervisor' ? <div className="card"><h3>Recent activity</h3>
        <ul className="activity">{data.log.slice(0, 8).map((l, i) => <li key={i}><div>{l.text}<br /><small>{relTime(l.at)} · {l.by}</small></div></li>)}</ul>
        {!data.log.length ? <div className="empty">No activity yet.</div> : null}
      </div> : null}
    </div>
  </>;
}
