#!/usr/bin/env node
// Build the MATERIALS_AI pipeline as MATERIALS_LOADER_SVC after account_setup.sql
// has been run in Snowsight. PUT the axle CSV, SEM predictions, NCRs and
// procedures, then execute snowflake/sql/01_raw.sql … 07_app_grants.sql.

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
  const sf = { ...cfg.snowflake, username: process.env.SNOWFLAKE_LOADER_USER || 'MATERIALS_LOADER_SVC',
    role: process.env.SNOWFLAKE_LOADER_ROLE || 'MATERIALS_ENGINEER',
    privateKey: fs.readFileSync(process.env.SNOWFLAKE_LOADER_KEY || path.join(ROOT, 'keys/loader_private.pem'), 'utf8') }
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

const cfg = loadConfig()
const conn = connect(cfg)
await new Promise((resolve, reject) => conn.connect((e) => (e ? reject(e) : resolve())))

const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  if (f.startsWith('02_')) {
    if (!fs.existsSync(AXLE)) {
      console.warn(`Skipping PUT of axle CSV (not found at ${AXLE}). Run this script again after the file is available.`)
    } else {
      console.log('PUT axle, SEM, NCR…')
      await exec(conn, `PUT file://${AXLE} @RAW.LANDING/axle/ AUTO_COMPRESS=TRUE OVERWRITE=TRUE`)
      if (fs.existsSync(SEM)) await exec(conn, `PUT file://${SEM} @RAW.LANDING/sem/ AUTO_COMPRESS=TRUE OVERWRITE=TRUE`)
      await exec(conn, `PUT file://${NCR} @RAW.LANDING/ncr/ AUTO_COMPRESS=TRUE OVERWRITE=TRUE`)
    }
  }
  console.log(`SQL ${f}`)
  const optional = /04_ai|05_search|06_ml/.test(f)
  for (const stmt of statements(fs.readFileSync(path.join(SQL_DIR, f), 'utf8'))) {
    try { await exec(conn, stmt) } catch (e) {
      if (optional) { console.warn(`Skipping (trial Cortex/ML may be unavailable): ${String(e.message).slice(0, 180)}`); continue }
      console.error(stmt.slice(0, 120)); throw e
    }
  }
}

const knowledge = path.join(ROOT, 'knowledge')
for (const file of fs.readdirSync(knowledge).filter((f) => f.endsWith('.md'))) {
  const doc = parseDoc(fs.readFileSync(path.join(knowledge, file), 'utf8'), path.basename(file, '.md'))
  await exec(conn, `MERGE INTO RAW.DOCUMENTS_RAW t USING (SELECT ? DOC_ID, ? TITLE, ? CATEGORY, ? BODY) s ON t.DOC_ID = s.DOC_ID
    WHEN MATCHED THEN UPDATE SET TITLE = s.TITLE, CATEGORY = s.CATEGORY, BODY = s.BODY, LOADED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (DOC_ID, TITLE, CATEGORY, BODY, LOADED_AT) VALUES (s.DOC_ID, s.TITLE, s.CATEGORY, s.BODY, CURRENT_TIMESTAMP())`,
  [doc.id, doc.title, doc.category, doc.body])
  console.log(`document ${doc.id}`)
}

const ncrCount = await exec(conn, 'SELECT COUNT(*) AS N FROM CURATED.NCR_ENRICHED')
if (!Number(ncrCount[0]?.N)) {
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

conn.destroy((e) => { if (e) throw e })
console.log('Pipeline built. Next: npm run snowflake:verify')
