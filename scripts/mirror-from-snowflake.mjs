#!/usr/bin/env node
// Replace data/mirror/products.json with the live MART / CURATED products.

import fs from 'node:fs'
import path from 'node:path'
import { loadConfig, ROOT } from '../server/src/config.js'
import { createSnowflake } from '../server/src/data/snowflake.js'

const cfg = loadConfig()
const api = await createSnowflake(cfg)
const [routes, factors, correlations, tempering, dataQuality, sem, ncrs, ml] = await Promise.all([
  api.routes(), api.factors(), api.correlations(), api.tempering(), api.dataQuality(), api.sem(), api.ncrs(), api.ml().catch(() => null),
])
const out = path.join(ROOT, 'data/mirror/products.json')
fs.writeFileSync(out, JSON.stringify({
  meta: { source: 'exported from Snowflake MART / CURATED', builtAt: new Date().toISOString(), account: cfg.snowflake.account },
  routes, factors, correlations, tempering, dataQuality, sem, ncrs, ml,
}, null, 1))
await api.close()
console.log(`Wrote ${out} (${routes.length} routes)`)
