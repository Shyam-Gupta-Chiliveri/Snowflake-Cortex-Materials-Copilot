import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.js'
import { createApp } from './app.js'

export async function start(env = process.env) {
  const cfg = loadConfig(env)
  const app = await createApp(cfg)
  const server = await new Promise((resolve) => {
    const s = app.listen(cfg.port, '0.0.0.0', () => resolve(s))
  })
  const info = await app.locals.repo.info()
  console.log(`materials copilot on :${cfg.port} (${info.mode}${app.locals.reason ? `; ${app.locals.reason}` : ''})`)
  return { server, repo: app.locals.repo, app }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((e) => { console.error(e); process.exit(1) })
}
