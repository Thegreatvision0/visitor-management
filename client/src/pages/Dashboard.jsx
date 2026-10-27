import { useApp } from '../context.jsx';
import { PageHead } from '../components/ui.jsx';
import { ChartCard, HBarChart, LineChart, PartBar, MiniPart, SERIES } from '../components/Charts.jsx';
import { today, fd, fdt, diffDays, dayOf, addDays, MON, relTime } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';
import { counts, Help, COUNT_HELP } from '../lib/counts.jsx';
import { approveOpen, rcArrive, regView } from '../modals/regs.jsx';
import { bedClean, bedExtend } from '../modals/beds.jsx';

/* "Today's tasks": what needs doing now, each row with its one-click action. groups: [key, title, cls, rows, all] */
function TodayTasks({ groups }) {
  const live = groups.filter(g => g[3].length), total = live.reduce((n, g) => n + g[3].length, 0);
  return <div className="card tasks"><div className="tasks-h"><h3>Today's tasks</h3>{total ? <span className="b warn">{total} to do</span> : <span className="b ok">All done</span>}</div>
    {live.length ? <div className="tasks-g">{live.map(([k, title, cls, rows, all]) => <section key={k} className={'tgroup ' + cls} aria-label={title}>
      <h4>{title} <b>{rows.length}</b></h4>
      <ul>{rows.slice(0, 4).map(x => <li key={x.key}><span>{x.text}{x.sub ? <><br /><small>{x.sub}</small></> : null}</span>{x.act ? <button type="button" className={'btn sm ' + (x.cls || '')} onClick={x.act}>{x.label}</button> : null}</li>)}</ul>
      {rows.length > 4 || all ? <button type="button" className="linkb" onClick={all}>See all {rows.length} →</button> : null}
    </section>)}</div> : <div className="empty">Nothing waiting — late arrivals, expiring stays, beds to clean and approvals will show here.</div>}
  </div>;
}

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
  const K = counts(D, t), res = K.residing, overdue = K.overdue; // same definitions as Reception and Accommodation
  const subs = R.filter(r => r.status === 'Submitted'), exts = R.filter(r => pendingExt(r));
  const showBeds = D.can('accommodation');
  const sub = <>{D.role.label} · {fd(t)}{me.role === 'coordinator' ? ' · ' + ((D.branch(me.branchId) || {}).name || 'no branch set') + ' branch' : ''}{me.role === 'supervisor' ? ' · ' + ((D.dept(me.deptId) || {}).name || 'no department set') + ' department' : ''}</>;
  const app = useApp(), openTab = (page, tab, f) => { if (f) setFs(f); if (tab) setTab(page, tab); go(page); };

  /* beds */
  const st = D.bedStates(), c = K.beds;
  const tot = data.beds.length, occPct = tot ? Math.round(c.Occupied / tot * 100) : 0;
  const BED = [['Occupied', SERIES[0]], ['Reserved', SERIES[1]], ['Cleaning', SERIES[2]], ['Available', '#cbd5e1']];
  const blds = data.buildings.map(b => {
    const ids = new Set(data.rooms.filter(r => r.buildingId === b.id).map(r => r.id)), beds = data.beds.filter(x => ids.has(x.roomId));
    const n = k => beds.filter(x => st.get(x.id).status === k).length;
    return { b, total: beds.length, occ: n('Occupied'), resv: n('Reserved'), cl: n('Cleaning') };
  }).filter(x => x.total);

  /* arrivals & departures: last 14 days (or the 7 / 30 chosen) actual + next 7 days expected */
  const trend = D.feature('todayTasks') ? Number(app.ui.f['db.trend'] || 7) : 14;
  const days = []; for (let i = -trend; i <= 7; i++) days.push(addDays(t, i));
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
  if (overdue.length) al.push(['bad', `${overdue.length} overdue stay(s): ${overdue.slice(0, 3).map(r => D.mName(r.memberId)).join(', ')}${overdue.length > 3 ? '…' : ''}`, () => D.can('reception') ? openTab('reception', 'd', { 'rc.q': '' }) : openTab('longterm', null, { 'lt.f': 'od' })]);
  const ex = R.filter(r => r.status === 'Checked In' && ['Monthly', 'Long-Term'].includes(stayType(r)) && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7);
  if (ex.length && D.can('longterm')) al.push(['', `${ex.length} monthly/long-term stay(s) expiring within 7 days`, () => openTab('longterm', null, { 'lt.f': 'soon' })]);
  if (showBeds) {
    const nb = R.filter(r => ['Approved', 'Checked In'].includes(r.status) && !D.activeAlloc(r.id)).length; if (nb) al.push(['info', `${nb} approved member(s) waiting for a bed`, () => openTab('accommodation', 'w')]);
    if (c.Cleaning) al.push(['info', `${c.Cleaning} bed(s) pending cleaning`, () => openTab('accommodation', 'c')]);
  }
  if (D.can('departments') && noDuty) al.push(['info', `${noDuty} resident(s) without sewa assignment`, () => openTab('departments', 'u')]);

  /* Today's tasks — the same definitions as the counts above */
  const tasks = [];
  if (D.feature('todayTasks')) {
    const edR = D.canEdit('reception'), edA = D.canEdit('approvals'), edB = D.canEdit('accommodation');
    if (D.can('reception')) tasks.push(['late', 'Late arrivals', 'bad', K.late.slice().sort((a, b) => stayStart(a).localeCompare(stayStart(b))).map(r => ({ key: r.id, text: D.mName(r.memberId), sub: `expected ${fd(stayStart(r))} · ${diffDays(stayStart(r), t)} day(s) late`,
      label: edR ? 'Confirm arrival' : 'View', cls: edR ? 'pri' : '', act: () => (edR ? rcArrive : regView)(app, r.id) })), () => openTab('reception', 'a', { 'rc.af': '', 'rc.q': '' })]);
    const exp7 = R.filter(r => r.status === 'Checked In' && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7).sort((a, b) => stayEnd(a).localeCompare(stayEnd(b)));
    const canExt = edB || edA;
    if (D.can('reception') || D.can('longterm')) tasks.push(['exp', 'Stays ending in 7 days', 'warn', exp7.map(r => ({ key: r.id, text: D.mName(r.memberId), sub: `${stayType(r)} · ends ${fd(stayEnd(r))}${stayEnd(r) === t ? ' (today)' : ''}`,
      label: canExt ? 'Extend' : 'View', act: () => (canExt ? bedExtend : regView)(app, r.id) })), () => D.can('longterm') ? openTab('longterm', null, { 'lt.f': 'soon' }) : openTab('reception', 'r', { 'rc.q': '' })]);
    if (showBeds) tasks.push(['clean', 'Beds to clean', 'info', data.beds.filter(b => b.cleaning).map(b => ({ key: b.id, text: D.bedPath(b), label: edB ? 'Mark cleaned' : null, cls: 'ok', act: edB ? () => bedClean(app, b.id) : null })), () => openTab('accommodation', 'c')]);
    if (D.can('approvals')) tasks.push(['appr', 'Pending approvals', 'pur', subs.map(r => ({ key: r.id, text: D.mName(r.memberId), sub: `${r.id} · ${fd(r.arrival)} – ${fd(r.departure)} · ${relTime(D.submittedAt(r))}`,
      label: edA ? 'Review' : 'View', cls: edA ? 'pri' : '', act: () => (edA ? approveOpen : regView)(app, r.id) })).concat(exts.map(r => ({ key: 'x' + r.id, text: D.mName(r.memberId), sub: `extension to ${fd(pendingExt(r).to)}`, label: 'Open', act: () => openTab('approvals', 'x') }))), () => openTab('approvals', 'p')]);
  }

  const Kpi = ({ label, value, sub, icon, onClick, hero, help }) => {
    const Tag = onClick ? 'button' : 'div';
    return <Tag type={onClick ? 'button' : undefined} className={'kpi' + (hero ? ' hero' : '')} onClick={onClick} title={help ? COUNT_HELP[help] : undefined}>
      <span className="kicon"><Icon d={icon} /></span><span className="kl">{label}{help && D.feature('kpiHelp') ? <> <Help k={help} /></> : null}</span><span className="kval">{value}</span>{sub ? <span className="ks">{sub}</span> : null}
    </Tag>;
  };

  return <>
    <PageHead title="Dashboard" sub={sub} />
    {tasks.length ? <TodayTasks groups={tasks} /> : null}
    <div className="kpis">
      <Kpi hero label="Currently residing" help="residing" value={res.length} icon={I.home} onClick={() => openTab('reception', 'r', { 'rc.q': '' })}
        sub={<>{ty('Short-Term')} short · {ty('Monthly')} monthly · {ty('Long-Term')} long{overdue.length ? <span className="pill bad">{overdue.length} overdue</span> : <> · none overdue</>}</>} />
      <Kpi label="Registered sewadar" value={M.length.toLocaleString('en-IN')} icon={I.people} onClick={() => go('members')} sub="Member Master" />
      <Kpi label="Expected arrivals" help="expected" value={K.expected.length} icon={I.inn} onClick={() => openTab('reception', 'a', { 'rc.af': '', 'rc.q': '' })}
        sub={<>{K.arrivedToday.length} arrived today{K.late.length ? <span className="pill warn">{K.late.length} late</span> : null}</>} />
      <Kpi label="Due to depart" help="dueToday" value={K.dueToday.length} icon={I.out} onClick={() => openTab('reception', 'd', { 'rc.df': '', 'rc.q': '' })}
        sub={<>{K.departedToday.length} checked out today{K.overdue.length ? <span className="pill bad">{K.overdue.length} overdue</span> : null}</>} />
      <Kpi label="Pending approvals" value={subs.length + exts.length} icon={I.check} onClick={() => go('approvals')}
        sub={<>{subs.length} registrations · {exts.length} extensions{subs.length + exts.length ? <span className="pill warn">action needed</span> : null}</>} />
      {D.can('visitors') ? (() => { const gv = (data.visits || []).filter(v => v.date === t && ['Confirmed', 'Arrived', 'Completed'].includes(v.status)), ins = gv.filter(v => v.status !== 'Confirmed').length;
        return <Kpi label="Guests today" value={<>{ins}<small> / {gv.length}</small></>} icon={I.inn} onClick={() => openTab('visitors', ['security'].includes(me.role) ? 'gate' : 'sched')} sub={`arrived / expected · ${gv.filter(v => v.vehicle && v.vehicle.has).length} vehicle(s)`} />; })() : null}
      {showBeds ? <Kpi label="Bed occupancy" help="occupied" value={<>{occPct}<small>%</small></>} icon={I.bed} onClick={() => go('accommodation')} sub={`${c.Occupied} of ${tot} beds · ${c.Available} free`} /> : null}
    </div>

    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,520px),1fr))', marginBottom: 0 }}>
      <ChartCard title="Arrivals & departures" sub={`Last ${trend} days (actual) and next 7 days (expected)`}
        action={D.feature('todayTasks') ? <span className="seg" role="group" aria-label="Trend period">{[7, 30].map(n => <button key={n} type="button" className={trend === n ? 'on' : ''} aria-pressed={trend === n} onClick={() => app.setF('db.trend', String(n))}>{n} days</button>)}</span> : undefined}
        table={{ cols: ['Date', 'Arrivals', 'Departures'], rows: days.map((d, i) => [fd(d) + (d === t ? ' (today)' : d > t ? ' (expected)' : ''), arrV[i], depV[i]]) }}>
        <LineChart x={days} marker={trend} fmtX={fmtDay} series={[{ name: 'Arrivals', color: SERIES[0], values: arrV }, { name: 'Departures', color: SERIES[1], values: depV }]} />
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
