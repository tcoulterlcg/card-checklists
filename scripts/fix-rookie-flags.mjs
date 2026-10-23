// Add missing RC flags, only where the data itself says the card is a rookie.
//   1. Same card, same set: if a card (number + player) is flagged RC in one base or
//      parallel section, its copies in the set's other base/parallel sections are RC too
//      (a parallel never changes rookie status).
//   2. Upper Deck Series 1 / 2 hockey: base #201-250 / #451-500 are Young Guns (the
//      rookie cards) — applied only where Young Guns sit inside the Base section, and
//      to the base parallels carrying the same player at the same number.
// Insert, autograph and memorabilia sections are never changed.
//   node scripts/fix-rookie-flags.mjs [--dry-run]
import { readFileSync, writeFileSync } from 'node:fs'
const D = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const idx = JSON.parse(readFileSync(new URL('index.json', D), 'utf8')).sets
const isRC = (x) => /\bRC\b/.test(x || '')
const norm = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
// base or a parallel of base (not inserts / autos / relics)
const NOT_BASEISH = /auto|autograph|signature|relic|jersey|patch|memorabilia|material|swatch|insert|checklist|redemption|promo/i
const PARALLEL = /^base\b|\bbase$|parallel|refractor|prizm|holo|foil|gold|silver|black|red|blue|green|orange|purple|pink|exclusives|high gloss|clear cut|chrome|sapphire|rainbow|mojo|wave|shimmer|ice|canvas|printing plate|press proof|artist proof|xfractor|superfractor/i
const baseish = (t) => !NOT_BASEISH.test(t || '') && (/^\s*base\s*$/i.test(t || '') || PARALLEL.test(t || ''))
let added = 0, files = 0
const log = []
for (const s of idx) {
  const f = JSON.parse(readFileSync(new URL(s.slug + '.json', D), 'utf8'))
  const rc = new Set()
  for (const sec of f.sections) if (baseish(sec.title)) for (const c of sec.cards) if (c.n && isRC(c.x)) rc.add(norm(c.n) + '|' + norm(c.p))
  // Young Guns inside Base (UD Series 1 / 2 hockey)
  const ud = /^\d{4}-\d\d Upper Deck Series ([12]) Hockey$/.exec(s.name)
  if (ud) {
    const [lo, hi] = ud[1] === '2' ? [451, 500] : [201, 250]
    const base = f.sections.find(x => /^\s*base\s*$/i.test(x.title))
    for (const c of base?.cards || []) if (+c.n >= lo && +c.n <= hi && c.p) rc.add(norm(c.n) + '|' + norm(c.p))
  }
  if (!rc.size) continue
  let ch = 0
  for (const sec of f.sections) {
    if (!baseish(sec.title)) continue
    for (const c of sec.cards) {
      if (!c.n || isRC(c.x) || !rc.has(norm(c.n) + '|' + norm(c.p))) continue
      c.x = ((c.x || '') + ' RC').trim(); ch++
      if (log.length < 40) log.push(`${s.name} | ${sec.title} #${c.n} ${c.p}`)
    }
  }
  if (ch) { added += ch; files++; if (!DRY) writeFileSync(new URL(s.slug + '.json', D), JSON.stringify(f)) }
}
console.log(`${DRY ? 'would flag' : 'flagged'} ${added} cards as RC in ${files} sets`)
if (DRY) console.log(log.join('\n'))
