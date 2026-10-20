import type { Engine, Risk } from '../types'

export function classifyRisk(p10: number): Risk {
  if (p10 <= 25) return 'RED'
  if (p10 <= 60) return 'AMBER'
  return 'GREEN'
}

export function getRiskCounts(engines: Engine[]) {
  return engines.reduce((counts, engine) => {
    counts[classifyRisk(engine.p10)] += 1
    return counts
  }, { RED: 0, AMBER: 0, GREEN: 0 })
}

export function downloadCsv(filename: string, columns: string[], rows: (string | number)[][]) {
  const csv = [columns, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)   // revoking immediately can cancel the download in some browsers
}

export const ENGINE_CSV_COLUMNS = ['Engine ID', 'Subset', 'Last cycle', 'P10 pessimistic RUL', 'Median RUL', 'P90 optimistic RUL', 'Risk', 'Top sensor driver', 'Suggested next step']

export function exportFleetCsv(engines: Engine[]) {
  downloadCsv('vayusetu-engine-report.csv', ENGINE_CSV_COLUMNS, engines.map((engine) => [engine.id, engine.subset, engine.lastCycle, engine.p10, engine.medianRul, engine.p90, classifyRisk(engine.p10), engine.topDriver, engine.nextAction]))
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
