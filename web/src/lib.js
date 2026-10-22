export async function get(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

export async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const fmt = (n) => Number(n).toLocaleString('en-US')
export const num = (n, d = 2) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d }))

function inline(s) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<i>$2</i>')
    .replace(/\[([A-Z0-9][A-Z0-9#._-]{2,60})\]/g, '<span class="ref">$1</span>')
}

export function md(text) {
  const out = []; let list = null
  const flush = () => { if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null } }
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue }
    const li = line.match(/^(?:[-*\u2022]|\d+[.)])\s+(.*)$/)
    if (li) { (list ||= []).push(`<li>${inline(li[1])}</li>`); continue }
    flush(); out.push(`<p>${inline(line)}</p>`)
  }
  flush()
  return out.join('')
}

export function viewFromHash() {
  return (location.hash.match(/^#\/(\w+)/) || [])[1] || 'overview'
}
