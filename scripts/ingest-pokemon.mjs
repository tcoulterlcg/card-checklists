// Ingest the full Pokémon TCG from the free pokemontcg.io API into our set
// format. Each Pokémon set becomes one set file; cards are grouped into
// sections by rarity. Sport = "Pokémon".
//   node scripts/ingest-pokemon.mjs
import { writeFileSync, existsSync } from 'node:fs'

const API = 'https://api.pokemontcg.io/v2'
const H = { accept: 'application/json' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)
const RESUME = process.argv.includes('--resume')

const setsRes = await fetch(API + '/sets?pageSize=500&orderBy=releaseDate', { headers: H })
const sets = (await setsRes.json()).data
console.log('Pokémon sets:', sets.length)

let ok = 0, total = 0
for (const set of sets) {
  if (RESUME && existsSync(new URL('pkmn-' + set.id + '.json', dataDir))) { ok++; continue }
  const cards = []
  for (let page = 1; page < 12; page++) {
    const r = await fetch(API + '/cards?q=set.id:' + set.id + '&pageSize=250&page=' + page + '&select=name,number,rarity,supertype,subtypes,types', { headers: H })
    if (!r.ok) break
    const data = (await r.json()).data
    if (!data || data.length === 0) break
    cards.push(...data)
    if (data.length < 250) break
    await sleep(1800)
  }
  if (cards.length === 0) continue

  // Group into sections by rarity (meaningful for TCG collectors).
  const groups = {}
  for (const c of cards) {
    const rarity = c.rarity || 'Unlisted'
    ;(groups[rarity] = groups[rarity] || []).push({
      n: c.number,
      p: c.name,
      t: (c.types && c.types.join('/')) || c.supertype || '',
      x: c.rarity || undefined
    })
  }
  // Order sections: base rarities first, then chase rarities.
  const order = ['Common', 'Uncommon', 'Rare', 'Rare Holo', 'Double Rare', 'Ultra Rare', 'Rare Ultra', 'Illustration Rare', 'Special Illustration Rare', 'Rare Secret', 'Hyper Rare', 'Promo']
  const sections = Object.keys(groups)
    .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)) || a.localeCompare(b))
    .map(rarity => ({ title: rarity, cards: groups[rarity] }))

  const year = set.releaseDate ? parseInt(set.releaseDate.slice(0, 4)) : null
  const out = {
    slug: 'pkmn-' + set.id,
    name: 'Pokémon ' + set.name + (set.series && set.series !== set.name ? ' (' + set.series + ')' : ''),
    year,
    sport: 'Pokémon',
    source: 'pokemontcg.io',
    sections
  }
  writeFileSync(new URL(out.slug + '.json', dataDir), JSON.stringify(out))
  ok++; total += cards.length
  process.stdout.write('.')
  await sleep(1800)
}
console.log('\ningest-pokemon ->', ok, 'sets,', total.toLocaleString(), 'cards')
