import React, { useEffect, useState } from 'react'
import { get, fmt, num } from '../lib.js'

const STEPS = [
  ['01', 'Ingest', 'PUT + COPY of 385,000 axle tests, SEM U-Net, NCRs', '#/groups'],
  ['02', 'Curate', 'Dynamic tables parse route, chemistry, HV10, ductility', '#/groups'],
  ['03', 'Retrieve', 'Cortex Search over procedures and 8D texts (BM25 locally)', '#/chat'],
  ['04', 'Gate', 'WI-HT-4CR13 §5 in code: 30 % ductility, 600 HV10, <5 % low', '#/groups'],
  ['05', 'Answer', 'Cortex COMPLETE, critic-checked; mocked when disconnected', '#/chat'],
]

const CAPS = [
  ['Cortex Search', 'Hybrid retrieval over work instructions, SEM guide and NCRs.'],
  ['Cortex COMPLETE', 'LLM writes the answer from retrieved facts. Mocked locally.'],
  ['Snowflake ML', 'Ductility-band classifier from process and chemistry only.'],
  ['Dynamic tables', 'MART.ROUTE_QUALITY and SEM stay in sync with the raw CSV.'],
  ['Release gate', 'Decisions in code. The model explains; it never overrides.'],
  ['Key-pair auth', 'Service users, no passwords. Private keys stay in keys/.'],
]

export default function Overview() {
  const [kpis, setKpis] = useState(null)
  const [groups, setGroups] = useState([])
  const [pipe, setPipe] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    Promise.all([get('/kpis'), get('/groups'), get('/pipeline')])
      .then(([k, g, p]) => { setKpis(k); setGroups(g); setPipe(p) })
      .catch((e) => setErr(e.message))
  }, [])

  if (err) return <div className="card err">Could not load overview: {err}. Start the API with <code>npm start</code>.</div>
  if (!kpis) return <p className="muted">Loading 4Cr13 quality products…</p>

  const maxDuct = Math.max(...groups.map((g) => g.ductMean), 1)
  const layers = {}
  for (const o of pipe?.objects || []) (layers[o.layer] ||= []).push(o)

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Snowflake Cortex · Materials Quality</div>
        <h2>Heat-treatment copilot for 4Cr13 axle steel</h2>
        <p>
          {fmt(kpis.tests)} HV10 and three-point bending tests, {fmt(kpis.semImages)} SEM fracture images labelled ductile or brittle,
          and 8D nonconformances — queried in English, grounded on Snowflake data products, gated by WI-HT-4CR13.
        </p>
        <div className="cta">
          <a className="btn" href="#/chat">Ask the copilot</a>
          <a className="btn ghost" href="#/groups">Compare groups</a>
          <a className="btn ghost" href="#/sem">Open SEM</a>
          <span className="chip artifact">Artifact · local mirror</span>
          <span className="chip target">Target · live Cortex</span>
        </div>
      </div>

      <div className="grid g4" style={{ marginTop: 16 }}>
        <div className="card kpi good">
          <div className="l">Recommended route</div>
          <div className="v" style={{ fontSize: 24, marginTop: 8 }}>{kpis.recommended}</div>
          <div className="h">{kpis.recommendedLabel}</div>
        </div>
        <div className="card kpi">
          <div className="l">Mean ductility / HV10</div>
          <div className="v">{num(kpis.ductMean)}<small>% / {num(kpis.hv10Mean)}</small></div>
          <div className="h">on {kpis.recommended} · gate WI-HT-4CR13 §5</div>
        </div>
        <div className={`card kpi ${kpis.openNcrs ? 'warn' : ''}`}>
          <div className="l">Open NCRs</div>
          <div className="v">{kpis.openNcrs}</div>
          <div className="h">{kpis.failingRoutes} routes fail the release gate</div>
        </div>
        <div className="card kpi">
          <div className="l">Tests · SEM images</div>
          <div className="v">{fmt(kpis.tests)}<small>/ {fmt(kpis.semImages)}</small></div>
          <div className="h">HV order violations {kpis.hvOrderViolations}, sum≠100 {kpis.sumNot100}</div>
        </div>
      </div>

      <h3 style={{ margin: '26px 2px 12px', fontSize: 15 }}>From CSV to a grounded answer</h3>
      <div className="journey">
        {STEPS.map(([n, t, d, href]) => (
          <a className="step" href={href} key={n}><div className="n">{n}</div><b>{t}</b><span>{d}</span></a>
        ))}
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="hd">Ductility by route <span className="muted">gold = recommended</span></div>
          {groups.map((g) => (
            <div className="barrow" key={g.routeKey}>
              <span>{g.routeKey}</span>
              <div className="track"><div className={`fill${g.gate.recommended ? ' gold' : g.ductMean < 23 ? ' neg' : ''}`} style={{ width: `${(100 * g.ductMean) / maxDuct}%` }} /></div>
              <b className="num">{num(g.ductMean)} %</b>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="hd">What this workbench is</div>
          <ul className="list">
            <li>Same 4Cr13 axle story as the SAP quality copilot: HV10, bending, SEM dimples vs cleavage, 8D.</li>
            <li>Tempering from 180 to 240 °C raises ductility by {num(kpis.temperingSlope, 4)} points per °C (Version 6).</li>
            <li>Vacuum hardening at 230 °C (V14) is the series candidate; extra re-temper (V14-RT) adds nothing.</li>
            <li>Untempered V6-A / Friulpress B are hard and brittle — not releasable.</li>
            <li>Serving <b>{kpis.source}</b>. Cortex {kpis.llm || 'mocked'} · search {kpis.search}.</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Snowflake building blocks</div>
        <div className="caps">
          {CAPS.map(([t, d]) => (
            <div className="cap" key={t}><div className="t">{t}</div><p>{d}</p></div>
          ))}
        </div>
      </div>

      {pipe?.objects ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="hd">Pipeline lineage <span className="muted">{pipe.objects.length} objects</span></div>
          {Object.entries(layers).map(([layer, items]) => (
            <div className="layer" key={layer}>
              <div className="ln">{layer}</div>
              <div className="items">
                {items.map((o) => (
                  <div className="box" key={o.id}><b>{o.id}</b><span className="muted">{o.type} · {o.what}</span></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Related live apps <span className="muted">same 4Cr13 story, not merged here</span></div>
        <div className="caps">
          <div className="cap"><div className="t">Agentic AI <span className="chip live">Live</span></div><p><a href="https://138.2.179.154.sslip.io" target="_blank" rel="noreferrer">138.2.179.154.sslip.io</a> — multi-agent materials assistant.</p></div>
          <div className="cap"><div className="t">SEM classifier <span className="chip live">Live</span></div><p><a href="https://sem.138.2.179.154.sslip.io" target="_blank" rel="noreferrer">sem.138.2.179.154.sslip.io</a> — U-Net ductile / brittle maps.</p></div>
          <div className="cap"><div className="t">RAG <span className="chip live">Live</span></div><p><a href="https://rag.138.2.179.154.sslip.io" target="_blank" rel="noreferrer">rag.138.2.179.154.sslip.io</a> — standards / thesis retrieval.</p></div>
          <div className="cap"><div className="t">SAP workbench <span className="chip live">Live</span></div><p><a href="https://quality.138.2.179.154.sslip.io" target="_blank" rel="noreferrer">quality.138.2.179.154.sslip.io</a> — CAP + Gen AI Hub quality copilot.</p></div>
        </div>
      </div>
      <p className="footer">Demo release limits in WI-HT-4CR13 §5 are project criteria, not a standard. NCR texts are illustrative. The 67 MB axle CSV is not in git. VM deploy of this copilot is Target and needs approval.</p>
    </>
  )
}
