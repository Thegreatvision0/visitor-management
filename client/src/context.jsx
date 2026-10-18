/* App-wide state: signed-in user, data snapshot, modal, toasts and per-page UI state (filters, tabs). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';
import { makeDomain } from './lib/domain.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [data, setData] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [ui, setUi] = useState({ f: {}, tab: {}, closed: {} });
  const tid = useRef(0);

  const toast = useCallback((msg, kind) => {
    const id = ++tid.current;
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);
  const openModal = useCallback(node => setModal(node), []);
  const closeModal = useCallback(() => setModal(null), []);

  const reload = useCallback(async () => { setData(await api.get('/snapshot')); }, []);
  const loadSession = useCallback(async () => {
    const u = await api.get('/auth/me');
    if (u.mustChangePassword) { setMe(u); setData(null); return; } // temporary password: choose a new one first
    const d = await api.get('/snapshot');
    setMe(u); setData(d);
  }, []);
  const logout = useCallback(() => {
    setToken(null); setMe(null); setData(null); setModal(null); setUi({ f: {}, tab: {}, closed: {} });
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

  const value = { me, data, D, booting, login, logout, loadSession, reload, api, toast, openModal, closeModal, mutate, run, ui, setF, setFs, setTab, toggle, go };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="overlay" className={modal ? 'open' : ''} onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>{modal}</div>
      <div id="toasts">{toasts.map(t => <div key={t.id} className={'toast ' + (t.kind || '')}>{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}
