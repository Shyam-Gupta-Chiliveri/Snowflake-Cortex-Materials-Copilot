import React, { useEffect, useRef, useState } from 'react'
import { get, post, esc, md } from '../lib.js'

const SUGGESTIONS = [
  'Can we release V6-F?',
  'Which heat-treatment route should we use?',
  'Compare V14 and V6-F',
  'Why is V6-A brittle?',
  'What does SEM show for Group F?',
  'Effect of tempering temperature',
  'Tell me about NCR-2026-012',
  'Open 8D for the vacuum re-temper',
]

function Answer({ d }) {
  const c = d.critic || {}
  const verdict = c.verdict === 'pass' ? <span className="chip pos">Critic: grounded</span>
    : c.verdict === 'revised' ? <span className="chip crit">Critic: LLM answer replaced</span>
      : <span className="chip neg">Critic: blocked</span>
  const rec = c.recommended === true ? <span className="chip pos">Recommended</span>
    : c.recommended === false ? <span className="chip neg">Not recommended</span> : null
  const total = (d.steps || []).reduce((a, s) => a + (s.ms || 0), 0)
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: md(d.answer) }} />
      <div className="meta">
        {rec}{verdict}
        <span className="chip ghost">{esc(d.provider)}{d.model ? ` · ${d.model}` : ''}</span>
        {d.mocked ? <span className="chip crit">Cortex mocked</span> : null}
      </div>
      <details>
        <summary>How I got this: {(d.steps || []).length} steps, {total} ms</summary>
        <ul className="steps">
          {(d.steps || []).map((s, i) => (
            <li key={i}>
              <span className="n">{i + 1}</span>
              <span><b>{s.agent}</b> <span className="tool">{s.tool} · {s.ms} ms</span><br />{s.summary}</span>
            </li>
          ))}
        </ul>
      </details>
      {d.citations?.length ? (
        <details>
          <summary>Sources ({d.citations.length})</summary>
          <ul className="cites">
            {d.citations.map((x) => <li key={x.ref}><b>{x.ref}</b> {x.title} <i>({x.kind})</i></li>)}
          </ul>
        </details>
      ) : null}
    </>
  )
}

export default function Chat() {
  const [health, setHealth] = useState(null)
  const [kpis, setKpis] = useState(null)
  const [messages, setMessages] = useState([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef(null)

  useEffect(() => {
    get('/health').then(setHealth).catch(() => {})
    get('/kpis').then(setKpis).catch(() => {})
  }, [])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function ask(question) {
    const text = String(question || q).trim()
    if (!text || busy) return
    setQ('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', text }])
    try {
      const d = await post('/ask', { question: text })
      setMessages((m) => [...m, { role: 'bot', d }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', error: e.message }])
    }
    setBusy(false)
  }

  return (
    <div className="grid g-copilot">
      <div className="stack">
        <div className="card">
          <div className="hd">What the copilot can see</div>
          <ul className="list">
            <li>{kpis ? `${kpis.tests.toLocaleString()} axle tests across ${kpis.routeCount} heat-treatment routes.` : 'Route quality, SEM and NCRs from the local mirror or Snowflake MART.'}</li>
            <li>Release gate from WI-HT-4CR13 §5: 30 % ductility, 600 HV10, &lt;5 % of tests below 23 %.</li>
            <li>SEM U-Net ductile vs cleavage area, linked to routes by file name.</li>
            <li>8D NCRs. Open ones can be previewed as a ServiceNow incident.</li>
            <li>Cortex {health?.cortex === 'mocked' ? 'is mocked locally' : `model ${health?.cortex || '…'}`}; the critic still checks every number.</li>
          </ul>
        </div>
        <div className="card">
          <div className="hd">Try these</div>
          <div className="bd" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn ghost" type="button" onClick={() => ask(s)}>{s}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="joule">
        <div className="jhead">
          <div className="t"><span className="spark">✦</span> Cortex materials copilot</div>
          <div className="d">4Cr13 / X46CrS13 · HV10 · SEM · 8D · {health?.mode === 'snowflake' ? 'Snowflake' : 'local mirror'}</div>
        </div>
        <div className="msgs">
          {messages.length === 0 && !busy ? (
            <div className="msg bot"><p>Ask about a route, a tempering temperature, SEM, or an NCR. Decisions come from the gate; I only explain them.</p></div>
          ) : null}
          {messages.map((m, i) => m.role === 'user'
            ? <div className="msg user" key={i}>{m.text}</div>
            : <div className="msg bot" key={i}>{m.error ? <p>Sorry: {m.error}</p> : <Answer d={m.d} />}</div>)}
          {busy ? <div className="msg bot"><span className="typing">Routing, retrieving, gating</span></div> : null}
          <div ref={bottom} />
        </div>
        <div className="suggest">
          {SUGGESTIONS.slice(0, 4).map((s) => (
            <button key={s} type="button" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
        <form className="ask" onSubmit={(e) => { e.preventDefault(); ask() }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about V14, V6-F, SEM, NCR-2026-012…" maxLength={2000} />
          <button className="btn" type="submit" disabled={busy}>Ask</button>
        </form>
      </div>
    </div>
  )
}
