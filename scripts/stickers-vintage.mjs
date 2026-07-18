// Build set JSONs for vintage Panini/Topps sticker sets (1980-2002) from a
// TCDB checklist scrape.
//
// TCDB blocks server-side fetches, so the checklists are pulled in the browser
// (see the scraper in this repo's notes) and written as one TSV:
//   sport \t year \t sid \t setName \t cardNum \t player \t team \t variant
//
// Unlike tcdb-parse.mjs — which reverse-engineers cards out of page *text* and
// needs a team dictionary to tell a team apart from a name — this reads the
// structured columns straight off the checklist table, so no team dictionary
// and no flag heuristics are involved.
//
//   node scripts/stickers-vintage.mjs <scrape.tsv> [--dry-run]
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'

const file = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
if (!file) { console.error('Usage: node scripts/stickers-vintage.mjs <scrape.tsv> [--dry-run]'); process.exit(1) }

const dataDir = new URL('../public/data/', import.meta.url)
const slugify = (s) => s.toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')

// Group rows by set id.
const sets = new Map()
let bad = 0
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue
  const p = line.split('\t')
  if (p.length < 6) { bad++; continue }
  const [sport, year, sid, name, num, player, team = '', variant = ''] = p
  if (!sets.has(sid)) sets.set(sid, { sport, year: parseInt(year, 10), sid, name, cards: [] })
  const card = { n: num.trim(), p: player.trim() }
  if (team.trim()) card.t = team.trim()
  if (variant.trim()) card.v = variant.trim()
  sets.get(sid).cards.push(card)
}
console.log(`parsed ${sets.size} sets, ${[...sets.values()].reduce((n, s) => n + s.cards.length, 0)} cards${bad ? `, ${bad} malformed lines skipped` : ''}`)

const existingSlugs = new Set(readdirSync(dataDir).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')))

let written = 0, skippedEmpty = 0, collisions = 0
const report = []
for (const s of sets.values()) {
  if (!s.cards.length) { skippedEmpty++; continue }
  // Set names already lead with the year ("1985 Topps Stickers"), so the slug
  // only needs the sport appended to stay unique across sports.
  let slug = slugify(s.name)
  if (!slug.includes(slugify(s.sport))) slug += '-' + slugify(s.sport)
  if (existingSlugs.has(slug)) { collisions++; slug += '-' + s.sid }
  existingSlugs.add(slug)

  const json = {
    slug,
    name: s.name,
    year: s.year,
    sport: s.sport,
    source: 'tcdb.com',
    sections: [{ title: 'Base Set', cards: s.cards }]
  }
  if (!dryRun) writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify(json))
  report.push(`${s.sport.padEnd(11)} ${s.year}  ${String(s.cards.length).padStart(4)} cards  ${slug}`)
  written++
}

report.sort()
console.log('\n' + report.slice(0, 25).join('\n'))
if (report.length > 25) console.log(`... and ${report.length - 25} more`)
console.log(`\n${dryRun ? '[dry-run] would write' : 'wrote'} ${written} set files` +
  (skippedEmpty ? `, skipped ${skippedEmpty} empty` : '') +
  (collisions ? `, ${collisions} slug collisions disambiguated by sid` : ''))
if (!dryRun) console.log('next: node scripts/build-index.mjs && node scripts/build-search-index.mjs')
