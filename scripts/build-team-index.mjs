// Build the team index (static + catalog sets) that powers "My PC" team chases ("Lightning shields", "Rays SuperFractors").
//
//   public/data/pc-teams/dir.json        — { v, teams: [[name, sport, cards, file], ...] }  (most cards first)
//   public/data/pc-teams/<file>.json     — one team's cards, grouped by set section:
//     { sets: [[slug, name, year]], sections: [...], players: [...],
//       groups: [[setIdx, sectionIdx, playerIdx, number, flags, playerIdx, number, flags, ...], ...] }
//
// Reads the same sets as the player index: static sets in public/data plus the catalog sets that
// build-player-index.mjs caches in node_modules/.cache/catalog-sets (run that first).
// One team = one name in one sport ("Tampa Bay Lightning" / Hockey). Cards listing two teams
// ("Lightning / Red Wings") count for both. Tiny or junk team names are left out.
//
//   node scripts/build-team-index.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const cacheDir = new URL('../node_modules/.cache/catalog-sets/', import.meta.url)
const outDir = new URL('../public/data/pc-teams/', import.meta.url)
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const MIN_CARDS = 100
const NO_TEAM_SPORTS = new Set(['', 'Entertainment', 'Non-Sport', 'Lorcana', 'Disney', 'Pokémon', 'Magic', 'One Piece', 'Yu-Gi-Oh!'])

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['‘’`.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ')
// a real team name: has a word, isn't a flag list / print run / sport name
const okTeam = (t) => /[A-Za-z]{3,}/.test(t) && !/^[a-z]/.test(t) && t.length <= 60 && !/#|\d\/\d|^\//.test(t) && !/^(baseball|basketball|football|hockey|soccer|checklist|team card|rookie|rc|au|mem|sp|ssp)$/i.test(t)
  && !/^(?:(?:URA?|AUR?|MEM|RC|SP|SSP|SN\d+)(?:,\s*|$))+$/.test(t)

// card-level flags from TCDB's flag column: A = autograph, R = rookie, 1 = one-of-one, N = numbered
const flagCode = (x) => {
  const f = String(x || ''); if (!f) return ''
  return (/\bAU\b/.test(f) ? 'A' : '') + (/\bRC\b/.test(f) ? 'R' : '') + (/(^|\s)\/1(\s|$)/.test(f) ? '1' : /(^|\s)\/\d+(\s|$)/.test(f) ? 'N' : '')
}
const intern = (v, arr, map) => { let i = map.get(v); if (i === undefined) { i = arr.length; arr.push(v); map.set(v, i) } return i }

const files = []
for (const f of readdirSync(dataDir)) if (f.endsWith('.json') && !SKIP.test(f)) files.push(new URL(f, dataDir))
const staticSlugs = new Set(readdirSync(dataDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)))
if (existsSync(cacheDir)) for (const f of readdirSync(cacheDir)) if (f.endsWith('.json') && !staticSlugs.has(decodeURIComponent(f.slice(0, -5)))) files.push(new URL(f, cacheDir))

// key "norm|sport" -> team bucket
const teams = new Map()
let sets = 0
for (const u of files) {
  let s
  try { s = JSON.parse(readFileSync(u, 'utf8')) } catch { continue }
  if (!s.slug || !Array.isArray(s.sections) || s.incomplete || NO_TEAM_SPORTS.has(s.sport || '')) continue
  sets++
  for (const sec of s.sections) {
    for (const c of sec.cards || []) {
      if (!c.t || !c.p) continue
      for (const raw of String(c.t).split(/\s+\/\s+|\s*;\s*/)) {
        const t = raw.trim(); if (!okTeam(t)) continue
        const key = norm(t) + '|' + s.sport
        let b = teams.get(key)
        if (!b) { b = { names: new Map(), sport: s.sport, cards: 0, sets: [], setId: new Map(), setMeta: [], sections: [], secId: new Map(), players: [], plId: new Map(), groups: new Map() }; teams.set(key, b) }
        b.names.set(t, (b.names.get(t) || 0) + 1)
        b.cards++
        const si = intern(s.slug, b.sets, b.setId)
        if (!b.setMeta[si]) b.setMeta[si] = [s.slug, s.name || s.slug, s.year || 0]
        const xi = intern(sec.title || '', b.sections, b.secId)
        const gk = si + ':' + xi
        let g = b.groups.get(gk); if (!g) { g = [si, xi]; b.groups.set(gk, g) }
        g.push(intern(c.p, b.players, b.plId), c.n == null ? '' : String(c.n), flagCode(c.x))
      }
    }
  }
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true })
mkdirSync(outDir, { recursive: true })
const dir = []
let file = 0, rows = 0
for (const b of [...teams.values()].filter(b => b.cards >= MIN_CARDS).sort((a, b) => b.cards - a.cards)) {
  const name = [...b.names.entries()].sort((a, b) => b[1] - a[1])[0][0]
  writeFileSync(new URL(file + '.json', outDir), JSON.stringify({ name, sport: b.sport, sets: b.setMeta, sections: b.sections, players: b.players, groups: [...b.groups.values()] }))
  dir.push([name, b.sport, b.cards, file++])
  rows += b.cards
}
writeFileSync(new URL('dir.json', outDir), JSON.stringify({ v: 1, teams: dir }))
console.log('team index:', dir.length.toLocaleString(), 'teams,', rows.toLocaleString(), 'card rows from', sets.toLocaleString(), 'sets')
