// BM25 over the knowledge base and NCR texts. Used only by the local mirror; in
// Snowflake mode retrieval is done by the Cortex Search service.

export const INJECTION = /(ignore (all|any|the)? ?(previous|prior|above)? ?(instructions|rules)|system prompt|reveal .*(key|secret|password)|api[ _-]?key|disregard (the|all|previous))/i

const STOP = new Set(('a an and are as at be by for from has have in is it of on or that the this to was were will with ' +
  'what why how which who when where do does did can could should we our i you me my per not no than then there these those').split(' '))

export function tokens(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9.]+/).map((t) => t.replace(/^\.+|\.+$/g, ''))
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, '') : t))
}

export function parseDoc(raw, fallbackId) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  const meta = {}
  if (m) for (const line of m[1].split('\n')) { const [k, ...v] = line.split(':'); meta[k.trim()] = v.join(':').trim() }
  return { id: meta.id || fallbackId, title: meta.title || fallbackId, category: meta.category || 'Document', body: (m ? m[2] : raw).trim() }
}

export class Retriever {
  constructor() { this.chunks = []; this.k1 = 1.4; this.b = 0.75 }

  add(c) { if (!INJECTION.test(c.text)) this.chunks.push({ ...c, toks: tokens(`${c.title} ${c.text}`) }) }

  addDoc(doc) {
    doc.body.split(/\n(?=## )/).map((s) => s.trim()).filter(Boolean)
      .forEach((text, i) => this.add({ ref: `${doc.id}#${i + 1}`, title: doc.title, kind: doc.category, text }))
  }

  build() {
    const N = this.chunks.length
    this.df = new Map()
    for (const c of this.chunks) for (const t of new Set(c.toks)) this.df.set(t, (this.df.get(t) || 0) + 1)
    this.avg = this.chunks.reduce((a, c) => a + c.toks.length, 0) / Math.max(N, 1)
    this.idf = (t) => { const n = this.df.get(t) || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)) }
    return this
  }

  search(query, k = 5) {
    const q = new Set(tokens(query))
    return this.chunks.map((c) => {
      const tf = new Map()
      for (const t of c.toks) tf.set(t, (tf.get(t) || 0) + 1)
      let s = 0
      for (const t of q) {
        const f = tf.get(t)
        if (f) s += this.idf(t) * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * c.toks.length) / this.avg)))
      }
      return { c, s }
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k)
      .map(({ c, s }) => ({ ref: c.ref, title: c.title, kind: c.kind, text: c.text, score: Number(s.toFixed(3)) }))
  }
}
