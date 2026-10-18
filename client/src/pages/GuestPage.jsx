/* Public page for guests (no sign-in): /guest/<token>, opened from the link the host shared.
   The guest registers the appointment and vehicle; afterwards the same link shows the status and,
   once confirmed, the time, office and parking to use at the gate. */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BASE } from '../api.js';
import { fd } from '@shared/dates.js';
import { isMobile } from '@shared/constants.js';

const NO_VEHICLE = 'No vehicle (coming on foot / dropped off)';

const STEPS = [['Submitted', 'Registered'], ['Accepted', 'Accepted by in-charge'], ['Awaiting office', 'Parking & office approval'], ['Confirmed', 'Confirmed'], ['Arrived', 'Arrived']];
const ORDER = { Invited: 0, Submitted: 1, Accepted: 2, 'Office rejected': 2, 'Awaiting office': 3, Confirmed: 4, Arrived: 5, Completed: 6 };
const MESSAGE = {
  Submitted: 'Thank you — your request has been sent to the department in-charge. You can come back to this page any time to see the status.',
  Accepted: 'Your appointment has been accepted. The host is arranging parking and the meeting place.',
  'Awaiting office': 'Your appointment is accepted and the parking / meeting place is waiting for approval from the main office.',
  'Office rejected': 'The host is re-arranging the parking or meeting place. Please check back later.',
  Confirmed: 'Your visit is confirmed. Please show this page at Abhinandan Dwar gate.',
  Arrived: 'Welcome to DJJS Nurmahal.', Completed: 'Thank you for visiting DJJS Nurmahal.',
  Declined: 'The department in-charge could not accept this appointment. Please contact your host.'
};

async function call(method, token, body) {
  const r = await fetch(`${BASE}/public/visits/${encodeURIComponent(token)}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d;
}

export default function GuestPage() {
  const { token } = useParams();
  const [v, setV] = useState(null), [err, setErr] = useState(''), [loadErr, setLoadErr] = useState(''), [busy, setBusy] = useState(false), [edit, setEdit] = useState(false);
  const [f, setF] = useState({ people: 1, vehicleType: NO_VEHICLE });
  useEffect(() => {
    call('GET', token).then(d => {
      setV(d);
      const g = d.guest || {}, veh = d.vehicle || {};
      setF(x => ({ ...x, name: g.name || '', mobile: g.mobile || '', email: g.email || '', organisation: g.organisation || '', city: g.city || '', people: g.people || 1, purpose: g.purpose || '',
        deptId: d.deptId || '', deptName: d.deptName || (d.depts.find(x => x.id === d.deptId) || {}).name || '', meetWith: d.meetWith || '', date: d.date || '', time: d.time || '', vehicleType: veh.has ? veh.type || 'Car' : NO_VEHICLE, vehicleNumber: veh.number || '', parking: veh.preferred || 'Abhinandan Dwar' }));
      setEdit(d.status === 'Invited');
    }).catch(e => setLoadErr(e.message));
  }, [token]);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  /* typing an in-charge's name (from the suggestions) also picks their department */
  const setMeet = e => { const name = e.target.value, d = v && v.depts.find(x => x.incharge && x.incharge.toLowerCase() === name.trim().toLowerCase()); setF({ ...f, meetWith: name, ...(d ? { deptId: d.id, deptName: d.name } : {}) }); };
  /* department is typed; a name that matches the list also links the department (and its in-charge) */
  const setDept = e => { const name = e.target.value, d = v && v.depts.find(x => x.name.toLowerCase() === name.trim().toLowerCase()); setF({ ...f, deptName: name, deptId: d ? d.id : '' }); };
  const hasVehicle = f.vehicleType && f.vehicleType !== NO_VEHICLE;

  async function submit(e) {
    e.preventDefault(); setErr('');
    if (!f.name || !f.mobile || !f.meetWith || !f.deptName || !f.date || !f.time || !f.purpose) return setErr('Please fill in all the fields marked *.');
    if (!isMobile(f.mobile)) return setErr('Please enter a valid 10-digit mobile number.');
    if (hasVehicle && !f.vehicleNumber) return setErr('Please enter the vehicle number.');
    setBusy(true);
    try { setV(await call('POST', token, { ...f, hasVehicle })); setEdit(false); window.scrollTo(0, 0); } catch (x) { setErr(x.message); }
    setBusy(false);
  }

  const shell = body => <div id="login" style={{ alignItems: 'flex-start', paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
    <div className="lg" style={{ maxWidth: 620 }}>
      <img className="lg-logo" src="/djjs-logo.png" alt="Divya Jyoti Jagrati Sansthan logo" style={{ width: 96 }} />
      <h1 style={{ textAlign: 'center' }}>DJJS Nurmahal</h1>
      <p className="lg-sub muted" style={{ margin: '2px 0 18px' }}>Guest visit registration</p>
      {body}
    </div></div>;
  if (loadErr) return shell(<div className="err">{loadErr}</div>);
  if (!v) return shell(<div className="empty">Loading…</div>);
  const dept = v.depts.find(d => d.id === (v.deptId || f.deptId));

  if (!edit) {
    const n = ORDER[v.status] || 0;
    return shell(<>
      <div className={'alert ' + (v.status === 'Declined' ? 'bad' : v.status === 'Confirmed' || v.status === 'Arrived' ? 'info' : '')}><span>{MESSAGE[v.status] || v.status}</span></div>
      {v.status !== 'Declined' ? <ol className="gsteps">{STEPS.map(([k, l], i) => <li key={k} className={n > i ? 'done' : n === i + 1 ? 'now' : ''}>{l}</li>)}</ol> : null}
      <div className="kv" style={{ marginTop: 14 }}>
        <div><span>Guest</span>{v.guest.name}{v.guest.people > 1 ? ` (+${v.guest.people - 1})` : ''}</div>
        <div><span>Meeting</span>{[v.meetWith, dept ? dept.name : v.deptName].filter(Boolean).join(' — ') || '—'}</div>
        <div><span>Date &amp; time</span>{fd(v.date)} · {v.time}</div>
        <div><span>Host</span>{v.hostName}</div>
        <div><span>Vehicle</span>{v.vehicle && v.vehicle.has ? `${v.vehicle.number} (${v.vehicle.type})` : 'No vehicle'}</div>
        {v.vehicle && v.vehicle.has ? <div><span>Parking</span>{v.parking ? <b>{v.parking}</b> : <span className="muted">Will be assigned by the DJJS office</span>}</div> : null}
        {v.office ? <div><span>Meeting place</span><b>{v.office}</b></div> : null}
        {v.golfCart ? <div><span>Golf car</span>Arranged for your campus visit</div> : null}
      </div>
      {v.editable ? <button className="btn" style={{ width: '100%' }} onClick={() => setEdit(true)}>Change my details</button> : null}
    </>);
  }

  const req = <i className="rq">*</i>;
  return shell(<form className="f2" onSubmit={submit} noValidate>
    <div className="note full" style={{ gridColumn: '1/-1' }}>You have been invited by <b>{v.hostName}</b>. Please fill in your details to book your appointment.</div>
    <label className="fld"><span>Your name {req}</span><input className="in" value={f.name} onChange={set('name')} autoComplete="name" /></label>
    <label className="fld"><span>Mobile number {req}</span><input className="in" type="tel" inputMode="numeric" value={f.mobile} onChange={set('mobile')} placeholder="10-digit mobile" autoComplete="tel-national" /></label>
    <label className="fld"><span>Email</span><input className="in" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
    <label className="fld"><span>Organisation / from</span><input className="in" value={f.organisation} onChange={set('organisation')} /></label>
    <label className="fld"><span>City</span><input className="in" value={f.city} onChange={set('city')} /></label>
    <label className="fld"><span>Number of people (including you)</span><input className="in" type="number" min="1" max="50" value={f.people} onChange={set('people')} /></label>
    {v.lockMeeting ? /* invited by a department head: the meeting is with them, fixed */
      <div className="fld full"><span>Meeting with</span><div className="in" style={{ background: 'var(--card-2)' }}><b>{v.meetWith}</b>{v.deptName ? ' — ' + v.deptName : ''}</div></div>
      : <>
        <label className="fld"><span>Whom are you meeting? {req}</span>
          <input className="in" list="meetList" value={f.meetWith} onChange={setMeet} placeholder="Type the person's name" autoComplete="off" />
          <datalist id="meetList">{v.depts.filter(d => d.incharge).map(d => <option key={d.id} value={d.incharge}>{d.name}</option>)}</datalist></label>
        <label className="fld"><span>Department {req}</span>
          <input className="in" list="deptList" value={f.deptName} onChange={setDept} placeholder="Type or choose the department" autoComplete="off" />
          <datalist id="deptList">{v.depts.map(d => <option key={d.id} value={d.name}>{d.incharge || ''}</option>)}</datalist>
          <small>{f.deptId ? `Your request goes to the in-charge of ${f.deptName}.` : 'Type the department; your host will forward the request.'}</small></label>
      </>}
    <label className="fld"><span>Date {req}</span><input className="in" type="date" min={v.today} value={f.date} onChange={set('date')} /></label>
    <label className="fld"><span>Time {req}</span><input className="in" type="time" value={f.time} onChange={set('time')} /></label>
    <label className="fld full"><span>Purpose of the visit {req}</span><textarea className="in" rows="2" value={f.purpose} onChange={set('purpose')} /></label>
    <h3 className="full" style={{ gridColumn: '1/-1', margin: '6px 0 0' }}>Vehicle</h3>
    <label className="fld"><span>Vehicle type</span><select className="in" value={f.vehicleType} onChange={set('vehicleType')}>{[NO_VEHICLE, ...v.vehicleTypes].map(t => <option key={t}>{t}</option>)}</select></label>
    <label className="fld"><span>Vehicle number {hasVehicle ? req : null}</span><input className="in" value={f.vehicleNumber || ''} onChange={set('vehicleNumber')} placeholder={hasVehicle ? 'e.g. PB 10 AB 1234' : 'Choose the vehicle type first'} disabled={!hasVehicle} style={{ textTransform: 'uppercase' }} /></label>
    {hasVehicle ? <div className="note" style={{ gridColumn: '1/-1', margin: 0 }}>Your parking will be assigned by the DJJS office and shown on this page once your visit is confirmed.</div> : null}
    {err ? <div className="err">{err}</div> : null}
    <button className="btn pri full" style={{ gridColumn: '1/-1' }} disabled={busy}>{busy ? 'Sending…' : v.status === 'Submitted' ? 'Save changes' : 'Book appointment'}</button>
  </form>);
}
