import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, Avatar, Tabs, useTab, FInput, Mobile, StayBadge } from '../components/ui.jsx';
import { fd, fdt, today } from '@shared/dates.js';
import { stayStart, stayEnd, stayType } from '@shared/constants.js';
import { rcArrive, rcOut, rcUndoIn, rcUndoOut, regView, walkin } from '../modals/regs.jsx';
import { bedExtend } from '../modals/beds.jsx';
import { counts, Help, COUNT_HELP } from '../lib/counts.jsx';

export default function Reception() {
  const app = useApp(), { D, data, ui } = app, R = D.regs(), t = today(), ed = D.canEdit('reception');
  /* same definitions as the Dashboard (lib/counts.jsx); the chips narrow each tab */
  const K = counts(D, t), af = ui.f['rc.af'] || '', df = ui.f['rc.df'] || '';
  const exp = af === 'up' ? K.upcoming : af === 'all' ? K.expected.concat(K.upcoming) : K.expected, res = K.residing;
  const dep = df === 'today' ? K.dueToday : df === 'od' ? K.overdue : K.overdue.concat(K.dueToday);
  const chip = (k, key, l, n, help, cls) => <button type="button" className={'fchip' + ((ui.f[key] || '') === k ? ' on' : '') + (cls ? ' ' + cls : '')} aria-pressed={(ui.f[key] || '') === k} title={help} onClick={() => app.setF(key, k)}>{l} <b>{n}</b></button>;
  const tab = useTab('reception', 'a'), q = (ui.f['rc.q'] || '').toLowerCase();
  const match = r => !q || (r.id + D.mName(r.memberId) + r.memberId + ((D.member(r.memberId) || {}).mobile || '')).toLowerCase().includes(q);
  const who = r => { const m = D.member(r.memberId); return <div className="who"><Avatar m={m} /><div><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId} · <Mobile m={m} /></small></div></div>; };
  const bedC = r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : <small>Not allocated</small>; };
  const view = r => <Btn onClick={() => regView(app, r.id)}>View</Btn>;
  const canExtend = D.canEdit('accommodation') || D.canEdit('approvals'); // extend a stay whose last date has passed
  const tt = app.feature('tableTools'), T = k => tt ? { id: 'reception-' + k, csv: 'reception-' + k } : {};
  const whoS = { sort: r => D.mName(r.memberId), csv: r => `${D.mName(r.memberId)} (${r.memberId})` };
  let b = null;
  const chipsA = <div className="fchips">{chip('', 'rc.af', 'Today & late', K.expected.length, COUNT_HELP.expected)}{chip('up', 'rc.af', 'Upcoming', K.upcoming.length, COUNT_HELP.upcoming)}{chip('all', 'rc.af', 'All approved', K.expected.length + K.upcoming.length)}</div>;
  const chipsD = <div className="fchips">{chip('', 'rc.df', 'All due', K.overdue.length + K.dueToday.length)}{chip('today', 'rc.df', 'Due today', K.dueToday.length, COUNT_HELP.dueToday, 'warn')}{chip('od', 'rc.df', 'Overdue', K.overdue.length, COUNT_HELP.overdue, 'bad')}</div>;
  if (tab === 'a') b = <>{chipsA}<Table rows={exp.filter(match).sort((a, c) => stayStart(a).localeCompare(stayStart(c)))} {...T('arrivals')} empty="No approved arrivals waiting." cols={[
    ['Member', who, whoS], ['Branch', r => D.bName(r.branchId), { sort: r => D.bName(r.branchId) }], ['Expected', r => <>{fd(stayStart(r))}{stayStart(r) === t ? <> <span className="b info">Today</span></> : stayStart(r) < t ? <> <span className="b bad">Late</span></> : null}</>, { sort: stayStart }],
    ['Until', r => fd(stayEnd(r)), { sort: stayEnd }], ['Type', r => <Badge s={stayType(r)} />, { sort: stayType }], ['Bed', bedC, { csv: r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : ''; } }], ['', r => ed ? <Btn cls="pri" onClick={() => rcArrive(app, r.id)}>Confirm arrival</Btn> : view(r)]]} /></>;
  if (tab === 'r' || tab === 'd') b = <>{tab === 'd' ? chipsD : null}<Table rows={(tab === 'r' ? res : dep).filter(match).sort((a, c) => stayEnd(a).localeCompare(stayEnd(c)))} {...T(tab === 'r' ? 'residents' : 'departures')} empty="Nobody here." cols={[
    ['Member', who, whoS], ['Arrived', r => fdt(r.actualIn), { sort: r => r.actualIn }], ['Expected departure', r => <>{fd(stayEnd(r))}{stayEnd(r) < t ? <> <Badge s="Overdue" /></> : stayEnd(r) === t ? <> <span className="b warn">Today</span></> : null}</>, { sort: stayEnd }],
    ['Type', r => <Badge s={stayType(r)} />, { sort: stayType }], ['Accommodation', bedC, { csv: r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : ''; } }], ['', r => <>{ed ? <><Btn cls="pri" onClick={() => rcOut(app, r.id)}>Check out</Btn><Btn onClick={() => rcUndoIn(app, r.id)}>Undo check-in</Btn></> : null}{canExtend ? <Btn cls={stayEnd(r) < t ? 'ok' : ''} onClick={() => bedExtend(app, r.id)}>Extend stay</Btn> : null}{view(r)}</>]]} /></>;
  if (tab === 'h') b = <Table rows={R.filter(r => r.actualIn).filter(match).sort((a, c) => c.actualIn.localeCompare(a.actualIn)).slice(0, 80)} {...T('history')} empty="No visits yet." cols={[
    ['Member', who, whoS], ['Arrived', r => fdt(r.actualIn), { sort: r => r.actualIn }], ['Departed', r => fdt(r.actualOut), { sort: r => r.actualOut || '' }], ['Type', r => <Badge s={stayType(r)} />, { sort: stayType }], ['Status', r => app.feature('stayBadges') ? <StayBadge r={r} /> : <Badge s={r.status} />, { sort: r => r.status }],
    ['', r => <>{view(r)}{ed && r.status === 'Checked Out' ? <Btn onClick={() => rcUndoOut(app, r.id)}>Undo check-out</Btn> : null}</>]]} />;
  /* lookup of members without a live visit */
  const lookup = q.length >= 2 ? D.members().filter(m => (m.id + m.name + m.mobile).toLowerCase().includes(q) && !data.regs.some(r => r.memberId === m.id && ['Approved', 'Checked In'].includes(r.status))).slice(0, 5) : [];
  return <>
    <PageHead title="Reception — Check-In / Check-Out" sub="Only approved members can be checked in.">{ed ? <PBtn onClick={() => walkin(app)}>+ Walk-in visitor</PBtn> : null}</PageHead>
    <div className="card">
      <div className="filters"><FInput k="rc.q" ph="Search by Member ID, name or mobile…" /></div>
      {lookup.length ? <div className="note">{lookup.map(m => <div key={m.id} style={{ margin: '4px 0' }}>{m.name} ({m.id}) has no approved visit. {data.regs.some(r => r.memberId === m.id && r.status === 'Submitted') ? 'A request is awaiting management approval.' : ed ? <Btn onClick={() => walkin(app, m.id)}>Register walk-in</Btn> : null}</div>)}</div> : null}
      <Tabs page="reception" list={[['a', 'Expected arrivals', K.expected.length], ['r', 'Current residents', K.residing.length], ['d', 'Due / overdue departures', K.overdue.length + K.dueToday.length], ['h', 'Visit history']]} />
      {D.feature('kpiHelp') ? <p className="muted small-help">{tab === 'a' ? <><Help k="expected" /> {COUNT_HELP.expected}</> : tab === 'r' ? <><Help k="residing" /> {COUNT_HELP.residing}</> : tab === 'd' ? <><Help k="overdue" /> Due today and overdue residents — same numbers as the Dashboard.</> : null}</p> : null}
      {b}
    </div>
  </>;
}
