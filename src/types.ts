export type Risk = 'RED' | 'AMBER' | 'GREEN'

export interface EngineDriver {
  sensor: string
  direction: 'Increasing risk' | 'Decreasing risk'
  /** flights of predicted remaining life this sensor removes (Increasing risk) or adds (Decreasing risk) */
  influence: number
}

export interface Engine {
  id: string
  /** engine id used by the model outputs, e.g. FD001_test_007 */
  uid?: string
  subset: string
  lastCycle: number
  p10: number
  medianRul: number
  p90: number
  /** band assigned by the model pipeline (same P10 rule as classifyRisk) */
  band?: Risk
  topDriver: string
  nextAction: string
  drivers: EngineDriver[]
  interpretation: string
}

export interface Warning {
  id: string
  engineId: string
  reason: string
  created: string
  /** flight at which the early-warning rule first fired */
  flight?: number
}

/** per-engine history file served from public/data/engines/<id>.json */
export interface EngineHistory {
  cycles: number[]
  sensors: Record<string, number[]>
  p10: number[]
  p50: number[]
  p90: number[]
}

export interface ModelMetrics {
  version: string
  task: string
  data: { trainEngines: number; testEngines: number; split: Record<string, number>; source: string }
  champion: { names: string[]; weights: number[]; valRmse: number }
  overall: { rmse: number; rmseCi: number[]; rmseCapped: number; mae: number; nasaScore: number; coverage: number; coverageLt50: number; width: number }
  subsets: { subset: string; engines: number; rmse: number; ci: string; mae: number; coverage: number; width: number }[]
  ledger: { family: string; rmse: number; improvement: number | null; kept: boolean }[]
  arena: { model: string; valRmse: number; valMae: number; fitSeconds: number }[]
  calibration: { method: string; calCoverage: number }
  earlyWarning: { rule: string; outcomes: Record<string, number>; median_notice_flights: number; engines: number }
  published: Record<string, number>
  limitations: string[]
}

// ---------- hard-coded demo fleet layer (fictional) ----------
export interface DemoBase { id: string; name: string; state: string; region: string; lat: number; lon: number; tempo: number }
export interface DemoAircraft { tail: string; type: string; role: string; baseId: string; engineIds: string[]; sortiesPerDay: number; inMaintenanceDays: number }
export interface DemoUnit { id: string; name: string; baseId: string; jobs90d: number; onTime90d: number; avgTurnaroundDays: number; repeatDefectPct: number; engineBays: number; sparesFillPct: number }
