/* Small presentational building blocks shared by every page. */
import { useApp } from '../context.jsx';

export const BADGE = {
  Draft: 'gray', Submitted: 'info', Approved: 'ok', Rejected: 'bad', Cancelled: 'gray', 'Checked In': 'pur', 'Checked Out': 'gray', Available: 'ok', Occupied: 'bad', Reserved: 'warn', Cleaning: 'info',
  Present: 'ok', Absent: 'bad', Leave: 'warn', 'Not Marked': 'gray', Active: 'ok', Ended: 'gray', Pending: 'warn', 'Short-Term': 'info', Monthly: 'pur', 'Long-Term': 'warn', Resident: 'pur', Overdue: 'bad', Expected: 'info', Arrived: 'ok', Departed: 'gray',
  Invited: 'gray', Accepted: 'info', Declined: 'bad', 'Awaiting office': 'warn', 'Office rejected': 'bad', Confirmed: 'ok', Completed: 'gray'
};
export const Badge = ({ s, cls }) => <span className={'b ' + (cls || BADGE[s] || 'gray')}>{s}</span>;

/** Normalise options: strings or {v, l}. */
export const normOpts = opts => (opts || []).map(o => typeof o === 'object' ? o : { v: o, l: o });

export function Table({ cols, rows, empty, rowKey }) {
  if (!rows.length) return <div className="empty">{empty || 'No records found.'}</div>;
  return (
    <div className="tw"><table className="rt">
      <thead><tr>{cols.map((c, i) => <th key={i}>{c[0]}</th>)}</tr></thead>
      {/* data-label: on phones each row becomes a card with the column name beside each value */}
      <tbody>{rows.map((r, i) => <tr key={rowKey ? rowKey(r) : (r.id || i)}>{cols.map((c, j) => <td key={j} data-label={typeof c[0] === 'string' ? c[0] : ''}>{c[1](r)}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

export const PageHead = ({ title, sub, children }) => (
  <div className="ph"><div><h1>{title}</h1>{sub ? <p className="muted" style={{ margin: '4px 0 0' }}>{sub}</p> : null}</div><div className="acts">{children}</div></div>
);
export const Btn = ({ cls, children, ...p }) => <button type="button" className={'btn sm ' + (cls || '')} {...p}>{children}</button>;
export const PBtn = ({ children, ...p }) => <button type="button" className="btn pri" {...p}>{children}</button>;

export function Tabs({ page, list }) {
  const { ui, setTab } = useApp(), cur = ui.tab[page] || list[0][0];
  return (
    <div className="tabs">{list.map(t => (
      <button key={t[0]} type="button" className={'tab' + (cur === t[0] ? ' on' : '')} onClick={() => setTab(page, t[0])}>
        {t[1]}{t[2] != null ? <span className="cnt">{t[2]}</span> : null}
      </button>
    ))}</div>
  );
}
export const useTab = (page, def) => useApp().ui.tab[page] || def;

const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const Avatar = ({ m, size }) => {
  if (!m) return <span className="av" style={{ background: 'var(--gray)' }}>?</span>;
  const st = size ? { width: size, height: size, borderRadius: 10 } : null;
  return m.photo ? <img className="av" style={st} src={m.photo} alt="" />
    : <span className="av" style={{ ...st, background: `hsl(${hue(m.name)} 45% 40%)` }}>{m.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</span>;
};
export const Bar = ({ l, v, max }) => <div className="row"><span>{l}</span><div className="bar"><i style={{ width: (max ? Math.round(v / max * 100) : 0) + '%' }} /></div><b>{v}</b></div>;

/* Filter controls bound to ui.f[key] (kept while moving between pages). */
export function FInput({ k, ph, type }) {
  const { ui, setF } = useApp();
  return <input className="in" type={type || 'text'} value={ui.f[k] || ''} placeholder={ph} onChange={e => setF(k, e.target.value)} />;
}
export function FSelect({ k, opts, all, onPick }) {
  const { ui, setF } = useApp();
  return (
    <select className="in" value={ui.f[k] || ''} onChange={e => { setF(k, e.target.value); if (onPick) onPick(e.target.value); }}>
      {all != null ? <option value="">{all}</option> : null}
      {normOpts(opts).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
}
export const KV = ({ items }) => <div className="kv">{items.filter(Boolean).map(([k, v, full]) => <div key={k} style={full ? { gridColumn: '1/-1' } : null}><span>{k}</span>{v}</div>)}</div>;
export const Chip = ({ children }) => <span className="chip">{children}</span>;
