// Universal checklist text -> JSON set file.
// Paste raw checklist text (one card per line, e.g. "1 Ronald Acuna Jr. - Atlanta Braves"
// or "BD-45 Jackson Holliday, Baltimore Orioles RC") into a .txt file, then:
//   node scripts/parse-checklist.mjs <input.txt> <slug> "<Set Name>" <year> <sport> [source]
// Writes public/data/<slug>.json and updates public/data/index.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const [, , input, slug, name, year, sport, source] = process.argv
if (!input || !slug || !name || !year || !sport) {
  console.error('Usage: node scripts/parse-checklist.mjs <input.txt> <slug> "<Set Name>" <year> <sport> [source]')
  process.exit(1)
}

const text = readFileSync(input, 'utf8')
const cards = []
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line) continue
  // number = leading token possibly with letters/dashes (e.g. 12, BD-45, US100)
  const m = line.match(/^#?([A-Za-z]{0,4}-?\d+[A-Za-z]?)[\s.:]+(.+)$/)
  if (!m) continue
  const number = m[1]
  let rest = m[2].trim()
  let note = ''
  // trailing flags like RC, SP, SSP, AU
  const flag = rest.match(/\s(RC|SP|SSP|AU|RC AU|Rookie)$/i)
  if (flag) { note = flag[1].toUpperCase(); rest = rest.slice(0, flag.index).trim() }
  // player/team separated by " - ", " – ", or ", "
  let player = rest, team = ''
  const sep = rest.match(/^(.*?)\s+[-–—]\s+(.*)$/) || rest.match(/^(.*?),\s+(.*)$/)
  if (sep) { player = sep[1].trim(); team = sep[2].trim() }
  cards.push({ number, player, team, note: note || undefined })
}

if (cards.length === 0) { console.error('No cards parsed — check the input format.'); process.exit(1) }

const dataDir = new URL('../public/data/', import.meta.url)
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year: parseInt(year), sport, source: source || null, cards }, null, 1))

const indexPath = new URL('index.json', dataDir)
let index = { sets: [] }
if (existsSync(indexPath)) index = JSON.parse(readFileSync(indexPath, 'utf8'))
index.sets = index.sets.filter(s => s.slug !== slug)
index.sets.push({ slug, name, year: parseInt(year), sport, cardCount: cards.length, source: source || null })
index.sets.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name))
writeFileSync(indexPath, JSON.stringify(index, null, 1))
console.log('parsed', cards.length, 'cards ->', slug + '.json (index now', index.sets.length, 'sets)')
