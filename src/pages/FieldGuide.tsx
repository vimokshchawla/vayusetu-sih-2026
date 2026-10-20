import { Download, FileText } from 'lucide-react'
import type { Engine } from '../types'
import { downloadCsv, ENGINE_CSV_COLUMNS } from '../utils/fleet'
import { availability, buildFleet } from '../utils/readiness'

const ENGINE_GUIDE: [string, string, string][] = [
  ['Engine ID', 'Model output', 'NASA C-MAPSS test engine (subset + number).'],
  ['Subset', 'NASA data', 'FD001–FD004: number of flight conditions and fault modes the engine was simulated under.'],
  ['Last cycle', 'NASA data', 'Last recorded flight cycle – the point the prediction is made at.'],
  ['P10 pessimistic RUL', 'Model output', 'Remaining cycles with a 10% chance of failing sooner. Drives the risk band.'],
  ['Median RUL', 'Model output', 'Most likely remaining cycles (capped at 125 = “healthy, 125+ left”).'],
  ['P90 optimistic RUL', 'Model output', 'Remaining cycles with a 90% chance of failing sooner.'],
  ['Risk', 'Rule', 'RED if P10 ≤ 25 cycles, AMBER if P10 ≤ 60, otherwise GREEN.'],
  ['Top sensor driver', 'Model output', 'Sensor that lowers predicted life most vs a healthy engine in the same flight condition; “None stands out” if no sensor moves it by 0.5 cycles.'],
  ['Suggested next step', 'Rule', 'Action mapped from the top drivers and band. Needs approval from a certifying engineer.'],
]
const AIRCRAFT_COLUMNS = ['Tail', 'Type', 'Role', 'Air base', 'State', 'Sorties per day', 'Engines', 'Worst engine', 'Worst engine P10', 'Status', 'In hangar (days)', 'Ready now', 'Days to Critical', 'Expected available in 30 days (%)', 'Expected available in 90 days (%)']
const AIRCRAFT_GUIDE: [string, string, string][] = [
  ['Tail, Type, Role, Air base, State', 'Demo fleet', 'Fictional aircraft and bases, hard-coded for the demonstration.'],
  ['Sorties per day', 'Demo fleet', 'Assumed flying rate; one sortie uses one engine cycle.'],
  ['Engines / Worst engine', 'Model output', 'Real model-scored engines fitted to the aircraft; the one with the lowest P10 decides status.'],
  ['Status', 'Rule', 'Worst engine band (RED / AMBER / GREEN).'],
  ['In hangar (days)', 'Demo fleet', 'Days of maintenance remaining for aircraft already in the hangar.'],
  ['Ready now', 'Rule', 'Yes if no RED engine and not in the hangar.'],
  ['Days to Critical', 'Rule', '(worst engine P10 − 25) ÷ sorties per day.'],
  ['Expected available in 30 / 90 days', 'Model + rule', 'Chance the aircraft is out of the hangar and no engine has reached end of life, from each engine’s P10 / median / P90.'],
]

export default function FieldGuide({ engines, announce }: { engines: Engine[]; announce: (m: string) => void }) {
  const exportAircraft = () => {
    const fleet = buildFleet(engines)
    downloadCsv('vayusetu-aircraft-readiness.csv', AIRCRAFT_COLUMNS, fleet.map((a) => [a.tail, a.type, a.role, a.base.name, a.base.state, a.sortiesPerDay, a.engines.map((e) => e.id).join(' '), a.worst.id, a.worst.p10, a.band, a.inMaintenanceDays, a.readyNow ? 'Yes' : 'No', Math.ceil(a.daysToCritical), (100 * availability(a, 30)).toFixed(1), (100 * availability(a, 90)).toFixed(1)]))
    announce('Aircraft readiness exported as CSV')
  }
  const table = (rows: [string, string, string][]) => <div className="table-scroll"><table className="scenario-table fg-table"><thead><tr><th>Field</th><th>Source</th><th>Description</th></tr></thead><tbody>{rows.map(([f, s, d]) => <tr key={f}><td className="engine-id">{f}</td><td><span className={`fg-src ${s.startsWith('Demo') ? 'demo' : s === 'Rule' ? 'rule' : 'model'}`}>{s}</span></td><td>{d}</td></tr>)}</tbody></table></div>
  return <section className="panel field-guide">
    <div className="panel-title"><div><h2>Data exports &amp; field guide</h2><p>What every exported column means and where it comes from</p></div>
      <div className="fg-actions"><button className="button secondary" onClick={() => window.print()}><FileText size={15} />Print field guide</button><button className="button primary" onClick={exportAircraft}><Download size={15} />Aircraft readiness CSV</button></div></div>
    <h3 className="fg-h">Engine report CSV <small>{ENGINE_CSV_COLUMNS.length} columns · one row per engine</small></h3>
    {table(ENGINE_GUIDE)}
    <h3 className="fg-h">Aircraft readiness CSV <small>{AIRCRAFT_COLUMNS.length} columns · one row per aircraft</small></h3>
    {table(AIRCRAFT_GUIDE)}
  </section>
}
