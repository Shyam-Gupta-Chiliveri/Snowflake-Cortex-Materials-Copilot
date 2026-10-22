// Same rules as MART.ANOMALIES. Used by the local mirror and as a fallback when
// Snowflake has not refreshed the dynamic table yet.

import { evaluate } from '../agent/gate.js'

export function deriveAnomalies({ routes = [], ncrs = [], sem } = {}) {
  const out = []
  for (const r of routes) {
    const gate = evaluate(r, { routes, ncrs })
    if (!gate.recommended) {
      out.push({
        anomalyId: `REL-${r.routeKey}`,
        kind: 'release-block',
        severity: r.lowDuctSharePct >= 50 ? 'critical' : 'major',
        routeKey: r.routeKey,
        title: `${r.routeKey} fails release criteria`,
        detail: gate.reasons.join('; ') || `${r.routeKey} is below the release gate`,
        metrics: { ductMean: r.ductMean, hv10Mean: r.hv10Mean, lowDuctSharePct: r.lowDuctSharePct },
      })
    }
  }
  for (const s of sem?.byRoute || []) {
    const r = routes.find((x) => x.routeKey === s.routeKey)
    if (!r || s.cleavageDominatedPct < 50 || r.ductMean < 30) continue
    out.push({
      anomalyId: `SEM-${s.routeKey}`,
      kind: 'sem-lab-mismatch',
      severity: 'major',
      routeKey: s.routeKey,
      title: `${s.routeKey} SEM cleavage vs lab ductility`,
      detail: `lab ductility ${r.ductMean} % but ${s.cleavageDominatedPct} % of SEM images are cleavage-dominated`,
      metrics: { ductMean: r.ductMean, semDuctileMean: s.semDuctileMean, cleavageDominatedPct: s.cleavageDominatedPct },
    })
  }
  for (const n of ncrs.filter((n) => n.status === 'Open')) {
    const sev = String(n.severity || '').toLowerCase()
    out.push({
      anomalyId: n.ncrId,
      kind: 'open-ncr',
      severity: sev === 'critical' ? 'critical' : sev === 'minor' ? 'minor' : 'major',
      routeKey: n.routeKey,
      title: `${n.ncrId} is open`,
      detail: n.summary || n.description,
      metrics: { status: n.status, severity: n.severity, category: n.category },
    })
  }
  const rank = { critical: 0, major: 1, minor: 2 }
  return out.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || a.routeKey.localeCompare(b.routeKey))
}
