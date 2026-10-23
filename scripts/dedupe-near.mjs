// Near-duplicate pass the name-based dedupe misses: the same product imported from
// two sources under different slugs ("…-checklist-entertainment" vs "…-entertainment",
// "2022-23-topps-chrome-spfl-cards" vs "…-soccer", "2024-25-…-pwhl" vs "2024-…-pwhl").
// Two static sets are the same product when they share sport, first year, maker, the
// same slug words (ignoring filler like "checklist", "cards", "trading"), and ≥90% of
// the smaller copy's cards (number + surname) are on the larger one. "Box set" /
// "factory set" / "premium" products never merge with the main release.
// Keeps the larger copy; the other file is removed with a redirect (old -> kept).
//   node scripts/dedupe-near.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const FILLER = new Set(['and', 'the', 'card', 'cards', 'trading', 'checklist', 'checklists', 'set', 'mlb', 'nba', 'nfl', 'nhl', 'entertainment', 'baseball', 'basketball', 'football', 'hockey', 'soccer', 'racing', 'wrestling', 'golf', 'tennis', 'boxing', 'ufc', 'multi', 'sport', 'ud'])
const DISTINCT = /\b(box|factory|premium|blaster|mega|hobby|retail|wrapper|redemption|update|series)\b/
const firstYear = (slug) => { const m = slug.match(/^(\d{2})-\d{2}-/); if (m) return 2000 + +m[1]; const y = slug.match(/^(19|20)\d{2}/); return y ? +y[0] : 0 }
const words = (slug) => slug.toLowerCase().replace(/^(\d{2})-(\d{2})-/, '').replace(/^(19|20)\d{2}(-\d{2,4})?-/, '').split('-').filter(t => t && !FILLER.has(t))
const sur = (p) => String(p || '').trim().split(/\s+/).pop().toLowerCase()

const sets = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))
  if (!s.slug || !Array.isArray(s.sections) || s.incomplete) continue
  const cards = new Set()
  for (const sec of s.sections) for (const c of sec.cards || []) cards.add(String(c.n || '').toLowerCase() + '|' + sur(c.p))
  const w = words(s.slug)
  sets.push({ slug: s.slug, sport: s.sport, year: firstYear(s.slug), w, key: s.sport + '|' + firstYear(s.slug) + '|' + [...w].sort().join('-'), distinct: DISTINCT.test(w.join(' ')), n: cards.size, cards })
}
const groups = new Map()
for (const s of sets) (groups.get(s.key) || groups.set(s.key, []).get(s.key)).push(s)
const red = JSON.parse(readFileSync(new URL('redirects.json', dataDir), 'utf8'))
let merged = 0
for (const g of groups.values()) {
  if (g.length < 2) continue
  g.sort((a, b) => b.n - a.n)
  const keep = g[0]
  for (const s of g.slice(1)) {
    if (s.distinct !== keep.distinct) continue
    let hit = 0; for (const k of s.cards) if (keep.cards.has(k)) hit++
    const cover = s.n ? hit / s.n : 0
    if (cover < 0.9) { console.log('skip (cover ' + Math.round(cover * 100) + '%):', s.slug, '->', keep.slug); continue }
    console.log('merge', s.slug, '(' + s.n + ') ->', keep.slug, '(' + keep.n + '), cover', Math.round(cover * 100) + '%')
    merged++
    if (!DRY) {
      red[s.slug] = keep.slug
      for (const [a, b] of Object.entries(red)) if (b === s.slug) red[a] = keep.slug   // no redirect chains
      unlinkSync(new URL(s.slug + '.json', dataDir))
    }
  }
}
if (!DRY && merged) writeFileSync(new URL('redirects.json', dataDir), JSON.stringify(red))
console.log(DRY ? '(dry run)' : '', 'merged', merged)
