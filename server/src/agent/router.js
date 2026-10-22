// Rule-based router: finds routes, NCR ids and process settings in the question and
// decides which tools run. Fast, free and testable; the LLM only writes the answer.

import { INJECTION } from './retriever.js'

const GROUP_ROUTE = { A: ['V6-A'], C: ['V6-C'], D: ['V6-D'], E: ['V6-E'], F: ['V6-F'], H: ['V11-H'], I: ['V11-I'] }
const TEMP_ROUTE = { 180: 'V6-C', 200: 'V6-D', 220: 'V6-E', 240: 'V6-F' }

export const DEFAULT_PROCESS = { material: '4Cr13', dieCast: false, diameter: 8, samples: 5,
  c: 0.41, si: 0.4, mn: 0.42, p: 0.02, s: 0.012, cr: 13.0, ni: 0.2,
  seriesC: 0, seriesH: 0, seriesUnspecified: false, vacuum: false, addC: 0, addH: 0 }

function num(re, q) { const m = q.match(re); return m ? Number(m[1]) : null }

export function parseProcess(q) {
  const x = { ...DEFAULT_PROCESS }
  if (/x46/i.test(q)) x.material = 'X46CrS13'
  if (/7[.,]8\s*mm/i.test(q)) x.diameter = 7.8
  if (/die[- ]?cast/i.test(q) && !/no die[- ]?cast|without die/i.test(q)) x.dieCast = true
  if (/\b3[- ]?samples?\b|three samples/i.test(q)) x.samples = 3
  const c = num(/(0[.,]\d{2,3})\s*%?\s*(?:c\b|carbon)/i, q) ?? num(/carbon\D{0,8}(0[.,]\d{2,3})/i, q)
  const cr = num(/(1[2-4](?:[.,]\d+)?)\s*%?\s*(?:cr\b|chrom)/i, q) ?? num(/chrom\w*\D{0,8}(1[2-4](?:[.,]\d+)?)/i, q)
  if (c) x.c = c
  if (cr) x.cr = cr
  if (/vacuum/i.test(q)) { x.vacuum = true; x.seriesC = num(/vacuum\D{0,25}(\d{3})/i, q) || 230 }
  const series = q.match(/series[^.]*?(\d{3})\s*°?\s*C?\s*(?:\/|for)?\s*(\d+)\s*h/i)
  if (series) { x.seriesC = +series[1]; x.seriesH = +series[2] }
  const rest = series ? q.replace(series[0], '') : q
  const add = [...rest.matchAll(/(\d{3})\s*°?\s*C\s*(?:\/|for)?\s*(\d+)\s*h/gi)].pop()
  if (add && !(x.vacuum && +add[1] === x.seriesC && !/re-?temper|\+|then|plus|and/i.test(rest))) { x.addC = +add[1]; x.addH = +add[2] }
  else if (!add && !x.vacuum && !series && !/untempered|as quenched|no temper/i.test(q)) {
    const t = num(/temper\w*\D{0,12}(\d{3})/i, q)
    if (t) { x.addC = t; x.addH = 1 }
  }
  return x
}

export function route(question, knownRoutes = []) {
  const q = String(question || '').trim()
  const known = new Set(knownRoutes.map((r) => r.toUpperCase()))
  const routes = new Set()
  const add = (k) => { if (!known.size || known.has(k)) routes.add(k) }

  for (const m of q.matchAll(/\bV(3|6|11|14)(?:-([A-I]))?(?:-(FRIULPRESS|FREUND|RT))?\b/gi)) {
    const k = `V${m[1]}${m[2] ? '-' + m[2].toUpperCase() : ''}${m[3] ? '-' + m[3].toUpperCase() : ''}`
    if (known.has(k)) add(k)
    else for (const r of known) if (r.startsWith(k + '-') || r === k) add(r)
  }
  for (const m of q.matchAll(/\bgroup\s+([A-I])\b/gi)) {
    const g = m[1].toUpperCase()
    if (g === 'B') {
      if (/freund/i.test(q)) add('V3-B-FREUND')
      if (/friul/i.test(q) || !/freund/i.test(q)) add('V6-B-FRIULPRESS')
      if (!/friul|freund/i.test(q)) add('V3-B-FREUND')
    } else (GROUP_ROUTE[g] || []).forEach(add)
  }
  if (/friulpress/i.test(q)) add('V6-B-FRIULPRESS')
  if (/freund/i.test(q)) add('V3-B-FREUND')
  for (const m of q.matchAll(/version\s*(3|6|11|14)\b/gi)) for (const r of known) if (r.startsWith(`V${m[1]}-`) || r === `V${m[1]}`) add(r)
  if (/vacuum/i.test(q)) { add('V14'); if (/re-?temper|\bRT\b/i.test(q)) add('V14-RT') }
  if (/untempered|as[- ]quenched/i.test(q)) add('V6-A')

  const intents = new Set()
  if (/\b(predict|what if|expected ductility|would (it|we|that|this) (get|give|have)|estimate the ductility|forecast)\b/i.test(q)) intents.add('predict')
  if (!intents.has('predict')) {
    for (const m of q.matchAll(/(180|200|220|240)\s*°?\s*C/gi)) if (/temper/i.test(q) && !/series|vacuum/i.test(q)) add(TEMP_ROUTE[m[1]])
  }
  if (/\b(best|recommend\w*|optimal|which (route|heat[- ]?treatment|temper\w*|process)|should we (use|choose))\b/i.test(q)) intents.add('best')
  if (/\b(release|approve)\b/i.test(q)) {
    if (routes.size) intents.add('route')
    else intents.add('best')
  }
  if (/per ?°?\s?c\b|per degree|tempering temperature|effect of temper|temperature effect|how much .*temper|slope|higher temper/i.test(q)) intents.add('tempering')
  const factor = (q.match(/\b(diameter|7[.,]8|die[- ]?cast\w*|x46\w*|sulph\w*|sulfur|grade|chemistry|carbon|chromium|nickel|manganese|silicon|phosph\w*|composition|sample count|3[- ]sample|three[- ]sample)\b/i) || [])[1]
  if (factor && !intents.has('predict')) intents.add('factor')
  if (/\b(sem|fractograph\w*|images?|dimples?|cleavage|u-?net|micrograph\w*|fracture surface)\b/i.test(q)) intents.add('sem')
  const ncrIds = [...q.matchAll(/\bNCR-\d{4}-\d{3}\b/gi)].map((m) => m[0].toUpperCase())
  if (ncrIds.length || /\b(ncrs?|nonconformance\w*|non-conformance\w*|issues?|problems?|complaints?|incidents?|customer returns?|8d|failures?|failed|cracks?|cracked)\b/i.test(q)) intents.add('ncr')
  if (/\bdata quality|valid(ation|ity)|consisten\w*|bad records?\b/i.test(q)) intents.add('quality')
  if (/\b(what can you|help me|capabilit\w*|what do you (know|do))\b/i.test(q)) intents.add('capability')
  if (routes.size >= 2 && /\bcompare|versus|vs\.?|difference|better\b/i.test(q)) intents.add('compare')
  if (routes.size && !intents.size) intents.add('route')

  const order = ['capability', 'predict', 'compare', 'best', 'tempering', 'factor', 'sem', 'ncr', 'route', 'quality']
  const primary = order.find((i) => intents.has(i)) || 'knowledge'
  return {
    question: q, primary, intents: [...intents], routes: [...routes], ncrIds, factor: factor || null,
    process: intents.has('predict') ? parseProcess(q) : null,
    injection: INJECTION.test(q),
  }
}
