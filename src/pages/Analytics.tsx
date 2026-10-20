import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Engine, Risk } from '../types'
import { classifyRisk } from '../utils/fleet'
import { availability, buildFleet, pctOf, RISK_HEX } from '../utils/readiness'

const axis = { axisLine: false, tickLine: false, tick: { fill: '#697386', fontSize: 10 } }
const riskCount = (es: Engine[]) => {
  const c = { RED: 0, AMBER: 0, GREEN: 0 } as Record<Risk, number>
  es.forEach((e) => { c[classifyRisk(e.p10)] += 1 })
  return c
}

export default function Analytics({ engines }: { engines: Engine[] }) {
  const fleet = useMemo(() => buildFleet(engines), [engines])
  const byBase = [...new Set(fleet.map((a) => a.base.name))].map((name) => {
    const c = riskCount(fleet.filter((a) => a.base.name === name).flatMap((a) => a.engines))
    return { name: name.replace('Vayu Base ', ''), Critical: c.RED, Watch: c.AMBER, Healthy: c.GREEN }
  })
  const byType = [...new Set(fleet.map((a) => a.type))].sort().map((t) => {
    const ac = fleet.filter((a) => a.type === t)
    return { type: t, 'Ready now %': Math.round(pctOf(ac.filter((a) => a.readyNow).length, ac.length)), 'Expected 90 d %': Math.round(pctOf(ac.reduce((s, a) => s + availability(a, 90), 0), ac.length)) }
  })
  const curve = Array.from({ length: 19 }, (_, i) => i * 5).map((d) => ({ day: d, 'Expected ready %': Number(pctOf(fleet.reduce((s, a) => s + availability(a, d), 0), fleet.length).toFixed(1)) }))
  const drivers = Object.entries(engines.filter((e) => classifyRisk(e.p10) !== 'GREEN' && e.drivers.length > 0).reduce((m, e) => { m[e.topDriver] = (m[e.topDriver] ?? 0) + 1; return m }, {} as Record<string, number>))
    .map(([driver, n]) => ({ driver, Engines: n })).sort((a, b) => b.Engines - a.Engines).slice(0, 8)
  const bySubset = ['FD001', 'FD002', 'FD003', 'FD004'].map((s) => {
    const es = engines.filter((e) => e.subset === s).map((e) => e.medianRul).sort((a, b) => a - b)
    const q = (p: number) => es.length ? es[Math.floor(p * (es.length - 1))] : 0
    const c = riskCount(engines.filter((e) => e.subset === s))
    return { subset: s, engines: es.length, median: q(0.5), q25: q(0.25), q75: q(0.75), ...c }
  })
  const ready90 = curve.find((c) => c.day === 90)!['Expected ready %']

  return <div className="fl">
    <div className="demo-strip"><Info size={15} /><span><b>Mixed sources.</b> Engine risk, drivers and remaining life are real model output. Breakdowns by base and aircraft type use the fictional demo fleet.</span></div>
    <div className="fl-kpis">
      <div className="panel"><small>Expected fleet readiness</small><b>{curve[0]['Expected ready %']}% → {ready90}%</b><span>Now → in 90 days, if no maintenance is done</span></div>
      <div className="panel"><small>Most common driver (at-risk engines)</small><b>{drivers[0]?.driver}</b><span>{drivers[0]?.Engines} RED / AMBER engines</span></div>
      <div className="panel"><small>Highest-risk subset</small><b>{[...bySubset].sort((a, b) => pctOf(b.RED, b.engines) - pctOf(a.RED, a.engines))[0].subset}</b><span>Largest share of RED engines</span></div>
    </div>
    <div className="model-panels">
      <section className="panel"><div className="panel-title"><div><h2>Engine risk by air base</h2><p>Engines on aircraft at each base · demo fleet</p></div><small className="chart-unit">ENGINES</small></div>
        <div className="fl-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={byBase} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" {...axis} interval={0} angle={-35} textAnchor="end" height={56} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Bar dataKey="Critical" stackId="r" fill={RISK_HEX.RED} isAnimationActive={false} /><Bar dataKey="Watch" stackId="r" fill={RISK_HEX.AMBER} isAnimationActive={false} /><Bar dataKey="Healthy" stackId="r" fill={RISK_HEX.GREEN} radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        <div className="legend"><span><i style={{ background: RISK_HEX.RED }} />Critical</span><span><i style={{ background: RISK_HEX.AMBER }} />Watch</span><span><i style={{ background: RISK_HEX.GREEN }} />Healthy</span></div></section>
      <section className="panel"><div className="panel-title"><div><h2>Readiness forecast</h2><p>Expected share of aircraft available if no maintenance is done</p></div><small className="chart-unit">% OF FLEET</small></div>
        <div className="fl-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={curve} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="day" {...axis} /><YAxis domain={[0, 100]} {...axis} /><Tooltip /><ReferenceLine y={80} stroke="#26734d" strokeDasharray="4 4" /><Line type="monotone" dataKey="Expected ready %" stroke="#2d5b4d" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
        <div className="chart-foot">Days from today · dashed line = 80% readiness target</div></section>
    </div>
    <div className="model-panels">
      <section className="panel"><div className="panel-title"><div><h2>Readiness by aircraft type</h2><p>Ready now vs expected in 90 days · demo fleet</p></div><small className="chart-unit">%</small></div>
        <div className="fl-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={byType} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="type" {...axis} /><YAxis domain={[0, 100]} {...axis} /><Tooltip /><Bar dataKey="Ready now %" fill="#34465a" radius={[3, 3, 0, 0]} isAnimationActive={false} /><Bar dataKey="Expected 90 d %" fill="#94a3b8" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
        <div className="legend"><span><i style={{ background: '#34465a' }} />Ready now</span><span><i style={{ background: '#94a3b8' }} />Expected in 90 days</span></div></section>
      <section className="panel"><div className="panel-title"><div><h2>Most common sensor drivers</h2><p>Top driver of RED and AMBER engines where one sensor stands out · real model output</p></div><small className="chart-unit">ENGINES</small></div>
        <div className="fl-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={drivers} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 40 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="driver" width={120} {...axis} /><Tooltip /><Bar dataKey="Engines" fill="#b7791f" radius={[0, 3, 3, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></section>
    </div>
    <section className="panel"><div className="panel-title"><div><h2>Remaining life by NASA subset</h2><p>Median (P50) predicted remaining cycles at the last recorded flight · real model output</p></div></div>
      <div className="table-scroll"><table className="scenario-table"><thead><tr><th>Subset</th><th>Operating conditions</th><th>Fault modes</th><th>Engines</th><th>Median RUL (25th–75th pct)</th><th>RED</th><th>AMBER</th><th>GREEN</th></tr></thead>
        <tbody>{bySubset.map((s) => <tr key={s.subset}><td className="engine-id">{s.subset}</td><td>{s.subset === 'FD002' || s.subset === 'FD004' ? '6 conditions' : '1 condition'}</td><td>{s.subset === 'FD003' || s.subset === 'FD004' ? 'HPC + fan' : 'HPC'}</td><td>{s.engines}</td><td>{s.median} <small>({s.q25}–{s.q75})</small></td><td>{s.RED}</td><td>{s.AMBER}</td><td>{s.GREEN}</td></tr>)}</tbody></table></div></section>
  </div>
}
