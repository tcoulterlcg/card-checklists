// Ingest the One Piece Card Game from the free optcgapi.com API. One set file
// per product (booster, extra/premium booster, starter deck); cards grouped by
// rarity, with parallels / alt arts in their own section. Sport = "One Piece".
//   node scripts/ingest-onepiece.mjs              (fetch from optcgapi.com)
//   node scripts/ingest-onepiece.mjs dump.json    (use a browser dump: {sets, rows})
import { writeFileSync, readFileSync } from 'node:fs'

const API = 'https://optcgapi.com/api'
const dataDir = new URL('../public/data/', import.meta.url)

let sets, rows
if (process.argv[2]) {
  ;({ sets, rows } = JSON.parse(readFileSync(process.argv[2], 'utf8')))
} else {
  const get = async (p) => { const r = await fetch(API + p, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json() }
  sets = await get('/allSets/')
  const cards = [...await get('/allSetCards/'), ...await get('/allSTCards/')]
  rows = cards.map(c => [c.set_id, c.set_name, c.card_set_id, c.card_name, c.rarity, c.card_type, c.card_color,
    c.card_image_id === c.card_set_id ? '' : String(c.card_image_id || '').replace(c.card_set_id, '')])
}

// English release years (approximate for starter decks).
const YEAR = {
  'OP-01': 2022, 'OP-02': 2023, 'OP-03': 2023, 'OP-04': 2023, 'OP-05': 2023,
  'OP-06': 2024, 'OP-07': 2024, 'OP-08': 2024, 'OP-09': 2024, 'EB-01': 2024, 'PRB-01': 2024,
  'OP-10': 2025, 'OP-11': 2025, 'OP-12': 2025, 'OP-13': 2025, 'EB-02': 2025, 'PRB-02': 2025
}
const yearFor = (id) => {
  if (YEAR[id]) return YEAR[id]
  const st = id.match(/^ST-(\d+)/)
  if (st) { const n = +st[1]; return n <= 4 ? 2022 : n <= 10 ? 2023 : n <= 20 ? 2024 : n <= 28 ? 2025 : 2026 }
  return 2026
}

const RARITY = { L: 'Leader', C: 'Common', UC: 'Uncommon', R: 'Rare', SR: 'Super Rare', SEC: 'Secret Rare', SP: 'Special', TR: 'Treasure Rare', PR: 'Promo', P: 'Promo' }
const ORDER = ['Leader', 'Common', 'Uncommon', 'Rare', 'Super Rare', 'Secret Rare', 'Treasure Rare', 'Promo', 'Parallels & Alt Arts', 'Reprints']

// Starter-deck cards reprinted inside a later booster are listed under that
// booster's name — file them with the booster product.
const byName = new Map(sets.map(s => [s.set_name.replace(/\s+/g, ' ').trim().toLowerCase(), s.set_id]))
const products = new Map()
for (const [setId, setName, num, name, rarity, type, , variant] of rows) {
  const id = setId.startsWith('ST-') && byName.get(String(setName).replace(/\s+/g, ' ').trim().toLowerCase()) || setId
  const name0 = id === setId ? setName : (sets.find(s => s.set_id === id) || {}).set_name
  if (!products.has(id)) products.set(id, { id, name: name0, cards: [] })
  const v = String(variant || '').toLowerCase()
  const kind = /[_-]r\d/.test(v) ? 'Reprints' : /p\d/.test(v) ? 'Parallels & Alt Arts' : null
  products.get(id).cards.push({ section: kind || RARITY[rarity] || rarity || 'Unlisted', n: num, p: name, t: type || '', x: kind ? (RARITY[rarity] || rarity) + (kind === 'Reprints' ? ' Reprint' : ' Parallel') : (RARITY[rarity] || rarity || undefined) })
}

let ok = 0, total = 0
for (const pr of products.values()) {
  const groups = {}
  for (const { section, ...c } of pr.cards) (groups[section] = groups[section] || []).push(c)
  const rank = (s) => { const i = ORDER.indexOf(s); return i === -1 ? 99 : i }
  const sections = Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map(title => ({ title, cards: groups[title].sort((a, b) => a.n.localeCompare(b.n, undefined, { numeric: true })) }))
  const out = {
    slug: 'one-piece-' + pr.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: 'One Piece ' + pr.id + ' ' + String(pr.name).replace(/\s+/g, ' ').trim(),
    year: yearFor(pr.id),
    sport: 'One Piece',
    source: 'optcgapi.com',
    sections
  }
  writeFileSync(new URL(out.slug + '.json', dataDir), JSON.stringify(out))
  ok++; total += pr.cards.length
}
console.log('ingest-onepiece ->', ok, 'sets,', total.toLocaleString(), 'cards')
