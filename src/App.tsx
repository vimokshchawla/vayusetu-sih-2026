import { useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowDown, ArrowDownUp, ArrowUp, CalendarDays,
  Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock3, Download,
  FileText, Gauge, HelpCircle, LayoutDashboard, Menu, Plane, Search, Settings,
  ShieldCheck, SlidersHorizontal, Wrench, Map as MapIcon, Radar as RadarIcon, Building2, ChartColumn, Info,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useLocation, useNavigate } from 'react-router-dom'
import { modelEngines as fleetEngines, modelMetrics, modelWarnings as fleetWarnings, sensors } from './data/modelData'
import type { Engine, EngineHistory, Risk } from './types'
import { classifyRisk, exportFleetCsv, formatDate, getRiskCounts } from './utils/fleet'
import WhatIf from './pages/WhatIf'
import BaseMap from './pages/BaseMap'
import RadarPage from './pages/Radar'
import Units from './pages/Units'
import Analytics from './pages/Analytics'
import FieldGuide from './pages/FieldGuide'
import { availability, buildFleet, pctOf } from './utils/readiness'
import './fleet.css'
import './dashboard.css'
import './whatif.css'
import './portal.css'

const navigation = [
  ['Overview', '/', LayoutDashboard], ['Base Map', '/bases', MapIcon], ['Fleet', '/fleet', Plane],
  ['Radar', '/radar', RadarIcon], ['Diagnostics', '/diagnostics', Gauge], ['Maintenance', '/maintenance', Wrench],
  ['Warnings', '/warnings', AlertTriangle], ['What-if', '/planning', CalendarDays], ['Units', '/units', Building2],
  ['Analytics', '/analytics', ChartColumn], ['Model', '/model', Activity], ['Reports', '/reports', FileText],
] as const
const titles: Record<string, string> = { '/': 'Overview', '/bases': 'Air Base Map', '/fleet': 'Fleet Monitoring', '/radar': 'Readiness Radar', '/diagnostics': 'Engine Diagnostics', '/maintenance': 'Predictive Maintenance', '/warnings': 'Early Warnings', '/planning': 'What-if Planning', '/units': 'Maintenance Units', '/analytics': 'Fleet Analytics', '/model': 'Model Performance', '/reports': 'Reports' }
titles['/settings'] = 'Settings'

function App() {
  const location = useLocation()
  const routerNavigate = useNavigate()
  const page = titles[location.pathname] ? location.pathname : '/'   // unknown addresses fall back to Overview instead of crashing
  const [selectedId, setSelectedId] = useState(() => [...fleetEngines].sort((a, b) => a.p10 - b.p10)[0].id)
  const [subset, setSubset] = useState('All subsets')
  const [headerSearch, setHeaderSearch] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [acknowledged, setAcknowledged] = useState<string[]>([])
  const [toast, setToast] = useState('')
  const [compactRows, setCompactRows] = useState(false)
  const engines = subset === 'All subsets' ? fleetEngines : fleetEngines.filter((e) => e.subset === subset)
  const scopeLabel = page === '/planning' ? 'All subsets' : subset
  const scopeCount = page === '/planning' ? fleetEngines.length : engines.length
  const selected = fleetEngines.find((e) => e.id === selectedId) ?? fleetEngines[0]
  const navigate = (path: string) => { routerNavigate(path); setMobileMenuOpen(false) }
  const announce = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2500) }
  const openEngine = (engine: Engine) => { setSelectedId(engine.id); navigate('/diagnostics') }
  const submitHeaderSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = headerSearch.trim().toUpperCase()
    if (!query) return
    const engineMatch = fleetEngines.find((engine) => engine.id.toUpperCase() === query)
    if (engineMatch) openEngine(engineMatch)
    else if (['FD001', 'FD002', 'FD003', 'FD004'].includes(query)) { setSubset(query); navigate('/fleet') }
    else {
      const enginePrefix = fleetEngines.find((engine) => engine.id.toUpperCase().startsWith(query))
      if (enginePrefix) openEngine(enginePrefix)
      else {
        const aircraft = buildFleet(fleetEngines).find((a) => a.tail.toUpperCase() === query)
        if (aircraft) openEngine(aircraft.worst)
        else announce('No engine, aircraft or subset matches that search')
      }
    }
  }
  return <div className={`portal-shell ${compactRows ? 'compact-rows' : ''}`}>
    <header className="portal-header"><button className="portal-brand" onClick={() => navigate('/')}><span className="portal-brand-mark"><img src="/icon.svg" alt="" /></span><span><strong>VayuSetu</strong><small>Predictive maintenance &amp; fleet availability</small></span></button><form className="portal-search" role="search" onSubmit={submitHeaderSearch}><Search size={17} /><input aria-label="Search engines, tail numbers or subsets" placeholder="Search engines, tail numbers or subsets" value={headerSearch} onChange={(event) => setHeaderSearch(event.target.value)} /><button type="submit" aria-label="Search"><ChevronRight size={16} /></button></form><div className="portal-scope" aria-label={`Fleet scope: ${scopeLabel}, ${scopeCount} engines`}><span><small>FLEET SCOPE</small><b>{scopeLabel}</b></span><i>{scopeCount} {scopeCount === 1 ? 'engine' : 'engines'}</i></div><button className="portal-menu-toggle" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Menu size={19} /></button></header>
    <nav className="portal-nav" aria-label="Main navigation">{navigation.map(([name, path, Icon]) => <button key={path} className={page === path ? 'active' : ''} onClick={() => navigate(path)}><Icon size={16} /><span>{name}</span>{path === '/warnings' && <i className="portal-nav-count">{fleetWarnings.length - acknowledged.length}</i>}</button>)}<button className={page === '/settings' ? 'active' : ''} onClick={() => navigate('/settings')}><Settings size={16} /><span>Settings</span></button></nav>
    {mobileMenuOpen && <nav className="portal-mobile-nav" aria-label="Mobile navigation">{navigation.map(([name, path, Icon]) => <button key={path} className={page === path ? 'active' : ''} onClick={() => navigate(path)}><Icon size={16} />{name}</button>)}<button className={page === '/settings' ? 'active' : ''} onClick={() => navigate('/settings')}><Settings size={16} />Settings</button></nav>}
    <main className="portal-content">
      <div className={`page-head ${page === '/' ? 'overview-hero' : ''}`}><div><span className="page-kicker">{page === '/' ? 'FLEET OPERATIONS' : `SERVICE / ${titles[page].toUpperCase()}`}</span><h1>{page === '/' ? 'Fleet readiness' : titles[page]}</h1><p>{description(page)}</p>{page === '/' && <div className="overview-actions"><button className="button primary" onClick={() => navigate('/maintenance')}><Wrench size={15} />Review priorities</button><button className="button secondary" onClick={() => navigate('/planning')}><CalendarDays size={15} />What-if planning</button></div>}</div><div className="head-actions">{['/', '/fleet', '/maintenance', '/reports'].includes(page) && <label className="select-box"><select value={subset} onChange={(e) => setSubset(e.target.value)} aria-label="Select operating subset"><option>All subsets</option><option>FD001</option><option>FD002</option><option>FD003</option><option>FD004</option></select><ChevronDown size={14} /></label>}{page === '/' && <button className="button secondary" onClick={() => { exportFleetCsv(engines); announce('Fleet report exported as CSV') }}><Download size={15} />Export</button>}</div></div>
      {page === '/' && <Overview engines={engines} openEngine={openEngine} navigate={navigate} />}
      {page === '/fleet' && <Fleet engines={engines} openEngine={openEngine} />}
      {page === '/diagnostics' && <Diagnostics engine={selected} selectEngine={setSelectedId} />}
      {page === '/maintenance' && <Maintenance engines={engines} openEngine={openEngine} />}
      {page === '/warnings' && <Warnings acknowledged={acknowledged} acknowledge={(id) => { setAcknowledged((current) => current.includes(id) ? current : [...current, id]); announce('Warning acknowledged') }} openEngine={(id) => { setSelectedId(id); navigate('/diagnostics') }} />}
      {page === '/planning' && <WhatIf engines={fleetEngines} initialId={selectedId} viewEngine={(id) => { setSelectedId(id); navigate('/diagnostics') }} />}
      {page === '/bases' && <BaseMap engines={fleetEngines} openEngine={(id) => { setSelectedId(id); navigate('/diagnostics') }} />}
      {page === '/radar' && <RadarPage engines={fleetEngines} openEngine={(id) => { setSelectedId(id); navigate('/diagnostics') }} />}
      {page === '/units' && <Units engines={fleetEngines} />}
      {page === '/analytics' && <Analytics engines={fleetEngines} />}
      {page === '/model' && <ModelPerformance />}
      {page === '/reports' && <><Reports engines={engines} exported={() => { exportFleetCsv(engines); announce('Engine report exported as CSV') }} /><FieldGuide engines={fleetEngines} announce={announce} /></>}
      {page === '/settings' && <SettingsPage compact={compactRows} toggleCompact={() => setCompactRows(!compactRows)} />}
      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
      <footer><span>VayuSetu · SIH26249</span><span>Model v1.1 · NASA C-MAPSS simulated data · Not for operational use</span></footer>
    </main>
  </div>
}

function description(page: string) { return ({ '/': 'Fleet health and predicted maintenance needs at a glance.', '/fleet': 'Engine-level risk, remaining life estimates, and inspection priorities.', '/diagnostics': 'Sensor history, prediction uncertainty, and model influence.', '/maintenance': 'Prioritise inspections using the VayuSetu RUL risk policy.', '/warnings': 'Review and acknowledge model-generated early warnings.', '/planning': 'Change operating assumptions for an engine and compare the risk outlook against its baseline.', '/model': 'Test results, calibration and provenance of the VayuSetu RUL model.', '/reports': 'Export a fleet risk snapshot for offline review.', '/settings': 'Preferences for this browser session.', '/bases': 'Air bases across India coloured by aircraft readiness, now and over the next 90 days.', '/radar': 'Which aircraft stay available through the planning window, ranked by time to Critical.', '/units': 'Maintenance unit performance and current engine workload.', '/analytics': 'Risk and readiness broken down by base, aircraft type, subset and sensor driver.' } as Record<string, string>)[page] }

function Overview({ engines, openEngine, navigate }: { engines: Engine[]; openEngine: (e: Engine) => void; navigate: (path: string) => void }) {
  const count = getRiskCounts(engines)
  const sortedMedians = engines.map((e) => e.medianRul).sort((a, b) => a - b)
  const med = sortedMedians.length ? Math.round((sortedMedians[Math.floor((sortedMedians.length - 1) / 2)] + sortedMedians[Math.ceil((sortedMedians.length - 1) / 2)]) / 2) : 0
  const riskData = [{ name: 'Critical', value: count.RED, color: '#b42318' }, { name: 'Watch', value: count.AMBER, color: '#b7791f' }, { name: 'Healthy', value: count.GREEN, color: '#26734d' }]
  const rulBins = [0, 20, 40, 60, 80, 100, 120].map((n) => ({ range: `${n}–${n + 19}`, count: engines.filter((e) => e.medianRul >= n && e.medianRul < n + 20).length }))
  return <><div className="kpi-grid"><KPI label="Engines monitored" value={engines.length} foot="In selected population" icon={<Plane size={16} />} /><KPI label="Urgent inspection" value={count.RED} foot="P10 ≤ 25 cycles" tone="red" icon={<AlertTriangle size={16} />} /><KPI label="Under observation" value={count.AMBER} foot="P10: 26–60 cycles" tone="amber" icon={<Clock3 size={16} />} /><KPI label="Classified healthy" value={count.GREEN} foot="P10 > 60 cycles" tone="green" icon={<ShieldCheck size={16} />} /><KPI label="Median predicted RUL" value={`${med} cycles`} foot="Median of P50 estimates" icon={<Activity size={16} />} /></div>
    <section className="panel"><div className="panel-title"><div><h2>Fleet risk overview</h2><p>Ranked by pessimistic RUL · select an engine for diagnostics</p></div><button className="link-button" onClick={() => navigate('/fleet')}>View fleet <ChevronRight size={15} /></button></div><EngineTable engines={engines} compact openEngine={openEngine} /></section>
    <div className="chart-grid"><section className="panel chart-panel"><div className="panel-title"><div><h2>Engines by priority</h2><p>Classification uses pessimistic P10</p></div><button className="icon-btn" title="Critical ≤25 · Watch 26–60 · Healthy >60 cycles"><HelpCircle size={16} /></button></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={riskData} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#697386', fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><Bar dataKey="value" name="Engines" radius={[3, 3, 0, 0]} barSize={38}>{riskData.map((item) => <Cell key={item.name} fill={item.color} />)}</Bar></BarChart></ResponsiveContainer></div><div className="legend">{riskData.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}<b>{item.value}</b></span>)}</div></section>
      <section className="panel chart-panel"><div className="panel-title"><div><h2>Predicted RUL distribution</h2><p>Median estimates · cycles</p></div><small className="chart-unit">CYCLES</small></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={rulBins} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fill: '#697386', fontSize: 9 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><Bar dataKey="count" name="Engines" fill="#64748b" radius={[3, 3, 0, 0]} barSize={24} /></BarChart></ResponsiveContainer></div><div className="chart-foot">VayuSetu model v1.1 · distribution by median estimate</div></section></div>
    <FleetStrip engines={engines} navigate={navigate} />
    <SubsetChart engines={engines} />
  </>
}

function FleetStrip({ engines, navigate }: { engines: Engine[]; navigate: (path: string) => void }) {
  const fleet = useMemo(() => buildFleet(engines), [engines])
  if (!fleet.length) return null
  const now = fleet.filter((a) => a.readyNow).length
  const in30 = fleet.reduce((s, a) => s + availability(a, 30), 0)
  const in90 = fleet.reduce((s, a) => s + availability(a, 90), 0)
  const bases = new Set(fleet.map((a) => a.baseId)).size
  return <section className="panel fleet-strip"><div className="panel-title"><div><h2>Fleet availability</h2><p>Aircraft carrying the engines in this view · <span className="demo-tag"><Info size={11} />demo fleet</span></p></div><button className="link-button" onClick={() => navigate('/bases')}>Air base map <ChevronRight size={15} /></button></div>
    <div className="fleet-strip-grid"><div><small>Aircraft</small><b>{fleet.length}</b><span>at {bases} air bases</span></div><div><small>Mission-ready now</small><b>{now} <i>{Math.round(pctOf(now, fleet.length))}%</i></b><span>No RED engine, not in hangar</span></div><div><small>Expected in 30 days</small><b>{Math.round(in30)} <i>{Math.round(pctOf(in30, fleet.length))}%</i></b><span>If no maintenance is done</span></div><div><small>Expected in 90 days</small><b>{Math.round(in90)} <i>{Math.round(pctOf(in90, fleet.length))}%</i></b><span>If no maintenance is done</span></div></div></section>
}

function KPI({ label, value, foot, tone = '', icon }: { label: string; value: string | number; foot: string; tone?: string; icon: React.ReactNode }) { return <div className="kpi"><div className="kpi-label">{label}<i className={tone}>{icon}</i></div><strong className={tone}>{value}</strong><small>{foot}</small></div> }

function Fleet({ engines, openEngine }: { engines: Engine[]; openEngine: (e: Engine) => void }) { return <section className="panel fleet-page"><div className="panel-title"><div><h2>Engine inventory</h2><p>{engines.length} engines in current selection · click a row to inspect</p></div><span className="data-tag">NASA C-MAPSS TEST SET</span></div><EngineTable engines={engines} openEngine={openEngine} /></section> }

function EngineTable({ engines, compact = false, openEngine }: { engines: Engine[]; compact?: boolean; openEngine: (e: Engine) => void }) {
  const [query, setQuery] = useState('')
  const [risk, setRisk] = useState('All risks')
  const [group, setGroup] = useState('All subsets')
  const [sort, setSort] = useState<'id' | 'lastCycle' | 'medianRul' | 'p10'>('p10')
  const [ascending, setAscending] = useState(true)
  const [page, setPage] = useState(0)
  const size = compact ? 6 : 8
  const groups = [...new Set(engines.map((e) => e.subset))]
  const rows = useMemo(() => engines.filter((e) => e.id.toLowerCase().includes(query.toLowerCase()) && (risk === 'All risks' || classifyRisk(e.p10) === risk) && (group === 'All subsets' || e.subset === group)).sort((a, b) => {
    const aValue = a[sort], bValue = b[sort]
    const result = typeof aValue === 'string' ? aValue.localeCompare(String(bValue)) : Number(aValue) - Number(bValue)
    return ascending ? result : -result
  }), [engines, query, risk, group, sort, ascending])
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const displayed = rows.slice(page * size, page * size + size)
  const sortBy = (column: typeof sort) => { setAscending(sort === column ? !ascending : true); setSort(column); setPage(0) }
  return <><div className="table-tools"><label className="search-input"><Search size={15} /><input placeholder="Search engine ID" value={query} onChange={(e) => { setQuery(e.target.value); setPage(0) }} /></label><label className="filter"><SlidersHorizontal size={13} /><select value={risk} onChange={(e) => { setRisk(e.target.value); setPage(0) }}><option>All risks</option><option>RED</option><option>AMBER</option><option>GREEN</option></select><ChevronDown size={12} /></label><label className="filter"><select value={group} onChange={(e) => { setGroup(e.target.value); setPage(0) }}><option>All subsets</option>{groups.map((g) => <option key={g}>{g}</option>)}</select><ChevronDown size={12} /></label><span className="row-count">{rows.length} engines</span></div><div className="table-scroll"><table className="engine-table"><thead><tr><th><button onClick={() => sortBy('id')}>Engine ID <SortIndicator active={sort === 'id'} ascending={ascending} /></button></th><th>Subset</th><th><button onClick={() => sortBy('lastCycle')}>Last cycle <SortIndicator active={sort === 'lastCycle'} ascending={ascending} /></button></th><th><button onClick={() => sortBy('medianRul')}>Median RUL <SortIndicator active={sort === 'medianRul'} ascending={ascending} /></button></th><th><button onClick={() => sortBy('p10')}>P10–P90 <SortIndicator active={sort === 'p10'} ascending={ascending} /></button></th><th>Risk</th><th>Top driver</th>{!compact && <th>Recommended next step</th>}<th /></tr></thead><tbody>{displayed.map((engine) => <tr key={engine.id} tabIndex={0} onClick={() => openEngine(engine)} onKeyDown={(e) => { if (e.key === 'Enter') openEngine(engine) }}><td className="engine-id">{engine.id}</td><td><span className="subset-tag">{engine.subset}</span></td><td>{engine.lastCycle.toLocaleString()}</td><td className="numeric">{engine.medianRul} <small>cycles</small></td><td>{engine.p10}–{engine.p90}</td><td><RiskTag value={classifyRisk(engine.p10)} /></td><td>{engine.topDriver}</td>{!compact && <td>{engine.nextAction}</td>}<td><ChevronRight size={14} className="row-arrow" /></td></tr>)}</tbody></table>{!displayed.length && <EmptyState title="No engines match these filters" detail="Try another engine ID, risk category, or subset." />}</div><div className="pagination"><span>Showing {rows.length ? page * size + 1 : 0}–{Math.min((page + 1) * size, rows.length)} of {rows.length}</span><div><button className="icon-btn" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button><b>{page + 1} / {pages}</b><button className="icon-btn" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button></div></div></>
}

function RiskTag({ value }: { value: Risk }) { return <span className={`risk-tag ${value.toLowerCase()}`}><i />{value}</span> }
function SortIndicator({ active, ascending }: { active: boolean; ascending: boolean }) { return active ? ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowDownUp size={12} /> }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><Search size={20} /><b>{title}</b><span>{detail}</span></div> }

function SubsetChart({ engines }: { engines: Engine[] }) {
  const data = [...new Set(engines.map((e) => e.subset))].map((subset) => { const counts = getRiskCounts(engines.filter((e) => e.subset === subset)); return { subset, Critical: counts.RED, Watch: counts.AMBER, Healthy: counts.GREEN } })
  return <section className="panel subset-panel"><div className="panel-title"><div><h2>Priority by subset</h2><p>NASA C-MAPSS operating subsets · simulated data</p></div><small className="chart-unit">ENGINE COUNT</small></div><div className="subset-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="subset" axisLine={false} tickLine={false} tick={{ fill: '#697386', fontSize: 11 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><Bar dataKey="Critical" name="Critical engines" stackId="priority" fill="#b42318" /><Bar dataKey="Watch" name="Watch engines" stackId="priority" fill="#b7791f" /><Bar dataKey="Healthy" name="Healthy engines" stackId="priority" fill="#26734d" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="legend subset-legend"><span><i style={{ background: '#b42318' }} />Critical</span><span><i style={{ background: '#b7791f' }} />Watch</span><span><i style={{ background: '#26734d' }} />Healthy</span></div></section>
}

function useEngineHistory(engineId: string) {
  const [state, setState] = useState<{ id: string; data: EngineHistory | null; error: boolean }>({ id: '', data: null, error: false })
  useEffect(() => {
    let live = true
    fetch(`${import.meta.env.BASE_URL}data/engines/${encodeURIComponent(engineId)}.json`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<EngineHistory> })
      .then((data) => { if (live) setState({ id: engineId, data, error: false }) })
      .catch(() => { if (live) setState({ id: engineId, data: null, error: true }) })
    return () => { live = false }
  }, [engineId])
  return state.id === engineId ? state : { id: engineId, data: null, error: false }
}

function Diagnostics({ engine, selectEngine }: { engine: Engine; selectEngine: (id: string) => void }) {
  const [chosenSensors, setChosenSensors] = useState<string[]>(sensors.slice(0, 2))
  const [windowSize, setWindowSize] = useState(60)
  const { data, error } = useEngineHistory(engine.id)
  const colors = ['#34465a', '#b7791f', '#26734d', '#64748b', '#b42318']
  const all = data ? data.cycles.map((cycle, k) => ({ cycle, ...Object.fromEntries(sensors.map((s) => [s, data.sensors[s]?.[k]])), p10: data.p10[k], p50: data.p50[k], p90: data.p90[k] })) : []
  const history = all.slice(-windowSize)
  const toggle = (sensor: string) => setChosenSensors((current) => current.includes(sensor) ? current.filter((s) => s !== sensor) : [...current, sensor])
  const risk = classifyRisk(engine.p10)
  const loading = !data && !error
  const waiting = (what: string) => loading
    ? <div className="prediction-empty"><Clock3 size={18} /><b>Loading {what}…</b></div>
    : <div className="prediction-empty"><AlertTriangle size={18} /><b>{what[0].toUpperCase() + what.slice(1)} unavailable</b><span>The history file for this engine could not be loaded.</span></div>
  return <><section className="panel diagnostic-head"><div className="engine-ident"><span><Plane size={21} /></span><div><small>ENGINE RECORD</small><select value={engine.id} onChange={(e) => selectEngine(e.target.value)} aria-label="Select engine">{fleetEngines.map((e) => <option key={e.id}>{e.id}</option>)}</select><p>NASA C-MAPSS · {engine.subset} · last cycle {engine.lastCycle}</p></div></div><div className="diagnostic-rul"><RiskTag value={risk} /><div><small>PREDICTED MEDIAN RUL</small><b>{engine.medianRul} <i>cycles</i></b></div></div></section><div className="metric-grid"><Metric label="P10 · Pessimistic" value={`${engine.p10} cycles`} /><Metric label="P90 · Optimistic" value={`${engine.p90} cycles`} /><Metric label="Prediction interval" value={`${(engine.p90 - engine.p10).toFixed(1)} cycles`} /><Metric label="Inspection priority" value={risk === 'RED' ? 'Urgent review' : risk === 'AMBER' ? 'Plan inspection' : 'Routine monitoring'} /></div><div className="info-note"><HelpCircle size={15} />P10–P90 is the model's 80% range, not a guaranteed failure window. On the NASA test engines the true remaining life fell inside it {Math.round(modelMetrics.overall.coverage * 100)}% of the time. Estimates require engineering validation.</div>
    <div className="diagnostic-charts"><section className="panel chart-panel"><div className="panel-title"><div><h2>Sensor history</h2><p>Readings normalised within each flight condition · last {data ? Math.min(windowSize, all.length) : windowSize} cycles</p></div><label className="range-input">Window <input type="range" min="20" max="120" step="20" value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))} /><b>{windowSize} cycles</b></label></div><div className="sensor-options">{sensors.map((sensor, i) => <label key={sensor}><input type="checkbox" checked={chosenSensors.includes(sensor)} onChange={() => toggle(sensor)} /><i style={{ background: colors[i] }} />{sensor}</label>)}</div><div className="diagnostic-chart">{!data ? waiting('sensor history') : <ResponsiveContainer width="100%" height="100%"><LineChart data={history} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="cycle" axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><ReferenceLine y={0} stroke="#c3c9d1" />{sensors.map((s, i) => chosenSensors.includes(s) && <Line key={s} type="monotone" dataKey={s} stroke={colors[i]} dot={false} strokeWidth={1.6} isAnimationActive={false} />)}</LineChart></ResponsiveContainer>}</div><div className="chart-foot">0 = typical reading for that flight condition across the training fleet (z-score). Readings drifting away from 0 indicate wear.</div></section>
      <section className="panel chart-panel"><div className="panel-title"><div><h2>RUL prediction history</h2><p>Model estimate at every recorded flight · cycles</p></div><small className="chart-unit">INFERENCE VIEW</small></div><div className="diagnostic-chart">{!data ? waiting('prediction history') : <ResponsiveContainer width="100%" height="100%"><LineChart data={all} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="cycle" axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><YAxis domain={[0, 130]} axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><ReferenceLine y={60} stroke="#b7791f" strokeDasharray="4 4" /><ReferenceLine y={25} stroke="#b42318" strokeDasharray="4 4" /><Line type="monotone" dataKey="p90" name="P90 optimistic" stroke="#94a3b8" dot={false} strokeWidth={1.2} isAnimationActive={false} /><Line type="monotone" dataKey="p50" name="Median" stroke="#34465a" dot={false} strokeWidth={2} isAnimationActive={false} /><Line type="monotone" dataKey="p10" name="P10 pessimistic" stroke="#b42318" dot={false} strokeWidth={1.2} isAnimationActive={false} /></LineChart></ResponsiveContainer>}</div><div className="chart-foot">Dashed lines: Watch (P10 ≤ 60) and Critical (P10 ≤ 25). Estimates are capped at 125 cycles (“healthy, 125+ left”). Actual future RUL is unknown in inference view.</div></section></div>
    <div className="diagnostic-bottom"><section className="panel"><div className="panel-title"><div><h2>Model drivers</h2><p>Effect on predicted life vs a healthy engine in the same flight condition</p></div></div>{engine.drivers.length ? engine.drivers.map((driver, i) => <div className="driver" key={driver.sensor + driver.direction}><span>0{i + 1}</span><b>{driver.sensor}</b><i className={driver.direction === 'Increasing risk' ? 'up' : 'down'}>{driver.direction === 'Increasing risk' ? '↑' : '↓'} {driver.direction}</i><small>{driver.direction === 'Increasing risk' ? '−' : '+'}{driver.influence} cycles</small></div>) : <div className="empty-state"><b>No single sensor stands out</b><span>Wear shows up across several sensors at once.</span></div>}<p className="interpretation">{engine.interpretation}</p></section><section className="panel recommendation"><div className="panel-title"><div><h2>Suggested next step</h2><p>Engineering approval required</p></div><Wrench size={17} /></div><strong>{engine.nextAction}</strong><p>Review sensor history and prediction uncertainty with a qualified engineer before taking action. This is not an operational instruction.</p><button className="button secondary" onClick={() => window.print()}><ClipboardList size={15} />Print diagnostic</button></section></div>
  </>
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><small>{label}</small><b>{value}</b></div> }

function Maintenance({ engines, openEngine }: { engines: Engine[]; openEngine: (e: Engine) => void }) {
  const [filter, setFilter] = useState('All priorities')
  const counts = getRiskCounts(engines)
  const queue = engines.filter((e) => filter === 'All priorities' || classifyRisk(e.p10) === filter).sort((a, b) => a.p10 - b.p10)
  return <><div className="priority-summary">{(['RED', 'AMBER', 'GREEN'] as Risk[]).map((risk) => <div className={`priority-card ${risk.toLowerCase()}`} key={risk}><span>{risk} priority</span><b>{counts[risk]}</b><small>{risk === 'RED' ? 'P10 ≤ 25 cycles' : risk === 'AMBER' ? 'P10: 26–60 cycles' : 'P10 > 60 cycles'}</small></div>)}</div><section className="panel"><div className="panel-title"><div><h2>Ranked inspection queue</h2><p>Lowest pessimistic RUL first</p></div><label className="filter"><SlidersHorizontal size={13} /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>All priorities</option><option>RED</option><option>AMBER</option><option>GREEN</option></select><ChevronDown size={12} /></label></div><div className="queue">{queue.map((e, i) => <button className="queue-row" key={e.id} onClick={() => openEngine(e)}><span className="queue-index">{String(i + 1).padStart(2, '0')}</span><span><b>{e.id}</b><small>{e.subset} · cycle {e.lastCycle}</small></span><span><b>{e.medianRul} cycles</b><small>P10 {e.p10} · P90 {e.p90}</small></span><span><small>TOP CONTRIBUTOR</small><b>{e.topDriver}</b></span><span className="queue-action">{e.nextAction}</span><RiskTag value={classifyRisk(e.p10)} /><ChevronRight size={15} /></button>)}</div>{!queue.length && <EmptyState title="No engines in this priority" detail="Choose another priority filter." />}</section><div className="info-note"><ShieldCheck size={15} />Risk rules are based on pessimistic P10, not physical safety limits: RED ≤25, AMBER 26–60, GREEN &gt;60 cycles.</div></>
}

function Warnings({ acknowledged, acknowledge, openEngine }: { acknowledged: string[]; acknowledge: (id: string) => void; openEngine: (id: string) => void }) {
  const [filter, setFilter] = useState('All warnings')
  const [shown, setShown] = useState(25)
  const rows = fleetWarnings.filter((w) => filter === 'All warnings' || (filter === 'Unacknowledged' ? !acknowledged.includes(w.id) : acknowledged.includes(w.id)))
  return <><div className="warning-banner"><AlertTriangle size={17} /><div><b>Model-generated early warnings</b><span>Raised when P10 is at or below 30 cycles on 3 of the last 5 flights. On held-out run-to-failure engines this rule warned all {modelMetrics.earlyWarning.engines} in time (median {modelMetrics.earlyWarning.median_notice_flights} cycles notice). NASA simulated data; not connected to live systems.</span></div><strong>{fleetWarnings.length - acknowledged.length} ACTIVE</strong></div><section className="panel"><div className="panel-title"><div><h2>Warning register</h2><p>{rows.length} alerts in current view · review each trigger reason</p></div><label className="filter"><select value={filter} onChange={(e) => { setFilter(e.target.value); setShown(25) }}><option>All warnings</option><option>Unacknowledged</option><option>Acknowledged</option></select><ChevronDown size={12} /></label></div><div className="warnings-list">{rows.slice(0, shown).map((w) => { const e = fleetEngines.find((item) => item.id === w.engineId); if (!e) return null; const ack = acknowledged.includes(w.id); return <div className={`warning-row ${ack ? 'acknowledged' : ''}`} key={w.id}><RiskTag value={classifyRisk(e.p10)} /><button className="warning-engine" onClick={() => openEngine(e.id)}><b>{e.id}</b><small>{e.subset} · {e.p10}–{e.p90} cycles</small></button><div><small>TRIGGER REASON</small><span>{w.reason}</span></div><div><span className="source-tag">MODEL RULE</span><small>{w.created}</small></div>{ack ? <span className="ack-label"><Check size={13} />Acknowledged</span> : <button className="button secondary" onClick={() => acknowledge(w.id)}>Acknowledge</button>}</div> })}</div>{rows.length > shown && <div className="pagination"><span>Showing {shown} of {rows.length}</span><button className="button secondary" onClick={() => setShown(shown + 25)}>Show more</button></div>}{!rows.length && <div className="empty-state">No warnings in this view.</div>}</section></>
}

function ModelPerformance() {
  const m = modelMetrics
  const o = m.overall
  const champion = m.champion.names.map((n, i) => `${n} ${Math.round(m.champion.weights[i] * 100)}%`).join(' · ')
  const subsetData = m.subsets.map((r) => ({ subset: r.subset, RMSE: r.rmse }))
  const ledgerData = m.ledger.map((r) => ({ family: r.family, RMSE: r.rmse, kept: r.kept }))
  const tiles: [string, string, string][] = [
    ['Test RMSE vs true life', `${o.rmse} cycles`, `95% CI ${o.rmseCi[0]}–${o.rmseCi[1]} · ${m.data.testEngines} engines`],
    ['Test MAE', `${o.mae} cycles`, `RMSE vs capped target ${o.rmseCapped}`],
    ['NASA PHM08 score', o.nasaScore.toLocaleString(), 'Lower is better · late predictions penalised'],
    ['Range coverage (P10–P90)', `${Math.round(o.coverage * 100)}%`, `Target 80% · ${Math.round(o.coverageLt50 * 100)}% for engines near failure`],
    ['Average range width', `${o.width} cycles`, 'Width of the P10–P90 range'],
    ['Early-warning notice', `${m.earlyWarning.median_notice_flights} cycles`, `${m.earlyWarning.outcomes['good warning']} of ${m.earlyWarning.engines} warned in the 15–60 window`],
  ]
  return <><div className="model-notice"><Activity size={17} /><div><b>NASA C-MAPSS uses simulated turbofan data</b><span>It is not military aircraft maintenance data. Benchmark results must not be interpreted as operational fleet performance.</span></div></div>
    <section className="panel model-status"><ShieldCheck size={19} /><div><small>MODEL EVALUATION STATUS</small><h2>Evaluated · {m.version.split(' ')[0]}</h2><p>Champion: {champion} (validation RMSE {m.champion.valRmse}). Engine-grouped split of {m.data.split.train} / {m.data.split.val} / {m.data.split.cal} train / validation / calibration engines; NASA test set scored once.</p></div><span className="data-tag">METRICS LOADED</span></section>
    <div className="model-metrics">{tiles.map(([label, value, foot]) => <div className="panel" key={label}><small>{label}</small><b>{value}</b><span className="metric-foot">{foot}</span></div>)}</div>
    <div className="model-panels"><section className="panel"><div className="panel-title"><div><h2>Per-subset test metrics</h2><p>RMSE vs true remaining life · last recorded flight</p></div><small className="chart-unit">CYCLES</small></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={subsetData} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="subset" axisLine={false} tickLine={false} tick={{ fill: '#697386', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><Bar dataKey="RMSE" fill="#34465a" radius={[3, 3, 0, 0]} barSize={34} isAnimationActive={false} /></BarChart></ResponsiveContainer></div><div className="table-scroll"><table className="scenario-table"><thead><tr><th>Subset</th><th>Engines</th><th>RMSE (95% CI)</th><th>MAE</th><th>Coverage</th><th>Width</th></tr></thead><tbody>{m.subsets.map((r) => <tr key={r.subset}><td className="engine-id">{r.subset}</td><td>{r.engines}</td><td>{r.rmse} <small>{r.ci}</small></td><td>{r.mae}</td><td>{Math.round(r.coverage * 100)}%</td><td>{r.width}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-title"><div><h2>Feature-family improvement</h2><p>Cross-validated RMSE as each family is added · kept only if the gain beats 2× standard error</p></div><small className="chart-unit">CYCLES</small></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={ledgerData} margin={{ top: 8, right: 10, bottom: 0, left: -20 }}><CartesianGrid stroke="#edf0f2" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="family" axisLine={false} tickLine={false} tick={{ fill: '#697386', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#87909d', fontSize: 10 }} /><Tooltip /><Bar dataKey="RMSE" radius={[3, 3, 0, 0]} barSize={30} isAnimationActive={false}>{ledgerData.map((r) => <Cell key={r.family} fill={r.kept ? '#26734d' : '#b6bec9'} />)}</Bar></BarChart></ResponsiveContainer></div><div className="legend"><span><i style={{ background: '#26734d' }} />Kept</span><span><i style={{ background: '#b6bec9' }} />Dropped · no significant gain</span></div></section></div>
    <section className="panel"><div className="panel-title"><div><h2>Model arena</h2><p>Every candidate on the same validation engines · champion chosen on validation only</p></div></div><div className="table-scroll"><table className="scenario-table"><thead><tr><th>Model</th><th>Validation RMSE</th><th>Validation MAE</th><th>Fit time</th><th>Role</th></tr></thead><tbody><tr><td className="engine-id">Blend · {champion}</td><td><b>{m.champion.valRmse}</b></td><td>—</td><td>—</td><td><span className="data-tag">CHAMPION</span></td></tr>{m.arena.map((r) => <tr key={r.model}><td className="engine-id">{r.model}</td><td>{r.valRmse}</td><td>{r.valMae}</td><td>{r.fitSeconds}s</td><td>{m.champion.names.includes(r.model) ? 'In blend' : r.model === 'DummyMean' ? 'Baseline' : 'Candidate'}</td></tr>)}</tbody></table></div></section>
    <div className="model-panels"><section className="panel"><div className="panel-title"><div><h2>Calibration &amp; early warning</h2><p>Held-out calibration engines, never used for fitting</p></div></div><p className="interpretation">{m.calibration.method}. Coverage on calibration engines: {Math.round(m.calibration.calCoverage * 100)}%.</p><p className="interpretation">Early-warning rule: {m.earlyWarning.rule}. Outcomes: {Object.entries(m.earlyWarning.outcomes).map(([k, v]) => `${k} ${v}`).join(' · ')}.</p></section>
      <section className="panel"><div className="panel-title"><div><h2>Published comparison</h2><p>Subsets (of 4) where VayuSetu has lower test RMSE</p></div></div><div className="table-scroll"><table className="scenario-table"><thead><tr><th>Published method</th><th>VayuSetu better on</th></tr></thead><tbody>{Object.entries(m.published).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v} of 4 subsets</td></tr>)}</tbody></table></div><p className="interpretation">{m.limitations[0]}</p></section></div></>
}

function Reports({ engines, exported }: { engines: Engine[]; exported: () => void }) {
  const counts = getRiskCounts(engines)
  const highest = [...engines].sort((a, b) => a.p10 - b.p10).slice(0, 5)
  return <><div className="report-toolbar"><div><small>FLEET RISK SUMMARY</small><b>{engines.length} engines · Model {modelMetrics.version.split(' ')[0]} · NASA C-MAPSS test set · {formatDate(new Date())}</b></div><div><button className="button secondary" onClick={() => window.print()}><FileText size={15} />Print report</button><button className="button primary" onClick={exported}><Download size={15} />Export CSV</button></div></div><div className="report-counts">{(['RED', 'AMBER', 'GREEN'] as Risk[]).map((risk) => <div className={`priority-card ${risk.toLowerCase()}`} key={risk}><span>{risk} priority</span><b>{counts[risk]}</b><small>Engines by P10 risk policy</small></div>)}</div><section className="panel"><div className="panel-title"><div><h2>Highest-priority engines</h2><p>Sorted by pessimistic RUL · engineering review recommended</p></div><span className="data-tag">MODEL OUTPUT</span></div><div className="table-scroll"><table className="scenario-table"><thead><tr><th>Engine ID</th><th>Subset</th><th>Risk</th><th>P10 / Median / P90</th><th>Top sensor driver</th><th>Suggested next step</th></tr></thead><tbody>{highest.map((e) => <tr key={e.id}><td className="engine-id">{e.id}</td><td>{e.subset}</td><td><RiskTag value={classifyRisk(e.p10)} /></td><td>{e.p10} / {e.medianRul} / {e.p90} cycles</td><td>{e.topDriver}</td><td>{e.nextAction}</td></tr>)}</tbody></table></div></section><section className="panel report-model"><div className="panel-title"><div><h2>Model-performance summary</h2><p>Training, validation, calibration, and test metrics</p></div></div><p>Test RMSE {modelMetrics.overall.rmse} cycles (95% CI {modelMetrics.overall.rmseCi[0]}–{modelMetrics.overall.rmseCi[1]}) on {modelMetrics.data.testEngines} NASA test engines · MAE {modelMetrics.overall.mae} · P10–P90 range coverage {Math.round(modelMetrics.overall.coverage * 100)}% · early warning in time for {modelMetrics.earlyWarning.outcomes['good warning']} of {modelMetrics.earlyWarning.engines} calibration engines.</p><small>NASA C-MAPSS uses simulated turbofan data and is not military aircraft maintenance data.</small></section></>
}

function SettingsPage({ compact, toggleCompact }: { compact: boolean; toggleCompact: () => void }) { return <section className="panel settings-panel"><div className="panel-title"><div><h2>Workspace preferences</h2><p>Browser session settings</p></div></div><Setting name="Compact table rows" detail="Reduce vertical spacing in fleet tables." checked={compact} change={toggleCompact} /><div className="setting-row"><div><b>Data source</b><small>VayuSetu model v1.1 outputs bundled with the app · no live API connected.</small></div><span className="data-tag">MODEL v1.1</span></div><p className="settings-foot">Preferences apply to this browser session only.</p></section> }
function Setting({ name, detail, checked, change }: { name: string; detail: string; checked: boolean; change: () => void }) { return <div className="setting-row"><div><b>{name}</b><small>{detail}</small></div><button role="switch" aria-checked={checked} className={`toggle ${checked ? 'on' : ''}`} onClick={change}><i /></button></div> }
export default App
