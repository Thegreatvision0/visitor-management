/* App shell: sidebar navigation, top bar with member search, notifications and profile menu. */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { Avatar, Badge } from './ui.jsx';
import { getPrefs, setPrefs } from '../lib/prefs.js';
import { today, diffDays, relTime } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';
import { memberView } from '../modals/members.jsx';
import { changePassword } from '../modals/admin.jsx';
import { approveOpen, regView, rcArrive } from '../modals/regs.jsx';
import { bedAssign } from '../modals/beds.jsx';
import { dutyAssign } from '../modals/duties.jsx';
import { viewVisit } from '../modals/visits.jsx';

/** Global search: members (ID, name, mobile), requests (ID), guests (name, mobile, ID, vehicle number) — grouped. */
function searchAll(D, q) {
  const ql = q.trim().toLowerCase(), qn = ql.replace(/[\s-]/g, '');
  if (ql.length < 2) return [];
  const has = (...xs) => xs.some(x => x && String(x).toLowerCase().replace(/[\s-]/g, '').includes(qn));
  /* archived members are found too (marked), so a "deleted" Member ID never just disappears */
  const members = D.allMembers().filter(m => has(m.id, m.name, m.mobile) || String(m.name).toLowerCase().includes(ql)).sort((a, b) => !!a.archived - !!b.archived).slice(0, 6)
    .map(m => ({ key: 'm' + m.id, m, title: m.name, tag: m.archived ? 'Archived' : null, sub: `${m.id} · ${m.mobile} · ${D.bName(m.branchId)}`, open: app => memberView(app, m.id) }));
  const regs = D.regs().filter(r => has(r.id)).slice(0, 5)
    .map(r => ({ key: 'r' + r.id, title: `${r.id} — ${D.mName(r.memberId)}`, tag: r.status, sub: `${D.bName(r.branchId)}`, open: app => regView(app, r.id) }));
  const guests = (D.data.visits || []).filter(v => has(v.id, v.guest && v.guest.name, v.guest && v.guest.mobile, v.vehicle && v.vehicle.number)).slice(0, 6)
    .map(v => ({ key: 'g' + v.id, title: (v.guest && v.guest.name) || 'Guest (not registered yet)', tag: v.status,
      sub: [v.id, v.vehicle && v.vehicle.has && v.vehicle.number ? '🚗 ' + v.vehicle.number : '', v.date ? v.date : '', v.meetWith ? 'meeting ' + v.meetWith : ''].filter(Boolean).join(' · '), open: app => viewVisit(app, v.id) }));
  return [['Members', members], ['Requests', regs], ['Guests & vehicles', guests]].filter(g => g[1].length);
}

export const NAV = [['dashboard', 'Dashboard', 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'],
  ['members', 'Member Master', 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75'],
  ['branches', 'Branches', 'M3 21h18M5 21V7l7-4 7 4v14M9 9h2M13 9h2M9 13h2M13 13h2'],
  ['prereg', 'Pre-Registration', 'M9 2h6v4H9zM7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M8 12h8M8 16h5'],
  ['approvals', 'Approvals', 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3'],
  ['reception', 'Reception', 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4'],
  ['accommodation', 'Accommodation', 'M2 20v-8a2 2 0 012-2h16a2 2 0 012 2v8M2 16h20M6 10V7a1 1 0 011-1h4a1 1 0 011 1v3'],
  ['departments', 'Sewa Departments', 'M4 7h16v13H4zM9 7V4h6v3M4 13h16'],
  ['longterm', 'Monthly / Long-Term', 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4'],
  ['visitors', 'Guest Visits', 'M5 17h14M6 17V9l2-4h8l2 4v8M6 9h12M8 17v2M16 17v2M9 13h.01M15 13h.01'],
  ['reports', 'Reports', 'M4 20V10M10 20V4M16 20v-8M22 20H2'],
  ['admin', 'Admin', 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2']];
const Icon = ({ d }) => <svg className="ic" viewBox="0 0 24 24"><path d={d} /></svg>;

/* "Needs attention": [page, text, tab, filters] — each opens the tab that lists exactly those records */
function notices(D) {
  const t = today(), R = D.regs(), n = [];
  const subs = R.filter(r => r.status === 'Submitted').length, ex = R.filter(r => pendingExt(r)).length;
  if (D.can('approvals') && subs) n.push(['approvals', `${subs} registration(s) awaiting approval`, 'p']);
  if (D.can('approvals') && ex) n.push(['approvals', `${ex} extension request(s)`, 'x']);
  const arr = R.filter(r => r.status === 'Approved' && stayStart(r) <= t).length; if (D.can('reception') && arr) n.push(['reception', `${arr} sewadar expected at reception`, 'a', { 'rc.q': '' }]);
  const od = R.filter(r => r.status === 'Checked In' && stayEnd(r) < t).length;
  if (od && D.can('reception')) n.push(['reception', `${od} overdue stay(s)`, 'd', { 'rc.q': '' }]);
  else if (od && D.can('longterm')) n.push(['longterm', `${od} overdue stay(s)`, null, { 'lt.f': 'od' }]);
  const soon = R.filter(r => r.status === 'Checked In' && ['Monthly', 'Long-Term'].includes(stayType(r)) && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7).length;
  if (D.can('longterm') && soon) n.push(['longterm', `${soon} long-stay approval(s) expiring within 7 days`, null, { 'lt.f': 'soon' }]);
  const nb = R.filter(r => ['Approved', 'Checked In'].includes(r.status) && !D.activeAlloc(r.id)).length; if (D.can('accommodation') && nb) n.push(['accommodation', `${nb} member(s) need a bed`, 'w']);
  const cl = D.data.beds.filter(b => b.cleaning).length; if (D.can('accommodation') && cl) n.push(['accommodation', `${cl} bed(s) pending cleaning`, 'c']);
  /* guest visits: what is waiting for this user's step */
  const V = D.data.visits || [], me = D.me, mg = ['superadmin', 'manager'].includes(me.role);
  const ap = V.filter(v => v.status === 'Submitted' && (mg || (D.hasCap('incharge') && v.deptId && v.deptId === me.deptId) || (!v.deptId && v.hostId === me.id))).length; if (ap) n.push(['visitors', `${ap} guest appointment(s) to accept`, 'dept']);
  const fin = V.filter(v => ['Accepted', 'Office rejected'].includes(v.status) && v.hostId === me.id).length; if (fin) n.push(['visitors', `${fin} guest visit(s) to finalise (parking / office)`, 'mine']);
  const off = V.filter(v => v.status === 'Awaiting office').length; if (off && D.hasCap('office')) n.push(['visitors', `${off} guest visit(s) waiting for Main Office approval`, 'office']);
  const gate = V.filter(v => v.status === 'Confirmed' && v.date === t).length; if (gate && D.hasCap('gate')) n.push(['visitors', `${gate} guest(s) expected at Abhinandan Dwar today`, 'gate']);
  return n;
}

/* Event notifications that ask for a task: which task, and whether it is still open (done ones are hidden). */
const KIND_BY_TEXT = [[/awaiting approval$/, 'approve'], [/^Extension request:/, 'ext'], [/approved — expected/, 'arrive'], [/needs a bed$/, 'bed'], [/assign a sewa department$/, 'duty'],
  [/needs cleaning$/, 'clean'], [/^(New|Updated) appointment request/, 'v-incharge'], [/^Approval needed:/, 'v-office'], [/^Expected:/, 'v-gate']]; // notifications saved before tasks were tagged
const kindOf = n => n.kind || (KIND_BY_TEXT.find(([re]) => re.test(n.text)) || [])[1] || '';
function stillOpen(D, n) {
  const k = kindOf(n), r = D.reg(n.regId), v = (D.data.visits || []).find(x => x.id === n.regId);
  if (k === 'approve') return !!r && r.status === 'Submitted';
  if (k === 'ext') return !!r && !!pendingExt(r);
  if (k === 'arrive') return !!r && r.status === 'Approved';
  if (k === 'bed') return !!r && ['Approved', 'Checked In'].includes(r.status) && !D.activeAlloc(r.id);
  if (k === 'duty') return !!r && r.status === 'Checked In' && !D.activeDuty(r.id);
  if (k === 'clean') { const a = D.data.allocs.filter(x => x.regId === n.regId).sort((x, y) => String(y.endedOn || '').localeCompare(String(x.endedOn || '')))[0], b = a && D.bedO(a.bedId); return !!b && !!b.cleaning; }
  if (k === 'v-incharge') return !!v && v.status === 'Submitted';
  if (k === 'v-office') return !!v && v.status === 'Awaiting office';
  if (k === 'v-gate') return !!v && ['Confirmed', 'Arrived'].includes(v.status);
  return true; // information only: stays in the list
}
/** Open the exact tab for a notification, and the record itself where there is one to act on. */
function openNotice(app, n) {
  const { D, go, setTab, setFs } = app, k = kindOf(n), id = n.regId, r = D.reg(id), v = (D.data.visits || []).find(x => x.id === id);
  const to = (page, tab, f) => { if (f) setFs(f); if (tab) setTab(page, tab); go(page); };
  if (k === 'approve') { to('approvals', 'p'); if (r) (D.canEdit('approvals') ? approveOpen : regView)(app, id); return; }
  if (k === 'ext') { to('approvals', 'x'); return; }
  if (k === 'arrive') { to('reception', 'a', { 'rc.q': '' }); if (r) (D.canEdit('reception') && r.status === 'Approved' ? rcArrive : regView)(app, id); return; }
  if (k === 'bed') { to('accommodation', 'w'); if (r && D.canEdit('accommodation') && !D.activeAlloc(id)) bedAssign(app, id); return; }
  if (k === 'duty') { to('departments', 'u'); if (r && D.canEdit('departments') && !D.activeDuty(id)) dutyAssign(app, id); return; }
  if (k === 'clean') { to('accommodation', 'c'); return; }
  if (n.page === 'visitors') { to('visitors', { 'v-incharge': 'dept', 'v-office': 'office', 'v-gate': 'gate' }[k]); if (v) viewVisit(app, id); return; }
  to(n.page); if (r) regView(app, id); else if (v) viewVisit(app, id);
}

export default function Layout({ page, children }) {
  const app = useApp(), { D, me, go, logout } = app;
  const [side, setSide] = useState(false), [menu, setMenu] = useState(null), [q, setQ] = useState('');
  const top = useRef(null), qRef = useRef(null), [prefs, setP] = useState(getPrefs), [hi, setHi] = useState(0);
  const pref = (k, v) => { const p = { ...prefs, [k]: v }; setP(p); setPrefs(p); };
  const G = D.feature('globalSearch');
  /* Ctrl+K (or ⌘K) jumps to the search box from anywhere */
  useEffect(() => {
    if (!G) return undefined;
    const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (qRef.current) { qRef.current.focus(); qRef.current.select(); } setMenu('search'); } };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  }, [G]);
  useEffect(() => {
    const h = e => { if (top.current && !top.current.contains(e.target)) setMenu(null); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const nn = notices(D), approvalsN = D.regs().filter(r => r.status === 'Submitted' || pendingExt(r)).length;
  /* archived members are found too (marked), so a "deleted" Member ID never just disappears */
  const groups = G ? searchAll(D, q) : [], flatHits = groups.flatMap(g => g[1]);
  const pick = x => { setMenu(null); setQ(''); if (qRef.current) qRef.current.blur(); x.open(app); };
  const ql = q.trim().toLowerCase(), hits = !G && ql.length >= 2 ? D.allMembers().filter(m => (m.id + m.name + m.mobile).toLowerCase().includes(ql)).sort((a, b) => !!a.archived - !!b.archived).slice(0, 8) : [];
  const nav = (p, tab, f) => { setSide(false); setMenu(null); if (f) app.setFs(f); if (tab) app.setTab(p, tab); go(p); };
  /* event notifications for this user's role / branch / department (newest first, from the server);
     a notification asking for a task disappears once the task is done */
  const notes = (D.data.notifications || []).filter(x => stillOpen(D, x));
  const [seen, setSeen] = useState(() => new Set()), [justSeen, setJustSeen] = useState(() => new Set());
  const unread = notes.filter(x => !x.read && !seen.has(x.id));
  const openBell = () => {
    if (menu === 'bell') { setMenu(null); return; }
    setMenu('bell');
    if (unread.length) { // mark as read; they stay highlighted while this list is open
      const ids = unread.map(x => x.id);
      setJustSeen(new Set(ids)); setSeen(s => new Set([...s, ...ids]));
      app.api.post('/notifications/read', { ids }).catch(() => {});
    } else setJustSeen(new Set());
  };

  return (
    <div className="shell">
      <aside id="side" className={side ? 'open' : ''}>
        <div className="brand"><span className="logo"><img src="/djjs-logo.png" alt="Divya Jyoti Jagrati Sansthan logo" /></span><div><b>DJJS Nurmahal</b><span>Sewadar &amp; Accommodation</span></div></div>
        <nav>{NAV.filter(n => D.can(n[0])).map(n => (
          <button key={n[0]} type="button" className={'nav' + (page === n[0] ? ' on' : '')} onClick={() => nav(n[0])} title={n[1]} aria-label={n[1]}>
            <Icon d={n[2]} />{n[1]}{n[0] === 'approvals' && approvalsN ? <span className="cnt">{approvalsN}</span> : null}
          </button>))}
        </nav>
      </aside>
      {side ? <div className="scrim" onClick={() => setSide(false)} aria-hidden="true" /> : null}
      <div className="content">
        <header className="top" ref={top}>
          <button className="burger" type="button" onClick={() => setSide(s => !s)} aria-label="Menu"><Icon d="M3 6h18M3 12h18M3 18h18" /></button>
          <div className="gsw">
            <Icon d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3" />
            <input ref={qRef} type="search" placeholder={G ? 'Search members, requests, guests, vehicles…  (Ctrl+K)' : 'Search member by ID, name or mobile…'} autoComplete="off" value={q} aria-label="Search"
              aria-controls="gsearch-list" aria-expanded={menu === 'search' && ql.length >= 2}
              onChange={e => { setQ(e.target.value); setMenu('search'); setHi(0); }} onFocus={() => setMenu('search')}
              onKeyDown={e => { if (!G) return; if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, flatHits.length - 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
                if (e.key === 'Enter' && flatHits[hi]) { e.preventDefault(); pick(flatHits[hi]); } if (e.key === 'Escape') { setMenu(null); e.target.blur(); } }} />
            {G && menu === 'search' && ql.length >= 2 ? <div className="dd gsearch" id="gsearch-list" role="listbox">{groups.length ? groups.map(([title, list]) => <div key={title} role="group" aria-label={title}><div className="ddh">{title}</div>
              {list.map(x => { const i = flatHits.indexOf(x); return <button key={x.key} type="button" role="option" aria-selected={i === hi} className={'it' + (i === hi ? ' hi' : '')} onMouseEnter={() => setHi(i)} onClick={() => pick(x)}>
                {x.m ? <Avatar m={x.m} /> : null}<span><b>{x.title}</b>{x.tag ? <> <Badge s={x.tag} /></> : null}<br /><small>{x.sub}</small></span></button>; })}</div>)
              : <div className="empty">Nothing found for “{q.trim()}”.</div>}</div> : null}
            {!G && menu === 'search' && ql.length >= 2 ? <div className="dd">{hits.length ? hits.map(m => (
              <button key={m.id} type="button" className="it" onClick={() => { setMenu(null); setQ(''); memberView(app, m.id); }}>
                <Avatar m={m} /><span><b>{m.name}</b>{m.archived ? <> <span className="b gray">Archived</span></> : null}<br /><small>{m.id} · {m.mobile} · {D.bName(m.branchId)}</small></span>
              </button>)) : <div className="empty">No matching member.</div>}</div> : null}
          </div>
          <div className="tr">
            <button className="iconbtn" type="button" onClick={openBell} aria-label="Notifications">
              <Icon d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />{unread.length + nn.length ? <span className="n">{unread.length + nn.length}</span> : null}
            </button>
            {menu === 'bell' ? <div className="dd" style={{ right: 150, minWidth: 340 }}>
              {notes.length ? <><div className="ddh">Notifications</div>{notes.map(x => (
                <button key={x.id} type="button" className={'it' + (x.read || seen.has(x.id) && !justSeen.has(x.id) ? '' : ' unread')} onClick={() => { setSide(false); setMenu(null); openNotice(app, x); }}>
                  <span>{x.text}<br /><small>{relTime(x.at)}</small></span>
                </button>))}</> : null}
              {nn.length ? <><div className="ddh">Needs attention</div>{nn.map((x, i) => <button key={i} type="button" className="it" onClick={() => nav(x[0], x[2], x[3])}>{x[1]}</button>)}</> : null}
              {!notes.length && !nn.length ? <div className="empty">All clear.</div> : null}
            </div> : null}
            <button className="prof" type="button" onClick={() => setMenu(m => m === 'prof' ? null : 'prof')}>
              <span className="av" style={{ background: 'var(--pri)' }}>{me.name[0]}</span><span className="t"><b>{me.name}</b><small>{D.role.label}</small></span>
            </button>
            {menu === 'prof' ? <div className="dd" style={{ minWidth: 260 }}><div style={{ padding: 12 }}>
              <small>Signed in as <b>{me.username}</b></small>
              {D.feature('displayPrefs') ? <div className="prefs" role="group" aria-label="Display">
                <label className="check"><input type="checkbox" checked={prefs.dark} onChange={e => pref('dark', e.target.checked)} />Dark mode</label>
                <label className="check"><input type="checkbox" checked={prefs.big} onChange={e => pref('big', e.target.checked)} />Bigger text</label>
              </div> : null}
              <button className="btn" type="button" style={{ width: '100%', margin: '10px 0 6px' }} onClick={() => { setMenu(null); changePassword(app); }}>Change password</button>
              <button className="btn" type="button" style={{ width: '100%' }} onClick={logout}>Sign out</button>
            </div></div> : null}
          </div>
        </header>
        {app.offline && D.feature('pageStates') ? <div className="netbar" role="alert"><span>Connection to the server lost — showing the last loaded data. Changes cannot be saved until it is back.</span><button type="button" className="btn sm" onClick={app.retry}>Retry now</button></div> : null}
        <main>{children}</main>
      </div>
    </div>
  );
}
