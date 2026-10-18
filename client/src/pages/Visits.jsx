import { useApp } from '../context.jsx';
import { PageHead, PBtn, Btn, Table, Badge, Tabs, useTab, FInput, FSelect, Chip } from '../components/ui.jsx';
import { fd, fdt, today, addDays } from '@shared/dates.js';
import { VISIT_STATUSES, timeAdd } from '@shared/constants.js';
import { setPublicUrl, inviteGuest, shareLink, viewVisit, inchargeDecide, finalize, officeDecide, gateEntry, gateExit, vWhen, vType, vNo, vMeet, vDept, vStay, can } from '../modals/visits.jsx';

const byWhen = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const byWhenDesc = (a, b) => (b.date + b.time).localeCompare(a.date + a.time);

export default function Visits() {
  const app = useApp(), { D, me, data, ui, setF } = app, f = ui.f, V = data.visits || [], t = today();
  setPublicUrl(data.publicUrl);
  const meV = { ...me, vcaps: D.vcaps };
  /* tabs follow the user's guest visit permissions (Admin → Guest visit access, plus the user's extras) */
  const tabs = [];
  if (can.invite(meV) || V.some(v => v.hostId === me.id)) tabs.push(['mine', 'My guests', V.filter(v => v.hostId === me.id && ['Invited', 'Submitted', 'Accepted', 'Office rejected', 'Awaiting office', 'Confirmed', 'Arrived'].includes(v.status)).length]);
  if (can.inchargeAny(meV)) tabs.push(['dept', 'Appointments', V.filter(v => v.status === 'Submitted' && can.incharge(meV, v)).length]);
  if (can.office(meV)) tabs.push(['office', 'Office approvals', V.filter(v => v.status === 'Awaiting office').length]);
  if (can.gate(meV) || can.all(meV)) tabs.push(['gate', 'Gate – Abhinandan Dwar', V.filter(v => v.date === t && ['Confirmed', 'Arrived'].includes(v.status)).length]);
  tabs.push(['sched', 'Office schedule']);
  if (can.all(meV) || can.office(meV) || can.gate(meV)) tabs.push(['all', 'All visits']);
  /* the user's own step is the first (default) tab */
  const def = can.gate(meV) && !can.invite(meV) ? 'gate' : can.office(meV) && !['superadmin', 'manager'].includes(me.role) ? 'office' : me.role === 'supervisor' ? 'dept' : '';
  const di = tabs.findIndex(x => x[0] === def); if (di > 0) tabs.unshift(tabs.splice(di, 1)[0]);
  let tab = useTab('visitors', tabs[0][0]); if (!tabs.some(x => x[0] === tab)) tab = tabs[0][0];

  const guest = v => <><b>{v.guest && v.guest.name ? v.guest.name : <span className="muted">Not registered yet</span>}</b><br /><small>{v.id}{v.guest && v.guest.organisation ? ' · ' + v.guest.organisation : ''}</small></>;
  const meet = v => <>{v.meetWith || vDept(D, v)}<br /><small>{v.meetWith ? vDept(D, v) + ' · ' : ''}Host: {v.hostName}</small></>;
  /* parking, office and golf car each get their own column */
  const parking = v => v.parking ? <Badge s={v.parking} cls={v.parking === 'Baikunth Dwar' ? 'pur' : 'info'} /> : v.vehicle && v.vehicle.has ? <span className="muted">Not set</span> : '—';
  const office = v => v.office ? <b>{v.office}</b> : <span className="muted">—</span>;
  const cart = v => v.golfCart ? <>Yes{v.cartNote ? <><br /><small>{v.cartNote}</small></> : null}</> : 'No';
  const stay = v => v.stay && v.stay.needed ? <>{vStay(D, v).split(' · ').slice(0, 2).join(' · ')}<br /><small>{vStay(D, v).split(' · ').slice(2).join(' · ')}</small></> : <span className="muted">No</span>;
  const planCols = [['Parking', parking], ['Office', office], ['Golf car', cart], ['Residence', stay]];
  const view = v => <Btn onClick={() => viewVisit(app, v.id)}>View</Btn>;
  let body = null;

  if (tab === 'mine') {
    const L = V.filter(v => v.hostId === me.id && (f['gv.old'] === 'all' || !['Completed', 'Cancelled', 'Declined'].includes(v.status))).sort(byWhenDesc);
    body = <>
      <div className="filters"><FSelect k="gv.old" opts={[{ v: 'all', l: 'Include completed / cancelled' }]} all="Open visits only" /></div>
      <Table rows={L} empty="No guests yet — use “Invite guest”." cols={[['When', vWhen], ['Guest', guest], ['Meeting', v => vMeet(D, v)], ['Vehicle type', vType], ['Vehicle number', vNo], ...planCols, ['Status', v => <Badge s={v.status} />],
        ['', v => <>{view(v)}{v.token && ['Invited', 'Submitted'].includes(v.status) ? <Btn onClick={() => shareLink(app, v)}>Share link</Btn> : null}
          {v.status === 'Submitted' && can.incharge(meV, v) ? <Btn cls="pri" onClick={() => inchargeDecide(app, v.id)}>Accept / decline</Btn> : null}
          {['Accepted', 'Office rejected'].includes(v.status) ? <Btn cls="pri" onClick={() => finalize(app, v.id)}>Finalise</Btn> : null}</>]]} />
    </>;
  }
  if (tab === 'dept') {
    const L = V.filter(v => can.incharge(meV, v) && (v.status === 'Submitted' || (['Accepted', 'Awaiting office', 'Confirmed', 'Arrived'].includes(v.status) && v.date >= t))).sort(byWhen);
    body = <Table rows={L} empty="No appointment requests for your department." cols={[['When', vWhen], ['Guest', guest], ['People', v => (v.guest && v.guest.people) || 1], ['Purpose', v => (v.guest && v.guest.purpose) || ''], ['Meeting', meet], ['Status', v => <Badge s={v.status} />],
      ['', v => <>{view(v)}{v.status === 'Submitted' ? <Btn cls="pri" onClick={() => inchargeDecide(app, v.id)}>Accept / decline</Btn> : null}</>]]} />;
  }
  if (tab === 'office') {
    /* waiting requests, and the decided ones (so the approved office stays visible) */
    const ost = f['gv.ost'] || 'wait';
    const decided = v => v.approval && v.approval.needed && v.approval.by;
    const L = V.filter(v => ost === 'wait' ? v.status === 'Awaiting office'
      : ost === 'ok' ? decided(v) && ['Confirmed', 'Arrived', 'Completed'].includes(v.status)
      : ost === 'no' ? v.status === 'Office rejected'
      : v.status === 'Awaiting office' || decided(v) || v.status === 'Office rejected').sort(ost === 'wait' ? byWhen : byWhenDesc);
    body = <>
      <div className="filters"><FSelect k="gv.ost" opts={[{ v: 'wait', l: 'Waiting for approval' }, { v: 'ok', l: 'Approved' }, { v: 'no', l: 'Rejected (back with host)' }, { v: 'all', l: 'All' }]} /></div>
      <Table rows={L} empty={ost === 'wait' ? 'Nothing waiting for approval.' : 'No visits here.'} cols={[['When', v => <>{vWhen(v)}<br /><small>{v.time ? `until ${timeAdd(v.time, v.duration || 60)}` : ''}</small></>], ['Guest', guest], ['Meeting', meet], ['Vehicle type', vType], ['Vehicle number', vNo], ...planCols,
        ['Status', v => <><Badge s={v.status} />{decided(v) ? <><br /><small>{v.status === 'Office rejected' ? 'Rejected' : 'Approved'} by {v.approval.by} · {fdt(v.approval.at)}</small></> : null}</>],
        ['', v => <>{view(v)}{v.status === 'Awaiting office' ? <Btn cls="pri" onClick={() => officeDecide(app, v.id)}>Approve / reject</Btn> : null}</>]]} />
    </>;
  }
  if (tab === 'gate') {
    const day = f['gv.day'] || t;
    const L = V.filter(v => v.date === day && ['Confirmed', 'Arrived', 'Completed'].includes(v.status)).sort(byWhen);
    const inside = V.filter(v => v.status === 'Arrived');
    body = <>
      <div className="filters"><label className="flabel">Date<input type="date" className="in" value={day} onChange={e => setF('gv.day', e.target.value)} /></label>
        <div className="flabel"><span>&nbsp;</span><div className="acts"><Btn onClick={() => setF('gv.day', t)}>Today</Btn><Btn onClick={() => setF('gv.day', addDays(t, 1))}>Tomorrow</Btn></div></div></div>
      {inside.length ? <div className="alert info"><span><b>{inside.length}</b> guest(s) inside the campus now: {inside.map(v => v.guest.name + (v.vehicle && v.vehicle.has ? ` (${v.vehicle.number})` : '')).join(', ')}</span></div> : null}
      <Table rows={L} empty="No confirmed guests for this day." cols={[['Time', v => <b>{v.time}</b>], ['Vehicle number', v => v.vehicle && v.vehicle.has ? vNo(v) : <span className="muted">On foot</span>], ['Vehicle type', v => v.vehicle && v.vehicle.has ? v.vehicle.type : '—'],
        ['Parking', v => v.parking ? <Badge s={v.parking} cls={v.parking === 'Baikunth Dwar' ? 'pur' : 'info'} /> : '—'], ['Guest', v => <>{v.guest.name}<br /><small>{v.guest.people || 1} person(s) · {v.guest.mobile}</small></>],
        ['Meeting', v => <>{vMeet(D, v)}{v.office ? <><br /><small>{v.office}</small></> : null}{v.golfCart ? <><br /><small>Golf car{v.cartNote ? ': ' + v.cartNote : ''}</small></> : null}</>],
        ['Status', v => <><Badge s={v.status} />{v.entryAt ? <><br /><small>in {fdt(v.entryAt).slice(-5)}{v.exitAt ? ' · out ' + fdt(v.exitAt).slice(-5) : ''}</small></> : null}</>],
        ['', v => <>{can.gate(meV) && v.status === 'Confirmed' ? <Btn cls="ok" onClick={() => gateEntry(app, v.id)}>Entry</Btn> : null}{can.gate(meV) && v.status === 'Arrived' ? <Btn onClick={() => gateExit(app, v.id)}>Exit</Btn> : null}{view(v)}</>]]} />
    </>;
  }
  if (tab === 'sched') {
    const day = f['gv.sday'] || t, offices = data.lists.offices || [];
    const L = V.filter(v => v.date === day && v.office && ['Awaiting office', 'Confirmed', 'Arrived', 'Completed'].includes(v.status)).sort(byWhen);
    body = <>
      <div className="filters"><label className="flabel">Date<input type="date" className="in" value={day} onChange={e => setF('gv.sday', e.target.value)} /></label></div>
      <div className="grid g4">{offices.map(o => { const b = L.filter(v => v.office === o); return <div key={o} className="stat"><div className="l">{o}</div><div className="v" style={{ fontSize: 20 }}>{b.length ? `${b.length} booking${b.length > 1 ? 's' : ''}` : 'Free all day'}</div>
        {b.map(v => <div key={v.id} className="s" style={{ cursor: 'pointer' }} onClick={() => viewVisit(app, v.id)}><b>{v.time}–{timeAdd(v.time, v.duration || 60)}</b> {v.guest.name}{v.status === 'Awaiting office' ? <> <Chip>pending</Chip></> : null}</div>)}</div>; })}</div>
      <p className="muted">Bookings waiting for Main Office approval also hold the office, so nobody else can book it for that time.</p>
    </>;
  }
  if (tab === 'all') {
    const q = (f['gv.q'] || '').toLowerCase(), st = f['gv.st'];
    const L = V.filter(v => (!st || v.status === st) && (!q || [v.id, v.guest && v.guest.name, v.guest && v.guest.mobile, v.vehicle && v.vehicle.number, v.hostName].join(' ').toLowerCase().includes(q))).sort(byWhenDesc);
    body = <>
      <div className="filters"><FInput k="gv.q" ph="Search guest, mobile, vehicle, host…" /><FSelect k="gv.st" opts={VISIT_STATUSES} all="All statuses" /></div>
      <Table rows={L.slice(0, 300)} empty="No guest visits." cols={[['When', vWhen], ['Guest', guest], ['Meeting', meet], ['Vehicle type', vType], ['Vehicle number', vNo], ...planCols, ['Status', v => <Badge s={v.status} />], ['', view]]} />
    </>;
  }
  return <>
    <PageHead title="Guest Visits" sub="Invite a guest → they register through the link → department in-charge accepts → host sets parking, office and golf car → Main Office approves → security records entry at Abhinandan Dwar.">
      {can.invite(meV) ? <PBtn onClick={() => inviteGuest(app)}>+ Invite guest</PBtn> : null}
    </PageHead>
    <div className="card"><Tabs page="visitors" list={tabs} />{body}</div>
  </>;
}
