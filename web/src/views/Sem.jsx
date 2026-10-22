import React, { useEffect, useState } from 'react'
import { get, fmt, num } from '../lib.js'

export default function Sem() {
  const [sem, setSem] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => { get('/sem').then(setSem).catch((e) => setErr(e.message)) }, [])
  if (err) return <div className="card err">{err}</div>
  if (!sem) return <p className="muted">Loading SEM predictions…</p>
  const mapped = (sem.mapping || []).reduce((s, m) => s + m.images, 0)
  return (
    <>
      <div className="grid g4">
        <div className="card kpi"><div className="l">SEM images</div><div className="v">{fmt(sem.images)}</div><div className="h">U-Net, ResNet50 encoder</div></div>
        <div className="card kpi"><div className="l">Linked to a route</div><div className="v">{fmt((sem.byRoute || []).reduce((s, r) => s + r.images, 0))}</div><div className="h">of {fmt(mapped)} classified file names</div></div>
        <div className="card kpi"><div className="l">Routes with SEM</div><div className="v">{(sem.byRoute || []).length}</div><div className="h">QUW23 and Version 11 without group stay unmapped</div></div>
        <div className="card kpi warn"><div className="l">Cleavage-dominated routes</div><div className="v">{(sem.byRoute || []).filter((r) => r.cleavageDominatedPct >= 50).length}</div><div className="h">mean dimple area &lt; 50 %</div></div>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="hd">How images were linked</div>
          <table>
            <thead><tr><th>Mapping</th><th>Images</th></tr></thead>
            <tbody>{(sem.mapping || []).map((m) => <tr key={m.mapping}><td>{m.mapping}</td><td className="num">{fmt(m.images)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <div className="hd">Read this with lab ductility</div>
          <ul className="list">
            <li>Ductile fracture: dimples. Brittle martensite: cleavage facets and river patterns.</li>
            <li>SEM ductile % is the dimple area in the field of view. Lab ductility % is the mechanical test on the whole bar.</li>
            <li>Compare route ranking, not the absolute numbers. A high lab ductility with cleavage-dominated SEM needs a second look at sampling.</li>
            <li>File names carry version, group and often the temper (for example Group-F 240C).</li>
          </ul>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="hd">Ductile area by route</div>
        <table>
          <thead><tr><th>Route</th><th>Images</th><th>SEM ductile %</th><th>Std</th><th>Cleavage-dominated %</th></tr></thead>
          <tbody>
            {(sem.byRoute || []).map((r) => (
              <tr key={r.routeKey}>
                <td><b>{r.routeKey}</b></td>
                <td className="num">{fmt(r.images)}</td>
                <td className="num">{num(r.semDuctileMean)}</td>
                <td className="num">{num(r.semDuctileStd)}</td>
                <td className="num">{num(r.cleavageDominatedPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
