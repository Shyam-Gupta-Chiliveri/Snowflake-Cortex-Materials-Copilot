// Snowflake driver: key-pair (JWT) authentication, a small connection pool, the data
// products from MART, Cortex Search over REST, Cortex COMPLETE and Snowflake ML.

import crypto from 'node:crypto'
import snowflake from 'snowflake-sdk'
import { LINEAGE } from './lineage.js'

snowflake.configure({ logLevel: 'ERROR' })

const camel = (k) => k.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const rowsToCamel = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v])))

export function jwtFor({ account, username, privateKey }) {
  const acct = account.toUpperCase().replace(/\.global$/i, '').split('.')[0]
  const user = username.toUpperCase()
  const pub = crypto.createPublicKey(crypto.createPrivateKey(privateKey)).export({ type: 'spki', format: 'der' })
  const fp = 'SHA256:' + crypto.createHash('sha256').update(pub).digest('base64')
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: `${acct}.${user}.${fp}`, sub: `${acct}.${user}`, iat: now, exp: now + 3540 })}`
  return `${body}.${crypto.sign('RSA-SHA256', Buffer.from(body), privateKey).toString('base64url')}`
}

export function sqlString(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
}

export async function createSnowflake(cfg) {
  const sf = cfg.snowflake
  const pool = snowflake.createPool({
    account: sf.account, username: sf.username, authenticator: 'SNOWFLAKE_JWT', privateKey: sf.privateKey,
    role: sf.role, warehouse: sf.warehouse, database: sf.database, application: 'MaterialsCopilot', clientSessionKeepAlive: true,
  }, { max: 4, min: 0, evictionRunIntervalMillis: 60000, idleTimeoutMillis: 300000 })

  const q = (sqlText, binds = []) => pool.use((conn) => new Promise((resolve, reject) => {
    conn.execute({ sqlText, binds, complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows || [])) })
  }))

  const cache = new Map()
  const cached = async (key, ttlMs, fn) => {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.t < ttlMs) return hit.v
    const v = await fn()
    cache.set(key, { t: Date.now(), v })
    return v
  }
  const product = (name, order = '') => cached(name, 10 * 60_000, async () => rowsToCamel(await q(`SELECT * FROM MART.${name} ${order}`)))

  let jwt = null, jwtAt = 0
  const bearer = () => { if (!jwt || Date.now() - jwtAt > 50 * 60_000) { jwt = jwtFor(sf); jwtAt = Date.now() } return jwt }
  const host = `https://${sf.account.toLowerCase()}.snowflakecomputing.com`
  const [db, schema, service] = sf.searchService.split('.')
  let searchVia = 'Cortex Search REST API'

  async function searchRest(query, k) {
    const res = await fetch(`${host}/api/v2/databases/${db}/schemas/${schema}/cortex-search-services/${service}:query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearer()}`, 'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, columns: ['CHUNK', 'CHUNK_ID', 'DOC_ID', 'TITLE', 'SOURCE_TYPE'], limit: k }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Cortex Search REST ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()).results || []
  }

  async function searchSql(query, k) {
    const params = JSON.stringify({ query, columns: ['CHUNK', 'CHUNK_ID', 'DOC_ID', 'TITLE', 'SOURCE_TYPE'], limit: k })
    const rows = await q(`SELECT SNOWFLAKE.CORTEX.SEARCH_PREVIEW(${sqlString(sf.searchService)}, ${sqlString(params)}) AS R`)
    return JSON.parse(rows[0].R).results || []
  }

  const api = {
    mode: 'snowflake',
    q,
    info: async () => {
      const r = await cached('info', 5 * 60_000, () => q('SELECT CURRENT_ACCOUNT() AS ACCOUNT, CURRENT_REGION() AS REGION, CURRENT_ROLE() AS ROLE, CURRENT_WAREHOUSE() AS WAREHOUSE, CURRENT_VERSION() AS VERSION'))
      return { mode: 'snowflake', label: 'Snowflake', account: sf.account, ...rowsToCamel(r)[0], llm: sf.models[0], search: searchVia, ml: 'Snowflake ML classification' }
    },
    routes: () => product('ROUTE_QUALITY', 'ORDER BY VERSION, ROUTE_KEY'),
    factors: () => product('FACTOR_EFFECTS', 'ORDER BY FACTOR, LEVEL'),
    correlations: () => product('DUCTILITY_DRIVERS'),
    tempering: async () => (await product('TEMPERING_RESPONSE'))[0],
    dataQuality: async () => (await product('DATA_QUALITY'))[0],
    sem: () => cached('sem', 10 * 60_000, async () => {
      const byRoute = rowsToCamel(await q('SELECT * FROM MART.SEM_BY_ROUTE ORDER BY ROUTE_KEY'))
      const mapping = rowsToCamel(await q('SELECT * FROM MART.SEM_MAPPING ORDER BY IMAGES DESC'))
      return { images: mapping.reduce((s, m) => s + Number(m.images), 0), mapping, byRoute }
    }),
    ncrs: () => cached('ncrs', 5 * 60_000, async () => rowsToCamel(await q('SELECT * FROM CURATED.NCR_ENRICHED ORDER BY OPENED_ON')).map((n) => ({
      ...n, openedOn: n.openedOn instanceof Date ? n.openedOn.toISOString().slice(0, 10) : String(n.openedOn).slice(0, 10),
    }))),
    anomalies: () => cached('anomalies', 5 * 60_000, async () => {
      try {
        return rowsToCamel(await q('SELECT * FROM MART.ANOMALIES'))
      } catch {
        const { deriveAnomalies } = await import('./anomalies.js')
        const [routes, ncrs, sem] = await Promise.all([api.routes(), api.ncrs(), api.sem()])
        return deriveAnomalies({ routes, ncrs, sem })
      }
    }),
    documents: async () => [],
    search: async (query, k = 5) => {
      let results
      try { results = await searchRest(query, k); searchVia = 'Cortex Search REST API' } catch (e) {
        results = await searchSql(query, k); searchVia = 'Cortex Search (SEARCH_PREVIEW)'
      }
      return results.map((r) => ({ ref: r.CHUNK_ID, title: r.TITLE, kind: r.SOURCE_TYPE, text: r.CHUNK,
        score: r['@scores']?.cosine_similarity ?? null }))
    },
    complete: async (prompt) => {
      let lastErr
      for (const model of sf.models) {
        try {
          const rows = await q('SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) AS R', [model, prompt])
          return { text: String(rows[0].R || '').trim(), model, provider: 'Snowflake Cortex' }
        } catch (e) { lastErr = e }
      }
      throw lastErr
    },
    ml: () => cached('ml', 30 * 60_000, async () => {
      const [metrics, importance, holdout] = await Promise.all([
        q('SELECT * FROM ML.EVAL_METRICS'), q('SELECT * FROM ML.FEATURE_IMPORTANCE ORDER BY 3 DESC'), q('SELECT * FROM ML.HOLDOUT_METRICS'),
      ])
      return { metrics: rowsToCamel(metrics), featureImportance: rowsToCamel(importance), holdout: rowsToCamel(holdout)[0] }
    }),
    predict: async (x) => {
      const rows = await q(`SELECT ML.DUCTILITY_CLASSIFIER!PREDICT(INPUT_DATA => OBJECT_CONSTRUCT(
        'MATERIAL', ?, 'DIE_CAST', ?, 'DIAMETER_MM', ?::FLOAT, 'SAMPLES', ?::FLOAT, 'C_PCT', ?::FLOAT, 'SI_PCT', ?::FLOAT,
        'MN_PCT', ?::FLOAT, 'P_PCT', ?::FLOAT, 'S_PCT', ?::FLOAT, 'CR_PCT', ?::FLOAT, 'NI_PCT', ?::FLOAT,
        'SERIES_C', ?::FLOAT, 'SERIES_H', ?::FLOAT, 'SERIES_UNSPECIFIED', ?, 'VACUUM', ?, 'ADD_C', ?::FLOAT, 'ADD_H', ?::FLOAT)) AS P`,
      [x.material, x.dieCast ? 'Yes' : 'No', x.diameter, x.samples, x.c, x.si, x.mn, x.p, x.s, x.cr, x.ni,
        x.seriesC || 0, x.seriesH || 0, x.seriesUnspecified ? 'Yes' : 'No', x.vacuum ? 'Yes' : 'No', x.addC || 0, x.addH || 0])
      const p = typeof rows[0].P === 'string' ? JSON.parse(rows[0].P) : rows[0].P
      return { band: p.class, probabilities: p.probability, by: 'Snowflake ML classification (ML.DUCTILITY_CLASSIFIER)' }
    },
    pipeline: () => cached('pipeline', 5 * 60_000, async () => {
      const tables = rowsToCamel(await q(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, ROW_COUNT, BYTES, LAST_ALTERED
        FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA <> 'INFORMATION_SCHEMA'`))
      let dts = []
      try { dts = rowsToCamel(await q('SELECT * FROM TABLE(INFORMATION_SCHEMA.DYNAMIC_TABLES()) WHERE NAME IS NOT NULL')) } catch { /* MONITOR not granted */ }
      return LINEAGE.map((o) => {
        const t = tables.find((t) => `${t.tableSchema}.${t.tableName}` === o.id)
        const d = dts.find((d) => `${d.schemaName}.${d.name}` === o.id)
        return { ...o, live: t ? { rows: Number(t.rowCount), bytes: Number(t.bytes), lastAltered: t.lastAltered,
          refreshMode: d?.refreshMode || null, state: d?.schedulingState || d?.state || null,
          dataTimestamp: d?.latestDataTimestamp || d?.dataTimestamp || null } : null }
      })
    }),
    close: () => pool.drain().then(() => pool.clear()),
  }
  await q('SELECT 1')
  return api
}
