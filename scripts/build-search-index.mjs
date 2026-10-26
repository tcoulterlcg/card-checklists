// Build public/data/search-index.json — a compact, dictionary-encoded index so
// global player search is a single fetch. Repeated strings (set slugs, section
// titles, teams) are pooled and referenced by integer id; each card row is
//   [player, slugId, number, sectionId, teamId, flag]
//   node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const skip = new Set(['index.json', 'search-index.json', 'patch-swaps.json', 'rpa-index.json', 'redirects.json'])   // generated/aux files, not sets

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
    for (const c of sec.cards || []) {
      const key = c.n + '' + c.p
      if (seen.has(key)) continue
      seen.add(key)
      rows.push([c.p, sid, c.n, secIdx, intern(c.t || '', teams, teamId), c.x || ''])
    }
  }
}
// The full index (~95 MB) is only an intermediate for the browse slices below; nothing on the
// site loads it, so it is no longer written into public/ (it was being deployed as a static file).
console.log('search index:', rows.length.toLocaleString(), 'cards |', slugs.length, 'slugs,', sections.length, 'sections,', teams.length, 'teams')

// Small slices for the browse filters, so a phone never downloads the full index:
//   teams/<sport>.json         sports: { teams: [[name, cards], ...] }   TCG: the whole game's rows
//   teams/<sport>/<i>.json     one team's rows (sports only)
// Each slice uses the same { slugs, sections, teams, rows } shape as search-index.json.
const TCG = new Set(['Pokémon', 'Yu-Gi-Oh!', 'Magic', 'Lorcana', 'One Piece', 'Disney'])
const isTeam = (t) => t && /[A-Za-z]{3,}/.test(t) && !/^#/.test(t) && !/\d\s*\/\s*\d/.test(t) && !/^\/?\s*\d/.test(t) && t.length >= 4
  && !/^[a-z]/.test(t)            // TCDB variation notes in the team column ("bat knob", "correct photo")
  && !/^AU\d|^AU, SN\d|\bSN\d{4,}/.test(t)   // flag text glued onto a year ("AU, SN1992012 Game")
// Checklist tags that land in the team column; not teams.
const NOT_TEAM = /^(all[- ]?rookies?|one of ones|no team|none|retired|rookie debut|team logo|letter|lace|third threads|team highlights|draft prospect|program of excellence|topps of the decade|topps hockey classics|veterans?|legends|rookies)$/i
const fold = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const TYPOS = { 'ottowa senators': 'Ottawa Senators', 'vegas golden knight': 'Vegas Golden Knights', 'st louis blues': 'St. Louis Blues' }
// One browse entry per team: "Bruins" / "Boston" / "Boston Bruins" -> Boston Bruins, accents and case folded.
function teamCanon(names) {
  const counts = new Map()   // folded -> [display, count]
  for (const [t, n] of names) { const k = fold(t); const c = counts.get(k); if (!c) counts.set(k, [t, n]); else { if (n > c[1] && /[A-Z]/.test(t)) c[0] = t; c[1] += n } }
  const full = [...counts.entries()].filter(([k]) => k.includes(' ')).sort((a, b) => b[1][1] - a[1][1])
  const tail = new Map(), head = new Map()   // nickname / city -> full names using it
  for (const [k] of full) {
    const w = k.split(' ')
    for (let i = 1; i < w.length; i++) { const nick = w.slice(i).join(' '), city = w.slice(0, i).join(' '); (tail.get(nick) || tail.set(nick, []).get(nick)).push(k); (head.get(city) || head.set(city, []).get(city)).push(k) }
  }
  const map = new Map()   // original name -> canonical display
  for (const [t] of names) {
    let k = fold(t)
    if (TYPOS[k]) k = fold(TYPOS[k])
    if (!counts.has(k) || !k.includes(' ')) {
      const big = (arr) => arr && arr.filter(x => counts.get(x)[1] >= 50)
      const byNick = big(tail.get(k)), byCity = big(head.get(k))
      if (byNick && byNick.length === 1) k = byNick[0]
      else if (byCity && byCity.length === 1) k = byCity[0]
    }
    map.set(t, (counts.get(k) || [TYPOS[fold(t)] || t])[0])
  }
  return map
}
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
  // a combo card ("Washington Capitals / Pittsburgh Penguins") is listed under each team, not as its own "team"
  for (const r of list) {
    if (r[4] < 0) continue
    for (const t of new Set(teams[r[4]].split(/\s+\/\s+/).map(x => x.trim()))) { if (!isTeam(t) || NOT_TEAM.test(t)) continue; if (!byTeam.has(t)) byTeam.set(t, []); byTeam.get(t).push(r) }
  }
  // merge spellings / nicknames into one entry per team
  const canon = teamCanon([...byTeam.entries()].map(([t, v]) => [t, v.length]))
  const merged = new Map()
  for (const [t, v] of byTeam) { const c = canon.get(t) || t; const seen = merged.get(c) || merged.set(c, new Set()).get(c); for (const r of v) seen.add(r) }
  byTeam.clear(); for (const [t, v] of merged) byTeam.set(t, [...v])
  const list2 = [...byTeam.entries()].filter(([, v]) => v.length >= 3).sort((a, b) => a[0].localeCompare(b[0]))
  mkdirSync(new URL(f + '/', outDir), { recursive: true })
  // slice files are named after the team, not its position in the list, so a cached older list
  // can never load a different team's cards after a rebuild
  const used = new Set()
  const fileOf = list2.map(([t]) => { const b = sportFile(t) || 'team'; let n = b, k = 2; while (used.has(n)) n = b + '-' + k++; used.add(n); return n })
  list2.forEach(([, v], i) => { writeFileSync(new URL(f + '/' + fileOf[i] + '.json', outDir), slice(v)); files++ })
  writeFileSync(new URL(f + '.json', outDir), JSON.stringify({ teams: list2.map(([t, v], i) => [t, v.length, fileOf[i]]) })); files++
}
console.log('browse slices:', files, 'files in public/data/teams/')
