// Build public/data/search-index.json — a compact, dictionary-encoded index so
// global player search is a single fetch. Repeated strings (set slugs, section
// titles, teams) are pooled and referenced by integer id; each card row is
//   [player, slugId, number, sectionId, teamId, flag]
//   node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const skip = new Set(['index.json', 'search-index.json', 'patch-swaps.json'])

const slugs = [], sections = [], teams = []
const slugId = new Map(), secId = new Map(), teamId = new Map()
const intern = (val, pool, map) => {
  if (val == null || val === '') return -1
  if (map.has(val)) return map.get(val)
  const id = pool.length
  pool.push(val); map.set(val, id)
  return id
}

const rows = []
const slugSport = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || skip.has(f)) continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch (e) { continue }
  if (!s.slug || s.incomplete) continue
  const sid = intern(s.slug, slugs, slugId)
  slugSport[sid] = s.sport
  // Parallel-heavy sources (Break Ninja) repeat the same card across hundreds
  // of parallel sections; collapse to one search row per (set, number, player)
  // so the client index stays loadable. The set page still shows every parallel.
  const seen = new Set()
  for (const sec of (s.sections || [])) {
    const secIdx = intern(sec.title, sections, secId)
    for (const c of sec.cards) {
      const key = c.n + '' + c.p
      if (seen.has(key)) continue
      seen.add(key)
      rows.push([c.p, sid, c.n, secIdx, intern(c.t || '', teams, teamId), c.x || ''])
    }
  }
}
writeFileSync(new URL('search-index.json', dataDir), JSON.stringify({ slugs, sections, teams, rows }))
console.log('search index:', rows.length.toLocaleString(), 'cards |', slugs.length, 'slugs,', sections.length, 'sections,', teams.length, 'teams')

// Small slices for the browse filters, so a phone never downloads the full index:
//   teams/<sport>.json         sports: { teams: [[name, cards], ...] }   TCG: the whole game's rows
//   teams/<sport>/<i>.json     one team's rows (sports only)
// Each slice uses the same { slugs, sections, teams, rows } shape as search-index.json.
const TCG = new Set(['Pokémon', 'Yu-Gi-Oh!', 'Magic', 'Lorcana', 'One Piece', 'Disney'])
const isTeam = (t) => t && /[A-Za-z]{3,}/.test(t) && !/^#/.test(t) && !/\d\s*\/\s*\d/.test(t) && !/^\/?\s*\d/.test(t) && t.length >= 4
export const sportFile = (sp) => sp.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const outDir = new URL('teams/', dataDir)
rmSync(outDir, { recursive: true, force: true }); mkdirSync(outDir, { recursive: true })
function slice(list) {
  const S = [], X = [], T = [], ms = new Map(), mx = new Map(), mt = new Map()
  const out = list.map(r => [r[0], intern(slugs[r[1]], S, ms), r[2], r[3] >= 0 ? intern(sections[r[3]], X, mx) : -1, r[4] >= 0 ? intern(teams[r[4]], T, mt) : -1, r[5]])
  return JSON.stringify({ slugs: S, sections: X, teams: T, rows: out })
}
const bySport = new Map()
for (const r of rows) { const sp = slugSport[r[1]]; if (!sp) continue; if (!bySport.has(sp)) bySport.set(sp, []); bySport.get(sp).push(r) }
let files = 0
for (const [sp, list] of bySport) {
  const f = sportFile(sp)
  if (TCG.has(sp)) { writeFileSync(new URL(f + '.json', outDir), slice(list)); files++; continue }
  const byTeam = new Map()
  for (const r of list) { if (r[4] < 0) continue; const t = teams[r[4]]; if (!isTeam(t)) continue; if (!byTeam.has(t)) byTeam.set(t, []); byTeam.get(t).push(r) }
  const list2 = [...byTeam.entries()].filter(([, v]) => v.length >= 3).sort((a, b) => a[0].localeCompare(b[0]))
  mkdirSync(new URL(f + '/', outDir), { recursive: true })
  list2.forEach(([, v], i) => { writeFileSync(new URL(f + '/' + i + '.json', outDir), slice(v)); files++ })
  writeFileSync(new URL(f + '.json', outDir), JSON.stringify({ teams: list2.map(([t, v]) => [t, v.length]) })); files++
}
console.log('browse slices:', files, 'files in public/data/teams/')
