/* Guest visit dialogs: invite & share link, details, in-charge decision, host finalise, Main Office decision, gate. */
import { useEffect, useState } from 'react';
import { useApp } from '../context.jsx';
import { FormModal, Modal, CloseBtn, Info, confirm } from '../components/Modal.jsx';
import { Badge, KV, Chip } from '../components/ui.jsx';
import { fd, fdt, today, addDays } from '@shared/dates.js';
import { PARKINGS, APPROVAL_PARKING, VEHICLE_TYPES, timeAdd, visitNeedsApproval } from '@shared/constants.js';

/* guests open the link from their own phones, so it must use the public address when one is configured */
let publicUrl = '';
export const setPublicUrl = u => { publicUrl = u || ''; };
export const guestLink = token => `${publicUrl || window.location.origin}/guest/${token}`;
export const vWhen = v => v.date ? `${fd(v.date)}${v.time ? ' · ' + v.time : ''}` : 'Date not chosen yet';
/** 'Navdeep Sharma (Security)' — the typed person, with the department */
export const vDept = (D, v) => v.deptId ? D.dName(v.deptId) : (v.deptName || '—'); // matched department, else as typed
export const vMeet = (D, v) => v.meetWith ? `${v.meetWith} (${vDept(D, v)})` : vDept(D, v);
/* vehicle type and vehicle number are shown as two separate columns / fields */
export const vType = v => v.vehicle && v.vehicle.has ? v.vehicle.type : 'No vehicle';
export const vNo = v => v.vehicle && v.vehicle.has && v.vehicle.number ? <b className="vno">{v.vehicle.number}</b> : '—';
export const vVehicle = v => v.vehicle && v.vehicle.has ? `${v.vehicle.number} · ${v.vehicle.type}` : 'No vehicle';
const isMgmt = me => ['superadmin', 'manager'].includes(me.role);
/* who may act at each step — from the user's guest visit permissions (Admin → Guest visit access / user extras) */
const capOf = (me, c) => (me.vcaps || []).includes(c);
export const can = {
  invite: me => capOf(me, 'invite'),
  host: (me, v) => isMgmt(me) || v.hostId === me.id,
  /* a typed department that is not in the list has no in-charge → the host decides */
  incharge: (me, v) => isMgmt(me) || (capOf(me, 'incharge') && !!v.deptId && me.deptId === v.deptId) || (!v.deptId && v.hostId === me.id),
  inchargeAny: me => isMgmt(me) || capOf(me, 'incharge'),
  office: me => capOf(me, 'office'),
  gate: me => capOf(me, 'gate'),
  all: me => capOf(me, 'all')
};
/** 'M101 (Mangal Bhawan) · 2 bed(s) · 18 Oct – 20 Oct' */
export const vStay = (D, v) => {
  if (!v.stay || !v.stay.needed) return 'No';
  const r = D.room(v.stay.roomId), b = r && D.bldg(r.buildingId);
  return `${r ? r.name : 'Room'}${b ? ' (' + b.name + ')' : ''} · ${v.stay.beds} bed(s) · ${fd(v.stay.from)} – ${fd(addDays(v.stay.to, 1))}${v.stay.bedIds && v.stay.bedIds.length ? ' · beds reserved' : ''}`;
};

/* ---------- 1. invite & share ---------- */
export function inviteGuest(app) {
  const { D, api, me } = app;
  /* a department head's guest is their own: meeting fixed to the head and their department */
  const lock = D.hasCap('incharge') && !!me.deptId && !['superadmin', 'manager'].includes(me.role);
  app.openModal(<FormModal title="Invite a guest" values={lock ? { meetWith: me.name } : {}}
    pre={lock
      ? <div className="note">This guest is <b>your guest</b>: the meeting is with you ({me.name}, {D.dName(me.deptId)}). The guest cannot change it, and other department heads do not see your guests. They fill in the appointment and vehicle through the link; you then accept it and arrange parking, office and residence.</div>
      : <div className="note">A registration link is created for the guest. They fill in the appointment, whom they meet and their vehicle; the department in-charge then accepts it.</div>}
    datalists={{ meetList: D.data.depts.filter(d => d.active && d.supervisor).map(d => d.supervisor), deptList: D.data.depts.filter(d => d.active).map(d => d.name) }}
    onChange={(n, val) => { if (n === 'meetWith') { const d = D.data.depts.find(x => x.supervisor && x.supervisor.toLowerCase() === val.trim().toLowerCase()); if (d) return { deptName: d.name }; } }}
    fields={[{ n: 'guestName', l: 'Guest name (optional)' }, { n: 'guestMobile', l: 'Guest mobile (optional, for WhatsApp)', t: 'tel' },
      lock ? null : { n: 'meetWith', l: 'Meeting with (person)', list: 'meetList', ph: 'Type a name, e.g. Swami …', hint: 'Type any name, or pick a department in-charge. The guest can change it.' },
      lock ? null : { n: 'deptName', l: 'Department', list: 'deptList', ph: 'Type or choose', hint: v => { const d = D.data.depts.find(x => x.name.toLowerCase() === String(v.deptName || '').trim().toLowerCase()); return !v.deptName ? 'The guest can fill it in.' : d ? `Goes to the in-charge: ${d.supervisor || '—'}` : 'Not in the department list — you will accept the appointment yourself.'; } },
      { n: 'vehicleType', l: 'Vehicle type (if known)', t: 'select', opts: VEHICLE_TYPES, ph: 'Guest will fill / no vehicle' },
      { n: 'vehicleNumber', l: 'Vehicle number (if known)', ph: 'e.g. PB 10 AB 1234', hidden: v => !v.vehicleType },
      { n: 'date', l: 'Suggested date', t: 'date' }, { n: 'time', l: 'Suggested time', t: 'time' }, { n: 'note', l: 'Note for the in-charge / office', t: 'textarea', full: 1 }].filter(Boolean)}
    buttons={[{ label: 'Create link', run: async v => {
      if (v.date && v.date < today()) return 'The date cannot be in the past.';
      try { const r = await api.post('/visits', v); await app.reload(); shareLink(app, { id: r.id, token: r.token, guest: { name: v.guestName, mobile: v.guestMobile } }); return null; }
      catch (e) { return e.message; }
    } }]} />);
}
export function shareLink(app, v) {
  const link = guestLink(v.token), name = (v.guest && v.guest.name) || '';
  const text = `Jai Maharaj Ji${name ? ' ' + name : ''}. Please register your visit to DJJS Nurmahal (appointment, whom you are meeting and vehicle details) here: ${link}`;
  const mob = v.guest && v.guest.mobile ? '91' + v.guest.mobile : '';
  const copy = async () => { try { await navigator.clipboard.writeText(link); app.toast('Link copied', 'ok'); } catch { app.toast('Select the link and copy it'); } };
  app.openModal(<Modal title="Share the registration link" footer={<CloseBtn />}>
    <p>Send this link to {name || 'the guest'}. It works on any phone, without signing in, for 14 days.</p>
    <input className="in" readOnly value={link} onFocus={e => e.target.select()} style={{ width: '100%', marginBottom: 10 }} />
    <div className="acts">
      <a className="btn pri" href={`https://wa.me/${mob}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a>
      <button className="btn" onClick={copy}>Copy link</button>
      {navigator.share ? <button className="btn" onClick={() => navigator.share({ title: 'DJJS Nurmahal visit', text, url: link }).catch(() => {})}>Share…</button> : null}
    </div>
  </Modal>);
}
/** After confirmation: tell the guest the details (WhatsApp). */
function confirmText(D, v) {
  return `Jai Maharaj Ji ${v.guest.name}. Your visit to DJJS Nurmahal is confirmed: ${vWhen(v)}, meeting ${vMeet(D, v)}${v.office ? ' in ' + v.office : ''}.` +
    (v.vehicle && v.vehicle.has ? ` Vehicle ${v.vehicle.number}: please park at ${v.parking} parking.` : '') + (v.golfCart ? ' A golf car will take you around the campus.' : '') +
    ` Please show this at Abhinandan Dwar gate: ${guestLink(v.token)}`;
}

/* ---------- details ---------- */
function VisitView({ id }) {
  const app = useApp(), { D, data } = app, me = { ...app.me, vcaps: D.vcaps }, v = (data.visits || []).find(x => x.id === id);
  if (!v) return <Info title="Guest visit">This visit is not available.</Info>;
  const g = v.guest || {};
  const acts = [];
  if (v.token && ['Invited', 'Submitted'].includes(v.status) && can.host(me, v)) acts.push(<button key="l" className="btn" onClick={() => shareLink(app, v)}>Share link</button>);
  if (v.status === 'Submitted' && can.incharge(me, v)) acts.push(<button key="i" className="btn pri" onClick={() => inchargeDecide(app, v.id)}>Accept / decline</button>);
  if (['Accepted', 'Office rejected', 'Awaiting office', 'Confirmed'].includes(v.status) && can.host(me, v)) acts.push(<button key="f" className={'btn ' + (['Accepted', 'Office rejected'].includes(v.status) ? 'pri' : '')} onClick={() => finalize(app, v.id)}>{v.status === 'Accepted' ? 'Finalise parking & office' : 'Change parking / office'}</button>);
  if (v.status === 'Awaiting office' && can.office(me)) acts.push(<button key="o" className="btn pri" onClick={() => officeDecide(app, v.id)}>Approve / reject</button>);
  if (v.status === 'Confirmed' && can.gate(me)) acts.push(<button key="e" className="btn ok" onClick={() => gateEntry(app, v.id)}>Record entry</button>);
  if (v.status === 'Arrived' && can.gate(me)) acts.push(<button key="x" className="btn" onClick={() => gateExit(app, v.id)}>Record exit</button>);
  if (v.status === 'Confirmed' && v.token && can.host(me, v)) acts.push(<a key="w" className="btn" target="_blank" rel="noreferrer" href={`https://wa.me/${g.mobile ? '91' + g.mobile : ''}?text=${encodeURIComponent(confirmText(D, v))}`}>Send confirmation (WhatsApp)</a>);
  if (['Invited', 'Submitted', 'Accepted', 'Awaiting office', 'Office rejected', 'Confirmed'].includes(v.status) && (can.host(me, v) || can.incharge(me, v))) acts.push(<button key="c" className="btn dng" onClick={() => cancelVisit(app, v.id)}>Cancel visit</button>);
  return <Modal title={<>{g.name || 'Guest (not registered yet)'} <small>{v.id}</small></>} wide footer={<>{acts}<CloseBtn /></>}>
    <div className="chips" style={{ marginBottom: 12 }}><Badge s={v.status} />{v.golfCart ? <Chip>Golf car</Chip> : null}{v.parking === APPROVAL_PARKING ? <Chip>Baikunth Dwar (approval)</Chip> : null}</div>
    <KV items={[['When', vWhen(v) + (v.duration ? ` (${v.duration} min)` : '')], ['Meeting', vMeet(D, v) + (v.inchargeName && v.inchargeName !== v.meetWith ? ` · accepted by ${v.inchargeName}` : '')], ['Host', v.hostName],
      ['Guest mobile', g.mobile || '—'], ['Organisation', [g.organisation, g.city].filter(Boolean).join(', ') || '—'], ['People', g.people || '—'],
      ['Vehicle type', vType(v)], ['Vehicle number', vNo(v)], ['Parking', v.parking || (v.vehicle && v.vehicle.has ? 'Not assigned yet' : '—')], ['Office', v.office || '—'],
      ['Golf car', v.golfCart ? 'Yes' + (v.cartNote ? ' — ' + v.cartNote : '') : 'No'], ['Residence', vStay(D, v)],
      v.approval && v.approval.by ? ['Main Office', `${v.status === 'Office rejected' ? 'Rejected' : 'Approved'} by ${v.approval.by}${v.approval.user && v.approval.user.toLowerCase() !== v.approval.by.toLowerCase() ? ' (signed in as ' + v.approval.user + ')' : ''} · ${fdt(v.approval.at)}${v.approval.parking || v.approval.office ? ` · parking: ${v.approval.parking || 'none'}, office: ${v.approval.office || 'none'}` : ''}${v.approval.remarks ? ' — ' + v.approval.remarks : ''}`] : null,
      v.entryAt ? ['Entry', `${fdt(v.entryAt)} · ${v.entryBy}`] : null, v.exitAt ? ['Exit', `${fdt(v.exitAt)} · ${v.exitBy}`] : null,
      v.gateRemarks ? ['Gate remarks', v.gateRemarks, true] : null, g.purpose ? ['Purpose', g.purpose, true] : null, v.note ? ['Host note', v.note, true] : null]} />
    <h3>Timeline</h3>
    <div className="tl">{(v.history || []).map((h, i) => <div key={i}><small>{fdt(h.at)} · {h.by}</small><br />{h.text}</div>)}</div>
  </Modal>;
}
export const viewVisit = (app, id) => app.openModal(<VisitView id={id} />);

/* ---------- 3. department in-charge ---------- */
export function inchargeDecide(app, id) {
  const { D, data, api, mutate } = app, v = data.visits.find(x => x.id === id);
  app.openModal(<FormModal title={`Appointment — ${v.guest.name}`}
    pre={<div className="note"><b>{v.guest.name}</b>{v.guest.organisation ? ` (${v.guest.organisation})` : ''} wants to meet <b>{vMeet(D, v)}</b> on <b>{vWhen(v)}</b> · {v.guest.people || 1} person(s) · {vVehicle(v)}<br />Purpose: {v.guest.purpose}</div>}
    values={{ date: v.date, time: v.time, duration: String(v.duration || 60), note: '' }}
    fields={[{ n: 'date', l: 'Date', t: 'date', req: 1 }, { n: 'time', l: 'Time', t: 'time', req: 1 }, { n: 'duration', l: 'Duration', t: 'select', opts: [['30', '30 minutes'], ['60', '1 hour'], ['90', '1½ hours'], ['120', '2 hours'], ['180', '3 hours']].map(([a, b]) => ({ v: a, l: b })) },
      { n: 'note', l: 'Note (required when declining)', t: 'textarea', full: 1 }]}
    buttons={[{ label: 'Decline', cls: 'bad', run: x => x.note ? mutate(() => api.post(`/visits/${id}/incharge`, { accept: false, note: x.note }), 'Appointment declined') : 'Please give a reason for declining.' },
      { label: 'Accept appointment', cls: 'ok', run: x => mutate(() => api.post(`/visits/${id}/incharge`, { ...x, accept: true }), 'Accepted — the host will finalise parking and office') }]} />);
}

/* ---------- 4. host finalises parking, office, golf car and residence ---------- */
function FinalizeForm({ id }) {
  const { D, data, api, mutate } = useApp(), v = data.visits.find(x => x.id === id);
  const [slots, setSlots] = useState(null);
  const [rooms, setRooms] = useState({ key: '', list: [] }); // rooms with free beds for the chosen nights
  useEffect(() => { api.get('/visits/office-slots?date=' + v.date).then(setSlots).catch(() => setSlots([])); }, [api, v.date]);
  const loadRooms = (from, to) => {
    const key = from + '|' + to; if (!from || !to || to <= from) return setRooms({ key, list: [] });
    api.get(`/visits/bed-availability?from=${from}&to=${to}&visit=${id}`).then(list => setRooms({ key, list })).catch(() => setRooms({ key, list: [] }));
  };
  const st = v.stay && v.stay.needed ? v.stay : null;
  const stay0 = { stay: st ? 'Yes' : 'No', stayFrom: st ? st.from : v.date, stayTo: st ? addDays(st.to, 1) : addDays(v.date, 1), stayBeds: String(st ? st.beds : (v.guest.people || 1)), stayRoom: st ? st.roomId : '' };
  useEffect(() => { loadRooms(stay0.stayFrom, stay0.stayTo); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const end = timeAdd(v.time, v.duration || 60);
  const busy = o => (slots || []).find(s => s.id !== v.id && s.office === o && s.time < end && v.time < timeAdd(s.time, s.duration));
  const offices = (data.lists.offices || []).map(o => { const b = busy(o); return { v: o, l: b ? `${o} — booked ${b.time}–${timeAdd(b.time, b.duration)}` : `${o} — free`, b }; });
  const hasVeh = v.vehicle && v.vehicle.has;
  if (!slots) return <Info title="Finalise visit">Checking which offices are free…</Info>;
  const roomOpts = x => rooms.list.filter(r => r.free >= (Number(x.stayBeds) || 1)).map(r => ({ v: r.roomId, l: `${r.building} · ${r.room} (${r.floor}, ${r.gender}) — ${r.free} bed(s) free` }));
  return <FormModal title={`Finalise — ${v.guest.name}, ${vWhen(v)}`} wide
    pre={<div className="note">{vVehicle(v)} · {v.guest.people || 1} person(s). <b>Baikunth Dwar</b> parking, an office, a golf car or a <b>residence</b> is sent to the <b>Main Office</b> for approval; Abhinandan Dwar parking alone is confirmed at once.</div>}
    values={{ parking: v.parking || (hasVeh ? 'Abhinandan Dwar' : ''), office: v.office && !busy(v.office) ? v.office : '', golfCart: v.golfCart ? 'Yes' : 'No', cartNote: v.cartNote || '', ...stay0 }}
    onChange={(n, val, all) => { if (['stayFrom', 'stayTo', 'stay'].includes(n) && all.stay === 'Yes') loadRooms(all.stayFrom, all.stayTo); }}
    fields={[hasVeh ? { n: 'parking', l: 'Parking', t: 'select', opts: PARKINGS.map(p => ({ v: p, l: p === APPROVAL_PARKING ? p + ' (needs Main Office approval)' : p + ' (open to all)' })), req: 1 } : null,
      { n: 'office', l: `Office for the meeting (${v.time}–${end})`, t: 'select', opts: offices.filter(o => !o.b).map(({ v: a, l }) => ({ v: a, l })), ph: 'No office needed', hint: offices.some(o => o.b) ? 'Booked: ' + offices.filter(o => o.b).map(o => o.l.replace(' — booked', '')).join(', ') : 'All offices are free at this time.' },
      { n: 'golfCart', l: 'Golf car for campus visit', t: 'select', opts: ['No', 'Yes'] },
      { n: 'cartNote', l: 'Golf car note (pick-up point, time…)', hidden: x => x.golfCart !== 'Yes' },
      { n: 'stay', l: 'Residence (overnight stay on campus)', t: 'select', opts: ['No', 'Yes'], full: 1 },
      { n: 'stayFrom', l: 'Check-in', t: 'date', hidden: x => x.stay !== 'Yes' },
      { n: 'stayTo', l: 'Check-out', t: 'date', hidden: x => x.stay !== 'Yes' },
      { n: 'stayBeds', l: 'Number of beds', t: 'number', hidden: x => x.stay !== 'Yes' },
      { n: 'stayRoom', l: 'Room (only rooms with enough free beds)', t: 'select', ph: 'Select room', opts: roomOpts, hidden: x => x.stay !== 'Yes',
        hint: x => x.stayTo <= x.stayFrom ? 'Check-out must be after check-in.' : rooms.key !== x.stayFrom + '|' + x.stayTo ? 'Checking free beds…' : roomOpts(x).length ? 'Beds are reserved in Accommodation when the Main Office approves.' : 'No room has that many free beds for these nights — reduce the beds or change the dates.' }].filter(Boolean)}
    buttons={[{ label: 'Finalise', run: x => {
      if (x.stay === 'Yes' && !x.stayRoom) return 'Choose a room for the residence.';
      const payload = { parking: x.parking || '', office: x.office, golfCart: x.golfCart === 'Yes', cartNote: x.cartNote,
        stayNeeded: x.stay === 'Yes', stayFrom: x.stayFrom, stayTo: x.stayTo, stayBeds: x.stayBeds, stayRoom: x.stayRoom, stay: { needed: x.stay === 'Yes' } };
      return mutate(() => api.post(`/visits/${id}/finalize`, payload), visitNeedsApproval(payload) ? 'Sent to Main Office for approval' : 'Visit confirmed — security has been notified');
    } }]} />;
}
export const finalize = (app, id) => app.openModal(<FinalizeForm id={id} />);

/* ---------- 5. Main Office ---------- */
/* The approver confirms the parking and office number explicitly and signs with their own name (all mandatory). */
function OfficeDecideForm({ id }) {
  const { D, data, api, mutate, me } = useApp(), v = data.visits.find(x => x.id === id);
  const [slots, setSlots] = useState(null);
  useEffect(() => { api.get('/visits/office-slots?date=' + v.date).then(setSlots).catch(() => setSlots([])); }, [api, v.date]);
  if (!slots) return <Info title="Main Office approval">Checking which offices are free…</Info>;
  const end = timeAdd(v.time, v.duration || 60);
  const busy = o => slots.find(s => s.id !== v.id && s.office === o && s.time < end && v.time < timeAdd(s.time, s.duration));
  const offices = (data.lists.offices || []).filter(o => !busy(o));
  const hasVeh = v.vehicle && v.vehicle.has;
  const sign = x => String(x.approverName || '').trim().length < 3 ? 'Write your full name to sign this decision.' : null;
  return <FormModal title={`Main Office approval — ${v.guest.name}`} wide
    pre={<div className="note"><b>{vWhen(v)}</b> ({v.duration || 60} min), meeting {vMeet(D, v)} · host {v.hostName}<br />
      Host requested — Parking: <b>{v.parking || '—'}</b> · Office: <b>{v.office || '—'}</b> · Golf car: <b>{v.golfCart ? 'Yes' : 'No'}</b>{v.cartNote ? ' (' + v.cartNote + ')' : ''} · {vVehicle(v)}
      {v.stay && v.stay.needed ? <><br />Residence: <b>{vStay(D, v)}</b> — beds are reserved in Accommodation when you approve.</> : null}
      <br />Confirm the parking and office number below and sign with your full name.</div>}
    values={{ parking: hasVeh ? v.parking || '' : '', office: v.office && !busy(v.office) ? v.office : '', cartNote: v.cartNote || '', approverName: '' }}
    fields={[hasVeh ? { n: 'parking', l: 'Approved parking (required to approve)', t: 'select', opts: PARKINGS, ph: 'Select parking' } : null,
      { n: 'office', l: `Approved office number (${v.time}–${end})${v.office ? ' (required to approve)' : ''}`, t: 'select', opts: offices, ph: v.office ? 'Select office' : 'No office',
        hint: v.office && busy(v.office) ? `${v.office} has meanwhile been booked — choose another office.` : offices.length ? 'Only offices free at this time are listed.' : 'No office is free at this time.' },
      v.golfCart ? { n: 'cartNote', l: 'Golf car assigned (e.g. Car 2, driver)' } : null,
      { n: 'approverName', l: 'Approved by — your full name', req: 1, ph: 'Type your full name', hint: `Recorded together with your sign-in (${me.name}).` },
      { n: 'remarks', l: 'Remarks (required when rejecting)', t: 'textarea', full: 1 }].filter(Boolean)}
    buttons={[{ label: 'Reject', cls: 'bad', run: x => sign(x) || (!x.remarks ? 'Please give a reason for rejecting.' : mutate(() => api.post(`/visits/${id}/office`, { approve: false, remarks: x.remarks, approverName: x.approverName }), 'Sent back to the host')) },
      { label: 'Approve', cls: 'ok', run: x => {
        if (hasVeh && !x.parking) return 'Choose the approved parking.';
        if (v.office && !x.office) return 'Choose the approved office number.';
        return sign(x) || mutate(() => api.post(`/visits/${id}/office`, { approve: true, parking: x.parking, office: x.office, remarks: x.remarks, cartNote: x.cartNote, approverName: x.approverName }), 'Approved — security has been notified');
      } }]} />;
}
export const officeDecide = (app, id) => app.openModal(<OfficeDecideForm id={id} />);

/* ---------- 6. gate (security, Abhinandan Dwar) ---------- */
export function gateEntry(app, id) {
  const { data, api, mutate } = app, v = data.visits.find(x => x.id === id);
  app.openModal(<FormModal title={`Entry — ${v.guest.name}`}
    pre={<div className="note">Booked: <b>{vVehicle(v)}</b>{v.parking ? <> → <b>{v.parking}</b> parking</> : null}{v.office ? <> · meeting in <b>{v.office}</b></> : null}{v.golfCart ? ' · golf car arranged' : ''}</div>}
    values={{ vehicleNumber: v.vehicle && v.vehicle.has ? v.vehicle.number : '' }}
    fields={[{ n: 'vehicleNumber', l: 'Vehicle number at the gate', hint: 'Correct it if the vehicle is different from the booking.' }, { n: 'remarks', l: 'Remarks', t: 'textarea', full: 1 }]}
    buttons={[{ label: 'Record entry', cls: 'ok', run: x => mutate(() => api.post(`/visits/${id}/entry`, x), 'Entry recorded — host and in-charge notified') }]} />);
}
export const gateExit = (app, id) => { const v = app.data.visits.find(x => x.id === id); confirm(app, 'Record exit', <>Record that <b>{v.guest.name}</b>{v.vehicle && v.vehicle.has ? ` (${v.vehicle.number})` : ''} has left the campus?</>, 'Record exit', () => app.run(() => app.api.post(`/visits/${id}/exit`), 'Exit recorded')); };
export function cancelVisit(app, id) {
  app.openModal(<FormModal title="Cancel guest visit" fields={[{ n: 'why', l: 'Reason (optional)', t: 'textarea', full: 1 }]}
    buttons={[{ label: 'Cancel visit', cls: 'bad', run: x => app.mutate(() => app.api.post(`/visits/${id}/cancel`, x), 'Visit cancelled') }]} />);
}
