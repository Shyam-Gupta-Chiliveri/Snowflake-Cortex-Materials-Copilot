#!/usr/bin/env node
// Read-only checks as MATERIALS_APP_SVC: row counts, Cortex Search, Cortex COMPLETE.

import { loadConfig } from '../server/src/config.js'
import { createSnowflake } from '../server/src/data/snowflake.js'

const cfg = loadConfig()
if (!cfg.snowflake.account || !cfg.snowflake.privateKey) {
  console.error('Snowflake is not configured. Copy .env.example to .env after snowflake:keys.')
  process.exit(1)
}
const api = await createSnowflake(cfg)
const info = await api.info()
console.log(info)
const counts = await api.q(`SELECT
  (SELECT COUNT(*) FROM MART.ROUTE_QUALITY) AS ROUTES,
  (SELECT TESTS FROM MART.DATA_QUALITY) AS TESTS,
  (SELECT SUM(IMAGES) FROM MART.SEM_MAPPING) AS SEM,
  (SELECT COUNT(*) FROM CURATED.NCR_ENRICHED) AS NCRS`)
console.log('counts', counts[0])
const routes = await api.routes()
console.log(`routes ${routes.length}: ${routes.map((r) => r.routeKey).join(', ')}`)
try {
  const hits = await api.search('release ductility 30 HV10', 3)
  console.log('search', info.search || '', hits.map((h) => h.ref))
} catch (e) {
  console.warn('search failed:', String(e.message).slice(0, 200))
}
try {
  const c = await api.complete('In one sentence: what is 4Cr13? Use only the word martensitic if unsure.')
  console.log('complete', c.model, (c.text || '').slice(0, 200))
} catch (e) {
  console.warn('COMPLETE not available yet:', String(e.message).slice(0, 200))
}
await api.close()
