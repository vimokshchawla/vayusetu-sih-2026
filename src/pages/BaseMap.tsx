import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import type { Engine, Risk } from '../types'
import { buildFleet, pctOf, readinessBand, RISK_HEX, summariseBases } from '../utils/readiness'
import type { BaseSummary } from '../utils/readiness'

type Geo = { features: { properties?: Record<string, unknown>; geometry?: { type: string; coordinates: unknown } | null }[] }
const LON0 = 67.5, LON1 = 98, LAT0 = 6, LAT1 = 37.5, W = 600
const KX = Math.cos((22 * Math.PI) / 180)
const K = W / ((LON1 - LON0) * KX)
const H = (LAT1 - LAT0) * K
const px = (lon: number, lat: number): [number, number] => [(lon - LON0) * KX * K, (LAT1 - lat) * K]
const HORIZONS = [{ h: 0, label: 'Now' }, { h: 30, label: '30 days' }, { h: 90, label: '90 days' }]

function ringsOf(g: { type: string; coordinates: unknown }): number[][][] {
  if (g.type === 'Polygon') return g.coordinates as number[][][]
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat()
  return []
}
const norm = (x: string) => x.toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim()
const stateName = (p?: Record<string, unknown>) => String(p?.st_nm ?? p?.ST_NM ?? p?.NAME_1 ?? p?.name ?? p?.state ?? p?.State ?? '')

function useIndiaGeo() {
  const [geo, setGeo] = useState<Geo | null | undefined>(undefined)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/india_states.geojson`).then((r) => (r.ok ? r.json() : null)).then((g) => setGeo(g && Array.isArray(g.features) ? g : null)).catch(() => setGeo(null))
  }, [])
  return geo
}

function Tag({ value, label }: { value: Risk; label?: string }) { return <span className={`risk-tag ${value.toLowerCase()}`}><i />{label ?? value}</span> }

export default function BaseMap({ engines, openEngine }: { engines: Engine[]; openEngine: (id: string) => void }) {
  const fleet = useMemo(() => buildFleet(engines), [engines])
  const bases = useMemo(() => summariseBases(fleet), [fleet])
  const geo = useIndiaGeo()
  const [h, setH] = useState(0)
  const [selected, setSelected] = useState<string>('')
  const ready = (b: BaseSummary) => (h === 0 ? b.readyNow : b.expectedReady(h))
  const pct = (b: BaseSummary) => pctOf(ready(b), b.aircraft.length)
  const base = bases.find((b) => b.id === selected)
  const baseStates = new Set(bases.map((b) => norm(b.state)))
  const ranked = [...bases].sort((a, b) => pct(a) - pct(b))
  const total = fleet.length
  const fleetReady = bases.reduce((s, b) => s + ready(b), 0)
  const paths = useMemo(() => (geo?.features ?? []).flatMap((f, i) => f.geometry ? [{ key: i, name: stateName(f.properties), d: ringsOf(f.geometry).map((ring) => ring.map(([lon, lat], j) => `${j ? 'L' : 'M'}${px(lon, lat).map((v) => v.toFixed(1)).join(' ')}`).join(' ') + 'Z').join(' ') }] : []), [geo])

  return <div className="fl">
    <div className="demo-strip"><Info size={15} /><span><b>Demo fleet layer.</b> Air bases, aircraft, tail numbers and sortie rates are fictional and hard-coded; each aircraft carries real model-scored NASA C-MAPSS engines.</span></div>
    <div className="fl-kpis">
      <div className="panel"><small>Aircraft in demo fleet</small><b>{total}</b><span>{bases.length} air bases · {engines.length} engines</span></div>
      <div className="panel"><small>{h === 0 ? 'Mission-ready now' : `Expected ready in ${h} days`}</small><b>{Math.round(fleetReady)} <i>({Math.round(pctOf(fleetReady, total))}%)</i></b><span>{h === 0 ? 'No RED engine, not in the hangar' : 'Out of the hangar and no engine at end of life'}</span></div>
      <div className="panel"><small>Lowest-readiness base</small><b>{ranked[0]?.name.replace('Vayu Base ', '')}</b><span>{Math.round(pct(ranked[0]))}% ready · {ranked[0]?.state}</span></div>
      <div className="panel"><small>Aircraft in the hangar</small><b>{bases.reduce((s, b) => s + b.inHangar, 0)}</b><span>Already under maintenance</span></div>
    </div>

    <div className="fl-map-grid">
      <section className="panel fl-map">
        <div className="panel-title"><div><h2>India air base map</h2><p>Bases coloured by share of aircraft ready · select a base</p></div>
          <div className="fl-seg" role="tablist">{HORIZONS.map((o) => <button key={o.h} className={h === o.h ? 'active' : ''} onClick={() => setH(o.h)}>{o.label}</button>)}</div></div>
        <svg viewBox={`-10 -10 ${W + 20} ${H + 20}`} className="fl-svg" role="img" aria-label="Map of India with air bases">
          {paths.length ? paths.map((p) => <path key={p.key} d={p.d} className={`fl-state ${base && norm(p.name) === norm(base.state) ? 'sel' : baseStates.has(norm(p.name)) ? 'has-base' : ''}`}><title>{p.name}</title></path>) : <>
            {[10, 15, 20, 25, 30, 35].map((lat) => <line key={`a${lat}`} x1={0} x2={W} y1={px(70, lat)[1]} y2={px(70, lat)[1]} className="fl-grid" />)}
            {[70, 75, 80, 85, 90, 95].map((lon) => <line key={`o${lon}`} y1={0} y2={H} x1={px(lon, 20)[0]} x2={px(lon, 20)[0]} className="fl-grid" />)}
          </>}
          {bases.map((b) => {
            const [x, y] = px(b.lon, b.lat)
            const band = readinessBand(pct(b))
            return <g key={b.id} className={`fl-base ${selected === b.id ? 'sel' : ''}`} transform={`translate(${x} ${y})`} onClick={() => setSelected(selected === b.id ? '' : b.id)} tabIndex={0} role="button" aria-label={`${b.name}, ${Math.round(pct(b))}% ready`} onKeyDown={(e) => { if (e.key === 'Enter') setSelected(b.id) }}>
              <circle r={8 + Math.sqrt(b.aircraft.length) * 1.3} fill={RISK_HEX[band]} />
              <text y={-14 - Math.sqrt(b.aircraft.length) * 1.3} textAnchor="middle">{b.name.replace('Vayu Base ', '')}</text>
              <text y={4} textAnchor="middle" className="fl-pct">{Math.round(pct(b))}</text>
            </g>
          })}
        </svg>
        <div className="legend"><span><i style={{ background: RISK_HEX.GREEN }} />≥ 80% ready</span><span><i style={{ background: RISK_HEX.AMBER }} />65–80%</span><span><i style={{ background: RISK_HEX.RED }} />&lt; 65%</span><span>Circle size = aircraft at base · number = % ready</span></div>
        {geo && <p className="fl-credit">State boundaries: <a href="https://github.com/datameet/maps" target="_blank" rel="noreferrer">DataMeet India community</a> (CC BY 4.0), simplified for display. Base locations are illustrative.</p>}
        {geo === null && <p className="fl-note">India map file not found at <code>public/data/india_states.geojson</code> – bases are shown on a plain grid.</p>}
      </section>

      <section className="panel fl-detail">
        {!base ? <>
          <div className="panel-title"><div><h2>Bases by readiness</h2><p>{h === 0 ? 'Ready now' : `Expected ready in ${h} days`} · lowest first</p></div></div>
          <div className="fl-rank">{ranked.map((b) => <button key={b.id} onClick={() => setSelected(b.id)}><span><b>{b.name.replace('Vayu Base ', '')}</b><small>{b.state} · {b.aircraft.length} aircraft</small></span><span className="fl-bar"><i style={{ width: `${pct(b)}%`, background: RISK_HEX[readinessBand(pct(b))] }} /></span><em>{Math.round(pct(b))}%</em><ChevronRight size={14} /></button>)}</div>
        </> : <>
          <div className="panel-title"><div><small className="fl-kicker">{base.region.toUpperCase()} SECTOR · {base.state.toUpperCase()}</small><h2>{base.name}</h2><p>{base.aircraft.length} aircraft · base tempo ×{base.tempo}</p></div><button className="link-button" onClick={() => setSelected('')}>All bases</button></div>
          <div className="fl-mini">
            <div><small>Ready now</small><b>{base.readyNow}/{base.aircraft.length}</b></div>
            <div><small>In 30 days</small><b>{Math.round(base.expectedReady(30))}</b></div>
            <div><small>In 90 days</small><b>{Math.round(base.expectedReady(90))}</b></div>
            <div><small>RED / AMBER engines</small><b>{base.red} / {base.amber}</b></div>
          </div>
          {base.unit && <p className="fl-unit">{base.unit.name}: {Math.round(pctOf(base.unit.onTime90d, base.unit.jobs90d))}% on time · {base.unit.avgTurnaroundDays} days average turnaround · {base.unit.engineBays} engine bays</p>}
          <div className="fl-aclist">{[...base.aircraft].sort((a, b) => a.worst.p10 - b.worst.p10).map((a) => <button key={a.tail} onClick={() => openEngine(a.worst.id)}>
            <span><b>{a.tail}</b><small>{a.type} · {a.role}</small></span>
            <span><small>WORST ENGINE</small><b>{a.worst.id}</b></span>
            <span><small>TO CRITICAL</small><b>{a.daysToCritical === 0 ? 'Now' : `${Math.ceil(a.daysToCritical)} d`}</b></span>
            {a.inMaintenanceDays > 0 ? <Tag value="AMBER" label={`HANGAR ${a.inMaintenanceDays}D`} /> : <Tag value={a.band} />}
            <ChevronRight size={14} />
          </button>)}</div>
        </>}
      </section>
    </div>

    <section className="panel">
      <div className="panel-title"><div><h2>Air base readiness table</h2><p>Expected values combine each aircraft's engine predictions with its sortie rate</p></div></div>
      <div className="table-scroll"><table className="scenario-table"><thead><tr><th>Base</th><th>State</th><th>Aircraft</th><th>Ready now</th><th>Expected · 30 d</th><th>Expected · 90 d</th><th>RED engines</th><th>AMBER engines</th><th>In hangar</th><th>Status</th></tr></thead>
        <tbody>{bases.map((b) => { const p = pctOf(b.readyNow, b.aircraft.length); return <tr key={b.id} onClick={() => setSelected(b.id)} className="fl-row"><td className="engine-id">{b.name}</td><td>{b.state}</td><td>{b.aircraft.length}</td><td>{b.readyNow} <small>({Math.round(p)}%)</small></td><td>{Math.round(b.expectedReady(30))}</td><td>{Math.round(b.expectedReady(90))}</td><td>{b.red}</td><td>{b.amber}</td><td>{b.inHangar}</td><td><Tag value={readinessBand(p)} label={readinessBand(p) === 'GREEN' ? 'READY' : readinessBand(p) === 'AMBER' ? 'WATCH' : 'LOW'} /></td></tr> })}</tbody></table></div>
    </section>
    <p className="fl-foot">The worst engine on each aircraft decides its status (RED = P10 ≤ 25 cycles). Expected readiness = chance the aircraft is out of the hangar and no engine has reached end of life, from the model's P10 / median / P90 range.</p>
  </div>
}
