// ServiceNow stub: always builds a fictional incident payload. If instance
// credentials are set it attempts a real POST and still returns the payload.

function nextNumber() {
  const n = 10000 + Math.floor(Math.random() * 89999)
  return `INC00${n}`
}

export function buildIncident({ ncrId, routeKey, shortDescription, description, urgency = '2', severity } = {}) {
  const number = nextNumber()
  return {
    number,
    sys_id: `demo-${number.toLowerCase()}`,
    short_description: shortDescription || `Materials quality: ${ncrId || routeKey || 'anomaly'}`,
    description: description || 'Opened by the materials quality copilot (demo payload).',
    urgency,
    impact: severity === 'critical' ? '1' : '2',
    category: 'Quality',
    subcategory: 'Heat treatment',
    assignment_group: 'Materials Quality Engineering',
    caller_id: 'MATERIALS_COPILOT',
    correlation_id: ncrId || routeKey || null,
    correlation_display: ncrId || routeKey || null,
    company: 'PeakSoft demo',
    opened_at: new Date().toISOString(),
  }
}

export async function createIncident(cfg, body) {
  const payload = buildIncident(body)
  const sn = cfg.servicenow
  if (sn.instance && sn.user && sn.password) {
    try {
      const url = `${sn.instance.replace(/\/$/, '')}/api/now/table/incident`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sn.user}:${sn.password}`).toString('base64')}`,
          'Content-Type': 'application/json', Accept: 'application/json',
        },
        body: JSON.stringify({
          short_description: payload.short_description,
          description: payload.description,
          urgency: payload.urgency, impact: payload.impact,
          category: payload.category, correlation_id: payload.correlation_id,
        }),
        signal: AbortSignal.timeout(8000),
      })
      if (res.ok) {
        const data = await res.json()
        return { mode: 'servicenow', label: 'Live', payload: { ...payload, ...data.result } }
      }
      return { mode: 'stub', label: 'Artifact', payload, warning: `ServiceNow HTTP ${res.status}; returning demo payload` }
    } catch (e) {
      return { mode: 'stub', label: 'Artifact', payload, warning: `ServiceNow unreachable: ${String(e.message).slice(0, 140)}` }
    }
  }
  return { mode: 'stub', label: 'Artifact', payload, warning: 'No ServiceNow credentials; demo incident only' }
}
