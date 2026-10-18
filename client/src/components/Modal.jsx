/* Modal dialogs and the generic form modal used by every add / edit screen. */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { normOpts } from './ui.jsx';
import { isMobile } from '@shared/constants.js';

export function Modal({ title, wide, children, footer }) {
  const { closeModal } = useApp();
  return (
    <div className={'mdl' + (wide ? ' wide' : '')} role="dialog" aria-modal="true">
      <div className="mh"><h2>{title}</h2><button type="button" className="x" onClick={closeModal} aria-label="Close">×</button></div>
      <div className="mb">{children}</div>
      {footer ? <div className="mf">{footer}</div> : null}
    </div>
  );
}
export const CloseBtn = () => { const { closeModal } = useApp(); return <button type="button" className="btn" onClick={closeModal}>Close</button>; };
export const Info = ({ title, children }) => <Modal title={title} footer={<CloseBtn />}>{children}</Modal>;

export function ConfirmBox({ title, children, okLabel, onOk, danger }) {
  const { closeModal } = useApp();
  return (
    <Modal title={title} footer={<>
      <button type="button" className="btn" onClick={closeModal}>Cancel</button>
      <button type="button" className={'btn ' + (danger ? 'bad' : 'pri')} onClick={() => { closeModal(); onOk(); }}>{okLabel}</button>
    </>}><p>{children}</p></Modal>
  );
}
/** confirm(app, title, content, okLabel, onOk, danger) */
export const confirm = (app, title, content, okLabel, onOk, danger) =>
  app.openModal(<ConfirmBox title={title} okLabel={okLabel} onOk={onOk} danger={danger}>{content}</ConfirmBox>);

const val = (x, v) => typeof x === 'function' ? x(v) : x;

/**
 * Generic form modal.
 * fields: [{ n, l, t: text|tel|date|number|datetime-local|select|textarea|photo, opts (array or fn(values)), req, ph, full,
 *            hint (node or fn(values)), ro, dis, list, hidden (bool or fn(values)) }]
 * buttons: [{ label, cls, run(values) → Promise<error string | null> }]
 * onChange(name, value, values) may return extra values to merge (cascading selects, auto-fill).
 */
export function FormModal({ title, wide, pre, fields, values: init = {}, buttons, onChange, datalists }) {
  const { closeModal } = useApp();
  const [vals, setVals] = useState(() => {
    const v = { ...init };
    fields.forEach(f => { if (v[f.n] == null) v[f.n] = f.def != null ? f.def : ''; });
    return v;
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const errRef = useRef(null);
  const F = fields.map(f => ({ ...f, opts: f.t === 'select' ? normOpts(val(f.opts, vals)) : f.t === 'checks' ? val(f.opts, vals) : null, hidden: val(f.hidden, vals), hint: val(f.hint, vals), dis: val(f.dis, vals) }));

  /* a select whose value is no longer offered (e.g. after a parent changed) is cleared;
     a select without a placeholder holds its first option, as the browser shows it */
  useEffect(() => {
    const fix = {};
    F.forEach(f => {
      if (!f.opts || f.t !== 'select') return;
      const has = f.opts.some(o => String(o.v) === String(vals[f.n]));
      if (f.ph == null && !has && f.opts.length) fix[f.n] = f.opts[0].v;
      else if (f.ph != null && vals[f.n] !== '' && !has) fix[f.n] = '';
    });
    if (Object.keys(fix).length) setVals(v => ({ ...v, ...fix }));
  });
  useEffect(() => { if (err && errRef.current) errRef.current.scrollIntoView({ block: 'nearest' }); }, [err]);

  const set = (n, value) => setVals(prev => {
    let next = { ...prev, [n]: value };
    if (onChange) { const p = onChange(n, value, next); if (p) next = { ...next, ...p }; }
    return next;
  });
  async function press(b) {
    const out = { ...vals };
    for (const f of F) {
      if (f.hidden || f.t === 'photo' || f.t === 'checks') continue;
      const v = typeof out[f.n] === 'string' ? out[f.n].trim() : out[f.n];
      out[f.n] = v == null ? '' : v;
      if (f.req && (out[f.n] === '' || out[f.n] == null)) { setErr(`${f.l} is required.`); document.getElementById('f-' + f.n)?.focus(); return; }
      if (out[f.n] && f.t === 'tel' && !isMobile(out[f.n])) { setErr(`${f.l} must be a valid 10-digit mobile number.`); document.getElementById('f-' + f.n)?.focus(); return; }
    }
    setBusy(true); setErr('');
    const e = await b.run(out);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <Modal title={title} wide={wide} footer={<>
      <button type="button" className="btn" onClick={closeModal}>Cancel</button>
      {buttons.map((b, i) => <button key={i} type="button" className={'btn ' + (b.cls != null ? b.cls : 'pri')} disabled={busy} onClick={() => press(b)}>{b.label}</button>)}
    </>}>
      {pre}
      {datalists ? Object.entries(datalists).map(([id, list]) => <datalist key={id} id={id}>{list.map(o => <option key={o} value={o} />)}</datalist>) : null}
      <form className="f2" noValidate onSubmit={e => e.preventDefault()}>
        {F.map(f => f.hidden ? null : <Field key={f.n} f={f} v={vals[f.n]} set={set} />)}
        {err ? <div className="err" ref={errRef}>{err}</div> : null}
      </form>
    </Modal>
  );
}

function Field({ f, v, set }) {
  if (f.t === 'photo') return <PhotoField label={f.l} value={v} onChange={x => set(f.n, x)} />;
  if (f.t === 'checks') { /* several options, value = array of chosen keys */
    const cur = Array.isArray(v) ? v : [];
    return <div className={'fld' + (f.full ? ' full' : '')}><span>{f.l}</span>
      <div className="checks">{normOpts(f.opts).map(o => <label key={o.v} className="check"><input type="checkbox" checked={cur.includes(o.v)} onChange={e => set(f.n, e.target.checked ? [...cur, o.v] : cur.filter(x => x !== o.v))} />{o.l}</label>)}</div>
      {f.hint ? <small>{f.hint}</small> : null}</div>;
  }
  const common = { className: 'in', id: 'f-' + f.n, value: v == null ? '' : v, onChange: e => set(f.n, e.target.value) };
  let inp;
  if (f.t === 'select') inp = <select {...common} disabled={f.dis}>{f.ph != null ? <option value="">{f.ph}</option> : null}{f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
  else if (f.t === 'textarea') inp = <textarea {...common} rows={2} placeholder={f.ph || ''} />;
  else inp = <input {...common} type={f.t || 'text'} placeholder={f.ph || ''} list={f.list} readOnly={f.ro} />;
  return (
    <label className={'fld' + (f.full ? ' full' : '')}>
      <span>{f.l}{f.req ? <> <i className="rq">*</i></> : null}</span>{inp}{f.hint ? <small>{f.hint}</small> : null}
    </label>
  );
}

/** Downscale an image data-URL to max 240px JPEG so stored records stay small. */
function shrink(src) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => { const s = Math.min(1, 240 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .75)); };
    im.src = src;
  });
}
/** Live camera capture (getUserMedia) with upload fallback. */
function PhotoField({ label, value, onChange }) {
  const { toast } = useApp();
  const [stream, setStream] = useState(null);
  const vid = useRef(null), up = useRef(null), cam = useRef(null);
  const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); setStream(null); };
  useEffect(() => () => { if (stream) stream.getTracks().forEach(t => t.stop()); }, [stream]);
  useEffect(() => { if (stream && vid.current) vid.current.srcObject = stream; }, [stream]);
  const fromFile = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = async () => onChange(await shrink(rd.result)); rd.readAsDataURL(f); e.target.value = ''; };
  const start = () => {
    stop();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('Camera not available here — choose a photo instead.'); cam.current.click(); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } }, audio: false })
      .then(setStream).catch(() => { toast('Camera blocked or not found — pick a photo instead.'); cam.current.click(); });
  };
  const snap = async () => {
    const v = vid.current; if (!v || !v.videoWidth) { toast('Camera is still starting — try again'); return; }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    const url = c.toDataURL('image/jpeg', .9); stop(); onChange(await shrink(url));
  };
  return (
    <div className="fld full"><span style={{ fontWeight: 600, fontSize: 12.5 }}>{label}</span>
      <div className="who">
        {value ? <img className="av" style={{ width: 72, height: 72, borderRadius: 10 }} src={value} alt="Member photo" />
          : <span className="av" style={{ width: 72, height: 72, borderRadius: 10, background: 'var(--grayl)', color: 'var(--muted)', fontSize: 11 }}>No photo</span>}
        <div className="acts">
          <button type="button" className="btn sm pri" onClick={start}>📷 {value ? 'Retake photo' : 'Take photo'}</button>
          <button type="button" className="btn sm" onClick={() => up.current.click()}>Upload</button>
          {value ? <button type="button" className="btn sm" onClick={() => onChange(null)}>Remove</button> : null}
        </div>
      </div>
      <input type="file" ref={up} accept="image/*" hidden onChange={fromFile} />
      <input type="file" ref={cam} accept="image/*" capture="user" hidden onChange={fromFile} />
      {stream ? <div style={{ marginTop: 8 }}>
        <video ref={vid} autoPlay playsInline muted style={{ width: '100%', maxWidth: 340, borderRadius: 10, background: '#000', display: 'block' }} />
        <div className="acts" style={{ marginTop: 8 }}><button type="button" className="btn sm ok" onClick={snap}>Capture</button><button type="button" className="btn sm" onClick={stop}>Cancel</button></div>
      </div> : null}
      <small>Take a live photo with the camera (allow camera access when asked) or upload one.</small>
    </div>
  );
}

/** Single date-time prompt used by reception (arrival / departure). */
export const DtForm = ({ title, note, label, def, run }) => (
  <FormModal title={title} pre={<div className="note">{note}</div>} values={{ dt: def }} fields={[{ n: 'dt', l: 'Date & time', t: 'datetime-local', req: 1 }]} buttons={[{ label, run: v => run(v.dt) }]} />
);
