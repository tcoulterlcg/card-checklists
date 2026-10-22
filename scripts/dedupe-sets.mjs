// Merge duplicate sets: same sport + same normalized display name (run after
// normalize-names.mjs). Keeps the copy with the most cards (ties: Break Ninja >
// TCDB > checklistcenter > cardboardconnection), deletes the rest and records
// old -> kept slug in public/data/redirects.json so existing links and
// wantlists keep working.
//   node scripts/dedupe-sets.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const RANK = { 'breakninja.com': 4, 'tcdb.com': 3, 'checklistcenter.com': 2, 'cardboardconnection.com': 1 }
const groups = new Map()
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  let s; try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.name || !s.sport) continue
  const k = s.sport + '|' + s.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const n = (s.sections || []).reduce((a, x) => a + (x.cards || []).length, 0)
  ;(groups.get(k) || groups.set(k, []).get(k)).push({ slug: s.slug, n, src: s.source })
}
const redirectsPath = new URL('redirects.json', dataDir)
const redirects = existsSync(redirectsPath) ? JSON.parse(readFileSync(redirectsPath, 'utf8')) : {}
let removed = 0
for (const [k, list] of groups) {
  if (list.length < 2) continue
  list.sort((a, b) => b.n - a.n || (RANK[b.src] || 0) - (RANK[a.src] || 0))
  const keep = list[0]
  for (const d of list.slice(1)) {
    if (DRY) console.log(k.split('|')[1], ':', d.slug, `(${d.n})`, '->', keep.slug, `(${keep.n})`)
    else { unlinkSync(new URL(d.slug + '.json', dataDir)); redirects[d.slug] = keep.slug }
    removed++
  }
}
// collapse redirect chains
for (const k of Object.keys(redirects)) { let t = redirects[k], i = 0; while (redirects[t] && i++ < 10) t = redirects[t]; redirects[k] = t }
if (!DRY) writeFileSync(redirectsPath, JSON.stringify(redirects))
console.log('duplicates', DRY ? 'found' : 'merged', removed)
