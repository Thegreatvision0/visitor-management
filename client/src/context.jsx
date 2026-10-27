/* App-wide state: signed-in user, data snapshot, modal, toasts and per-page UI state (filters, tabs). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { makeDomain } from './lib/domain.js';

const Ctx = createContext(null);

/* archived branches, departments and requests are kept apart: lists and forms use only the ones in use */
const prep = d => {
  if (!d) return d;
  const split = l => [(l || []).filter(x => !x.archived), (l || []).filter(x => x.archived)];
  const [branches, ab] = split(d.branches), [depts, ad] = split(d.depts), [regs, ar] = split(d.regs);
  return { ...d, branches, depts, regs, archived: { branches: ab, depts: ad, regs: ar } };
};
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [ui, setUi] = useState({ f: {}, tab: {}, closed: {} });
  /* DEMO mode and feature switches — known before sign-in (shared/features.js, FEATURES env) */
  const [meta, setMeta] = useState({ demo: false, features: {} });
  /* masked mobile numbers revealed in this session (each reveal is in the audit log) */
  const [revealed, setRevealed] = useState({});
  const reveal = useCallback(async id => { const r = await api.post(`/members/${id}/reveal`); setRevealed(x => ({ ...x, [id]: r })); }, []);
  useEffect(() => { api.get('/meta').then(setMeta).catch(() => {}); }, []);
  const tid = useRef(0);

  const toast = useCallback((msg, kind) => {
    const id = ++tid.current;
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  const openModal = useCallback(node => setModal(node), []);
  const closeModal = useCallback(() => setModal(null), []);

  const reload = useCallback(async () => { setData(prep(await api.get('/snapshot'))); }, []);
  const loadSession = useCallback(async () => {
    /* both requests at once — one network round trip less when signing in */
    const [u, d] = await Promise.all([api.get('/auth/me'), api.get('/snapshot').catch(e => e)]);
    if (u.mustChangePassword) { setMe(u); setData(null); return; } // temporary password: choose a new one first
    if (d instanceof Error) throw d;
    setMe(u); setData(prep(d));
  }, []);
  const logout = useCallback(() => {
    setToken(null); setMe(null); setData(null); setModal(null); setUi({ f: {}, tab: {}, closed: {} }); setRevealed({});
  }, []);
  const login = useCallback(async (username, password) => {
    const { token } = await api.post('/auth/login', { username, password });
    setToken(token); await loadSession();
  }, [loadSession]);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => {
    if (!getToken()) return;
    loadSession().catch(() => logout()).finally(() => setBooting(false));
  }, [loadSession, logout]);
  /* auto-refresh: every 10 s (and when the tab regains focus) ask the server whether anything
     changed, and reload the snapshot only then — new requests appear without refreshing the page */
  const revRef = useRef(null);
  useEffect(() => { if (data) revRef.current = data.rev; }, [data]);
  useEffect(() => {
    if (!me || me.mustChangePassword) return;
    let busy = false;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try { const { rev } = await api.get('/rev'); if (rev !== revRef.current) await reload(); } catch { /* offline: try again next tick */ }
      busy = false;
    };
    const id = setInterval(check, 10000);
    window.addEventListener('focus', check);
    return () => { clearInterval(id); window.removeEventListener('focus', check); };
  }, [me, reload]);
  /* while a dialog is open the page behind it must not scroll (iOS Safari) */
  useEffect(() => { document.body.classList.toggle('modal-open', !!modal); }, [modal]);
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') setModal(null); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, []);

  const D = useMemo(() => (data && me ? makeDomain(data, me) : null), [data, me]);

  /** For form buttons: run the API call, refresh data, close the modal and toast. Returns an error message or null. */
  const mutate = useCallback(async (fn, okMsg, { close = true } = {}) => {
    try { await fn(); await reload(); if (close) setModal(null); if (okMsg) toast(okMsg, 'ok'); return null; }
    catch (e) { return e.message; }
  }, [reload, toast]);
  /** For plain buttons: like mutate, but errors are shown as a toast. */
  const run = useCallback(async (fn, okMsg, opts = {}) => {
    const err = await mutate(fn, okMsg, { close: false, ...opts });
    if (err) toast(err, 'bad');
    return err;
  }, [mutate, toast]);

  const setF = useCallback((k, v) => setUi(u => ({ ...u, f: { ...u.f, [k]: v } })), []);
  const setFs = useCallback(obj => setUi(u => ({ ...u, f: { ...u.f, ...obj } })), []);
  const setTab = useCallback((page, x) => setUi(u => ({ ...u, tab: { ...u.tab, [page]: x } })), []);
  const toggle = useCallback(k => setUi(u => ({ ...u, closed: { ...u.closed, [k]: !u.closed[k] } })), []);
  const go = useCallback(page => { setModal(null); navigate('/' + page); window.scrollTo(0, 0); }, [navigate]);

  const feature = k => !!((data && data.features) || meta.features)[k];
  const value = { revealed, reveal, meta, feature, me, data, D, booting, login, logout, loadSession, reload, api, toast, openModal, closeModal, mutate, run, ui, setF, setFs, setTab, toggle, go };
  return (
    <Ctx.Provider value={value}>
      {meta.demo ? <div className="demo-ribbon" role="note">DEMO — sample data in a separate demo database, not the live system</div> : null}
      {children}
      <div id="overlay" className={modal ? 'open' : ''} onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>{modal}</div>
      <div id="toasts">{toasts.map(t => <div key={t.id} className={'toast ' + (t.kind || '')}>{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}
