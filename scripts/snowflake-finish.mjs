#!/usr/bin/env node
// Resume after a FUTURE GRANT failure: app grants + APP views. Safe to re-run.

import fs from 'node:fs'
import path from 'node:path'
import snowflake from 'snowflake-sdk'
import { loadConfig, ROOT } from '../server/src/config.js'

function statements(sql) {
  return sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)
}

const cfg = loadConfig()
const conn = snowflake.createConnection({
  account: cfg.snowflake.account,
  username: process.env.SNOWFLAKE_LOADER_USER || 'MATERIALS_LOADER_SVC',
  authenticator: 'SNOWFLAKE_JWT',
  privateKey: fs.readFileSync(process.env.SNOWFLAKE_LOADER_KEY || path.join(ROOT, 'keys/loader_private.pem'), 'utf8'),
  role: process.env.SNOWFLAKE_LOADER_ROLE || 'MATERIALS_ENGINEER',
  warehouse: cfg.snowflake.warehouse,
  database: cfg.snowflake.database,
  application: 'MaterialsCopilotBuild',
})
await new Promise((resolve, reject) => conn.connect((e) => (e ? reject(e) : resolve())))
const exec = (sqlText) => new Promise((resolve, reject) => {
  conn.execute({ sqlText, complete: (err, _s, rows) => (err ? reject(err) : resolve(rows || [])) })
})

for (const name of ['07_app_grants.sql', '08_app.sql']) {
  console.log(`SQL ${name}`)
  for (const stmt of statements(fs.readFileSync(path.join(ROOT, 'snowflake/sql', name), 'utf8'))) {
    try { await exec(stmt) } catch (e) {
      console.warn(`  skip: ${String(e.message).slice(0, 200)}`)
    }
  }
}
try { await exec('GRANT SELECT ON ALL DYNAMIC TABLES IN SCHEMA MART TO ROLE MATERIALS_APP') } catch (e) { console.warn(String(e.message).slice(0, 160)) }
try { await exec('GRANT SELECT ON ALL VIEWS IN SCHEMA APP TO ROLE MATERIALS_APP') } catch (e) { console.warn(String(e.message).slice(0, 160)) }
console.log('routes', (await exec('SELECT COUNT(*) AS N FROM MART.ROUTE_QUALITY'))[0])
conn.destroy(() => {})
console.log('Finish complete.')
