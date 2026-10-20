import { useMemo, useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import type { Engine, Risk } from '../types'
import { availability, buildFleet, needsMaintenance, pctOf, RISK_HEX } from '../utils/readiness'
import type { FleetAircraft } from '../utils/readiness'

type GroupBy = 'base' | 'type' | 'region'
const HORIZONS = [30, 60, 90, 180]
const groupKey = (a: FleetAircraft, g: GroupBy) => (g === 'base' ? a.base.name.replace('Vayu Base ', '') : g === 'type' ? `${a.type} · ${a.role}` : `${a.base.region} sector`)
/** status of an aircraft at horizon h */
function outlook(a: FleetAircraft, h: number): Risk {
  if (!a.readyNow || a.daysToCritical === 0) return 'RED'
  if (needsMaintenance(a, h) || a.inMaintenanceDays > 0) return 'AMBER'
  return 'GREEN'
}
const OUT_LABEL: Record<Risk, string> = { RED: 'Unavailable now', AMBER: 'Needs engine work in window', GREEN: 'Clear through window' }

export default function Radar({ engines, openEngine }: { engines: Engine[]; openEngine: (id: string) => void }) {
  const fleet = useMemo(() => buildFleet(engines), [engines])
  const [h, setH] = useState(30)
  const [groupBy, setGroupBy] = useState<GroupBy>('base')
  const [filter, setFilter] = useState('All')
  const [shown, setShown] = useState(15)
  const scoped = fleet.filter((a) => filter === 'All' || groupKey(a, groupBy) === filter)
  const counts = { RED: 0, AMBER: 0, GREEN: 0 } as Record<Risk, number>
  scoped.forEach((a) => { counts[outlook(a, h)] += 1 })
  const expected = scoped.reduce((s, a) => s + availability(a, h), 0)
  const enginesCritical = scoped.flatMap((a) => a.engines.map((e) => ({ e, a }))).filter(({ e, a }) => e.p10 <= 25 || (e.p10 - 25) / a.sortiesPerDay <= h).length
  const groups = [...new Set(fleet.map((a) => groupKey(a, groupBy)))].sort()
  const rows = groups.map((g) => {
    const ac = fleet.filter((a) => groupKey(a, groupBy) === g)
    const c = { RED: 0, AMBER: 0, GREEN: 0 } as Record<Risk, number>
    ac.forEach((a) => { c[outlook(a, h)] += 1 })
    return { g, n: ac.length, c, expected: ac.reduce((s, a) => s + availability(a, h), 0) }
  }).sort((a, b) => pctOf(a.expected, a.n) - pctOf(b.expected, b.n))
  const ranking = [...scoped].filter((a) => a.readyNow).sort((a, b) => a.daysToCritical - b.daysToCritical)
  const maxDays = Math.max(1, h)

  return <div className="fl">
    <div className="demo-strip"><Info size={15} /><span><b>Demo fleet layer.</b> Aircraft, bases and sortie rates are fictional; engine predictions are real model output.</span></div>
    <section className="panel fl-radar-head">
      <div><small className="fl-kicker">READINESS INTELLIGENCE</small><h2>Readiness radar</h2><p>Which aircraft stay available through the planning window, and which need engine work first.</p></div>
      <div className="fl-controls">
        <label>Horizon<select value={h} onChange={(e) => setH(Number(e.target.value))}>{HORIZONS.map((x) => <option key={x} value={x}>{x} days</option>)}</select></label>
        <label>Group by<select value={groupBy} onChange={(e) => { setGroupBy(e.target.value as GroupBy); setFilter('All') }}><option value="base">Air base</option><option value="type">Aircraft type</option><option value="region">Sector</option></select></label>
        <label>Scope<select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All</option>{groups.map((g) => <option key={g}>{g}</option>)}</select></label>
      </div>
    </section>

    <div className="fl-kpis">
      <div className="panel"><small>Aircraft in scope</small><b>{scoped.length}</b><span>{filter === 'All' ? 'Whole demo fleet' : filter}</span></div>
      <div className="panel tone-green"><small>Clear through {h} days</small><b>{counts.GREEN}</b><span>{Math.round(pctOf(counts.GREEN, scoped.length))}% of aircraft</span></div>
      <div className="panel tone-amber"><small>Need engine work within {h} days</small><b>{counts.AMBER}</b><span>Worst engine reaches Critical, or in hangar</span></div>
      <div className="panel tone-red"><small>Unavailable now</small><b>{counts.RED}</b><span>RED engine or already grounded</span></div>
      <div className="panel"><small>Expected ready on day {h}</small><b>{Math.round(expected)}</b><span>{enginesCritical} engines reach Critical in window</span></div>
    </div>

    <div className="fl-two">
      <section className="panel">
        <div className="panel-title"><div><h2>Outlook by {groupBy === 'base' ? 'air base' : groupBy === 'type' ? 'aircraft type' : 'sector'}</h2><p>{h}-day window · lowest expected readiness first</p></div></div>
        <div className="fl-stack">{rows.map((r) => <button key={r.g} className={filter === r.g ? 'sel' : ''} onClick={() => setFilter(filter === r.g ? 'All' : r.g)}>
          <span className="fl-stack-name"><b>{r.g}</b><small>{r.n} aircraft · {Math.round(pctOf(r.expected, r.n))}% expected ready</small></span>
          <span className="fl-stack-bar">{(['GREEN', 'AMBER', 'RED'] as Risk[]).map((k) => r.c[k] ? <i key={k} style={{ width: `${pctOf(r.c[k], r.n)}%`, background: RISK_HEX[k] }} title={`${OUT_LABEL[k]}: ${r.c[k]}`} /> : null)}</span>
          <span className="fl-stack-n">{r.c.RED}/{r.c.AMBER}/{r.c.GREEN}</span>
        </button>)}</div>
        <div className="legend">{(['GREEN', 'AMBER', 'RED'] as Risk[]).map((k) => <span key={k}><i style={{ background: RISK_HEX[k] }} />{OUT_LABEL[k]}</span>)}</div>
      </section>

      <section className="panel">
        <div className="panel-title"><div><h2>Aircraft ranking</h2><p>Currently available aircraft · soonest to Critical first</p></div></div>
        <div className="fl-ranking">{ranking.slice(0, shown).map((a, i) => <button key={a.tail} onClick={() => openEngine(a.worst.id)}>
          <span className="fl-i">{String(i + 1).padStart(2, '0')}</span>
          <span><b>{a.tail}</b><small>{a.type} · {a.base.name.replace('Vayu Base ', '')} · {a.sortiesPerDay} sorties/day</small></span>
          <span className="fl-days"><span className="fl-bar"><i style={{ width: `${Math.min(100, (a.daysToCritical / maxDays) * 100)}%`, background: RISK_HEX[a.daysToCritical <= h ? 'AMBER' : 'GREEN'] }} /></span><em>{a.daysToCritical === 0 ? 'Now' : a.daysToCritical > 365 ? '> 1 year' : `${Math.ceil(a.daysToCritical)} ${Math.ceil(a.daysToCritical) === 1 ? 'day' : 'days'}`}</em></span>
          <ChevronRight size={14} />
        </button>)}</div>
        {ranking.length > shown && <div className="pagination"><span>Showing {shown} of {ranking.length}</span><button className="button secondary" onClick={() => setShown(shown + 15)}>Show more</button></div>}
      </section>
    </div>
    <p className="fl-foot">Days to Critical = (worst engine P10 − 25 cycles) ÷ the aircraft's sortie rate, assuming one engine cycle per sortie. Expected ready = chance the aircraft is out of the hangar and no engine has reached end of life by the end of the window.</p>
  </div>
}
