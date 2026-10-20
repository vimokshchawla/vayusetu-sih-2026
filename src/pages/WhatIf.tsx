import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Activity, ArrowRight, ChevronDown, HelpCircle, RotateCcw } from 'lucide-react'
import type { Engine, Risk } from '../types'
import { classifyRisk, formatDate } from '../utils/fleet'
import { failChance } from '../utils/readiness'

/*
  What-if simulator (NIRMAN-style) for one engine.
  The model gives each engine a remaining-life range in cycles (P10 / median / P90).
  The scenario changes how fast those cycles are used up (tempo, mission severity, surge, grounding)
  and when the engine stops accruing risk (inspection / engine change). Risk = chance the engine reaches
  end of life within the horizon, read from the model's range. Rule-based on top of the ML range.
*/

type Params = { tempo: number; severity: number; surgeDays: number; surgeTempo: number; groundDays: number; inspectDay: number }
type ParamKey = keyof Params
type Outlook = 'Stable' | 'Elevated' | 'Severe'

const BASELINE: Params = { tempo: 1, severity: 1, surgeDays: 0, surgeTempo: 2, groundDays: 0, inspectDay: 0 }

const FIELDS: { key: ParamKey; group: string; label: string; min: number; max: number; step: number; unit: string; help: string }[] = [
  { key: 'tempo', group: 'Operating tempo', label: 'Sorties per day', min: 0.25, max: 3, step: 0.25, unit: 'sorties/day', help: 'Normal flying rate for this aircraft.' },
  { key: 'severity', group: 'Operating tempo', label: 'Engine cycles per sortie', min: 0.8, max: 1.5, step: 0.05, unit: 'cycles', help: 'Above 1 = harsher missions (high power, hot or high-altitude) that wear the engine faster.' },
  { key: 'surgeDays', group: 'Surge period', label: 'Surge length', min: 0, max: 60, step: 1, unit: 'days', help: 'Days of intensified operations starting now. 0 = no surge.' },
  { key: 'surgeTempo', group: 'Surge period', label: 'Sorties per day during surge', min: 1, max: 4, step: 0.5, unit: 'sorties/day', help: 'Flying rate while the surge lasts.' },
  { key: 'groundDays', group: 'Maintenance plan', label: 'Grounded before flying resumes', min: 0, max: 30, step: 1, unit: 'days', help: 'Aircraft held on the ground (e.g. awaiting spares) – no cycles used.' },
  { key: 'inspectDay', group: 'Maintenance plan', label: 'Inspection / engine change on day', min: 0, max: 180, step: 1, unit: 'day', help: 'After this day the engine is assumed restored or replaced, so its risk stops accruing. 0 = not planned.' },
]
const GROUPS = [...new Set(FIELDS.map((f) => f.group))]

const QUICK: { name: string; params: Params }[] = [
  { name: 'Baseline', params: BASELINE },
  { name: 'Surge operations', params: { ...BASELINE, tempo: 1.5, severity: 1.2, surgeDays: 14, surgeTempo: 3 } },
  { name: 'Reduced flying', params: { ...BASELINE, tempo: 0.5 } },
  { name: 'Ground & inspect', params: { ...BASELINE, groundDays: 5, inspectDay: 7 } },
]
const HORIZONS = [7, 14, 30, 60, 90, 180]

// ---------- calculation ----------
function cyclesUsed(days: number, p: Params) {
  let total = 0
  for (let d = 0; d < Math.ceil(days); d++) {
    const frac = Math.min(1, days - d)
    const rate = d < p.groundDays ? 0 : d < p.groundDays + p.surgeDays ? p.surgeTempo : p.tempo
    total += rate * p.severity * frac
  }
  return total
}
function riskPct(e: Engine, p: Params, horizon: number) {
  const exposure = p.inspectDay > 0 ? Math.min(horizon, p.inspectDay) : horizon
  return 100 * failChance(e, cyclesUsed(exposure, p))
}
/** first day on which `cycles` have been used up; null if not within a year */
function dayToUse(cycles: number, p: Params): number | null {
  if (cycles <= 0) return 0
  for (let d = 1; d <= 365; d++) if (cyclesUsed(d, p) >= cycles) return d
  return null
}
const outlook = (pct: number): Outlook => pct > 60 ? 'Severe' : pct > 30 ? 'Elevated' : 'Stable'
const changedKeys = (p: Params) => (Object.keys(BASELINE) as ParamKey[]).filter((k) => p[k] !== BASELINE[k])
const fmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d)
const fieldOf = (k: ParamKey) => FIELDS.find((f) => f.key === k)!
const valueText = (k: ParamKey, v: number) => k === 'inspectDay' && v === 0 ? 'not planned' : k === 'surgeDays' && v === 0 ? 'no surge' : k === 'inspectDay' ? `day ${v}` : `${v} ${v === 1 ? fieldOf(k).unit.replace('sorties', 'sortie').replace('cycles', 'cycle').replace('days', 'day') : fieldOf(k).unit}`

function report(e: Engine, p: Params, horizon: number, fleet: Engine[]) {
  const base = riskPct(e, BASELINE, horizon), scen = riskPct(e, p, horizon)
  // fair split of the total change: average of "this change alone" and "removing it from the full scenario", rescaled to sum to the total
  const keys = changedKeys(p)
  const raw = keys.map((k) => ((riskPct(e, { ...BASELINE, [k]: p[k] }, horizon) - base) + (scen - riskPct(e, { ...p, [k]: BASELINE[k] }, horizon))) / 2)
  const rawSum = raw.reduce((a, b) => a + b, 0)
  const contributions = keys.map((k, i) => ({ key: k, delta: Math.abs(rawSum) > 1e-9 ? raw[i] * (scen - base) / rawSum : 0 }))
  const crossing = (threshold: number, q: Params) => e.p10 <= threshold ? 0 : dayToUse(e.p10 - threshold, q)
  const fleetCritical = (q: Params) => fleet.filter((f) => f.p10 <= 25 || (dayToUse(f.p10 - 25, { ...q, inspectDay: 0 }) ?? 999) <= horizon).length
  return {
    base, scen, delta: scen - base, contributions,
    forecasts: [
      { label: 'Risk · 30 days', base: riskPct(e, BASELINE, 30), scen: riskPct(e, p, 30), unit: '%' },
      { label: 'Risk · 90 days', base: riskPct(e, BASELINE, 90), scen: riskPct(e, p, 90), unit: '%' },
      { label: 'Days to Watch (P10 ≤ 60)', base: crossing(60, BASELINE), scen: crossing(60, p), unit: 'd' },
      { label: 'Days to Critical (P10 ≤ 25)', base: crossing(25, BASELINE), scen: crossing(25, p), unit: 'd' },
    ],
    criticalDay: crossing(25, p),
    fleet: { base: fleetCritical(BASELINE), scen: fleetCritical(p), total: fleet.length },
  }
}

// ---------- small pieces ----------
function Gauge({ pct, size = 'large' }: { pct: number; size?: 'large' | 'small' }) {
  const r = 80, cx = 110, cy = 100
  const pt = (v: number) => { const a = Math.PI * (1 - v / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)] }
  const arc = (a: number, b: number) => { const [x1, y1] = pt(a), [x2, y2] = pt(b); return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}` }
  const [nx, ny] = pt(Math.max(0, Math.min(100, pct)))
  const tone = outlook(pct).toLowerCase()
  return <svg className={`sim-gauge ${size}`} viewBox="-10 -16 240 140" role="img" aria-label={`${fmt(pct)}% risk, ${outlook(pct)}`}>
    <path d={arc(0, 30)} className="g-green" /><path d={arc(30, 60)} className="g-amber" /><path d={arc(60, 100)} className="g-red" />
    <line x1={cx} y1={cy} x2={cx + (nx - cx) * 0.78} y2={cy + (ny - cy) * 0.78} className={`g-needle ${tone}`} /><circle cx={cx} cy={cy} r="6" className={`g-hub ${tone}`} />
    <text x={cx - r} y={cy + 18} textAnchor="middle">0%</text><text x={cx + (r + 22) * Math.cos(Math.PI * 0.7)} y={cy - (r + 22) * Math.sin(Math.PI * 0.7)} textAnchor="middle">30%</text>
    <text x={cx + (r + 22) * Math.cos(Math.PI * 0.4)} y={cy - (r + 22) * Math.sin(Math.PI * 0.4)} textAnchor="middle">60%</text><text x={cx + r} y={cy + 18} textAnchor="middle">100%</text>
  </svg>
}
function Tag({ value }: { value: Risk }) { return <span className={`risk-tag ${value.toLowerCase()}`}><i />{value}</span> }
const dayText = (d: number | null, start: Date) => {
  if (d === null) return 'Beyond 1 year'
  if (d === 0) return 'Already crossed'
  const date = new Date(start); date.setDate(date.getDate() + d)
  return `${d} ${d === 1 ? 'day' : 'days'} · ${formatDate(date)}`
}

// ---------- page ----------
export default function WhatIf({ engines, initialId, viewEngine }: { engines: Engine[]; initialId: string; viewEngine: (id: string) => void }) {
  const sorted = useMemo(() => [...engines].sort((a, b) => a.p10 - b.p10), [engines])
  // open on the chosen engine only if it still has life to play with; otherwise on an AMBER engine with a planning window
  const [engineId, setEngineId] = useState(() => {
    const chosen = engines.find((e) => e.id === initialId)
    if (chosen && chosen.p10 > 25) return chosen.id
    const pool = engines.filter((e) => e.p10 > 40 && e.p10 <= 60)
    return (pool.length ? [...pool].sort((a, b) => Math.abs(a.p10 - 50) - Math.abs(b.p10 - 50))[0] : chosen ?? engines[0]).id
  })
  const [draft, setDraft] = useState<Params>(BASELINE)
  const [horizon, setHorizon] = useState(30)
  const [open, setOpen] = useState<string>(GROUPS[0])
  const [submitted, setSubmitted] = useState<{ engineId: string; params: Params; horizon: number } | null>(null)
  const engine = engines.find((e) => e.id === engineId) ?? sorted[0]
  const today = useMemo(() => new Date(), [])
  const baseRisk = riskPct(engine, BASELINE, horizon)
  const saturated = baseRisk >= 99.5 ? 'high' : baseRisk <= 0.5 ? 'low' : ''
  const shorter = HORIZONS.filter((x) => x < horizon && riskPct(engine, BASELINE, x) < 95).pop()
  const result = useMemo(() => {
    if (!submitted) return null
    const e = engines.find((x) => x.id === submitted.engineId)
    return e ? { engine: e, params: submitted.params, horizon: submitted.horizon, ...report(e, submitted.params, submitted.horizon, engines) } : null
  }, [submitted, engines])
  const dirty = !!submitted && (submitted.engineId !== engine.id || submitted.horizon !== horizon || changedKeys(draft).join() !== changedKeys(submitted.params).join() || (Object.keys(draft) as ParamKey[]).some((k) => draft[k] !== submitted.params[k]))
  const conditions = engine.subset === 'FD002' || engine.subset === 'FD004' ? '6 flight conditions' : '1 flight condition'
  const faults = engine.subset === 'FD003' || engine.subset === 'FD004' ? 'HPC + fan degradation' : 'HPC degradation'
  const selectEngine = (id: string) => { setEngineId(id); setSubmitted(null) }

  return <div className="sim">
    <section className="panel sim-picker">
      <label>Engine<select value={engine.id} onChange={(e) => selectEngine(e.target.value)}>{['FD001', 'FD002', 'FD003', 'FD004'].map((s) => <optgroup key={s} label={s}>{sorted.filter((e) => e.subset === s).map((e) => <option key={e.id} value={e.id}>{e.id} · {classifyRisk(e.p10)} · P10 {e.p10} cycles</option>)}</optgroup>)}</select></label>
      <button className="link-button" onClick={() => viewEngine(engine.id)}>View engine diagnostics <ArrowRight size={14} /></button>
    </section>

    <div className="sim-grid">
      <section className="panel sim-builder">
        <div className="sim-head"><div><small className="sim-kicker">SCENARIO BUILDER</small><h2>Change operating assumptions</h2><p>Adjust and submit to update the risk outlook.</p></div><button className="link-button" onClick={() => setDraft(BASELINE)}><RotateCcw size={13} /> Restore baseline</button></div>
        <div className="sim-quick"><small className="sim-kicker">QUICK SCENARIOS</small><div>{QUICK.map((q) => <button key={q.name} className={`sim-chip ${changedKeys(q.params).join() === changedKeys(draft).join() && changedKeys(draft).every((k) => draft[k] === q.params[k]) ? 'active' : ''}`} onClick={() => setDraft(q.params)}>{q.name}</button>)}</div></div>
        <div className="sim-groups">{GROUPS.map((g) => {
          const fields = FIELDS.filter((f) => f.group === g)
          const n = fields.filter((f) => draft[f.key] !== BASELINE[f.key]).length
          const isOpen = open === g
          return <div className={`sim-group ${isOpen ? 'open' : ''}`} key={g}>
            <button className="sim-group-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : g)}><b>{g}</b><span className={n ? 'changed' : ''}>{n} changed</span><ChevronDown size={14} /></button>
            {isOpen && fields.map((f) => <div className="sim-field" key={f.key}>
              <div className="sim-field-top"><label htmlFor={`sim-${f.key}`}>{f.label}</label><b className={draft[f.key] !== BASELINE[f.key] ? 'changed' : ''}>{valueText(f.key, draft[f.key])}</b></div>
              <input id={`sim-${f.key}`} type="range" min={f.min} max={f.max} step={f.step} value={draft[f.key]} onChange={(ev) => setDraft({ ...draft, [f.key]: Number(ev.target.value) })} style={{ '--fill': `${(draft[f.key] - f.min) / (f.max - f.min) * 100}%` } as CSSProperties} />
              <div className="sim-field-scale"><span>{f.min}</span><small>{f.help}</small><span>{f.max} {f.unit}</span></div>
            </div>)}
          </div>
        })}</div>
        <button className="button primary sim-submit" onClick={() => setSubmitted({ engineId: engine.id, params: draft, horizon })}>Calculate scenario risk <ArrowRight size={15} /></button>
        <p className="sim-note"><HelpCircle size={13} />Rule-based scenario built on the ML model's remaining-life range for this engine (P10 / median / P90). The scenario changes how fast that life is used, not the engine's condition.</p>
      </section>

      <div className="sim-side">
        <section className="panel sim-baseline">
          <div className="sim-head"><div><small className="sim-kicker">CURRENT ENGINE BASELINE</small><h2>{engine.id} · {engine.subset}</h2></div><span className="sim-date">{formatDate(today)}</span></div>
          <div className="sim-selects"><label>Target<select disabled><option>End-of-life risk</option></select></label><label>Horizon<select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>{HORIZONS.map((h) => <option key={h} value={h}>{h} days</option>)}</select></label></div>
          <div className="sim-gauge-card">
            <span>End-of-life risk · {horizon}-day baseline</span>
            <strong>{fmt(baseRisk)}<i>%</i></strong>
            <em className={`sim-outlook ${outlook(baseRisk).toLowerCase()}`}>{outlook(baseRisk).toUpperCase()} OUTLOOK</em>
            <Gauge pct={baseRisk} />
            <p className="sim-legend">Stable ≤ 30% · Elevated &gt; 30%–60% · Severe &gt; 60%</p>
            {saturated === 'high' && <p className="sim-hint">This engine is expected to reach end of life within {horizon} days whatever the tempo, so flying changes can't lower this number. Try <b>Ground &amp; inspect</b>{shorter ? <>, a <button className="link-button" onClick={() => setHorizon(shorter)}>{shorter}-day horizon</button></> : ''}, or an AMBER engine.</p>}
            {saturated === 'low' && <p className="sim-hint">Very little risk within {horizon} days even at higher tempo. Try a longer horizon or <b>Surge operations</b> to see when this engine becomes a concern.</p>}
            <p className="sim-base-meta">At 1 sortie/day, 1 cycle per sortie · model range P10 {engine.p10} / median {engine.medianRul} / P90 {engine.p90} cycles <Tag value={classifyRisk(engine.p10)} /></p>
          </div>
        </section>

        {!result ? <section className="panel sim-empty"><Activity size={20} /><h2>Your report will appear here</h2><p>Choose a quick scenario or move the sliders, then calculate scenario risk.</p></section> : <section className="panel sim-report">
          {dirty && <div className="sim-dirty">Inputs changed · calculate again to refresh this report.</div>}
          <small className="sim-kicker">SUBMITTED SCENARIO REPORT</small><h2>Scenario risk outlook</h2><p className="sim-sub">{result.engine.id} · {result.horizon}-day horizon · {result.contributions.length} {result.contributions.length === 1 ? 'parameter' : 'parameters'} changed.</p>
          <div className="sim-two">{[['BASELINE HEADLINE', result.base], ['SCENARIO HEADLINE', result.scen]].map(([label, v]) => <div className="sim-mini" key={label as string}><div><small>{label}</small><span className={`sim-outlook-text ${outlook(v as number).toLowerCase()}`}>{outlook(v as number)}</span></div><strong>{fmt(v as number)}%</strong><Gauge pct={v as number} size="small" /></div>)}</div>
          <div className={`sim-elevation ${result.delta > 0.05 ? 'up' : result.delta < -0.05 ? 'down' : 'flat'}`}><small>{result.delta > 0.05 ? 'Risk elevation' : result.delta < -0.05 ? 'Risk reduction' : 'No change in risk'}</small><b>{result.delta >= 0 ? '+' : ''}{fmt(result.delta)} risk points</b><span>· {outlook(result.base)} → {outlook(result.scen)}</span><p>{Math.abs(result.delta) <= 0.05 && (result.base >= 99.5 || result.base <= 0.5) ? (result.base >= 99.5 ? `Already certain to reach end of life within ${result.horizon} days at any tempo – only grounding or an inspection changes this. Compare the days-to-Critical forecast below, or use a shorter horizon.` : `Risk stays near zero within ${result.horizon} days – try a longer horizon.`) : `Percentage points of end-of-life risk within ${result.horizon} days.`}</p></div>
          <small className="sim-kicker">UPDATED FORECASTS</small>
          <div className="sim-forecasts">{result.forecasts.map((f) => {
            const isDays = f.unit === 'd'
            const sv = f.scen as number | null, bv = f.base as number | null
            const diff = sv !== null && bv !== null ? sv - bv : null
            const worse = diff !== null && (isDays ? diff < 0 : diff > 0)
            return <div className="sim-forecast" key={f.label}><small>{f.label.toUpperCase()}</small><b>{isDays ? (sv === 0 && bv === 0 ? 'Already in this band' : dayText(sv, today)) : `${fmt(sv as number)}%`}</b><span className={diff === null || Math.abs(diff) < 0.05 ? '' : worse ? 'worse' : 'better'}>{isDays && sv === 0 && bv === 0 ? 'Unchanged · P10 is already below this line' : diff === null ? (isDays ? `baseline ${dayText(bv, today)}` : '') : Math.abs(diff) < 0.05 ? `Unchanged from baseline` : `${diff >= 0 ? '+' : ''}${isDays ? Math.round(diff) + ' days' : fmt(diff) + ' pts'} from ${isDays ? dayText(bv, today) : fmt(bv as number) + '%'}`}</span></div>
          })}</div>
          <div className="sim-drivers">
            <div className="sim-pressure"><b>Top pressure drivers</b>{result.contributions.filter((c) => c.delta > 0.05).sort((a, b) => b.delta - a.delta).map((c) => <div key={c.key}><span>{fieldOf(c.key).label}</span><em>+{fmt(c.delta)}</em></div>)}{!result.contributions.some((c) => c.delta > 0.05) && <p>No changed input raised risk.</p>}</div>
            <div className="sim-protective"><b>Protective changes</b>{result.contributions.filter((c) => c.delta < -0.05).sort((a, b) => a.delta - b.delta).map((c) => <div key={c.key}><span>{fieldOf(c.key).label}</span><em>{fmt(c.delta)}</em></div>)}{!result.contributions.some((c) => c.delta < -0.05) && <p>No changed input lowered risk.</p>}</div>
          </div>
          {result.params.inspectDay > 0 && <div className={`sim-inspect ${result.criticalDay !== null && result.criticalDay < result.params.inspectDay ? 'late' : 'ok'}`}>{result.criticalDay !== null && result.criticalDay < result.params.inspectDay ? `Planned inspection on day ${result.params.inspectDay} comes after the engine is expected to reach Critical (day ${result.criticalDay}). Bring it forward.` : `Planned inspection on day ${result.params.inspectDay} comes before the expected Critical crossing${result.criticalDay === null ? '' : ` (day ${result.criticalDay})`}.`}</div>}
          <div className="sim-fleet"><small>FLEET IMPACT · SAME TEMPO FOR ALL {result.fleet.total} ENGINES</small><span>Engines at or reaching Critical within {result.horizon} days: <b>{result.fleet.base}</b> baseline → <b>{result.fleet.scen}</b> scenario</span></div>
          <details className="sim-review"><summary>Review {result.contributions.length} submitted {result.contributions.length === 1 ? 'change' : 'changes'}</summary>{result.contributions.length ? <ul>{result.contributions.map((c) => <li key={c.key}>{fieldOf(c.key).label}: {valueText(c.key, BASELINE[c.key])} → <b>{valueText(c.key, result.params[c.key])}</b></li>)}</ul> : <p>Baseline assumptions – nothing changed.</p>}</details>
        </section>}

        <section className="panel sim-context"><h2>Fixed engine context</h2><p>Engine identity and model estimate stay tied to the selected baseline.</p><div>{[engine.subset, `Last cycle ${engine.lastCycle}`, conditions, faults, `Top driver: ${engine.topDriver}`].map((c) => <span key={c}>{c}</span>)}</div></section>
      </div>
    </div>
  </div>
}
