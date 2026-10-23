// Remove bulk-catalog entries that are fragments of a set the site already has.
//
// SportsCardsPro (scp-*) entries are price-guide pages, not checklists: they list
// only cards that have sold, and the guide splits every insert into its own
// "set" ("2008 Upper Deck the Cup Honorable Numbers" = 1 card). When the full
// checklist is already on the site (a static file, or a TCDB catalog set), such
// an entry duplicates it at best and shows a hole at worst.
//
// An scp entry is pruned when ALL of these hold:
//   1. A real set (static, or a non-scp catalog set) has the same sport and
//      first year, and its name words are a subset of the entry's name words —
//      the same product, or that product plus an insert name. Hockey/basketball
//      seasons count as their first year ("2005" matches "2005-06").
//   2. Both classify to the same product line (lib/brands.js), so "Black Diamond
//      Run for the Cup" is never folded into The Cup.
//   3. Every player on the entry is already on the real set (by surname), so
//      nothing a collector could look up is lost.
// Each pruned slug is redirected to the real set in public/data/redirects.json.
//
//   git worktree add ../catalog catalog
//   node scripts/catalog-prune.mjs ../catalog            # dry run: report only
//   node scripts/catalog-prune.mjs ../catalog --write    # apply
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { classifySet } from '../lib/brands.js'

const [root, flag] = process.argv.slice(2)
if (!root) { console.error('usage: node scripts/catalog-prune.mjs <catalogDir> [--write]'); process.exit(1) }
const WRITE = flag === '--write'

const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
const setFile = (slug) => join(root, 'sets', (fnv(slug) & 0xff).toString(16).padStart(2, '0'), slug + '.json')
const dataDir = new URL('../public/data/', import.meta.url)
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const STOP = new Set('and the card cards trading checklist checklists x edition set mlb nba nfl nhl mma hobby baseball basketball football hockey soccer racing wrestling golf tennis boxing ufc all scp ud upper deck panini topps'.split(' '))
function parse(name) {
  const n = String(name).toLowerCase().replace('checklist:', '')
  const m = n.match(/^\s*(\d{4})(?:[-/](\d{2,4}))?/)
  const rest = m ? n.slice(m[0].length) : n
  return { year: m ? +m[1] : null, words: new Set((rest.match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w))) }
}
const subset = (a, b) => { for (const w of a) if (!b.has(w)) return false; return true }

const surname = (p) => {
  const w = String(p).replace(/\[.*?\]|#\S+|\/\d+/g, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/)
  while (w.length > 1 && /^(jr|sr|ii|iii|iv|v)$/.test(w[w.length - 1])) w.pop()
  return w[w.length - 1] || ''
}
const players = (set) => {
  const out = new Set()
  for (const sec of set.sections || []) for (const c of sec.cards || []) {
    for (const part of String(c.p || '').replace(/\[.*?\]|#\S+\s*\/\d+/g, '').split(/\s*\/\s*|\s+&\s+/)) { const s = surname(part); if (s) out.add(s) }
  }
  return out
}

// Real sets: static files + non-scp catalog sets.
const staticIndex = readJson(new URL('index.json', dataDir)).sets || []
const indexFiles = readdirSync(join(root, 'index')).filter(f => f.endsWith('.json'))
const indexes = Object.fromEntries(indexFiles.map(f => [f, readJson(join(root, 'index', f))]))
const real = new Map()
const addReal = (s, where) => {
  const p = parse(s.name)
  if (!p.year || !p.words.size) return
  const k = p.year + '|' + s.sport
  if (!real.has(k)) real.set(k, [])
  real.get(k).push({ s, where, words: p.words })
}
for (const s of staticIndex) addReal(s, 'static')
for (const idx of Object.values(indexes)) for (const s of idx.sets) if (s.source !== 'sportscardspro.com') addReal(s, 'catalog')

const parentCache = new Map()
const parentPlayers = (r) => {
  if (!parentCache.has(r.s.slug)) {
    const f = r.where === 'static' ? new URL(r.s.slug + '.json', dataDir) : setFile(r.s.slug)
    parentCache.set(r.s.slug, existsSync(f) ? players(readJson(f)) : new Set())
  }
  return parentCache.get(r.s.slug)
}

// Words that name a parallel, a card type or nothing at all — not an insert.
const GENERIC = new Set('base rc rookie rookies card cards set parallel parallels variation variations gold silver bronze red blue green black white orange purple pink yellow rainbow platinum refractor refractors prizm prizms holo foil mini minis sp ssp short print printing plate plates press proof proofs 1 2 3 4 5 of a in on no numbered auto autos autograph autographs signed edition jumbo exclusive retail hobby'.split(' '))
const titleWords = (t) => new Set((String(t || '').toLowerCase().replace(/colour/g, 'color').match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w)))
const sectionCache = new Map()
const parentSections = (r) => {
  if (!sectionCache.has(r.s.slug)) {
    const f = r.where === 'static' ? new URL(r.s.slug + '.json', dataDir) : setFile(r.s.slug)
    sectionCache.set(r.s.slug, existsSync(f) ? (readJson(f).sections || []).map(x => titleWords(x.title)) : [])
  }
  return sectionCache.get(r.s.slug)
}
const missingInserts = new Map() // real slug -> insert names scp shows that it has no section for

// Fragments checked by hand that the automatic rules can't settle. Each maps to
// the real set it belongs to; `hint` lands in the hole report for follow-up.
const REVIEWED = {
  // SCP misspells Jari Kurri ("Kjurri"); he's in 2009-10 The Cup Signature Patches.
  'scp-hockey-cards-2009-upper-deck-the-cup-signature-patches': { to: '2009-10-upper-deck-the-cup-hockey' },
  // One card (Mark Stone #548) SCP files under The Cup; not on our Cup or UC checklist — verify.
  'scp-hockey-cards-2013-upper-deck-the-cup-ultimate-collection-rookies-printing-plates': { to: '2013-14-upper-deck-the-cup-hockey', hint: 'mark stone #548 (ultimate collection rookies printing plate)' }
}

const prune = new Map() // scp slug -> parent slug
const kept = { noParent: 0, otherProduct: 0, extraPlayers: 0 }
const holeHints = new Map() // parent slug -> players seen on scp but missing from the parent
for (const [file, idx] of Object.entries(indexes)) {
  for (const s of idx.sets) {
    if (s.source !== 'sportscardspro.com') continue
    if (REVIEWED[s.slug]) {
      const { to, hint } = REVIEWED[s.slug]
      if (hint) { const h = holeHints.get(to) || new Set(); h.add(hint); holeHints.set(to, h) }
      prune.set(s.slug, to)
      continue
    }
    const p = parse(s.name)
    let best = null
    for (const r of real.get(p.year + '|' + s.sport) || []) if (subset(r.words, p.words) && (!best || r.words.size > best.words.size)) best = r
    if (!best) { kept.noParent++; continue }
    if (classifySet(s.name, s.year).product !== classifySet(best.s.name, best.s.year).product) { kept.otherProduct++; continue }
    const f = setFile(s.slug)
    if (!existsSync(f)) continue
    const entry = readJson(f)
    // Inserts named by the entry (its extra name words, and its own section
    // titles) that the real set has no section for: the real set is missing them.
    const secs = parentSections(best)
    const wanted = [[...p.words].filter(w => !best.words.has(w))].concat((entry.sections || []).map(x => [...titleWords(x.title)]))
    for (const ws0 of wanted) {
      const ws = ws0.filter(w => !GENERIC.has(w))
      if (!ws.length || secs.some(t => ws.every(w => t.has(w)))) continue
      const label = ws.join(' ')
      const m = missingInserts.get(best.s.slug) || new Set(); m.add(label); missingInserts.set(best.s.slug, m)
    }
    const have = parentPlayers(best)
    const missing = [...players(entry)].filter(x => !have.has(x))
    if (missing.length) {
      kept.extraPlayers++
      const h = holeHints.get(best.s.slug) || new Set(); missing.forEach(m => h.add(m)); holeHints.set(best.s.slug, h)
      continue
    }
    prune.set(s.slug, best.s.slug)
  }
}

if (process.env.DUMP) writeFileSync(process.env.DUMP, JSON.stringify([...prune]))
console.log(`prune ${prune.size} fragment entries; kept ${kept.noParent} with no matching set, ${kept.otherProduct} of a different product, ${kept.extraPlayers} with players the real set lacks`)
// Review list for completing the real sets: players and inserts scp proves exist.
const report = {}
for (const slug of new Set([...holeHints.keys(), ...missingInserts.keys()])) {
  report[slug] = { missingPlayers: [...(holeHints.get(slug) || [])].sort(), missingInserts: [...(missingInserts.get(slug) || [])].sort() }
}
const order = Object.keys(report).sort((a, b) => (report[b].missingPlayers.length + 5 * report[b].missingInserts.length) - (report[a].missingPlayers.length + 5 * report[a].missingInserts.length))
writeFileSync(new URL('../scripts/data/catalog-hole-hints.json', import.meta.url), JSON.stringify(Object.fromEntries(order.map(k => [k, report[k]])), null, 1))
console.log(`${holeHints.size} real sets lack players scp has sold; ${missingInserts.size} lack inserts scp lists — see scripts/data/catalog-hole-hints.json`)

if (!WRITE) { console.log('dry run — pass --write to apply'); process.exit(0) }

// Apply: drop files + index rows, refresh the manifest, add redirects.
const manifest = readJson(join(root, 'manifest.json'))
for (const [file, idx] of Object.entries(indexes)) {
  const before = idx.sets.length
  idx.sets = idx.sets.filter(s => !prune.has(s.slug))
  if (idx.sets.length === before) continue
  writeFileSync(join(root, 'index', file), JSON.stringify(idx))
}
for (const slug of prune.keys()) { const f = setFile(slug); if (existsSync(f)) unlinkSync(f) }
let totalSets = 0, totalCards = 0
for (const [sport, m] of Object.entries(manifest.sports)) {
  const idx = indexes[m.file.replace(/^index\//, '')]
  if (!idx) continue
  m.sets = idx.sets.length
  m.cards = idx.sets.reduce((a, s) => a + (s.cardCount || 0), 0)
  totalSets += m.sets; totalCards += m.cards
}
manifest.sets = totalSets; manifest.cards = totalCards; manifest.updated = new Date().toISOString()
writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 1))

const redirectsPath = new URL('redirects.json', dataDir)
const redirects = existsSync(redirectsPath) ? readJson(redirectsPath) : {}
for (const [from, to] of prune) redirects[from] = to
writeFileSync(redirectsPath, JSON.stringify(redirects))
console.log(`wrote: ${prune.size} removed, manifest now ${totalSets} sets / ${totalCards} cards, redirects ${Object.keys(redirects).length}`)
