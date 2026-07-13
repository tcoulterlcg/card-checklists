// Build public/data/rpa-index.json — the RPA Tracker dataset. Scans every set
// for premium-hit sections (autograph / patch / relic) and emits one compact,
// dictionary-encoded row per card, classified by type with its serial print
// run pulled from the section odds.
//   rows: [ player, number, slugId, type, serial ]   type: RPA|PA|RA|AU|PATCH|RELIC
//   node scripts/build-rpa-index.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const skip = new Set(['index.json', 'search-index.json', 'patch-swaps.json', 'rpa-index.json'])

function classifyType(title) {
  const t = (title || '').toLowerCase()
  const auto = /\bauto|autograph|signature|signing|\bink\b|dual sig|triple sig/.test(t)
  const patch = /\bpatch|laundry tag|nameplate|logo ?man/.test(t)
  const rookie = /\brookie|\brc\b|\brpa\b|first bowman|1st bowman|debut/.test(t)
  const relic = /relic|memorabilia|material|jersey|swatch|game.?used|game.?worn|threads|fabric|\bgu\b|button/.test(t)
  if (/\brpa\b/.test(t) || (rookie && patch && auto)) return 'RPA'
  if (patch && auto) return 'PA'
  if (rookie && auto) return 'RA'
  if (auto) return 'AU'
  if (patch) return 'PATCH'
  if (relic) return 'RELIC'
  return null
}

function serialOf(odds) {
  if (!odds) return ''
  const m = odds.match(/#\/\s*([\d,]+)/)
  if (m) return '/' + m[1].replace(/,/g, '')
  if (/1\/1|one-of-one/i.test(odds)) return '1/1'
  return ''
}

const slugs = [], slugId = new Map()
const intern = (v) => { if (slugId.has(v)) return slugId.get(v); const id = slugs.length; slugs.push(v); slugId.set(v, id); return id }

const rows = []
const byType = {}
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || skip.has(f)) continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch (e) { continue }
  const sid = intern(s.slug)
  for (const sec of (s.sections || [])) {
    const type = classifyType(sec.title)
    if (!type) continue
    const serial = serialOf(sec.odds)
    for (const c of sec.cards) {
      rows.push([c.p, c.n, sid, type, serial])
      byType[type] = (byType[type] || 0) + 1
    }
  }
}
writeFileSync(new URL('rpa-index.json', dataDir), JSON.stringify({ slugs, rows }))
console.log('rpa index:', rows.length.toLocaleString(), 'hit cards across', slugs.length, 'sets')
console.log('by type:', JSON.stringify(byType))
