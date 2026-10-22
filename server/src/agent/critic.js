// Critic for LLM answers: every number must come from the facts, every citation
// must point to a retrieved source, numbers may not be spelled out, and the first
// sentence must agree with the decision the rules computed.

const NUM = /(?<![A-Za-z0-9-])\d+(?:[.,]\d+)?(?![A-Za-z0-9-]*\d)/g
const SPELLED = /\b(eleven|twelve|(?:thir|four|fif|six|seven|eigh|nine)teen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million)\b/i

export function normalise(text) {
  return String(text)
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/(\d)[\u00a0\u202f\u2009 ,'](?=\d{3}(?!\d))/g, '$1')
}

export function numbersIn(text) {
  NUM.lastIndex = 0
  return [...normalise(text).matchAll(NUM)].map((m) => m[0].replace(',', '.'))
}

export function grounding(answer, factTexts, question = '') {
  const pool = new Set()
  for (const t of [...factTexts, question]) for (const tok of normalise(t).match(/\d+(?:[.,]\d+)?/g) || []) pool.add(tok.replace(',', '.'))
  const poolNums = [...pool].map(Number)
  const ungrounded = []
  for (const s of numbersIn(String(answer).replace(/\[[^\]]*\]/g, ' '))) {
    const a = Number(s)
    if (pool.has(s) || (Number.isInteger(a) && a <= 10)) continue
    const dp = (s.split('.')[1] || '').length
    if (!poolNums.some((f) => Number(f.toFixed(dp)) === a)) ungrounded.push(s)
  }
  const spelled = String(answer).match(SPELLED)
  if (spelled) ungrounded.push(`number written as a word: ${spelled[0]}`)
  return { grounded: ungrounded.length === 0, ungrounded: [...new Set(ungrounded)] }
}

export function citations(answer, knownRefs) {
  const known = new Set(knownRefs.map((r) => r.toUpperCase()))
  const cited = [...String(answer).matchAll(/\[([^\]]{2,60})\]/g)].flatMap((m) => m[1].split(/[;,]\s*/)).map((s) => s.trim())
  const unknown = cited.filter((c) => !known.has(c.toUpperCase()))
  return { cited: cited.length, unknown: [...new Set(unknown)] }
}

const NEGATIVE = /\b(not|no|cannot|can't|do not|don't|isn't|fails?|failing|below|blocked|hold)\b/i

// expected: { recommended: boolean } for a single route, or { topRoute: 'V14' } for a ranking.
export function stance(answer, expected) {
  if (!expected) return { ok: true }
  const head = (String(answer).split(/(?<=[.!?])\s|\n/).find((l) => l.trim()) || '')
  if (expected.topRoute) {
    const ok = head.toUpperCase().includes(expected.topRoute.toUpperCase())
    return { ok, reason: ok ? null : `first sentence does not name the top route ${expected.topRoute}` }
  }
  const negative = NEGATIVE.test(head)
  const ok = expected.recommended ? !/\bnot recommended|fails?\b/i.test(head) : negative
  return { ok, reason: ok ? null : `first sentence contradicts the rule decision (${expected.recommended ? 'recommended' : 'not recommended'})` }
}
