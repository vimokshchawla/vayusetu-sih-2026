import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { demoUnits } from '../data/fleetDemo'
import type { Engine } from '../types'
import { buildFleet, pctOf, summariseBases } from '../utils/readiness'

type SortKey = 'onTime' | 'turnaround' | 'load' | 'repeat'

export default function Units({ engines }: { engines: Engine[] }) {
  const bases = useMemo(() => summariseBases(buildFleet(engines)), [engines])
  const [sort, setSort] = useState<SortKey>('onTime')
  const rows = demoUnits.map((u) => {
    const b = bases.find((x) => x.id === u.baseId)!
    const queue = b.red + b.amber
    return { ...u, base: b, onTime: pctOf(u.onTime90d, u.jobs90d), queue, load: queue / u.engineBays }
  })
  const sorted = [...rows].sort((a, b) => sort === 'onTime' ? b.onTime - a.onTime : sort === 'turnaround' ? a.avgTurnaroundDays - b.avgTurnaroundDays : sort === 'load' ? b.load - a.load : a.repeatDefectPct - b.repeatDefectPct)
  const best = [...rows].sort((a, b) => b.onTime - a.onTime).slice(0, 3)
  const busiest = [...rows].sort((a, b) => b.load - a.load)[0]
  const allJobs = rows.reduce((s, r) => s + r.jobs90d, 0)

  return <div className="fl">
    <div className="demo-strip"><Info size={15} /><span><b>Demo data.</b> Maintenance units and their 90-day statistics are fictional and hard-coded. The current queue counts real RED / AMBER engines on aircraft at each base.</span></div>
    <section className="panel fl-units-best">
      <div className="panel-title"><div><h2>Strongest on-time records</h2><p>Engine jobs completed on time in the last 90 days</p></div></div>
      <div className="fl-best">{best.map((u, i) => <div key={u.id}><small>RANK {i + 1}</small><b>{u.name}</b><span>{u.base.name} · {u.base.state}</span><strong>{Math.round(u.onTime)}%</strong><em>{u.onTime90d} of {u.jobs90d} jobs on time · {u.avgTurnaroundDays} d turnaround</em></div>)}</div>
    </section>
    <div className="fl-kpis">
      <div className="panel"><small>Maintenance units</small><b>{rows.length}</b><span>One per air base</span></div>
      <div className="panel"><small>Engine jobs · 90 days</small><b>{allJobs}</b><span>{Math.round(pctOf(rows.reduce((s, r) => s + r.onTime90d, 0), allJobs))}% on time fleet-wide</span></div>
      <div className="panel tone-amber"><small>Busiest unit now</small><b>{busiest.name.replace(' Maintenance Unit', '')}</b><span>{busiest.queue} engines queued for {busiest.engineBays} bays</span></div>
      <div className="panel"><small>Average turnaround</small><b>{(rows.reduce((s, r) => s + r.avgTurnaroundDays, 0) / rows.length).toFixed(1)} days</b><span>Per engine job</span></div>
    </div>
    <section className="panel">
      <div className="panel-title"><div><h2>All maintenance units</h2><p>Queue = RED + AMBER engines at the base · load = queue per engine bay</p></div>
        <label className="filter"><select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="onTime">Sort: on-time rate</option><option value="turnaround">Sort: fastest turnaround</option><option value="load">Sort: highest load</option><option value="repeat">Sort: fewest repeat defects</option></select></label></div>
      <div className="table-scroll"><table className="scenario-table"><thead><tr><th>Unit</th><th>Base</th><th>Jobs · 90 d</th><th>On time</th><th>Avg turnaround</th><th>Repeat defects</th><th>Engine bays</th><th>Spares fill</th><th>Queue now</th><th>Load</th></tr></thead>
        <tbody>{sorted.map((u) => <tr key={u.id}><td className="engine-id">{u.name}</td><td>{u.base.name.replace('Vayu Base ', '')} <small>· {u.base.state}</small></td><td>{u.jobs90d}</td><td><span className="fl-pill">{Math.round(u.onTime)}%</span></td><td>{u.avgTurnaroundDays} d</td><td>{u.repeatDefectPct}%</td><td>{u.engineBays}</td><td>{u.sparesFillPct}%</td><td>{u.queue}</td><td><b className={u.load > 6 ? 'fl-hot' : ''}>{u.load.toFixed(1)}×</b></td></tr>)}</tbody></table></div>
    </section>
  </div>
}
