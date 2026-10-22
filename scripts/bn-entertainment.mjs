// Convert a Break Ninja entertainment dump (pulled in the browser) into set files.
// Entertainment product pages are one paginated table: [Name, Number, Card Set, Copies].
// Multi-character cards are listed once per character — merged back into one card.
//   node scripts/bn-entertainment.mjs <dump.json> [sport]
// dump: [{ file: "2026-Topps-Chrome-Disney-Card-Checklist", rows: [[name, number, cardSet, copies]] }]
// Slugs follow the existing "<file>-entertainment" convention so set links survive
// when a fuller Break Ninja version replaces an older import of the same product.
import { readFileSync, writeFileSync } from 'node:fs'

const [file, sport = 'Entertainment'] = process.argv.slice(2)
if (!file) { console.error('usage: node scripts/bn-entertainment.mjs <dump.json> [sport]'); process.exit(1) }
const dataDir = new URL('../public/data/', import.meta.url)

let ok = 0, total = 0
for (const prod of JSON.parse(readFileSync(file, 'utf8'))) {
  if (!prod.rows || !prod.rows.length) { console.log('skip (no rows):', prod.file); continue }
  const base = prod.file.replace(/-Card-Checklist$/, '')
  const sections = new Map()
  for (const [name, num, setName, copies] of prod.rows) {
    const title = setName || 'Base'
    let sec = sections.get(title)
    if (!sec) { sec = { title, cards: [], byNum: new Map() }; sections.set(title, sec) }
    const key = num || name
    const prev = num ? sec.byNum.get(key) : null
    if (prev) { if (!prev.p.split(' / ').includes(name)) prev.p += ' / ' + name; continue }
    const card = { n: num || '', p: name }
    const cp = parseInt(copies)
    if (cp > 0 && cp <= 2500) card.x = '/' + cp
    sec.cards.push(card); if (num) sec.byNum.set(key, card)
  }
  const secs = [...sections.values()].map(({ title, cards }) => ({ title, cards }))
  const year = parseInt(base)
  const out = { slug: base.toLowerCase() + '-entertainment', name: base.replace(/-/g, ' '), year, sport, source: 'breakninja.com', sections: secs }
  writeFileSync(new URL(out.slug + '.json', dataDir), JSON.stringify(out))
  const n = secs.reduce((a, s) => a + s.cards.length, 0)
  ok++; total += n
  console.log(out.name, '-', secs.length, 'sections,', n, 'cards')
}
console.log('bn-entertainment ->', ok, 'sets,', total.toLocaleString(), 'cards')
