/* Dashboard chart components (plain SVG/HTML, no chart library).
   Specs: bars ≤ 24px with a 4px rounded data-end and square baseline, 2px lines, ≥ 8px end markers with a
   2px surface ring, hairline solid gridlines, values in text colours (never the series colour), a hover
   tooltip on every mark, and a Chart / Table switch so no value depends on colour alone. */
import { useLayoutEffect, useRef, useState } from 'react';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

/** Width of an element, kept up to date (so SVG text never scales). */
function useWidth(min = 280) {
  const ref = useRef(null), [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const set = () => setW(Math.max(min, Math.floor(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set); ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, w];
}
const niceMax = v => { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const ticks = max => { const m = niceMax(max), step = m / 4; return [0, 1, 2, 3, 4].map(i => Math.round(i * step)); };
const compact = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
/* horizontal bar: square at the baseline (left), 4px rounded data-end (right) */
const hbarPath = (x, y, w, h) => { const r = Math.min(4, w / 2, h / 2); return w <= 0 ? '' : `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`; };

/* keeps a tooltip's centre far enough from the edges that it stays on screen (phones) */
const clampX = (x, W) => Math.max(Math.min(110, W / 2), Math.min(W - Math.min(110, W / 2), x));
function Tip({ tip, W }) {
  if (!tip) return null;
  return <div className="tip" style={{ left: W ? clampX(tip.x, W) : tip.x, top: tip.y }}>{tip.body}</div>;
}

/** Card with title, subtitle, optional action, and a Chart / Table switch (the table is the accessible view). */
export function ChartCard({ title, sub, table, action, children, className }) {
  const [view, setView] = useState('chart');
  return (
    <div className={'card chart-card ' + (className || '')}>
      <div className="chart-head">
        <div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
        <div className="acts">{action}
          {table ? <div className="seg" role="group" aria-label="View">
            <button type="button" className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>Chart</button>
            <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
          </div> : null}
        </div>
      </div>
      {view === 'chart' || !table ? children : (
        <div className="tw"><table className="vtable rt"><thead><tr>{table.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} data-label={table.cols[j]}>{v}</td>)}</tr>)}</tbody></table></div>
      )}
    </div>
  );
}

/** Horizontal bar chart, one series. data: [{ label, value, sub?, onClick? }] */
export function HBarChart({ data, color = SERIES[0], unit = '', empty = 'No data yet.' }) {
  const [ref, W] = useWidth(), [tip, setTip] = useState(null), pointer = useRef('mouse'), armed = useRef(-1);
  if (!data.length) return <div className="empty">{empty}</div>;
  const labelW = Math.min(170, Math.max(96, W * 0.32)), valW = 40, row = 30, bar = 16, top = 4;
  const plotW = Math.max(40, W - labelW - valW), max = Math.max(1, ...data.map(d => d.value));
  const H = top + data.length * row + 22, tk = ticks(max), scale = v => v / tk[4] * plotW;
  const show = (e, i, d, y) => { const b = ref.current.getBoundingClientRect(); setTip({ i, x: e.clientX - b.left, y: y + 4, body: <><b>{d.label}</b><div>{d.value}{unit}{d.sub ? ' · ' + d.sub : ''}</div>{d.onClick ? <div style={{ opacity: .75 }}>{pointer.current === 'mouse' ? 'Click' : 'Tap again'} to open</div> : null}</> }); };
  return (
    <div className="viz" ref={ref} onPointerLeave={e => { if (e.pointerType === 'mouse') setTip(null); }}>
      <svg width={W} height={H} role="img" aria-label="Bar chart">
        {tk.map(t => <g key={t}><line x1={labelW + scale(t)} x2={labelW + scale(t)} y1={top} y2={H - 20} stroke="var(--grid)" strokeWidth="1" />
          <text className="tick" x={labelW + scale(t)} y={H - 6} textAnchor="middle">{compact(t)}</text></g>)}
        <line x1={labelW} x2={labelW} y1={top} y2={H - 20} stroke="var(--axis)" strokeWidth="1" />
        {data.map((d, i) => {
          const y = top + i * row, w = scale(d.value);
          return <g key={d.label}>
            {tip && tip.i === i ? <rect className="hover-band" x={0} y={y} width={W} height={row} rx="6" /> : null}
            <text className="lbl" x={labelW - 10} y={y + row / 2 + 4} textAnchor="end">{d.label.length > 22 ? d.label.slice(0, 21) + '…' : d.label}</text>
            <path d={hbarPath(labelW, y + (row - bar) / 2, w, bar)} fill={color} />
            <text className="val" x={labelW + w + 6} y={y + row / 2 + 4}>{d.value}</text>
            <rect className="hit" x={0} y={y} width={W} height={row}
              onPointerMove={e => { if (e.pointerType === 'mouse') show(e, i, d, y); }}
              onPointerDown={e => { pointer.current = e.pointerType; if (e.pointerType !== 'mouse') show(e, i, d, y); }}
              onClick={() => {
                /* touch: first tap shows the tooltip, second tap on the same bar opens it */
                if (pointer.current !== 'mouse' && armed.current !== i) { armed.current = i; return; }
                if (d.onClick) d.onClick();
              }} />
          </g>;
        })}
      </svg>
      <Tip tip={tip} W={W} />
    </div>
  );
}

/** Line chart over days with crosshair tooltip. x: ['YYYY-MM-DD'], series: [{ name, color, values }], marker: index of "today" */
export function LineChart({ x, series, marker, fmtX, height = 230 }) {
  const [ref, W] = useWidth(), [hov, setHov] = useState(null);
  const padL = 34, padR = 64, padT = 12, padB = 26, H = height, plotW = W - padL - padR, plotH = H - padT - padB;
  const max = Math.max(1, ...series.flatMap(s => s.values)), tk = ticks(max);
  const X = i => padL + (x.length > 1 ? i / (x.length - 1) * plotW : plotW / 2), Y = v => padT + plotH - v / tk[4] * plotH;
  const every = Math.max(1, Math.ceil(x.length / Math.max(2, Math.floor(plotW / 70))));
  const path = vals => vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const onMove = e => { const b = ref.current.getBoundingClientRect(), mx = e.clientX - b.left; const i = Math.round((mx - padL) / plotW * (x.length - 1)); setHov(Math.max(0, Math.min(x.length - 1, i))); };
  /* direct end labels; nudged apart only when they would collide */
  const last = x.length - 1, ends = series.map(s => ({ s, y: Y(s.values[last]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  return (
    <div className="viz" ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Line chart" style={{ touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setHov(null); }}>
        {tk.map(t => <g key={t}><line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} stroke={t ? 'var(--grid)' : 'var(--axis)'} strokeWidth="1" />
          <text className="tick" x={padL - 8} y={Y(t) + 4} textAnchor="end">{compact(t)}</text></g>)}
        {x.map((d, i) => (i % every === 0 && (marker == null || Math.abs(i - marker) >= Math.ceil(every / 2) + 1)) || i === marker ? <text key={d} className="tick" x={X(i)} y={H - 8} textAnchor="middle" style={i === marker ? { fill: 'var(--ink)', fontWeight: 600 } : null}>{i === marker ? 'Today' : fmtX(d)}</text> : null)}
        {marker != null ? <g><line x1={X(marker)} x2={X(marker)} y1={padT} y2={padT + plotH} stroke="var(--axis)" strokeWidth="1" />
          <text className="tick" x={X(marker) + 6} y={padT + 10}>Expected →</text></g> : null}
        {series.map(s => <g key={s.name}>
          <path d={path(s.values) + `L${X(last)},${Y(0)}L${X(0)},${Y(0)}Z`} fill={s.color} opacity=".08" />
          <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={X(last)} cy={Y(s.values[last])} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />
        </g>)}
        {ends.map(({ s, y }) => <text key={s.name} className="val" x={X(last) + 8} y={y + 4}>{s.values[last]} <tspan className="tick">{s.name.toLowerCase()}</tspan></text>)}
        {hov != null ? <g>
          <line x1={X(hov)} x2={X(hov)} y1={padT} y2={padT + plotH} stroke="var(--ink-2)" strokeWidth="1" opacity=".5" />
          {series.map(s => <circle key={s.name} cx={X(hov)} cy={Y(s.values[hov])} r="4" fill={s.color} stroke="var(--card)" strokeWidth="2" />)}
        </g> : null}
      </svg>
      {hov != null ? <div className="tip" style={{ left: clampX(X(hov), W), top: padT + 4 }}>
        <b>{fmtX(x[hov], true)}{marker != null && hov > marker ? ' (expected)' : hov === marker ? ' (today)' : ''}</b>
        {series.map(s => <div key={s.name} className="row"><span><i className="sw" style={{ background: s.color }} />{s.name}</span><b>{s.values[hov]}</b></div>)}
      </div> : null}
      <div className="vlegend">{series.map(s => <span key={s.name} className="key"><i className="ln" style={{ background: s.color }} />{s.name}</span>)}</div>
    </div>
  );
}

/** Part-to-whole bar (e.g. bed states): segments with 2px surface gaps, hover tooltip, legend with values. */
export function PartBar({ parts, total, height = 22, unitLabel = '' }) {
  const [tip, setTip] = useState(null), ref = useRef(null);
  const sum = total || parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="viz" ref={ref} onPointerLeave={e => { if (e.pointerType === 'mouse') setTip(null); }}>
      <div className="capacity" style={{ height }}>
        {parts.filter(p => p.value > 0).map(p => <i key={p.label} style={{ width: p.value / sum * 100 + '%', background: p.color }}
          onPointerDown={e => { const b = ref.current.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: 0, body: <><b>{p.label}</b><div>{p.value}{unitLabel} · {Math.round(p.value / sum * 100)}%</div></> }); }}
          onPointerMove={e => { const b = ref.current.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: 0, body: <><b>{p.label}</b><div>{p.value}{unitLabel} · {Math.round(p.value / sum * 100)}%</div></> }); }}
          onClick={p.onClick} />)}
      </div>
      <Tip tip={tip} W={ref.current ? ref.current.clientWidth : 0} />
      <div className="vlegend">{parts.map(p => <span key={p.label} className="key"><i className="sw" style={{ background: p.color }} />{p.label} <b style={{ color: 'var(--ink)' }}>{p.value}</b><span className="muted">({Math.round(p.value / sum * 100)}%)</span></span>)}</div>
    </div>
  );
}

/** Small occupancy bar for one row (e.g. a building): occupied / reserved / cleaning over its total. */
export function MiniPart({ parts, total, label, onClick }) {
  const [tip, setTip] = useState(false);
  const used = parts.reduce((a, p) => a + p.value, 0), pct = total ? Math.round(used / total * 100) : 0;
  return (
    <div className="bld-row" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} style={{ position: 'relative', cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <span title={label} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div className="capacity" style={{ background: 'var(--track)' }}>{parts.filter(p => p.value > 0).map(p => <i key={p.label} style={{ width: p.value / (total || 1) * 100 + '%', background: p.color }} />)}</div>
      <span className="pct">{pct}%</span>
      {tip ? <div className="tip" style={{ left: '50%', top: 0 }}><b>{label}</b>{parts.map(p => <div key={p.label} className="row"><span><i className="sw" style={{ background: p.color }} />{p.label}</span><b>{p.value}</b></div>)}<div className="row"><span>Free</span><b>{total - used}</b></div></div> : null}
    </div>
  );
}
