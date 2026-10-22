import { loadConfig } from './config.js'
import { createApp } from './app.js'

const cfg = loadConfig()
const app = await createApp(cfg)
const server = app.listen(cfg.port, () => {
  console.log(`Materials copilot on http://127.0.0.1:${cfg.port} (${app.locals.reason || 'Snowflake'})`)
})

const shutdown = async () => {
  server.close()
  await app.locals.repo.close().catch(() => {})
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
