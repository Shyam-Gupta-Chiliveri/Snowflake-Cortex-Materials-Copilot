#!/usr/bin/env node
// Read-only checks as MATERIALS_APP_SVC: row counts, Cortex Search, Cortex COMPLETE.

import { loadConfig } from '../server/src/config.js'
import { createSnowflake } from '../server/src/data/snowflake.js'

const cfg = loadConfig()
if (!cfg.snowflake.account || !cfg.snowflake.privateKey) {
  console.error('Snowflake is not configured. Run npm run snowflake:keys, paste account_setup.sql in Snowsight, then set SNOWFLAKE_ACCOUNT=ovllhya-hp33530')
  process.exit(1)
}
const api = await createSnowflake(cfg)
const info = await api.info()
console.log(info)
const routes = await api.routes()
console.log(`routes ${routes.length}: ${routes.map((r) => r.routeKey).join(', ')}`)
const hits = await api.search('release ductility 30 HV10', 3)
console.log('search', hits.map((h) => h.ref))
try {
  const c = await api.complete('In one sentence: what is 4Cr13? Use only the word martensitic if unsure.')
  console.log('complete', c.model, (c.text || '').slice(0, 160))
} catch (e) {
  console.warn('COMPLETE not available yet:', String(e.message).slice(0, 160))
}
await api.close()
