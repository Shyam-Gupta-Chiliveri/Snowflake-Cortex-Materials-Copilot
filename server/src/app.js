import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import { loadConfig, ROOT } from './config.js'
import { createRepo } from './data/index.js'
import { ask } from './agent/orchestrator.js'
import { kpis, groups, anomalies, previewIncident } from './products.js'
import { createIncident } from './servicenow.js'

export async function createApp(cfg = loadConfig()) {
  const { repo, reason } = await createRepo(cfg)
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '64kb' }))
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

  app.get('/health', wrap(async (_req, res) => {
    const info = await repo.info()
    res.json({
      ok: true,
      service: 'snowflake-cortex-materials-copilot',
      mode: info.mode,
      label: info.label,
      cortex: info.mode === 'snowflake' ? 'live warehouse · LLM trial-blocked (composer)' : 'mocked',
      search: info.search,
      ml: info.ml,
      reason,
      account: info.account || null,
    })
  }))

  app.post('/ask', wrap(async (req, res) => {
    const question = String(req.body?.question || '').trim()
    if (!question) return res.status(400).json({ error: 'Please enter a question.' })
    if (question.length > 2000) return res.status(400).json({ error: 'Question is too long (max 2000 characters).' })
    res.json(await ask(question, repo))
  }))

  app.get('/kpis', wrap(async (_req, res) => res.json(await kpis(repo))))
  app.get('/groups', wrap(async (_req, res) => res.json(await groups(repo))))
  app.get('/lots', wrap(async (_req, res) => res.json(await groups(repo))))
  app.get('/anomalies', wrap(async (_req, res) => res.json(await anomalies(repo))))
  app.get('/sem', wrap(async (_req, res) => res.json(await repo.sem())))
  app.get('/ncrs', wrap(async (_req, res) => res.json(await repo.ncrs())))
  app.get('/factors', wrap(async (_req, res) => res.json(await repo.factors())))
  app.get('/pipeline', wrap(async (_req, res) => res.json({ objects: await repo.pipeline(), reason })))
  app.get('/ml', wrap(async (_req, res) => res.json((await repo.ml()) || { status: 'Target', note: 'Train with npm run snowflake:build after ACCOUNTADMIN setup' })))
  app.get('/documents', wrap(async (_req, res) => res.json(await repo.documents())))

  app.get('/servicenow', wrap(async (req, res) => {
    const preview = await previewIncident(repo, req.query.ncr)
    res.json({ stub: true, preview })
  }))

  app.post('/servicenow', wrap(async (req, res) => {
    const preview = await previewIncident(repo, req.body?.ncrId)
    const result = await createIncident(cfg, {
      ncrId: preview?.ncrId,
      routeKey: preview?.ncr?.routeKey,
      shortDescription: preview?.payload?.short_description,
      description: preview?.payload?.description,
      urgency: preview?.payload?.urgency,
      severity: preview?.ncr?.severity,
    })
    res.json({
      stub: result.mode !== 'servicenow',
      created: result.mode === 'servicenow',
      message: result.warning || (result.mode === 'servicenow' ? 'Incident opened.' : 'ServiceNow is not configured. This is the incident that would be opened.'),
      preview,
      ...result,
    })
  }))

  const dist = path.join(ROOT, 'web/dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      res.sendFile(path.join(dist, 'index.html'))
    })
  }

  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ error: String(err.message || err).slice(0, 240) })
  })

  app.locals.repo = repo
  app.locals.reason = reason
  return app
}
