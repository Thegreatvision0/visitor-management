/* App shell: sidebar navigation, top bar with member search, notifications and profile menu. */
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context.jsx';
import { Avatar } from './ui.jsx';
import { today, diffDays, relTime } from '@shared/dates.js';
import { stayStart, stayEnd, stayType, pendingExt } from '@shared/constants.js';
import { memberView } from '../modals/members.jsx';
import { changePassword } from '../modals/admin.jsx';

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

function notices(D) {
  const t = today(), R = D.regs(), n = [];
  const subs = R.filter(r => r.status === 'Submitted').length, ex = R.filter(r => pendingExt(r)).length;
  if (D.can('approvals') && subs) n.push(['approvals', `${subs} registration(s) awaiting approval`]);
  if (D.can('approvals') && ex) n.push(['approvals', `${ex} extension request(s)`]);
  const arr = R.filter(r => r.status === 'Approved' && stayStart(r) <= t).length; if (D.can('reception') && arr) n.push(['reception', `${arr} sewadar expected at reception`]);
  const od = R.filter(r => r.status === 'Checked In' && stayEnd(r) < t).length; if (D.can('longterm') && od) n.push(['longterm', `${od} overdue stay(s)`]);
  const soon = R.filter(r => r.status === 'Checked In' && ['Monthly', 'Long-Term'].includes(stayType(r)) && diffDays(t, stayEnd(r)) >= 0 && diffDays(t, stayEnd(r)) <= 7).length;
  if (D.can('longterm') && soon) n.push(['longterm', `${soon} long-stay approval(s) expiring within 7 days`]);
  const nb = R.filter(r => ['Approved', 'Checked In'].includes(r.status) && !D.activeAlloc(r.id)).length; if (D.can('accommodation') && nb) n.push(['accommodation', `${nb} member(s) need a bed`]);
  const cl = D.data.beds.filter(b => b.cleaning).length; if (D.can('accommodation') && cl) n.push(['accommodation', `${cl} bed(s) pending cleaning`]);
  /* guest visits: what is waiting for this user's step */
  const V = D.data.visits || [], me = D.me, mg = ['superadmin', 'manager'].includes(me.role);
  const ap = V.filter(v => v.status === 'Submitted' && (mg || (D.hasCap('incharge') && v.deptId && v.deptId === me.deptId) || (!v.deptId && v.hostId === me.id))).length; if (ap) n.push(['visitors', `${ap} guest appointment(s) to accept`]);
  const fin = V.filter(v => ['Accepted', 'Office rejected'].includes(v.status) && v.hostId === me.id).length; if (fin) n.push(['visitors', `${fin} guest visit(s) to finalise (parking / office)`]);
  const off = V.filter(v => v.status === 'Awaiting office').length; if (off && D.hasCap('office')) n.push(['visitors', `${off} guest visit(s) waiting for Main Office approval`]);
  const gate = V.filter(v => v.status === 'Confirmed' && v.date === t).length; if (gate && D.hasCap('gate')) n.push(['visitors', `${gate} guest(s) expected at Abhinandan Dwar today`]);
  return n;
}

export default function Layout({ page, children }) {
  const app = useApp(), { D, me, go, logout } = app;
  const [side, setSide] = useState(false), [menu, setMenu] = useState(null), [q, setQ] = useState('');
  const top = useRef(null);
  useEffect(() => {
    const h = e => { if (top.current && !top.current.contains(e.target)) setMenu(null); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const nn = notices(D), approvalsN = D.regs().filter(r => r.status === 'Submitted' || pendingExt(r)).length;
  const ql = q.trim().toLowerCase(), hits = ql.length >= 2 ? D.members().filter(m => (m.id + m.name + m.mobile).toLowerCase().includes(ql)).slice(0, 8) : [];
  const nav = p => { setSide(false); setMenu(null); go(p); };
  /* event notifications for this user's role / branch / department (newest first, from the server) */
  const notes = D.data.notifications || [];
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
            <input type="search" placeholder="Search member by ID, name or mobile…" autoComplete="off" value={q} onChange={e => { setQ(e.target.value); setMenu('search'); }} onFocus={() => setMenu('search')} />
            {menu === 'search' && ql.length >= 2 ? <div className="dd">{hits.length ? hits.map(m => (
              <button key={m.id} type="button" className="it" onClick={() => { setMenu(null); setQ(''); memberView(app, m.id); }}>
                <Avatar m={m} /><span><b>{m.name}</b><br /><small>{m.id} · {m.mobile} · {D.bName(m.branchId)}</small></span>
              </button>)) : <div className="empty">No matching member.</div>}</div> : null}
          </div>
          <div className="tr">
            <button className="iconbtn" type="button" onClick={openBell} aria-label="Notifications">
              <Icon d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />{unread.length + nn.length ? <span className="n">{unread.length + nn.length}</span> : null}
            </button>
            {menu === 'bell' ? <div className="dd" style={{ right: 150, minWidth: 340 }}>
              {notes.length ? <><div className="ddh">Notifications</div>{notes.map(x => (
                <button key={x.id} type="button" className={'it' + (x.read || seen.has(x.id) && !justSeen.has(x.id) ? '' : ' unread')} onClick={() => nav(x.page)}>
                  <span>{x.text}<br /><small>{relTime(x.at)}</small></span>
                </button>))}</> : null}
              {nn.length ? <><div className="ddh">Needs attention</div>{nn.map((x, i) => <button key={i} type="button" className="it" onClick={() => nav(x[0])}>{x[1]}</button>)}</> : null}
              {!notes.length && !nn.length ? <div className="empty">All clear.</div> : null}
            </div> : null}
            <button className="prof" type="button" onClick={() => setMenu(m => m === 'prof' ? null : 'prof')}>
              <span className="av" style={{ background: 'var(--pri)' }}>{me.name[0]}</span><span className="t"><b>{me.name}</b><small>{D.role.label}</small></span>
            </button>
            {menu === 'prof' ? <div className="dd" style={{ minWidth: 260 }}><div style={{ padding: 12 }}>
              <small>Signed in as <b>{me.username}</b></small>
              <button className="btn" type="button" style={{ width: '100%', margin: '10px 0 6px' }} onClick={() => { setMenu(null); changePassword(app); }}>Change password</button>
              <button className="btn" type="button" style={{ width: '100%' }} onClick={logout}>Sign out</button>
            </div></div> : null}
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
