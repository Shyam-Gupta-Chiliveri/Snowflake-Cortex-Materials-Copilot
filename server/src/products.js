import { rank } from './agent/gate.js'

export async function kpis(repo) {
  const [routes, ncrs, sem, dq, info, tempering] = await Promise.all([
    repo.routes(), repo.ncrs(), repo.sem(), repo.dataQuality(), repo.info(), repo.tempering(),
  ])
  const ranked = rank(routes, ncrs)
  const top = ranked.find((x) => x.gate.recommended) || ranked[0]
  const open = ncrs.filter((n) => n.status === 'Open')
  return {
    tests: dq.tests,
    routeCount: routes.length,
    recommended: top?.route.routeKey || null,
    recommendedLabel: top?.route.routeLabel || null,
    ductMean: top?.route.ductMean ?? null,
    hv10Mean: top?.route.hv10Mean ?? null,
    openNcrs: open.length,
    semImages: sem.images,
    hvOrderViolations: dq.hvOrderViolations,
    sumNot100: dq.sumNot100,
    temperingSlope: tempering?.slopePctPerC ?? null,
    failingRoutes: ranked.filter((x) => !x.gate.recommended).length,
    mode: info.mode,
    source: info.label,
    llm: info.llm,
    search: info.search,
    ml: info.ml,
  }
}

export async function groups(repo) {
  const [routes, ncrs, sem] = await Promise.all([repo.routes(), repo.ncrs(), repo.sem()])
  const semBy = Object.fromEntries((sem.byRoute || []).map((s) => [s.routeKey, s]))
  return rank(routes, ncrs).map(({ route, gate }) => ({
    ...route,
    gate,
    sem: semBy[route.routeKey] || null,
    openNcrs: ncrs.filter((n) => n.routeKey === route.routeKey && n.status === 'Open').map((n) => n.ncrId),
  }))
}

export async function anomalies(repo) {
  const [routes, ncrs, sem] = await Promise.all([repo.routes(), repo.ncrs(), repo.sem()])
  const ranked = rank(routes, ncrs)
  return {
    openNcrs: ncrs.filter((n) => n.status === 'Open'),
    closedNcrs: ncrs.filter((n) => n.status !== 'Open'),
    failingRoutes: ranked.filter((x) => !x.gate.recommended).map(({ route, gate }) => ({
      routeKey: route.routeKey, routeLabel: route.routeLabel, ductMean: route.ductMean,
      hv10Mean: route.hv10Mean, lowDuctSharePct: route.lowDuctSharePct, reasons: gate.reasons, warnings: gate.warnings,
    })),
    cleavage: (sem.byRoute || []).filter((s) => s.cleavageDominatedPct >= 50),
    ncrs,
  }
}

export async function previewIncident(repo, ncrId) {
  const ncrs = await repo.ncrs()
  const n = ncrs.find((x) => x.ncrId === ncrId) || ncrs.find((x) => x.status === 'Open')
  if (!n) return null
  const urgency = n.severity === 'Critical' || /customer|return|field/i.test(n.description) ? '1' : n.status === 'Open' ? '2' : '3'
  return {
    ncrId: n.ncrId,
    table: 'incident',
    payload: {
      short_description: `${n.ncrId}: ${n.summary || n.description.split('. ')[0]}`,
      description: [
        `NCR ${n.ncrId} (${n.status}, ${n.category || 'unclassified'}, ${n.severity || 'n/a'}).`,
        `Route ${n.routeKey}, part ${n.part}, opened ${n.openedOn}.`,
        n.description,
        'Raised from the Snowflake Cortex materials quality copilot. 8D applies if the defect reached a customer (PR-8D).',
      ].join('\n'),
      urgency,
      impact: urgency,
      category: 'Quality',
      subcategory: n.category || 'Heat treatment',
      caller_id: 'materials.copilot',
    },
    ncr: n,
  }
}
