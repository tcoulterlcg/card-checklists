// Build public/data/search-index.json — one compact row per card so global
// player search is a single fetch instead of hundreds. Rows are tuples:
//   [player, setSlug, number, sectionTitle, team, flag]
// Set name/year/sport are resolved from index.json by slug at query time.
//   node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const rows = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || f === 'index.json' || f === 'search-index.json') continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch (e) { continue }
  for (const sec of (s.sections || [])) {
    for (const c of sec.cards) {
      rows.push([c.p, s.slug, c.n, sec.title, c.t || '', c.x || ''])
    }
  }
}
writeFileSync(new URL('search-index.json', dataDir), JSON.stringify({ rows }))
console.log('search index:', rows.length.toLocaleString(), 'cards')
