// Rebuild public/data/index.json (the browse manifest) from every per-set JSON
// on disk. scrape-cc.mjs rebuilds this inline, but the supplementary scrapers
// (premium-vintage, soccer-full, TCG ingests) only write set files — so this
// standalone pass keeps the manifest in sync. Wired into `prebuild` so Vercel
// regenerates it at deploy time too.
//   node scripts/build-index.mjs
import { writeFileSync, readFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const GENERATED = new Set(['index.json', 'search-index.json', 'rpa-index.json', 'patch-swaps.json'])

const sets = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || GENERATED.has(f)) continue
  try {
    const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))
    if (!s.slug || !s.sport || !Array.isArray(s.sections)) continue
    const cardCount = s.sections.reduce((n, sec) => n + (sec.cards ? sec.cards.length : 0), 0)
    if (cardCount === 0) continue
    sets.push({ slug: s.slug, name: s.name, year: s.year, sport: s.sport, cardCount, sections: s.sections.length, source: s.source })
  } catch (e) { /* skip malformed */ }
}
sets.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name))
writeFileSync(new URL('index.json', dataDir), JSON.stringify({ sets }))
console.log('index:', sets.length, 'sets,', sets.reduce((n, s) => n + s.cardCount, 0).toLocaleString(), 'cards total')
