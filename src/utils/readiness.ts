import { demoAircraft, demoBases, demoUnits } from '../data/fleetDemo'
import type { DemoAircraft, DemoBase, DemoUnit, Engine, Risk } from '../types'
import { classifyRisk } from './fleet'

/** chance the engine reaches end of life within `cycles`: straight lines through (0,0) (P10,10%) (median,50%) (P90,90%) (1.6×P90,100%) */
export function failChance(e: Engine, cycles: number) {
  const xs = [0, e.p10, e.medianRul, e.p90, Math.max(e.p90 * 1.6, e.p90 + 10)]
  const ys = [0, 0.1, 0.5, 0.9, 1]
  for (let i = 1; i < xs.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + 1e-6)
  if (cycles <= 0) return 0
  if (cycles >= xs[4]) return 1
  for (let i = 1; i < xs.length; i++) if (cycles <= xs[i]) return ys[i - 1] + (cycles - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1])
  return 1
}

const rank: Record<Risk, number> = { RED: 0, AMBER: 1, GREEN: 2 }

export interface FleetAircraft extends DemoAircraft {
  base: DemoBase
  engines: Engine[]
  worst: Engine
  band: Risk
  readyNow: boolean
  /** days until the worst engine's P10 reaches 25 (Critical) / 60 (Watch) at this aircraft's sortie rate; 0 = already */
  daysToCritical: number
  daysToWatch: number
}

export function buildFleet(engines: Engine[]): FleetAircraft[] {
  const byId = new Map(engines.map((e) => [e.id, e]))
  const bases = new Map(demoBases.map((b) => [b.id, b]))
  return demoAircraft.flatMap((a) => {
    const es = a.engineIds.map((id) => byId.get(id)).filter((e): e is Engine => !!e)
    if (!es.length) return []
    const worst = [...es].sort((x, y) => x.p10 - y.p10)[0]
    const band = es.map((e) => classifyRisk(e.p10)).sort((x, y) => rank[x] - rank[y])[0]
    const base = bases.get(a.baseId)!
    return [{
      ...a, base, engines: es, worst, band,
      readyNow: band !== 'RED' && a.inMaintenanceDays === 0,
      daysToCritical: Math.max(0, (worst.p10 - 25) / a.sortiesPerDay),
      daysToWatch: Math.max(0, (worst.p10 - 60) / a.sortiesPerDay),
    }]
  })
}

/** probability the aircraft is available on day h (no maintenance done in between): aircraft with a RED engine stay
 *  grounded, aircraft in the hangar return when their work ends, and no engine may have reached end of life */
export function availability(a: FleetAircraft, h: number) {
  if (a.band === 'RED') return 0
  if (a.inMaintenanceDays > h) return 0
  return a.engines.reduce((p, e) => p * (1 - failChance(e, a.sortiesPerDay * h)), 1)
}
/** aircraft whose worst engine reaches Critical (P10 ≤ 25) within h days and will need engine maintenance */
export const needsMaintenance = (a: FleetAircraft, h: number) => a.daysToCritical <= h

export interface BaseSummary extends DemoBase {
  aircraft: FleetAircraft[]
  unit?: DemoUnit
  readyNow: number
  expectedReady: (h: number) => number
  red: number
  amber: number
  inHangar: number
}

export function summariseBases(fleet: FleetAircraft[]): BaseSummary[] {
  return demoBases.map((b) => {
    const ac = fleet.filter((a) => a.baseId === b.id)
    const engines = ac.flatMap((a) => a.engines)
    return {
      ...b, aircraft: ac, unit: demoUnits.find((u) => u.baseId === b.id),
      readyNow: ac.filter((a) => a.readyNow).length,
      expectedReady: (h: number) => ac.reduce((s, a) => s + availability(a, h), 0),
      red: engines.filter((e) => classifyRisk(e.p10) === 'RED').length,
      amber: engines.filter((e) => classifyRisk(e.p10) === 'AMBER').length,
      inHangar: ac.filter((a) => a.inMaintenanceDays > 0).length,
    }
  })
}

export const pctOf = (part: number, whole: number) => (whole ? (100 * part) / whole : 0)
/** readiness colour band for a percentage of aircraft available */
export const readinessBand = (pct: number): Risk => (pct >= 80 ? 'GREEN' : pct >= 65 ? 'AMBER' : 'RED')
export const RISK_HEX: Record<Risk, string> = { RED: '#b42318', AMBER: '#b7791f', GREEN: '#26734d' }
