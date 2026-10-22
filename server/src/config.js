import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function privateKey() {
  if (process.env.SNOWFLAKE_PRIVATE_KEY) return process.env.SNOWFLAKE_PRIVATE_KEY.replace(/\\n/g, '\n')
  const p = process.env.SNOWFLAKE_PRIVATE_KEY_PATH
  return p && fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

export function loadConfig(env = process.env) {
  const key = privateKey()
  return {
    port: Number(env.PORT || 8080),
    dataMode: env.DATA_MODE || 'auto',
    snowflake: {
      account: env.SNOWFLAKE_ACCOUNT || null,
      username: env.SNOWFLAKE_USER || 'MATERIALS_APP_SVC',
      privateKey: key,
      role: env.SNOWFLAKE_ROLE || 'MATERIALS_APP',
      warehouse: env.SNOWFLAKE_WAREHOUSE || 'MATERIALS_WH',
      database: env.SNOWFLAKE_DATABASE || 'MATERIALS_AI',
      searchService: env.SNOWFLAKE_SEARCH_SERVICE || 'MATERIALS_AI.SEARCH.MATERIALS_SEARCH',
      models: (env.SNOWFLAKE_LLM || 'mistral-large2,llama3.1-70b,snowflake-llama-3.3-70b').split(',').map((s) => s.trim()).filter(Boolean),
    },
    servicenow: {
      instance: env.SERVICENOW_INSTANCE || null,
      user: env.SERVICENOW_USER || null,
      password: env.SERVICENOW_PASSWORD || null,
    },
  }
}

export const hasSnowflake = (c) => Boolean(c.snowflake.account && c.snowflake.privateKey && c.dataMode !== 'local')
