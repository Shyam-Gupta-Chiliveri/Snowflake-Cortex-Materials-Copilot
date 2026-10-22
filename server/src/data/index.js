import { hasSnowflake } from '../config.js'
import { createMirror } from './mirror.js'

// Snowflake when configured and reachable, otherwise the local mirror. The UI and
// every answer show which one served the request.
export async function createRepo(cfg) {
  const mirror = createMirror()
  if (!hasSnowflake(cfg)) return { repo: mirror, mirror, reason: 'Snowflake is not configured (local mirror)' }
  try {
    const { createSnowflake } = await import('./snowflake.js')
    const repo = await createSnowflake(cfg)
    return { repo, mirror, reason: null }
  } catch (e) {
    return { repo: mirror, mirror, reason: `Snowflake not reachable, serving the local mirror: ${String(e.message).slice(0, 160)}` }
  }
}
