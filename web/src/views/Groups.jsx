import React, { useEffect, useState } from 'react'
import { get, fmt, num } from '../lib.js'

export default function Groups() {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { get('/groups').then(setRows).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="card err">{err}</div>
  if (!rows) return <p className="muted">Loading routes…</p>
  const maxDuct = Math.max(...rows.map((r) => r.ductMean))
  return (
    <>
      <div className="card">
        <div className="hd">
          Heat-treatment routes
          <span className="muted">WI-HT-4CR13 §5 · ductility ≥ 30 % · HV10 ≥ 600 · low-ductility share &lt; 5 %</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Route</th><th>Process</th><th>Tests</th><th>HV10</th><th>Bend N</th>
              <th>Ductility %</th><th>Low %</th><th>SEM ductile %</th><th>Gate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.routeKey}>
                <td><b>{r.routeKey}</b><div className="muted">V{r.version}{r.groupCode ? ` · ${r.groupCode}` : ''}{r.press ? ` · ${r.press}` : ''}</div></td>
                <td>{r.routeLabel}</td>
                <td className="num">{fmt(r.tests)}</td>
                <td className="num">{num(r.hv10Mean)}</td>
                <td className="num">{num(r.bendMean, 0)}</td>
                <td className="num">{num(r.ductMean)}</td>
                <td className="num">{num(r.lowDuctSharePct)}</td>
                <td className="num">{r.sem ? num(r.sem.semDuctileMean) : '—'}</td>
                <td>
                  <span className={`chip ${r.gate.recommended ? 'pos' : 'neg'}`}>{r.gate.recommended ? 'Recommended' : 'Blocked'}</span>
                  {r.gate.warnings.length ? <div className="muted">{r.gate.warnings[0]}</div> : null}
                  {r.gate.reasons[0] ? <div className="muted">{r.gate.reasons[0]}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Ductility ranking</div>
        {rows.map((r) => (
          <div className="barrow" key={r.routeKey}>
            <span>{r.routeKey}</span>
            <div className="track"><div className={`fill${r.gate.recommended ? ' gold' : r.ductMean < 23 ? ' neg' : ''}`} style={{ width: `${(100 * r.ductMean) / maxDuct}%` }} /></div>
            <b className="num">{num(r.ductMean)} %</b>
          </div>
        ))}
      </div>
      <p className="footer">Group B exists on two presses (Freund series-temper with no recorded temperature; Friulpress untempered). Version 11 longer soaks at 200 °C do not beat a single 240 °C hour in Version 6.</p>
    </>
  )
}
