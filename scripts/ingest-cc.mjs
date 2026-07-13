// Ingest a cardboardconnection scrape dump (array of sets with sections)
// into public/data/: one JSON per set + a rebuilt index.json.
//   node scripts/ingest-cc.mjs <dump.json>
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'

const input = process.argv[2]
if (!input) { console.error('Usage: node scripts/ingest-cc.mjs <dump.json>'); process.exit(1) }

const dump = JSON.parse(readFileSync(input, 'utf8'))
const dataDir = new URL('../public/data/', import.meta.url)
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

let written = 0
for (const set of dump) {
  if (!set.slug || !set.sections || set.sections.length === 0) continue
  writeFileSync(new URL(set.slug + '.json', dataDir), JSON.stringify(set))
  written++
}

// Rebuild the index from every set file on disk (idempotent across batches).
const sets = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue
  try {
    const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))
    const cardCount = (s.sections || []).reduce((n, sec) => n + sec.cards.length, 0)
    sets.push({ slug: s.slug, name: s.name, year: s.year, sport: s.sport, cardCount, sections: (s.sections || []).length, source: s.source })
  } catch (e) { /* skip corrupt */ }
}
sets.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name))
writeFileSync(new URL('index.json', dataDir), JSON.stringify({ sets }))
console.log('ingest-cc ->', written, 'set files written;', sets.length, 'sets in index;',
  sets.reduce((n, s) => n + s.cardCount, 0).toLocaleString(), 'total cards')
