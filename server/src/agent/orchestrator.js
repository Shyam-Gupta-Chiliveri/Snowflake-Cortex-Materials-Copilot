import { route } from './router.js'
import { evaluate, rank } from './gate.js'
import { grounding, citations, stance } from './critic.js'
import { compose, cortexPrompt } from './composer.js'

function factTexts({ routed, routes, ncrs, sem, factors, tempering, quality, prediction, ranked }) {
  const facts = []
  for (const r of routes) {
    facts.push(`${r.routeKey} ${r.routeLabel} tests ${r.tests} HV10 ${r.hv10Mean} bend ${r.bendMean} ductility ${r.ductMean} lowDuctShare ${r.lowDuctSharePct} version ${r.version} addC ${r.addC ?? 0}`)
  }
  for (const n of ncrs) facts.push(`${n.ncrId} ${n.status} ${n.routeKey} ${n.openedOn} ${n.part} ${n.category || ''} ${n.severity || ''} ${n.summary || n.description}`)
  if (sem) {
    facts.push(`SEM images ${sem.images}`)
    for (const m of sem.mapping || []) facts.push(`SEM mapping ${m.mapping} ${m.images}`)
    for (const s of sem.byRoute || []) facts.push(`${s.routeKey} SEM ductile ${s.semDuctileMean} cleavage ${s.cleavageDominatedPct} images ${s.images}`)
  }
  for (const f of factors) facts.push(`factor ${f.factor} ${f.level} tests ${f.tests} HV10 ${f.hv10Mean} bend ${f.bendMean} ductility ${f.ductMean}`)
  if (tempering) facts.push(`tempering slope ${tempering.slopePctPerC} intercept ${tempering.interceptPct} r ${tempering.r} tests ${tempering.tests}`)
  if (quality) facts.push(`data quality tests ${quality.tests} hvOrderViolations ${quality.hvOrderViolations} sumNot100 ${quality.sumNot100}`)
  if (prediction) facts.push(`prediction band ${prediction.band} by ${prediction.by} matched ${prediction.matchedRoute || ''} expected ${prediction.expectedDuctility ?? ''}`)
  for (const x of ranked) {
    facts.push(`gate ${x.gate.routeKey} recommended ${x.gate.recommended} reasons ${x.gate.reasons.join('; ') || 'none'} warnings ${x.gate.warnings.join('; ') || 'none'}`)
  }
  facts.push(`question ${routed.question}`)
  return facts
}

function expectedStance(routed, ranked, picked) {
  if (routed.primary === 'best' && ranked[0]) return { topRoute: (ranked.find((x) => x.gate.recommended) || ranked[0]).route.routeKey }
  if ((routed.primary === 'route' || routed.intents.includes('best')) && picked[0]) {
    const g = ranked.find((x) => x.route.routeKey === picked[0].routeKey)?.gate
    if (g) return { recommended: g.recommended }
  }
  return null
}

export async function ask(question, repo) {
  const t0 = Date.now()
  const steps = []
  const tick = (agent, tool, started, summary) => steps.push({ agent, tool, ms: Date.now() - started, summary })

  const [allRoutes, ncrs, info] = await Promise.all([repo.routes(), repo.ncrs(), repo.info()])
  const known = allRoutes.map((r) => r.routeKey)
  const routed = route(question, known)
  tick('Router', 'rules', t0, `intent ${routed.primary}; routes ${routed.routes.join(', ') || 'none'}; injection ${routed.injection}`)

  if (routed.injection) {
    tick('Critic', 'prompt-injection filter', Date.now(), 'question tries to change instructions or extract secrets; blocked')
    return {
      answer: 'I can only answer 4Cr13 axle heat-treatment questions from the data products here. That message looks like an instruction override, so I did not run it. Try: "Can we release V6-F?"',
      provider: 'Critic', model: 'rules', mode: info.mode, plan: [routed.primary], steps, citations: [],
      critic: { verdict: 'blocked', grounded: true, recommended: null, reasons: ['prompt-injection pattern in question'], ungrounded: [] },
    }
  }

  const needSem = routed.intents.includes('sem') || routed.primary === 'best'
  const needFactors = routed.intents.includes('factor')
  const needTemper = routed.intents.includes('tempering') || routed.primary === 'best'
  const needQuality = routed.intents.includes('quality')
  const needPredict = routed.intents.includes('predict')

  const tLoad = Date.now()
  const [sem, factors, tempering, quality, prediction, hits] = await Promise.all([
    needSem ? repo.sem() : null,
    needFactors ? repo.factors() : [],
    needTemper ? repo.tempering() : null,
    needQuality ? repo.dataQuality() : null,
    needPredict && routed.process ? repo.predict(routed.process) : null,
    repo.search(routed.question, 5),
  ])
  tick('Retriever', info.search || 'search', tLoad, `${(hits || []).length} passage(s): ${(hits || []).map((h) => h.ref).join(', ') || 'none'}`)

  const ranked = rank(allRoutes, ncrs)
  const picked = routed.routes.map((k) => allRoutes.find((r) => r.routeKey === k)).filter(Boolean)
  const ctx = { routed, routes: picked.length ? picked : allRoutes, ncrs, sem, factors, tempering, quality, prediction, ranked, hits }
  const draft = compose(ctx)

  const gateText = picked.length
    ? picked.map((r) => {
      const g = evaluate(r, { routes: allRoutes, ncrs })
      return `${g.routeKey}: ${g.recommended ? 'RECOMMENDED' : 'NOT RECOMMENDED'}. Blocking: ${g.reasons.join(' | ') || 'none'}. Warnings: ${g.warnings.join(' | ') || 'none'}.`
    }).join('\n')
    : ranked[0]
      ? `${ranked[0].gate.routeKey} is top-ranked. ${ranked[0].gate.recommended ? 'RECOMMENDED' : 'NOT RECOMMENDED'}.`
      : 'No release decision in scope.'
  tick('Critic', 'WI-HT-4CR13 release gate', Date.now(), picked[0]
    ? gateText.split('\n')[0]
    : `ranked ${ranked.filter((x) => x.gate.recommended).map((x) => x.route.routeKey).join(', ') || 'none'}`)

  const facts = factTexts({ ...ctx, routes: allRoutes })
  const knowledge = (hits || []).map((h) => `[${h.ref}] ${h.title}: ${h.text}`)
  const prompt = cortexPrompt({ question: routed.question, gateText, facts, knowledge })

  const tLlm = Date.now()
  let completion = null
  let mocked = false
  try {
    completion = await repo.complete(prompt)
  } catch (e) {
    tick('Synthesizer', 'Snowflake Cortex COMPLETE', tLlm, `Cortex error: ${String(e.message).slice(0, 160)}`)
  }
  if (!completion || !completion.text) {
    mocked = info.mode !== 'snowflake'
    completion = { text: draft, model: 'deterministic-composer', provider: mocked ? 'Snowflake Cortex (mocked)' : 'Deterministic composer' }
    tick('Synthesizer', completion.provider, tLlm, mocked
      ? 'Snowflake disconnected; Cortex mocked with the deterministic composer'
      : 'no LLM text; rule-based answer')
  } else {
    tick('Synthesizer', completion.provider || 'Snowflake Cortex', tLlm, `${completion.model} wrote the answer`)
  }

  const expected = expectedStance(routed, ranked, picked)
  const check = grounding(completion.text, [...facts, ...knowledge, gateText, draft], routed.question)
  const refs = [...(hits || []).map((h) => h.ref), ...ncrs.map((n) => n.ncrId), 'WI-HT-4CR13#5', 'WI-HT-4CR13#2', 'WI-HT-4CR13#4', 'PR-8D#1', 'PR-8D#3', 'PR-HV10-BEND#2', 'PR-HV10-BEND#5', 'GD-FRACTO-SEM#1', 'GD-FRACTO-SEM#5', 'GD-TEST-CAMPAIGNS#2']
  const cite = citations(completion.text, refs)
  const stand = stance(completion.text, expected)

  let answer = completion.text
  let provider = completion.provider
  let model = completion.model
  let verdict = 'pass'
  if (!mocked && completion.model !== 'deterministic-composer' && (!check.grounded || !stand.ok || cite.unknown.length)) {
    verdict = 'revised'
    answer = draft
    provider = `${completion.provider} (replaced by deterministic composer)`
    model = 'rules'
  }
  tick('Critic', 'numeric grounding check', Date.now(),
    verdict === 'pass'
      ? `every number is found in the facts${expected ? '; conclusion matches the rule decision' : ''}`
      : !check.grounded
        ? `ungrounded numbers ${check.ungrounded.join(', ')}; answer replaced`
        : stand.ok ? `unknown citations ${cite.unknown.join(', ')}; answer replaced` : `${stand.reason}; answer replaced`)

  const used = [
    ...(hits || []).map((h) => ({ ref: h.ref, title: h.title, kind: h.kind, snippet: String(h.text).slice(0, 220) })),
    ...ncrs.filter((n) => answer.includes(n.ncrId)).map((n) => ({ ref: n.ncrId, title: n.ncrId, kind: 'Nonconformance', snippet: n.summary || n.description })),
  ].filter((c, i, arr) => arr.findIndex((x) => x.ref === c.ref) === i)

  const g = picked[0] && ranked.find((x) => x.route.routeKey === picked[0].routeKey)?.gate
  return {
    answer, provider, model, mode: info.mode, mocked,
    plan: [routed.primary, ...routed.intents.filter((i) => i !== routed.primary)],
    steps, citations: used,
    critic: {
      verdict, grounded: check.grounded, recommended: g ? g.recommended : null,
      reasons: g ? [...g.reasons, ...g.warnings.map((w) => `warning: ${w}`)] : [],
      ungrounded: check.ungrounded,
    },
  }
}
