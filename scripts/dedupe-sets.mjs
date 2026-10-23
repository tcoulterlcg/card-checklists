// Merge duplicate sets, keeping one copy of each product and redirecting the rest
// (old -> kept slug in public/data/redirects.json) so links and wantlists keep working.
//
// Pass 1 — same sport + same normalized display name (run after normalize-names.mjs).
// Pass 2 — near-duplicates: the same product imported from two sources under
//   slightly different names ("2021-22 Upper Deck Marvel Annual" vs "… Checklist",
//   "2016 Tim Hortons Hockey" vs "2016-17 Upper Deck Tim Hortons"). Same sport,
//   same first year, same name words, AND ≥90% of the smaller copy's cards
//   (number + surname) are on the larger one. Often one copy is badly incomplete
//   (154 vs 2,167 cards), which shows as a hole on the site. A bulk-catalog TCDB
//   set (../catalog, if checked out) can be the copy kept; only static files are
//   ever deleted.
//
// Keeps the copy with the most cards (ties: Break Ninja > TCDB > checklistcenter >
// cardboardconnection).
//   node scripts/dedupe-sets.mjs [--dry-run] [--catalog ../catalog]
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const ci = process.argv.indexOf('--catalog')
const catalogDir = ci > 0 ? process.argv[ci + 1] : new URL('../../catalog', import.meta.url).pathname
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const RANK = { 'breakninja.com': 4, 'tcdb.com': 3, 'checklistcenter.com': 2, 'cardboardconnection.com': 1 }
const HIDDEN = new Set(['sportscardspro.com'])   // never kept as "the" copy (see lib/catalog.js)
const order = (a, b) => b.n - a.n || (b.secs - a.secs) || (RANK[b.src] || 0) - (RANK[a.src] || 0)

const sets = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  let s; try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.name || !s.sport || s.incomplete) continue
  sets.push({ slug: s.slug, name: s.name, sport: s.sport, src: s.source, n: (s.sections || []).reduce((a, x) => a + (x.cards || []).length, 0), secs: (s.sections || []).length, file: new URL(f, dataDir), static: true })
}

const redirectsPath = new URL('redirects.json', dataDir)
const redirects = existsSync(redirectsPath) ? JSON.parse(readFileSync(redirectsPath, 'utf8')) : {}
const gone = new Set()
let removed = 0
const drop = (d, keep, why) => {
  if (!d.static || gone.has(d.slug)) return
  if (DRY) console.log(why, ':', d.slug, `(${d.n})`, '->', keep.slug, `(${keep.n})`)
  else { unlinkSync(d.file); redirects[d.slug] = keep.slug }
  gone.add(d.slug); removed++
}

// Pass 1: identical names.
const groups = new Map()
for (const s of sets) {
  const k = s.sport + '|' + s.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  ;(groups.get(k) || groups.set(k, []).get(k)).push(s)
}
for (const list of groups.values()) {
  if (list.length < 2) continue
  list.sort(order)
  for (const d of list.slice(1)) drop(d, list[0], 'same name')
}

// Pass 2: near-duplicates, confirmed by their cards.
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
const catFile = (slug) => join(catalogDir, 'sets', (fnv(slug) & 0xff).toString(16).padStart(2, '0'), slug + '.json')
const pool = sets.filter(s => !gone.has(s.slug))
if (existsSync(join(catalogDir, 'index'))) {
  const have = new Set(pool.map(s => s.slug))
  for (const f of readdirSync(join(catalogDir, 'index'))) {
    for (const s of JSON.parse(readFileSync(join(catalogDir, 'index', f), 'utf8')).sets || []) {
      if (HIDDEN.has(s.source) || have.has(s.slug)) continue
      pool.push({ slug: s.slug, name: s.name, sport: s.sport, src: s.source, n: s.cardCount || 0, secs: s.sections || 0, file: catFile(s.slug), static: false })
    }
  }
}
const STOP = new Set('and the card cards trading checklist checklists edition set sets mlb nba nfl nhl mma hobby baseball basketball football hockey soccer racing wrestling golf tennis boxing ufc entertainment ud upper deck panini topps'.split(' '))
const nameKey = (name) => {
  const n = name.toLowerCase()
  const m = n.match(/^\s*(\d{4})(?:[-/]\d{2,4})?/)
  // "Topps Chrome X Cactus Jack" is a collab mark; a trailing "X" ("Allen & Ginter X") is its own product.
  const words = (m ? n.slice(m[0].length) : n).match(/[a-z0-9]+/g) || []
  const kept = words.filter(w => !STOP.has(w))
  const sig = kept.filter((w, i) => !(w === 'x' && i < kept.length - 1))
  return m ? m[1] + '|' + [...new Set(sig)].sort().join(' ') : null
}
const surname = (p) => {
  const w = String(p || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/)
  while (w.length > 1 && /^(jr|sr|ii|iii|iv)$/.test(w[w.length - 1])) w.pop()
  return w[w.length - 1] || ''
}
const cardKeys = (s) => {
  if (!s._cards) {
    let d = {}; try { d = JSON.parse(readFileSync(s.file, 'utf8')) } catch {}
    s._cards = new Set((d.sections || []).flatMap(x => (x.cards || []).map(c => String(c.n || '').trim().replace(/^#/, '').toLowerCase() + '|' + surname(c.p))))
  }
  return s._cards
}
const near = new Map()
for (const s of pool) {
  const k = nameKey(s.name)
  if (!k) continue
  const g = s.sport + '|' + k
  ;(near.get(g) || near.set(g, []).get(g)).push(s)
}
for (const list of near.values()) {
  if (list.length < 2) continue
  list.sort(order)
  const keep = list[0]
  const big = cardKeys(keep)
  for (const d of list.slice(1)) {
    const small = cardKeys(d)
    if (!small.size) continue
    let inside = 0; for (const c of small) if (big.has(c)) inside++
    if (inside / small.size >= 0.9) drop(d, keep, 'near-duplicate')
  }
}

// collapse redirect chains
for (const k of Object.keys(redirects)) { let t = redirects[k], i = 0; while (redirects[t] && i++ < 10) t = redirects[t]; redirects[k] = t }
if (!DRY) writeFileSync(redirectsPath, JSON.stringify(redirects))
console.log('duplicates', DRY ? 'found' : 'merged', removed)
