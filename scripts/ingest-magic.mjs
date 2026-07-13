// Ingest Magic: The Gathering from the free Scryfall API. Limited to paper
// core / expansion / masters / draft-innovation sets (the sets collectors
// chase). One set file per MTG set; cards grouped into sections by rarity.
//   node scripts/ingest-magic.mjs [--resume]
import { writeFileSync, existsSync } from 'node:fs'

const H = { accept: 'application/json', 'user-agent': 'ChecklistHQ/1.0 (card checklist database)' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)
const RESUME = process.argv.includes('--resume')

const setsRes = await fetch('https://api.scryfall.com/sets', { headers: H })
const allSets = (await setsRes.json()).data
const sets = allSets.filter(s => ['core', 'expansion', 'masters', 'draft_innovation'].includes(s.set_type) && !s.digital && (s.card_count || 0) > 0)
console.log('MTG paper sets:', sets.length)

const order = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus']
const rlabel = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', mythic: 'Mythic Rare', special: 'Special', bonus: 'Bonus' }

let ok = 0, total = 0
for (const set of sets) {
  const slug = 'mtg-' + set.code
  if (RESUME && existsSync(new URL(slug + '.json', dataDir))) { ok++; continue }
  const cards = []
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('set:' + set.code + ' unique:prints') + '&order=set'
  for (let guard = 0; guard < 20 && url; guard++) {
    const r = await fetch(url, { headers: H })
    if (!r.ok) break
    const j = await r.json()
    if (j.data) cards.push(...j.data)
    url = j.has_more ? j.next_page : null
    await sleep(90)
  }
  if (cards.length === 0) continue

  const groups = {}
  for (const c of cards) {
    const rar = c.rarity || 'common'
    ;(groups[rar] = groups[rar] || []).push({
      n: c.collector_number,
      p: c.name,
      t: (c.type_line || '').split('—')[0].trim(),
      x: rlabel[c.rarity] || c.rarity
    })
  }
  const sections = Object.keys(groups)
    .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map(r => ({ title: rlabel[r] || r, cards: groups[r] }))

  const out = {
    slug, name: 'Magic ' + set.name,
    year: set.released_at ? parseInt(set.released_at.slice(0, 4)) : null,
    sport: 'Magic', source: 'scryfall.com', sections
  }
  writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify(out))
  ok++; total += cards.length
  process.stdout.write('.')
  await sleep(90)
}
console.log('\ningest-magic ->', ok, 'sets,', total.toLocaleString(), 'cards')
