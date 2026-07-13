// Ingest Yu-Gi-Oh! from the free YGOPRODeck API. The API is card-centric (each
// card lists the sets it appears in), so we fetch every card once and invert
// into per-set checklists, grouped into sections by rarity.
//   node scripts/ingest-yugioh.mjs
import { writeFileSync } from 'node:fs'

const H = { accept: 'application/json', 'user-agent': 'ChecklistHQ/1.0 (card checklist database)' }
const dataDir = new URL('../public/data/', import.meta.url)

// set_name -> release year
const setMeta = {}
for (const s of await (await fetch('https://db.ygoprodeck.com/api/v7/cardsets.php', { headers: H })).json()) {
  const date = s.tcg_date || s.set_date
  setMeta[s.set_name] = date ? parseInt(String(date).slice(0, 4)) : null
}

const all = (await (await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php', { headers: H })).json()).data
console.log('YGO cards:', all.length)

// Invert: set_name -> rarity -> [cards]
const bySet = {}
for (const card of all) {
  for (const cs of (card.card_sets || [])) {
    const name = cs.set_name
    if (!name) continue
    const numMatch = (cs.set_code || '').match(/(\d+)[A-Za-z]?$/)
    const num = numMatch ? numMatch[1] : (cs.set_code || '')
    ;(bySet[name] = bySet[name] || []).push({
      n: num, p: card.name, t: card.type || '', x: cs.set_rarity || undefined, _r: cs.set_rarity || 'Common'
    })
  }
}

const order = ['Common', 'Rare', 'Super Rare', 'Ultra Rare', 'Ultimate Rare', 'Secret Rare', 'Ghost Rare', 'Starlight Rare', 'Collector\'s Rare', 'Gold Rare']
let ok = 0, total = 0
for (const [name, cards] of Object.entries(bySet)) {
  if (cards.length < 3) continue
  const groups = {}
  for (const c of cards) { (groups[c._r] = groups[c._r] || []).push({ n: c.n, p: c.p, t: c.t, x: c.x }) }
  const sections = Object.keys(groups)
    .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)) || a.localeCompare(b))
    .map(r => ({ title: r, cards: groups[r] }))
  const slug = 'ygo-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({
    slug, name: 'Yu-Gi-Oh! ' + name, year: setMeta[name] || null, sport: 'Yu-Gi-Oh!', source: 'ygoprodeck.com', sections
  }))
  ok++; total += cards.length
}
console.log('ingest-yugioh ->', ok, 'sets,', total.toLocaleString(), 'printings')
