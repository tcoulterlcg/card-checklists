// Ingest Disney Lorcana from the free lorcast.com API. One set file per
// Lorcana set; cards grouped into sections by rarity. Sport = "Lorcana".
//   node scripts/ingest-lorcana.mjs
import { writeFileSync } from 'node:fs'

const API = 'https://api.lorcast.com/v0'
const H = { accept: 'application/json' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)

const sets = (await (await fetch(API + '/sets', { headers: H })).json()).results
console.log('Lorcana sets:', sets.length)

const order = ['Common', 'Uncommon', 'Rare', 'Super Rare', 'Legendary', 'Enchanted', 'Special', 'Promo']
let ok = 0, total = 0
for (const set of sets) {
  const r = await fetch(API + '/sets/' + set.id + '/cards', { headers: H })
  if (!r.ok) { await sleep(150); continue }
  const cards = await r.json()
  if (!Array.isArray(cards) || cards.length === 0) { await sleep(150); continue }

  const groups = {}
  for (const c of cards) {
    const rarity = c.rarity || 'Unlisted'
    ;(groups[rarity] = groups[rarity] || []).push({
      n: c.collector_number || c.number || '',
      p: c.name + (c.version ? ' — ' + c.version : ''),
      t: Array.isArray(c.type) ? c.type.join('/') : (c.type || ''),
      x: c.rarity || undefined
    })
  }
  const sections = Object.keys(groups)
    .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)) || a.localeCompare(b))
    .map(rarity => ({ title: rarity, cards: groups[rarity] }))

  const year = set.released_at ? parseInt(set.released_at.slice(0, 4)) : null
  const out = {
    slug: 'lorcana-' + (set.code || set.id).toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: 'Lorcana ' + set.name,
    year,
    sport: 'Lorcana',
    source: 'lorcast.com',
    sections
  }
  writeFileSync(new URL(out.slug + '.json', dataDir), JSON.stringify(out))
  ok++; total += cards.length
  process.stdout.write('.')
  await sleep(150)
}
console.log('\ningest-lorcana ->', ok, 'sets,', total.toLocaleString(), 'cards')
