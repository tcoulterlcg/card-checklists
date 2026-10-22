// Ingest the One Piece Card Game. Card lists come from Limitless TCG
// (onepiece.limitlesstcg.com), DON!! cards from optcgapi.com. Both sites block
// the build environment, so this reads browser dumps:
//   node scripts/ingest-onepiece.mjs <limitless.json> <don.json>
//
// limitless.json: { sets: [{href, t:[code, name, date, count]}], lt: {href: rows}, promo: [{href, t:[name, date, count], rows}] }
//   rows: [number, variant, name, category, rarity]   (variant = Limitless ?v= index, '' for the base print)
// don.json: [[code, productName, label]]   e.g. ["OP14", "The Azure Sea's Seven", "(Egghead)"]
//
// One set file per product (booster, extra/premium booster, starter deck), cards
// grouped by rarity with parallels/alt arts, reprints and DON!! in their own
// sections. Promos: one set per year, a section per promo product.
import { writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'

const [lfile, dfile] = process.argv.slice(2)
if (!lfile || !dfile) { console.error('usage: node scripts/ingest-onepiece.mjs <limitless.json> <don.json>'); process.exit(1) }
const L = JSON.parse(readFileSync(lfile, 'utf8'))
const DON = JSON.parse(readFileSync(dfile, 'utf8'))
const dataDir = new URL('../public/data/', import.meta.url)

const ORDER = ['Leader', 'Common', 'Uncommon', 'Rare', 'Super Rare', 'Secret Rare', 'Special Card', 'Treasure Rare', 'Promo', 'Parallels & Alt Arts', 'Reprints', 'DON!! Cards']
const rank = (s) => { const i = ORDER.indexOf(s); return i === -1 ? 99 : i }
const year = (d) => { const m = String(d || '').match(/(\d{2})\s*$/); return m ? 2000 + +m[1] : null }
const dash = (code) => code.replace(/^([A-Z]+)(\d+)$/, '$1-$2')            // OP01 -> OP-01
const norm = (code) => String(code).toUpperCase().replace(/-/g, '')        // ST-01 -> ST01
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim()

const donBy = {}
for (const [code, , label] of DON) (donBy[norm(code)] = donBy[norm(code)] || []).push(clean(label))

function build(rows, code) {
  const groups = {}
  const add = (sec, c) => (groups[sec] = groups[sec] || []).push(c)
  for (const [n, v, name, cat, rarity] of rows) {
    const own = !code || norm(n.split('-')[0]) === code
    const sec = v ? 'Parallels & Alt Arts' : own ? (clean(rarity) || 'Promo') : 'Reprints'
    add(sec, { n, p: clean(name), t: clean(cat), x: v ? 'Parallel' : (clean(rarity) || undefined) })
  }
  return groups
}
const toSections = (groups) => Object.keys(groups)
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  .map(title => ({ title, cards: groups[title] }))

// Replace any earlier One Piece files.
for (const f of readdirSync(dataDir)) if (/^one-piece-.*\.json$/.test(f)) unlinkSync(new URL(f, dataDir))

let ok = 0, total = 0
const write = (out) => {
  writeFileSync(new URL(out.slug + '.json', dataDir), JSON.stringify(out))
  ok++; total += out.sections.reduce((n, s) => n + s.cards.length, 0)
}

const seenDon = new Set()
for (const s of L.sets) {
  const [code, name, date, count] = s.t
  const rows = L.lt[s.href] || []
  if (rows.length !== parseInt(count)) throw new Error(code + ': expected ' + count + ' cards, got ' + rows.length)
  const groups = build(rows, norm(code))
  for (const [i, label] of (donBy[norm(code)] || []).entries()) (groups['DON!! Cards'] = groups['DON!! Cards'] || []).push({ n: 'DON-' + (i + 1), p: 'DON!! Card ' + label, t: 'DON!!', x: 'DON!!' })
  if (donBy[norm(code)]) seenDon.add(norm(code))
  let title = clean(name)
  if (/^ST/.test(code) && !/deck/i.test(title)) title = 'Starter Deck: ' + title
  write({ slug: 'one-piece-' + dash(code).toLowerCase(), name: 'One Piece ' + dash(code) + ' ' + title, year: year(date), sport: 'One Piece', source: 'limitlesstcg.com', sections: toSections(groups) })
}

// Promos: one set per year; undated products (prize cards, misc) get their own set.
const promoSets = {}
for (const p of L.promo) {
  const [pname, date, count] = p.t
  if (p.rows.length !== parseInt(count)) throw new Error(pname + ': expected ' + count + ', got ' + p.rows.length)
  const y = year(date)
  const key = y ? String(y) : clean(pname)
  const set = promoSets[key] = promoSets[key] || { y, name: y ? 'One Piece Promos ' + y : 'One Piece ' + clean(pname), sections: [] }
  const cards = p.rows.map(([n, v, name, cat, rarity]) => ({ n, p: clean(name), t: clean(cat), x: v ? 'Parallel' : (clean(rarity) || 'Promo') }))
  set.sections.push({ title: clean(pname), cards })
}
const extraDon = Object.entries(donBy).filter(([c]) => !seenDon.has(c)).flatMap(([c, labels]) => labels.map(l => [c, l]))
if (extraDon.length) {
  const misc = promoSets['Misc. Promos'] || Object.values(promoSets).find(s => !s.y)
  misc.sections.push({ title: 'DON!! Cards', cards: extraDon.map(([c, l], i) => ({ n: 'DON-' + (i + 1), p: 'DON!! Card ' + l, t: 'DON!!', x: 'DON!!' })) })
}
for (const s of Object.values(promoSets)) {
  write({ slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''), name: s.name, year: s.y || 2026, sport: 'One Piece', source: 'limitlesstcg.com', sections: s.sections })
}

// Old combined slugs from the optcgapi import.
const rp = new URL('redirects.json', dataDir)
const redirects = existsSync(rp) ? JSON.parse(readFileSync(rp, 'utf8')) : {}
Object.assign(redirects, { 'one-piece-op14-eb04': 'one-piece-op-14', 'one-piece-op15-eb04': 'one-piece-op-15' })
writeFileSync(rp, JSON.stringify(redirects))

console.log('ingest-onepiece ->', ok, 'sets,', total.toLocaleString(), 'cards')
