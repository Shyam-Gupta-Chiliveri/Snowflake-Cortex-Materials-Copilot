// Same parsing rules as snowflake/sql/02_curated.sql. Used to build the local
// mirror and to check parity with the Snowflake data products.

export function groupKey(testGroup) {
  const version = Number((testGroup.match(/Version-(\d+)/) || [])[1])
  const group = (testGroup.match(/Group ([A-I])/) || [])[1] || null
  const press = ((testGroup.match(/\((Friulpress|Freund)\)/) || [])[1] || '').toUpperCase() || null
  const sample = Number((testGroup.match(/Sample (\d+)/) || [])[1]) || null
  const key = `V${version}${group ? `-${group}` : ''}${press ? `-${press}` : ''}`
  return { key, version, group, press, sample }
}

export function temper(raw) {
  const s = String(raw || '').trim()
  if (!s || s === 'No') return { c: null, h: null, unspecified: false, vacuum: false }
  const vacuum = /^vac/i.test(s)
  const c = Number((s.match(/(\d{3})\s*°?\s*C/i) || [])[1]) || null
  const h = Number((s.match(/(\d+)\s*h/i) || [])[1]) || null
  return { c, h, unspecified: s === 'Yes', vacuum }
}

export function routeLabel(series, add) {
  const parts = []
  if (series.vacuum) parts.push(`Vacuum hardening, ${series.c} °C`)
  else if (series.unspecified) parts.push('Series temper (temperature not recorded)')
  else if (series.c) parts.push(`Series temper ${series.c} °C / ${series.h} h`)
  if (add.c) parts.push(`${parts.length ? '+ ' : 'Temper '}${add.c} °C / ${add.h} h`)
  return parts.length ? parts.join(' ') : 'Untempered (as quenched)'
}

export function routeKey(gk, series, add) {
  return gk + (series.vacuum && add.c ? '-RT' : '')
}

export function parseAxle(r) {
  const g = groupKey(r['Testing Group'])
  const series = temper(r['Series Tempering'])
  const add = temper(r['Additional Tempering'])
  return {
    groupKey: g.key, routeKey: routeKey(g.key, series, add), version: g.version, group: g.group, press: g.press,
    material: r.Material, dieCast: r['Die-casting'] === 'Yes', samples: Number(r.Samples),
    diameter: /7\.8/.test(r.Diameter) ? 7.8 : 8.0,
    c: +r['C [%]'], si: +r['Si [%]'], mn: +r['Mn [%]'], p: +r['P [%]'], s: +r['S [%]'], cr: +r['Cr [%]'], ni: +r['Ni [%]'],
    seriesC: series.c, seriesH: series.h, seriesUnspecified: series.unspecified, vacuum: series.vacuum, addC: add.c, addH: add.h,
    route: routeLabel(series, add),
    hv: +r['Mean HV10'], hvMin: +r['Min HV10'], hvMax: +r['Max HV10'],
    bend: +r['Avg Bending Force (N)'], bendMin: +r['Min Bending Force (N)'], bendMax: +r['Max Bending Force (N)'],
    duct: +r['Ductility %'], brit: +r['Brittleness %'],
  }
}

// SEM image names, e.g. "Version-6 Part 1 Group-F 240C-h9_filtered_zoom15_compressed.tif"
export function parseSem(name) {
  const version = Number((name.match(/Version-(\d+)/) || [])[1]) || null
  const group = (name.match(/Group-([A-I])/) || [])[1] || null
  const tempC = Number((name.match(/(\d{3})C/) || [])[1]) || null
  let routeKey = null, mapping = 'unmapped'
  if (/QUW23/.test(name)) mapping = 'other campaign (QUW23)'
  else if (/^Group-F-240C/.test(name)) { routeKey = 'V6-F'; mapping = 'inferred from group and temperature' }
  else if (version === 6 && group === 'B' && /Friulpress/i.test(name)) { routeKey = 'V6-B-FRIULPRESS'; mapping = 'file name' }
  else if (version === 6 && group) { routeKey = `V6-${group}`; mapping = 'file name' }
  else if (version === 14) { routeKey = /Retemper/i.test(name) ? 'V14-RT' : 'V14'; mapping = 'file name' }
  else if (version === 11) mapping = 'version 11 without group'
  return { version, group, tempC, routeKey, mapping }
}
