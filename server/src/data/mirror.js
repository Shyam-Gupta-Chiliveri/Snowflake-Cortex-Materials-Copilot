// Local mirror of the Snowflake data products (data/mirror/products.json). Serves the
// API when Snowflake is not configured or not reachable. It has no LLM, so answers
// come from the deterministic composer, and the ML prediction is a route average.

import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from '../config.js'
import { LINEAGE } from './lineage.js'
import { Retriever, parseDoc } from '../agent/retriever.js'
import { deriveAnomalies } from './anomalies.js'

export function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((c) => c !== '')) rows.push(row); row = [] }
    else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  const [header, ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

export function loadKnowledge() {
  const dir = path.join(ROOT, 'knowledge')
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()
    .map((f) => parseDoc(fs.readFileSync(path.join(dir, f), 'utf8'), path.basename(f, '.md')))
}

function ruleCategory(text) {
  if (/die-cast|overmould|housing|press-fit/i.test(text)) return 'Die-casting or assembly'
  if (/sulph|stringer|inclusion|chemistry|certificate/i.test(text)) return 'Material chemistry'
  if (/indent|fixture|LIMS|sample lots|measurement|re-test|test plan/i.test(text)) return 'Testing or measurement'
  if (/diameter|drawing|machin/i.test(text)) return 'Geometry or machining'
  return 'Heat treatment'
}

function ruleSeverity(n) {
  if (/customer|return|field/i.test(n.DESCRIPTION)) return 'Critical'
  if (n.STATUS === 'Open' || /block|hold|containment|scrap/i.test(n.DESCRIPTION)) return 'Major'
  return 'Minor'
}

export function createMirror() {
  const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mirror/products.json'), 'utf8'))
  const ncrs = products.ncrs || readCsv(path.join(ROOT, 'data/ncr_events.csv')).map((n) => ({
    ncrId: n.NCR_ID, openedOn: n.OPENED_ON, routeKey: n.ROUTE_KEY, part: n.PART, status: n.STATUS, description: n.DESCRIPTION,
    category: ruleCategory(n.DESCRIPTION), severity: ruleSeverity(n), summary: n.DESCRIPTION.split('. ')[0] + '.',
    enrichedBy: 'local keyword rules (Cortex runs in Snowflake mode)',
  }))
  const docs = loadKnowledge()
  const retriever = new Retriever()
  for (const d of docs) retriever.addDoc(d)
  for (const n of ncrs) retriever.add({ ref: n.ncrId, title: `${n.ncrId} (${n.category}, ${n.status})`, kind: 'Nonconformance',
    text: `Route ${n.routeKey}, ${n.part}, opened ${n.openedOn}. ${n.description}` })
  retriever.build()

  const bandOf = (d) => (d < 23 ? 'LOW' : d < 31 ? 'MEDIUM' : 'HIGH')

  return {
    mode: 'mirror',
    info: async () => ({ mode: 'mirror', label: 'Local mirror of the Snowflake data products', builtAt: products.meta?.builtAt,
      source: products.meta?.source, llm: null, search: 'BM25 (local)', ml: products.ml ? 'exported Snowflake ML metrics' : 'route average' }),
    routes: async () => products.routes,
    factors: async () => products.factors,
    correlations: async () => products.correlations,
    tempering: async () => products.tempering,
    dataQuality: async () => products.dataQuality,
    sem: async () => products.sem,
    ncrs: async () => ncrs,
    anomalies: async () => products.anomalies || deriveAnomalies({ routes: products.routes, ncrs, sem: products.sem }),
    documents: async () => docs.map(({ id, title, category }) => ({ id, title, category })),
    search: async (query, k = 5) => retriever.search(query, k),
    complete: async () => null,
    ml: async () => products.ml || null,
    predict: async (x) => {
      const r = products.routes.find((r) => (r.vacuum ? x.vacuum : !x.vacuum)
        && (r.seriesC || 0) === (x.seriesC || 0) && (r.addC || 0) === (x.addC || 0)
        && (!x.seriesUnspecified || r.routeKey === 'V3-B-FREUND'))
      if (!r) return { band: null, probabilities: null, by: 'route average (local mirror)', note: 'No tested route matches these settings.' }
      return { band: bandOf(r.ductMean), probabilities: null, by: 'route average (local mirror)', matchedRoute: r.routeKey, expectedDuctility: r.ductMean }
    },
    pipeline: async () => LINEAGE.map((o) => ({ ...o, live: null })),
    close: async () => {},
  }
}
