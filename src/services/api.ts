import type { Engine, Warning } from '../types'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`)
  if (!response.ok) throw new Error(`API request failed (${response.status})`)
  return response.json() as Promise<T>
}

export const fleetApi = {
  getSummary: () => get<{ total: number; red: number; amber: number; green: number; medianRul: number }>('/fleet/summary'),
  getEngines: () => get<Engine[]>('/engines'),
  getDiagnostics: (engineId: string) => get<Engine>(`/engines/${encodeURIComponent(engineId)}/diagnostics`),
  getWarnings: () => get<Warning[]>('/warnings'),
  getModelMetrics: () => get<Record<string, unknown>>('/models/metrics'),
  submitPlanning: (parameters: { engineIds: string[]; sortiesPerDay: number; startDate: string }) => fetch(`${apiBase}/planning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parameters) }),
  exportReport: async () => {
    const response = await fetch(`${apiBase}/reports/export`)
    if (!response.ok) throw new Error(`API request failed (${response.status})`)
    return response.blob()
  },
}
