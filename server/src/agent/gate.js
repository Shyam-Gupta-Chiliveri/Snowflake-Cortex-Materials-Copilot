// Release criteria from WI-HT-4CR13 section 5, evaluated in code on the data
// products. The LLM explains the decision; it never makes it.

export const CRITERIA = { minDuct: 30, minHv: 600, maxLowShare: 5 }
export const RULE_REF = 'WI-HT-4CR13#5'

export function evaluate(route, { routes = [], ncrs = [] } = {}) {
  const reasons = [], warnings = []
  if (route.ductMean < CRITERIA.minDuct) reasons.push(`mean ductility ${route.ductMean} % is below ${CRITERIA.minDuct} %`)
  if (route.hv10Mean < CRITERIA.minHv) reasons.push(`mean HV10 ${route.hv10Mean} is below ${CRITERIA.minHv}`)
  if (route.lowDuctSharePct >= CRITERIA.maxLowShare) reasons.push(`${route.lowDuctSharePct} % of tests are below 23 % ductility (limit ${CRITERIA.maxLowShare} %)`)
  if (/not recorded/i.test(route.routeLabel)) warnings.push('the tempering temperature is not recorded, so the process cannot be audited')
  if (route.routeKey.endsWith('-RT')) {
    const base = routes.find((r) => r.routeKey === route.routeKey.replace(/-RT$/, ''))
    if (base && Math.abs(base.ductMean - route.ductMean) < 0.5) {
      warnings.push(`the extra temper step adds no measurable ductility (${route.ductMean} % against ${base.ductMean} % without it)`)
    }
  }
  if (route.ductMean >= CRITERIA.minDuct && route.ductMean - CRITERIA.minDuct < 0.5) {
    warnings.push(`mean ductility ${route.ductMean} % is within 0.5 points of the ${CRITERIA.minDuct} % limit, so there is little margin`)
  }
  for (const n of ncrs.filter((n) => n.routeKey === route.routeKey && n.status === 'Open')) {
    warnings.push(`open nonconformance ${n.ncrId}: ${n.summary || n.description}`)
  }
  return { routeKey: route.routeKey, recommended: reasons.length === 0, reasons, warnings }
}

export function rank(routes, ncrs) {
  return routes.map((r) => ({ route: r, gate: evaluate(r, { routes, ncrs }) }))
    .sort((a, b) => Number(b.gate.recommended) - Number(a.gate.recommended)
      || b.route.ductMean - a.route.ductMean
      || a.gate.warnings.length - b.gate.warnings.length)
}
