import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, Avatar, Tabs, useTab, FInput } from '../components/ui.jsx';
import { fd, fdt, today } from '@shared/dates.js';
import { stayStart, stayEnd, stayType } from '@shared/constants.js';
import { rcArrive, rcOut, rcUndoIn, rcUndoOut, regView, walkin } from '../modals/regs.jsx';
import { bedExtend } from '../modals/beds.jsx';

export default function Reception() {
  const app = useApp(), { D, data, ui } = app, R = D.regs(), t = today(), ed = D.canEdit('reception');
  const exp = R.filter(r => r.status === 'Approved'), res = R.filter(r => r.status === 'Checked In'), dep = res.filter(r => stayEnd(r) <= t);
  const tab = useTab('reception', 'a'), q = (ui.f['rc.q'] || '').toLowerCase();
  const match = r => !q || (r.id + D.mName(r.memberId) + r.memberId + ((D.member(r.memberId) || {}).mobile || '')).toLowerCase().includes(q);
  const who = r => { const m = D.member(r.memberId); return <div className="who"><Avatar m={m} /><div><b>{D.mName(r.memberId)}</b><br /><small>{r.memberId} · {m ? m.mobile : ''}</small></div></div>; };
  const bedC = r => { const a = D.activeAlloc(r.id); return a ? D.bedShort(D.bedO(a.bedId)) : <small>Not allocated</small>; };
  const view = r => <Btn onClick={() => regView(app, r.id)}>View</Btn>;
  const canExtend = D.canEdit('accommodation') || D.canEdit('approvals'); // extend a stay whose last date has passed
  let b = null;
  if (tab === 'a') b = <Table rows={exp.filter(match).sort((a, c) => stayStart(a).localeCompare(stayStart(c)))} empty="No approved arrivals waiting." cols={[
    ['Member', who], ['Branch', r => D.bName(r.branchId)], ['Expected', r => <>{fd(stayStart(r))}{stayStart(r) === t ? <> <span className="b info">Today</span></> : stayStart(r) < t ? <> <span className="b bad">Late</span></> : null}</>],
    ['Until', r => fd(stayEnd(r))], ['Type', r => <Badge s={stayType(r)} />], ['Bed', bedC], ['', r => ed ? <Btn cls="pri" onClick={() => rcArrive(app, r.id)}>Confirm arrival</Btn> : view(r)]]} />;
  if (tab === 'r' || tab === 'd') b = <Table rows={(tab === 'r' ? res : dep).filter(match).sort((a, c) => stayEnd(a).localeCompare(stayEnd(c)))} empty="Nobody here." cols={[
    ['Member', who], ['Arrived', r => fdt(r.actualIn)], ['Expected departure', r => <>{fd(stayEnd(r))}{stayEnd(r) < t ? <> <Badge s="Overdue" /></> : stayEnd(r) === t ? <> <span className="b warn">Today</span></> : null}</>],
    ['Type', r => <Badge s={stayType(r)} />], ['Accommodation', bedC], ['', r => <>{ed ? <><Btn cls="pri" onClick={() => rcOut(app, r.id)}>Check out</Btn><Btn onClick={() => rcUndoIn(app, r.id)}>Undo check-in</Btn></> : null}{canExtend ? <Btn cls={stayEnd(r) < t ? 'ok' : ''} onClick={() => bedExtend(app, r.id)}>Extend stay</Btn> : null}{view(r)}</>]]} />;
  if (tab === 'h') b = <Table rows={R.filter(r => r.actualIn).filter(match).sort((a, c) => c.actualIn.localeCompare(a.actualIn)).slice(0, 80)} empty="No visits yet." cols={[
    ['Member', who], ['Arrived', r => fdt(r.actualIn)], ['Departed', r => fdt(r.actualOut)], ['Type', r => <Badge s={stayType(r)} />], ['Status', r => <Badge s={r.status} />],
    ['', r => <>{view(r)}{ed && r.status === 'Checked Out' ? <Btn onClick={() => rcUndoOut(app, r.id)}>Undo check-out</Btn> : null}</>]]} />;
  /* lookup of members without a live visit */
  const lookup = q.length >= 2 ? D.members().filter(m => (m.id + m.name + m.mobile).toLowerCase().includes(q) && !data.regs.some(r => r.memberId === m.id && ['Approved', 'Checked In'].includes(r.status))).slice(0, 5) : [];
  return <>
    <PageHead title="Reception — Check-In / Check-Out" sub="Only approved members can be checked in.">{ed ? <PBtn onClick={() => walkin(app)}>+ Walk-in visitor</PBtn> : null}</PageHead>
    <div className="card">
      <div className="filters"><FInput k="rc.q" ph="Search by Member ID, name or mobile…" /></div>
      {lookup.length ? <div className="note">{lookup.map(m => <div key={m.id} style={{ margin: '4px 0' }}>{m.name} ({m.id}) has no approved visit. {data.regs.some(r => r.memberId === m.id && r.status === 'Submitted') ? 'A request is awaiting management approval.' : ed ? <Btn onClick={() => walkin(app, m.id)}>Register walk-in</Btn> : null}</div>)}</div> : null}
      <Tabs page="reception" list={[['a', 'Expected arrivals', exp.length], ['r', 'Current residents', res.length], ['d', 'Due / overdue departures', dep.length], ['h', 'Visit history']]} />
      {b}
    </div>
  </>;
}
