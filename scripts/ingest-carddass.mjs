// Ingest Bandai Pokémon Carddass Parts 1–4 (1996–97) from Bulbapedia's card
// tables (pulled through the browser — Bulbapedia blocks the build env).
//   node scripts/ingest-carddass.mjs <carddass.json>
// Dump: [{ page, caption: "Part 1 (パート1)", rows: [[{t, img}], ...] }] where the
// first row is the header. Parts 1 & 2 print every Pokémon card in Red and Green
// versions; Parts 3 & 4 have one front each.
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/ingest-carddass.mjs <carddass.json>'); process.exit(1) }
const tables = JSON.parse(readFileSync(file, 'utf8'))
const dataDir = new URL('../public/data/', import.meta.url)
const YEAR = { 1: 1996, 2: 1996, 3: 1997, 4: 1997 }

const parts = {}
for (const tb of tables) {
  const part = +((tb.caption.match(/Part\s*(\d)/) || [])[1])
  if (!part) continue
  const P = parts[part] = parts[part] || { special: [], red: [], green: [], cards: [] }
  const head = tb.rows[0].map(c => c.t)
  for (const r of tb.rows.slice(1)) {
    const cell = (name) => r[head.indexOf(name)] || { t: '', img: false }
    const n = cell(head[0]).t
    if (!n) continue
    if (head.includes('Type')) {                       // title / checklist cards
      P.special.push({ n, p: cell('Type').t.replace(/\s*\(.*$|（.*$/, '').replace(/([a-z])card/i, '$1 Card').replace(/\b\w/g, ch => ch.toUpperCase()).trim() || 'Special Card', t: 'Special' })
    } else if (head.includes('Front (Red)')) {          // Parts 1 & 2
      const name = cell('Pokémon').t.replace(/^#\d+\s*/, '')
      const red = cell('Front (Red)').img, green = cell('Front (Green)').img, none = !red && !green
      if (red || none) P.red.push({ n, p: name, t: 'Pokémon', x: 'Red' })
      if (green || none) P.green.push({ n, p: name, t: 'Pokémon', x: 'Green' })
    } else {                                            // Parts 3 & 4
      const name = cell('Pokémon').t, move = cell('Move').t
      P.cards.push({ n, p: name + (move && move !== '—' ? ' (' + move + ')' : ''), t: n === '0' ? 'Special' : 'Pokémon' })
    }
  }
}

let ok = 0, total = 0
for (const [part, P] of Object.entries(parts)) {
  const sections = [
    P.special.length && { title: 'Title & Checklist Cards', cards: P.special },
    P.red.length && { title: 'Red', cards: P.red },
    P.green.length && { title: 'Green', cards: P.green },
    P.cards.length && { title: 'Base', cards: P.cards },
  ].filter(Boolean)
  const year = YEAR[part]
  const out = { slug: year + '-bandai-pokemon-carddass-part-' + part, name: year + ' Bandai Pokémon Carddass Part ' + part, year, sport: 'Pokémon', source: 'bulbapedia.bulbagarden.net', sections }
  writeFileSync(new URL(out.slug + '.json', dataDir), JSON.stringify(out))
  ok++; total += sections.reduce((a, s) => a + s.cards.length, 0)
  console.log(out.name, sections.map(s => s.title + ':' + s.cards.length).join(', '))
}
console.log('ingest-carddass ->', ok, 'sets,', total, 'cards')
