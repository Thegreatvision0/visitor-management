import { useState } from 'react';
import { useApp } from '../context.jsx';

export default function Login() {
  const { login } = useApp();
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await login(u.trim(), p); } catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <div id="login">
      <form className="lg" style={{ maxWidth: 420 }} onSubmit={submit}>
        <img className="lg-logo" src="/djjs-logo.png" alt="Divya Jyoti Jagrati Sansthan logo" />
        <h1>DJJS Nurmahal</h1>
        <p className="lg-sub" style={{ margin: '2px 0 18px' }}><b>Sewadar &amp; Accommodation Management System</b></p>
        <label className="fld" style={{ marginBottom: 12 }}><span>Username</span><input className="in" autoFocus autoComplete="username" value={u} onChange={e => setU(e.target.value)} /></label>
        <label className="fld" style={{ marginBottom: 14 }}><span>Password</span><input className="in" type="password" autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} /></label>
        {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}
        <button className="btn pri" style={{ width: '100%' }} disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

/** Shown instead of the app when the account has a temporary or demo password. */
export function ChoosePassword() {
  const { me, api, loadSession, logout } = useApp();
  const [cur, setCur] = useState(''), [p1, setP1] = useState(''), [p2, setP2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr('');
    if (p1.length < 8) return setErr('The new password must have at least 8 characters.');
    if (p1 !== p2) return setErr('The new passwords do not match.');
    setBusy(true);
    try { await api.post('/auth/password', { current: cur, next: p1 }); await loadSession(); }
    catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <div id="login">
      <form className="lg" style={{ maxWidth: 420 }} onSubmit={submit}>
        <img className="lg-logo" src="/djjs-logo.png" alt="Divya Jyoti Jagrati Sansthan logo" />
        <h1>Choose a new password</h1>
        <p className="lg-sub muted" style={{ margin: '4px 0 18px' }}>Hello {me.name}. Your current password is temporary — set your own to continue.</p>
        <label className="fld" style={{ marginBottom: 12 }}><span>Current (temporary) password</span><input className="in" type="password" autoComplete="current-password" autoFocus value={cur} onChange={e => setCur(e.target.value)} /></label>
        <label className="fld" style={{ marginBottom: 12 }}><span>New password (at least 8 characters)</span><input className="in" type="password" autoComplete="new-password" value={p1} onChange={e => setP1(e.target.value)} /></label>
        <label className="fld" style={{ marginBottom: 14 }}><span>Repeat new password</span><input className="in" type="password" autoComplete="new-password" value={p2} onChange={e => setP2(e.target.value)} /></label>
        {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}
        <button className="btn pri" style={{ width: '100%' }} disabled={busy || !cur || !p1 || !p2}>{busy ? 'Saving…' : 'Save and continue'}</button>
        <button type="button" className="btn" style={{ width: '100%', marginTop: 8 }} onClick={logout}>Sign out</button>
      </form>
    </div>
  );
}
