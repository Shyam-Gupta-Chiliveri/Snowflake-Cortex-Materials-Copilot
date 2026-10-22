import React, { useEffect, useState } from 'react'
import { get, num } from '../lib.js'

export default function Anomalies() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { get('/anomalies').then(setData).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="card err">{err}</div>
  if (!data) return <p className="muted">Loading NCRs…</p>
  return (
    <>
      <div className="grid g3">
        <div className={`card kpi ${data.openNcrs.length ? 'warn' : ''}`}>
          <div className="l">Open NCRs</div>
          <div className="v">{data.openNcrs.length}</div>
          <div className="h">8D if the defect reached a customer</div>
        </div>
        <div className="card kpi bad">
          <div className="l">Routes failing the gate</div>
          <div className="v">{data.failingRoutes.length}</div>
          <div className="h">below 30 % ductility, 600 HV10, or 5 % low-duct share</div>
        </div>
        <div className="card kpi">
          <div className="l">Cleavage-dominated SEM</div>
          <div className="v">{data.cleavage.length}</div>
          <div className="h">routes with mean dimple area under 50 %</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Open nonconformances</div>
        <table>
          <thead><tr><th>NCR</th><th>Route</th><th>Part</th><th>Opened</th><th>Category</th><th>Summary</th></tr></thead>
          <tbody>
            {data.openNcrs.map((n) => (
              <tr key={n.ncrId}>
                <td><b>{n.ncrId}</b><div className="muted">{n.severity || n.status}</div></td>
                <td>{n.routeKey}</td>
                <td>{n.part}</td>
                <td className="num">{n.openedOn}</td>
                <td>{n.category}</td>
                <td>{n.summary || n.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Blocked routes</div>
        <table>
          <thead><tr><th>Route</th><th>Ductility %</th><th>HV10</th><th>Low %</th><th>Reasons</th></tr></thead>
          <tbody>
            {data.failingRoutes.map((r) => (
              <tr key={r.routeKey}>
                <td><b>{r.routeKey}</b><div className="muted">{r.routeLabel}</div></td>
                <td className="num">{num(r.ductMean)}</td>
                <td className="num">{num(r.hv10Mean)}</td>
                <td className="num">{num(r.lowDuctSharePct)}</td>
                <td>{r.reasons.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Closed NCRs <span className="muted">illustrative 8D record</span></div>
        <table>
          <thead><tr><th>NCR</th><th>Route</th><th>Status</th><th>Category</th><th>Description</th></tr></thead>
          <tbody>
            {data.closedNcrs.map((n) => (
              <tr key={n.ncrId}>
                <td><b>{n.ncrId}</b></td>
                <td>{n.routeKey}</td>
                <td><span className="chip ghost">{n.status}</span></td>
                <td>{n.category}</td>
                <td>{n.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="footer">NCR texts were written for this demo so Cortex CLASSIFY_TEXT / SUMMARIZE and 8D have something to read. They are not plant records.</p>
    </>
  )
}
