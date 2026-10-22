import React, { useEffect, useState } from 'react'
import { get, post } from '../lib.js'

export default function ServiceNow() {
  const [an, setAn] = useState(null)
  const [ncrId, setNcrId] = useState('NCR-2026-012')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    get('/anomalies').then((d) => {
      setAn(d)
      const first = d.openNcrs[0]?.ncrId || d.ncrs[0]?.ncrId
      if (first) setNcrId(first)
    }).catch((e) => setErr(e.message))
  }, [])

  useEffect(() => {
    if (!ncrId) return
    get(`/servicenow?ncr=${encodeURIComponent(ncrId)}`).then((d) => setPreview(d.preview)).catch((e) => setErr(e.message))
  }, [ncrId])

  async function create() {
    setBusy(true); setResult(null)
    try { setResult(await post('/servicenow', { ncrId })) } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  if (err && !an) return <div className="card err">{err}</div>
  const ncrs = an ? [...an.openNcrs, ...an.closedNcrs] : []

  return (
    <>
      <div className="hero">
        <div className="eyebrow">ITSM stub</div>
        <h2>Preview the ServiceNow incident for an NCR</h2>
        <p>
          NCRs that block delivery, or that need a change in the test system, are raised as incidents with the NCR number in the short description (PR-8D §4).
          This screen shows the payload. Nothing is posted unless SERVICENOW_INSTANCE, SERVICENOW_USER and SERVICENOW_PASSWORD are set.
        </p>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="hd">Choose an NCR</div>
          <div className="bd">
            <label className="muted">NCR
              <select value={ncrId} onChange={(e) => setNcrId(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 6, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--line2)', borderRadius: 9, padding: '8px 10px' }}>
                {ncrs.map((n) => <option key={n.ncrId} value={n.ncrId}>{n.ncrId} · {n.routeKey} · {n.status}</option>)}
              </select>
            </label>
            <p className="muted" style={{ marginTop: 12 }}>{preview?.ncr?.description}</p>
            <button className="btn" type="button" disabled={busy || !preview} onClick={create}>
              {busy ? 'Sending…' : 'Create incident (stub)'}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="hd">Payload that would be POSTed to /api/now/table/incident</div>
          {preview ? <pre>{JSON.stringify(preview.payload, null, 2)}</pre> : <p className="muted bd">Select an NCR.</p>}
          {result ? (
            <div className="bd">
              <span className={`chip ${result.created ? 'pos' : 'crit'}`}>{result.created ? 'Created' : 'Stub — not sent'}</span>
              {result.payload?.number ? <span className="chip ghost">{result.payload.number}</span> : null}
              <p className="muted">{result.message || result.warning || result.error || (result.created ? 'Incident opened.' : '')}</p>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
