// Add sets to the free bulk catalog that lives on the repo's `catalog` branch
// (served to the site through the jsDelivr CDN, so it never touches the Vercel
// deploy or Supabase). Run from a checkout of main with the catalog branch
// checked out as a worktree:
//
//   git worktree add ../catalog catalog
//   node scripts/catalog-build.mjs ../catalog <dump.json> [<dump.json> ...]
//
// Dumps are either TCDB browser dumps ([{ sid, name, year, sport, sections }])
// or set files ([{ slug, name, year, sport, source, sections }]).
//
// Catalog layout:
//   sets/<hh>/<slug>.json   one set, same shape as public/data/<slug>.json (hh = fnv1a(slug) & 0xff, hex)
//   index/<sport>.json      { sets: [{ slug, name, year, sport, cardCount, sections, source }] }
//   manifest.json           { updated, sports: { <sport>: { file, sets, cards } }, sets, cards }
//
// Sets already on the site as static files (same slug, or the same product by
// merge-browser-dump's year+name key) are skipped: the static versions are the
// curated ones (Break Ninja parallels, print runs).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const [root, ...dumps] = process.argv.slice(2)
if (!root || !dumps.length) { console.error('usage: node scripts/catalog-build.mjs <catalogDir> <dump.json>...'); process.exit(1) }

export const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
const shard = (slug) => (fnv(slug) & 0xff).toString(16).padStart(2, '0')
const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sportFile = (sp) => slugify(sp) || 'other'

// Same product key as merge-browser-dump.mjs, so "2024 Topps Chrome Disney" from
// TCDB matches a static "2024-topps-chrome-disney-entertainment".
const STOP = new Set(['and', 'the', 'card', 'cards', 'trading', 'checklist', 'checklists', 'x', 'edition', 'series', 'set', 'mlb', 'nba', 'nfl', 'nhl', 'mma', 'autographed', 'photo', 'box', 'ud', 'upper', 'deck', 'panini', 'topps', 'hobby', 'entertainment', 'baseball', 'basketball', 'football', 'hockey', 'soccer', 'racing', 'wrestling', 'golf', 'tennis', 'boxing', 'ufc', 'non', 'sport', 'scp'])
const key = (slug) => slug.toLowerCase().replace(/^(\d{2})-(\d{2})-/, '20$1-$2-').split('-').filter(t => t && !STOP.has(t)).sort().join('-')

const staticIndex = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8')).sets || []
const staticSlugs = new Set(staticIndex.map(s => s.slug))
const staticKeys = new Set(staticIndex.map(s => key(s.slug)))

mkdirSync(join(root, 'sets'), { recursive: true })
mkdirSync(join(root, 'index'), { recursive: true })
const manifestPath = join(root, 'manifest.json')
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { sports: {} }
const indexes = {}
const loadIndex = (sp) => {
  const f = sportFile(sp)
  if (!indexes[f]) {
    const p = join(root, 'index', f + '.json')
    const arr = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).sets : []
    indexes[f] = { sport: sp, map: new Map(arr.map(s => [s.slug, s])) }
  }
  return indexes[f]
}

// Same product already in the catalog from another source: keep whichever has more cards.
const catKey = new Map()
for (const f of existsSync(join(root, 'index')) ? readdirSync(join(root, 'index')) : []) {
  const sp = JSON.parse(readFileSync(join(root, 'index', f), 'utf8')).sets || []
  for (const s of sp) catKey.set(key(s.slug), { slug: s.slug, sport: s.sport, n: s.cardCount || 0 })
}
let added = 0, updated = 0, skippedStatic = 0, empty = 0, cards = 0, replaced = 0, skippedDup = 0
for (const file of dumps) {
  for (const raw of JSON.parse(readFileSync(file, 'utf8'))) {
    if (raw.err) { empty++; continue }
    const sections = (raw.sections || [])
      .map(sec => ({ title: sec.title || 'Base', cards: (sec.cards || []).filter(c => c && c.p).map(c => { const o = { n: c.n || '', p: c.p }; if (c.t) o.t = c.t; if (c.x) o.x = c.x; return o }) }))
      .filter(sec => sec.cards.length)
    if (!sections.length) { empty++; continue }
    const slug = raw.slug || slugify(raw.name)
    if (staticSlugs.has(slug) || staticKeys.has(key(slug))) { skippedStatic++; continue }
    const n0 = sections.reduce((a, s) => a + s.cards.length, 0)
    const prev = catKey.get(key(slug))
    if (prev && prev.slug !== slug) {
      if (prev.n >= n0) { skippedDup++; continue }
      const pf = join(root, 'sets', shard(prev.slug), prev.slug + '.json')
      if (existsSync(pf)) unlinkSync(pf)
      loadIndex(prev.sport).map.delete(prev.slug)
      replaced++
    }
    catKey.set(key(slug), { slug, sport: raw.sport, n: n0 })
    const set = { slug, name: raw.name, year: raw.year ?? null, sport: raw.sport, source: raw.source || 'tcdb.com', sections }
    const dir = join(root, 'sets', shard(slug))
    mkdirSync(dir, { recursive: true })
    const p = join(dir, slug + '.json')
    existsSync(p) ? updated++ : added++
    writeFileSync(p, JSON.stringify(set))
    const n = sections.reduce((a, s) => a + s.cards.length, 0)
    cards += n
    loadIndex(set.sport).map.set(slug, { slug, name: set.name, year: set.year, sport: set.sport, cardCount: n, sections: sections.length, source: set.source })
  }
}

for (const [f, { sport, map }] of Object.entries(indexes)) {
  const sets = [...map.values()].sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name))
  writeFileSync(join(root, 'index', f + '.json'), JSON.stringify({ sets }))
  manifest.sports[sport] = { file: 'index/' + f + '.json', sets: sets.length, cards: sets.reduce((a, s) => a + (s.cardCount || 0), 0) }
}
manifest.sets = Object.values(manifest.sports).reduce((a, s) => a + s.sets, 0)
manifest.cards = Object.values(manifest.sports).reduce((a, s) => a + s.cards, 0)
manifest.updated = new Date().toISOString()
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
console.log(`catalog: +${added} new, ${updated} updated, ${replaced} replaced fuller, ${skippedDup} dup kept, ${skippedStatic} already static, ${empty} empty; ${cards.toLocaleString()} cards this run; catalog total ${manifest.sets.toLocaleString()} sets / ${manifest.cards.toLocaleString()} cards`)
