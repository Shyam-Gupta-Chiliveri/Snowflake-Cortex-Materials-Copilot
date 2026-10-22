#!/usr/bin/env node
// Build the MATERIALS_AI pipeline as MATERIALS_LOADER_SVC after account_setup.sql
// has been run in Snowsight. PUT CSVs, load, refresh dynamic tables, then Cortex / ML.

import fs from 'node:fs'
import path from 'node:path'
import snowflake from 'snowflake-sdk'
import { loadConfig, ROOT } from '../server/src/config.js'
import { parseDoc } from '../server/src/agent/retriever.js'

const AXLE = process.env.AXLE_CSV || path.resolve(ROOT, '../DSML_Final_Project/data/axle_test_385000_samples.csv')
const SEM = process.env.SEM_CSV || path.resolve(ROOT, '../DSML_Final_Project/sem_output/all_predictions.csv')
const NCR = path.join(ROOT, 'data/ncr_events.csv')
const SQL_DIR = path.join(ROOT, 'snowflake/sql')

function statements(sql) {
  return sql.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter((s) => s && !/^\s*$/.test(s))
}

function connect(cfg) {
  const keyPath = process.env.SNOWFLAKE_LOADER_KEY || path.join(ROOT, 'keys/loader_private.pem')
  const sf = {
    ...cfg.snowflake,
    username: process.env.SNOWFLAKE_LOADER_USER || 'MATERIALS_LOADER_SVC',
    role: process.env.SNOWFLAKE_LOADER_ROLE || 'MATERIALS_ENGINEER',
    privateKey: fs.readFileSync(keyPath, 'utf8'),
  }
  if (!sf.account || !sf.privateKey) throw new Error('Set SNOWFLAKE_ACCOUNT and generate keys (npm run snowflake:keys)')
  return snowflake.createConnection({
    account: sf.account, username: sf.username, authenticator: 'SNOWFLAKE_JWT', privateKey: sf.privateKey,
    role: sf.role, warehouse: sf.warehouse, database: sf.database, application: 'MaterialsCopilotBuild',
  })
}

function exec(conn, sqlText, binds) {
  return new Promise((resolve, reject) => {
    conn.execute({ sqlText, binds, complete: (err, _s, rows) => (err ? reject(err) : resolve(rows || [])) })
  })
}

async function runFile(conn, name, { optional = false } = {}) {
  const file = path.join(SQL_DIR, name)
  if (!fs.existsSync(file)) { console.warn(`missing ${name}`); return }
  console.log(`SQL ${name}`)
  for (const stmt of statements(fs.readFileSync(file, 'utf8'))) {
    try { await exec(conn, stmt) } catch (e) {
      const msg = String(e.message).slice(0, 240)
      const skip = optional || /CORTEX SEARCH|ML\.CLASSIFICATION|DUCTILITY_CLASSIFIER|FUTURE /.test(stmt)
      if (skip) { console.warn(`  skip: ${msg}`); continue }
      console.error(stmt.slice(0, 160))
      throw e
    }
  }
}

async function count(conn, sql) {
  const rows = await exec(conn, sql)
  return Number(Object.values(rows[0] || {})[0] || 0)
}

async function waitCount(conn, sql, min, label, tries = 48) {
  for (let i = 0; i < tries; i++) {
    try {
      const n = await count(conn, sql)
      console.log(`  ${label}: ${n}`)
      if (n >= min) return n
    } catch (e) {
      console.log(`  ${label}: waiting (${String(e.message).slice(0, 80)})`)
    }
    await new Promise((r) => setTimeout(r, 15000))
  }
  throw new Error(`${label} did not reach ${min} rows`)
}

async function put(conn, local, dest) {
  if (!fs.existsSync(local)) throw new Error(`Missing file: ${local}`)
  const uri = `file://${local}`
  console.log(`PUT ${path.basename(local)} -> ${dest}`)
  await exec(conn, `PUT '${uri}' ${dest} AUTO_COMPRESS=TRUE OVERWRITE=TRUE`)
}

const cfg = loadConfig()
if (!cfg.snowflake.account) {
  console.error('SNOWFLAKE_ACCOUNT is not set. Copy .env.example to .env')
  process.exit(1)
}
const conn = connect(cfg)
await new Promise((resolve, reject) => conn.connect((e) => (e ? reject(e) : resolve())))
console.log(`Connected as loader to ${cfg.snowflake.account}`)

await runFile(conn, '01_raw.sql')

console.log('PUT axle, SEM, NCR…')
await put(conn, AXLE, '@RAW.LANDING/axle/')
if (fs.existsSync(SEM)) await put(conn, SEM, '@RAW.LANDING/sem/')
else console.warn(`SEM CSV not found at ${SEM}`)
await put(conn, NCR, '@RAW.LANDING/ncr/')

await runFile(conn, '02_load.sql')
console.log(`RAW axle ${await count(conn, 'SELECT COUNT(*) FROM RAW.AXLE_TESTS_RAW')}, SEM ${await count(conn, 'SELECT COUNT(*) FROM RAW.SEM_PREDICTIONS_RAW')}, NCR ${await count(conn, 'SELECT COUNT(*) FROM RAW.NCR_RAW')}`)

const knowledge = path.join(ROOT, 'knowledge')
for (const file of fs.readdirSync(knowledge).filter((f) => f.endsWith('.md'))) {
  const doc = parseDoc(fs.readFileSync(path.join(knowledge, file), 'utf8'), path.basename(file, '.md'))
  await exec(conn, `MERGE INTO RAW.DOCUMENTS_RAW t USING (SELECT ? DOC_ID, ? TITLE, ? CATEGORY, ? BODY) s ON t.DOC_ID = s.DOC_ID
    WHEN MATCHED THEN UPDATE SET TITLE = s.TITLE, CATEGORY = s.CATEGORY, BODY = s.BODY, LOADED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (DOC_ID, TITLE, CATEGORY, BODY, LOADED_AT) VALUES (s.DOC_ID, s.TITLE, s.CATEGORY, s.BODY, CURRENT_TIMESTAMP())`,
  [doc.id, doc.title, doc.category, doc.body])
  console.log(`document ${doc.id}`)
}

await runFile(conn, '03_curated.sql')
try { await exec(conn, 'ALTER DYNAMIC TABLE CURATED.AXLE_TESTS REFRESH') } catch (e) { console.warn(String(e.message).slice(0, 160)) }
try { await exec(conn, 'ALTER DYNAMIC TABLE CURATED.SEM_FRACTOGRAPHY REFRESH') } catch (e) { console.warn(String(e.message).slice(0, 160)) }
await waitCount(conn, 'SELECT COUNT(*) FROM CURATED.AXLE_TESTS', 300000, 'CURATED.AXLE_TESTS')
await waitCount(conn, 'SELECT COUNT(*) FROM MART.ROUTE_QUALITY', 8, 'MART.ROUTE_QUALITY')

await runFile(conn, '04_ai_enrichment.sql', { optional: true })
const ncrCount = await count(conn, 'SELECT COUNT(*) FROM CURATED.NCR_ENRICHED').catch(() => 0)
if (!ncrCount) {
  console.warn('NCR_ENRICHED empty (Cortex classify/summarize skipped). Seeding keyword fallback…')
  await exec(conn, `INSERT INTO CURATED.NCR_ENRICHED
    (NCR_ID, OPENED_ON, ROUTE_KEY, PART, STATUS, DESCRIPTION, CATEGORY, SEVERITY, SUMMARY, ENRICHED_BY, ENRICHED_AT)
    SELECT NCR_ID, OPENED_ON, ROUTE_KEY, PART, STATUS, DESCRIPTION,
      CASE
        WHEN DESCRIPTION ILIKE '%die-cast%' OR DESCRIPTION ILIKE '%overmould%' THEN 'Die-casting or assembly'
        WHEN DESCRIPTION ILIKE '%sulph%' OR DESCRIPTION ILIKE '%inclusion%' THEN 'Material chemistry'
        WHEN DESCRIPTION ILIKE '%indent%' OR DESCRIPTION ILIKE '%fixture%' OR DESCRIPTION ILIKE '%LIMS%' THEN 'Testing or measurement'
        WHEN DESCRIPTION ILIKE '%diameter%' OR DESCRIPTION ILIKE '%machin%' THEN 'Geometry or machining'
        ELSE 'Heat treatment'
      END,
      CASE WHEN DESCRIPTION ILIKE '%customer%' OR DESCRIPTION ILIKE '%return%' THEN 'Critical'
           WHEN STATUS = 'Open' THEN 'Major' ELSE 'Minor' END,
      SPLIT_PART(DESCRIPTION, '. ', 1),
      'local keyword rules (Cortex unavailable)', CURRENT_TIMESTAMP()
    FROM RAW.NCR_RAW`)
}

await runFile(conn, '05_search.sql', { optional: true })
if (!(await count(conn, "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='SEARCH' AND TABLE_NAME='DOC_CHUNKS'").catch(() => 0))) {
  console.warn('Creating SEARCH.DOC_CHUNKS without Cortex SPLIT_TEXT (trial fallback)')
  await exec(conn, `CREATE TABLE IF NOT EXISTS SEARCH.DOC_CHUNKS AS
    SELECT DOC_ID || '#1' AS CHUNK_ID, DOC_ID, TITLE, CATEGORY AS SOURCE_TYPE, BODY AS CHUNK FROM RAW.DOCUMENTS_RAW
    UNION ALL
    SELECT NCR_ID, NCR_ID, NCR_ID || ' (' || COALESCE(CATEGORY, '') || ', ' || STATUS || ')', 'Nonconformance',
           'Route ' || ROUTE_KEY || ', ' || PART || ', opened ' || TO_VARCHAR(OPENED_ON) || '. ' || DESCRIPTION
    FROM CURATED.NCR_ENRICHED`)
}

await runFile(conn, '06_ml.sql', { optional: true })
await runFile(conn, '07_app_grants.sql')
await runFile(conn, '08_app.sql')

console.log(`routes ${await count(conn, 'SELECT COUNT(*) FROM MART.ROUTE_QUALITY')}, docs ${await count(conn, 'SELECT COUNT(*) FROM RAW.DOCUMENTS_RAW')}, ncrs ${await count(conn, 'SELECT COUNT(*) FROM CURATED.NCR_ENRICHED')}`)
conn.destroy((e) => { if (e) throw e })
console.log('Pipeline built. Next: npm run snowflake:verify')
