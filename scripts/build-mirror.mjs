// Builds data/mirror/*.json from the raw CSV files with the same rules as the
// Snowflake pipeline. The API serves this mirror when Snowflake is not configured
// (CI, local development) or not reachable. `npm run mirror:snowflake` replaces it
// with the real data products exported from Snowflake.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { parseAxle, parseSem } from './lib/parse.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const AXLE = process.env.AXLE_CSV || path.resolve(ROOT, '../DSML_Final_Project/data/axle_test_385000_samples.csv')
const SEM = process.env.SEM_CSV || path.resolve(ROOT, '../DSML_Final_Project/sem_output/all_predictions.csv')
const OUT = path.join(ROOT, 'data/mirror')

function splitCsv(line) {
  const out = []; let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur); return out
}

const r2 = (x) => (x === null || Number.isNaN(x) ? null : Math.round(x * 100) / 100)
const r4 = (x) => (x === null || Number.isNaN(x) ? null : Math.round(x * 10000) / 10000)

class Stat {
  constructor() { this.n = 0; this.sum = 0; this.sq = 0 }
  add(x) { this.n++; this.sum += x; this.sq += x * x }
  get mean() { return this.n ? this.sum / this.n : null }
  get std() { return this.n > 1 ? Math.sqrt(Math.max(0, (this.sq - (this.sum * this.sum) / this.n) / (this.n - 1))) : null }
}

class Corr {
  constructor() { this.n = 0; this.sx = 0; this.sy = 0; this.sxx = 0; this.syy = 0; this.sxy = 0 }
  add(x, y) { this.n++; this.sx += x; this.sy += y; this.sxx += x * x; this.syy += y * y; this.sxy += x * y }
  get r() {
    const { n, sx, sy, sxx, syy, sxy } = this
    const d = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
    return d ? (n * sxy - sx * sy) / d : null
  }
  get slope() { const { n, sx, sy, sxx, sxy } = this; const d = n * sxx - sx * sx; return d ? (n * sxy - sx * sy) / d : null }
  get intercept() { return this.slope === null ? null : (this.sy - this.slope * this.sx) / this.n }
}

async function axle() {
  const rl = readline.createInterface({ input: fs.createReadStream(AXLE, 'utf8'), crlfDelay: Infinity })
  let header = null
  const routes = new Map(), factors = new Map(), corr = {}, quality = { total: 0, hvOrder: 0, sum100: 0 }
  const temperFit = new Corr()
  const featureCorr = ['c', 'si', 'mn', 'p', 's', 'cr', 'ni', 'hv', 'bend']
  for (const f of featureCorr) corr[f] = new Corr()
  for await (const line of rl) {
    if (!header) { header = splitCsv(line.replace(/^\uFEFF/, '')); continue }
    if (!line.trim()) continue
    const cells = splitCsv(line); const raw = {}
    header.forEach((h, i) => { raw[h] = cells[i] })
    const x = parseAxle(raw)
    quality.total++
    if (x.hvMin > x.hv || x.hvMax < x.hv) quality.hvOrder++
    if (Math.abs(x.duct + x.brit - 100) > 0.1) quality.sum100++
    let r = routes.get(x.routeKey)
    if (!r) {
      r = { routeKey: x.routeKey, groupKey: x.groupKey, version: x.version, groupCode: x.group, press: x.press, routeLabel: x.route,
        seriesC: x.seriesC, seriesH: x.seriesH, addC: x.addC, addH: x.addH, vacuum: x.vacuum,
        hv: new Stat(), bend: new Stat(), duct: new Stat(), low: 0, x46: 0, dieCast: 0, d78: 0, s3: 0 }
      routes.set(x.routeKey, r)
    }
    r.hv.add(x.hv); r.bend.add(x.bend); r.duct.add(x.duct)
    if (x.duct < 23) r.low++
    if (x.material === 'X46CrS13') r.x46++
    if (x.dieCast) r.dieCast++
    if (x.diameter === 7.8) r.d78++
    if (x.samples === 3) r.s3++
    for (const [factor, level] of [['material', x.material], ['diameter', `${x.diameter} mm`], ['dieCast', x.dieCast ? 'Yes' : 'No'], ['samples', String(x.samples)]]) {
      const k = `${factor}|${level}`
      let f = factors.get(k)
      if (!f) { f = { factor, level, hv: new Stat(), bend: new Stat(), duct: new Stat() }; factors.set(k, f) }
      f.hv.add(x.hv); f.bend.add(x.bend); f.duct.add(x.duct)
    }
    for (const f of featureCorr) corr[f].add(x[f], x.duct)
    if (x.version === 6 && x.addC) temperFit.add(x.addC, x.duct)
  }
  const routeRows = [...routes.values()].map((r) => ({
    routeKey: r.routeKey, groupKey: r.groupKey, version: r.version, groupCode: r.groupCode, press: r.press, routeLabel: r.routeLabel,
    seriesC: r.seriesC, seriesH: r.seriesH, addC: r.addC, addH: r.addH, vacuum: r.vacuum,
    tests: r.hv.n, hv10Mean: r2(r.hv.mean), hv10Std: r2(r.hv.std), bendMean: r2(r.bend.mean), bendStd: r2(r.bend.std),
    ductMean: r2(r.duct.mean), ductStd: r2(r.duct.std), lowDuctSharePct: r2((100 * r.low) / r.hv.n),
    x46SharePct: r2((100 * r.x46) / r.hv.n), dieCastSharePct: r2((100 * r.dieCast) / r.hv.n),
    d78SharePct: r2((100 * r.d78) / r.hv.n), threeSampleSharePct: r2((100 * r.s3) / r.hv.n),
  })).sort((a, b) => a.routeKey.localeCompare(b.routeKey, 'en', { numeric: true }))
  const factorRows = [...factors.values()].map((f) => ({ factor: f.factor, level: f.level, tests: f.hv.n,
    hv10Mean: r2(f.hv.mean), bendMean: r2(f.bend.mean), ductMean: r2(f.duct.mean) }))
  const NAMES = { c: 'C_PCT', si: 'SI_PCT', mn: 'MN_PCT', p: 'P_PCT', s: 'S_PCT', cr: 'CR_PCT', ni: 'NI_PCT', hv: 'HV10_MEAN', bend: 'BEND_AVG_N' }
  const correlations = featureCorr.map((f) => ({ feature: NAMES[f], rWithDuctility: r4(corr[f].r) }))
  const tempering = { scope: 'Version 6, additional temper 180 to 240 °C for 1 h', tests: temperFit.n,
    slopePctPerC: r4(temperFit.slope), interceptPct: r2(temperFit.intercept), r: r4(temperFit.r) }
  return { routeRows, factorRows, correlations, tempering, quality }
}

async function sem() {
  const lines = fs.readFileSync(SEM, 'utf8').split(/\r?\n/).filter(Boolean)
  const header = splitCsv(lines.shift())
  const rows = lines.map((l) => { const c = splitCsv(l); const o = {}; header.forEach((h, i) => { o[h] = c[i] }); return o })
  const by = new Map(), mapping = {}
  for (const r of rows) {
    const p = parseSem(r.image_name)
    mapping[p.mapping] = (mapping[p.mapping] || 0) + 1
    if (!p.routeKey) continue
    let s = by.get(p.routeKey)
    if (!s) { s = { routeKey: p.routeKey, duct: new Stat(), cleavageDominated: 0 }; by.set(p.routeKey, s) }
    const d = Number(r.ductile_percentage)
    s.duct.add(d)
    if (d < 50) s.cleavageDominated++
  }
  return {
    images: rows.length, mapping: Object.entries(mapping).map(([mapping, images]) => ({ mapping, images })),
    byRoute: [...by.values()].map((s) => ({ routeKey: s.routeKey, images: s.duct.n, semDuctileMean: r2(s.duct.mean),
      semDuctileStd: r2(s.duct.std), cleavageDominatedPct: r2((100 * s.cleavageDominated) / s.duct.n) }))
      .sort((a, b) => a.routeKey.localeCompare(b.routeKey, 'en', { numeric: true })),
  }
}

const a = await axle()
const s = await sem()
fs.mkdirSync(OUT, { recursive: true })
const meta = { source: 'local mirror built from the raw CSV files with the pipeline rules', builtAt: new Date().toISOString() }
fs.writeFileSync(path.join(OUT, 'products.json'), JSON.stringify({ meta, routes: a.routeRows, factors: a.factorRows,
  correlations: a.correlations, tempering: a.tempering, dataQuality: { tests: a.quality.total, hvOrderViolations: a.quality.hvOrder, sumNot100: a.quality.sum100 }, sem: s }, null, 1))
console.log(`routes ${a.routeRows.length}, tests ${a.quality.total}, sem images ${s.images}`, s.mapping)
