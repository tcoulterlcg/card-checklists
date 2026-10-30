// Build the data for the Grid game (?view=grid) — CardHQ's take on Immaculate Grid.
//
// Reads what build-player-index.mjs wrote (players/dir.json, players/<shard>.json, players/sets.json)
// and writes one small file per mode:
//
//   public/data/grid/modes.json           — [{ id, label, group, players, cats }]
//   public/data/grid/<mode>.json          — { v, id, label, players: [[name, cards], ...],
//                                             cats: [[kind, label], ...], cells: { "a-b": [playerIdx, ...] } }
//
// A square is the pair of its row and column categories. A player answers a square when ONE of
// their cards matches both (a Lightning card from The Cup, a rookie autograph from the 2010s),
// except team x team, which works like the original game: cards with both teams over a career.
// Players are the most-carded in each mode (index order = most cards first), so answers are
// people collectors know. Only pairs with at least MIN_ANSWERS players are written; the page
// builds every grid from those, so every square it shows can be solved.
//
//   node scripts/build-grid-index.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { classifySet } from '../lib/brands.js'
import { TYPE } from '../lib/query.js'

const pDir = new URL('../public/data/players/', import.meta.url)
const outDir = new URL('../public/data/grid/', import.meta.url)
if (!existsSync(new URL('dir.json', pDir)) || !existsSync(new URL('sets.json', pDir))) {
  console.log('grid: player index not built, skipping'); process.exit(0)
}
const dir = JSON.parse(readFileSync(new URL('dir.json', pDir), 'utf8'))
const setMeta = JSON.parse(readFileSync(new URL('sets.json', pDir), 'utf8'))
const sportName = (i) => dir.sports[i] || ''

// team cards, checklists and other non-people that the player index lists like players
const NOT_A_PLAYER = /^(team|teams|checklist|checklists|header|logo|title card|puzzle|unknown|various|multiple players?|team (card|checklist|photo|logo)|tba|tbd|badge|emblem|crest|escudo|kit|shield|squadra|équipe|equipe|mannschaft|scudetto|mascot|stadium|trophy|angel|miguel)$|\bteam (card|checklist|photo|logo)\b/i
const MIN_ANSWERS = 3   // a square needs at least this many answers
const MIN_CAT = 12      // a category needs at least this many players in the mode

const SPORT_MODES = [
  ['hockey', 'Hockey', 'Hockey'], ['football', 'Football', 'Football'], ['baseball', 'Baseball', 'Baseball'],
  ['basketball', 'Basketball', 'Basketball'], ['soccer', 'Soccer', 'Soccer']
]
const TCG_MODES = [['pokemon', 'Pokémon', 'Pokémon']]   // other TCGs: card names, not characters; no grid yet
const modes = []
for (const [id, label, sport] of SPORT_MODES) modes.push({ id, label, group: 'sport', kind: 'sport', sports: new Set([sport]), size: 2500 })
modes.push({ id: 'multi', label: 'Multi-sport', group: 'sport', kind: 'multi', sports: new Set(SPORT_MODES.map(m => m[2])), size: 600 })   // size per sport
for (const [id, label, sport] of TCG_MODES) modes.push({ id, label, group: 'tcg', kind: 'tcg', sports: new Set([sport]), size: 1500 })

// ---- eligible players per mode (dir is sorted most cards first) ----
const modesOf = new Map()   // player id -> [{ mode, idx }]
for (const m of modes) {
  m.players = []; m.perSport = new Map()
  for (const p of dir.players) {
    const sp = sportName(p[3]); if (!m.sports.has(sp)) continue
    const n = m.perSport.get(sp) || 0; if (n >= m.size) continue
    if (!/[a-z]/i.test(p[0]) || p[0].length < 3 || NOT_A_PLAYER.test(p[0].trim()) || /^(badge|emblem|crest|logo|coat of arms|escudo|ecusson|écusson|official logo|club emblem|scudetto|team|club badge|club crest|club logo|kit|stadium)\b|\bFOIL$/i.test(p[0])) continue
    m.perSport.set(sp, n + 1)
    let list = modesOf.get(p[6]); if (!list) modesOf.set(p[6], list = [])
    list.push({ m, idx: m.players.length, sport: sp })
    m.players.push({ name: p[0], cards: p[2], sport: sp, pairs: new Set(), teams: new Set() })
  }
  // most cards first across sports too (multi-sport interleaves by volume)
  m.cats = []; m.catId = new Map()
}
const cat = (m, kind, label) => { const k = kind + '|' + label; let i = m.catId.get(k); if (i == null) { i = m.cats.length; m.cats.push([kind, label]); m.catId.set(k, i) } return i }

// ---- per-card attributes ----
const decadeLabel = (y) => { const d = y ? Math.floor((y - 1) / 10) * 10 : 0; return d ? d + 's' : '' }
const cleanTeam = (t) => {
  t = String(t || '').trim()
  if (!t || t.length < 4 || !/[A-Za-z]{3,}/.test(t) || /^\/|#|\d\/\d|\b(AU|MEM|RC|SP|SSP)\b|\bteam card\b|checklist/i.test(t)) return ''
  if (/[\/&,]| and /i.test(t)) return ''   // combo cards ("Rangers / Islanders")
  return t.replace(/^St\.? /, 'St. ')   // "St Louis Blues" = "St. Louis Blues"
}
// TCG series: "Pokémon Black Bolt (Scarlet & Violet)" -> "Scarlet & Violet" era
const seriesOf = (name) => { const m = /\(([^)]+)\)\s*$/.exec(name || ''); return m ? m[1].trim() : '' }
// TCG card variant from the printed name: "Charizard ex" -> "ex", "Pikachu VMAX" -> "VMAX"
const VARIANT_RE = /\s(ex|EX|GX|V|VMAX|VSTAR|V-UNION|BREAK|LV\.X|Prime|LEGEND|Star|δ|Mega|Radiant|Shining|Dark|Light|Team Rocket's)$/
const variantOf = (label, base) => { const m = VARIANT_RE.exec(label || ''); if (m) return m[1]; const p = /^(Dark|Light|Shining|Radiant|Mega|Team Rocket's|Alolan|Galarian|Hisuian|Paldean)\s/.exec(label || ''); return p ? p[1] : '' }

// TCG card kinds from the section title
const TCG_KINDS = [[/illustration rare/i, 'Illustration Rare'], [/full art/i, 'Full Art'], [/secret/i, 'Secret Rare'], [/reverse holo/i, 'Reverse Holo'], [/\bholo/i, 'Holo'], [/promo/i, 'Promo'], [/trainer gallery|galarian gallery/i, 'Gallery'], [/shiny/i, 'Shiny'], [/gold/i, 'Gold']]
const TEAM_JUNK = /high school|sparkle|prospect|rookie|all[- ]?star|draft|legends?|team card|checklist|unknown|free agent|retired|^SN\d|prismatic|refractor|\b(silver|gold|parallel)\b|^(nfl |nba |mlb |nhl )?(hockey|football|baseball|basketball|soccer)$/i
const NO_SPORT_CAT = new Set(['Multi-Sport', 'Misc Sports', 'Entertainment', 'Non-Sport'])
const BRAND_NAMES = new Set(['Panini', 'Topps', 'Upper Deck', 'Leaf', 'Fleer', 'Donruss', 'Pinnacle', 'Score', 'Pacific', 'Bowman'])

function attrs(m, setName, year, sport, team, type, serial, label, base, section) {
  const a = []
  const { brand, product } = classifySet(setName, year)
  if (m.kind === 'tcg') {
    const ser = seriesOf(setName); if (ser && ser !== 'Other') a.push(cat(m, 'series', ser))
    const d = decadeLabel(year); if (d) a.push(cat(m, 'decade', d))
    const v = variantOf(label, base); if (v) a.push(cat(m, 'variant', v))
    for (const [re, k] of TCG_KINDS) if (re.test(section || '')) { a.push(cat(m, 'type', k)); break }
    return a
  }
  if (m.kind === 'multi') { if (sport && !NO_SPORT_CAT.has(sport)) a.push(cat(m, 'sport', sport)) }
  else { const t = cleanTeam(team); if (t && !TEAM_JUNK.test(t)) a.push(cat(m, 'team', t)) }
  if (brand && brand !== 'Other') a.push(cat(m, 'brand', brand))
  if (product && product !== 'Other' && !BRAND_NAMES.has(product) && product !== brand) a.push(cat(m, 'product', product))
  const d = decadeLabel(year); if (d) a.push(cat(m, 'decade', d))
  const rc = type & TYPE.RC, au = type & TYPE.AU
  if (rc) a.push(cat(m, 'type', 'Rookie card'))
  if (au) a.push(cat(m, 'type', 'Autograph'))
  if (rc && au) a.push(cat(m, 'type', 'Rookie autograph'))
  return a
}

// ---- read every shard once ----
const PAIR = 1 << 16
let rows = 0
for (let s = 0; s < dir.shards; s++) {
  let sh
  try { sh = JSON.parse(readFileSync(new URL(s + '.json', pDir), 'utf8')) } catch { continue }
  for (const r of sh.rows) {
    const list = modesOf.get(r[0]); if (!list) continue
    const meta = setMeta[sh.slugs[r[1]]]; if (!meta) continue
    const [setName, year, sport] = meta
    const team = r[4] >= 0 ? sh.teams[r[4]] : ''
    const label = r[8] != null ? sh.labels[r[8]] : ''
    const section = sh.sections[r[2]] || ''
    rows++
    for (const { m, idx } of list) {
      const pl = m.players[idx]
      const a = [...new Set(attrs(m, setName, year, sport, team, r[6], r[5], label, pl.name, section))]
      for (const x of a) if (m.cats[x][0] === 'team') pl.teams.add(x)
      for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
        const x = Math.min(a[i], a[j]), y = Math.max(a[i], a[j])
        pl.pairs.add(x * PAIR + y)
      }
      // a lone category still counts toward "who has this at all" (category size)
      for (const x of a) pl.pairs.add(x * PAIR + x)
    }
  }
}

// ---- write ----
if (existsSync(outDir)) rmSync(outDir, { recursive: true })
mkdirSync(outDir, { recursive: true })
const index = []
for (const m of modes) {
  // team x team: both teams anywhere in the player's cards
  for (const pl of m.players) { const t = [...pl.teams].sort((a, b) => a - b); for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) pl.pairs.add(t[i] * PAIR + t[j]) }
  const order = m.players.map((p, i) => i).sort((a, b) => m.players[b].cards - m.players[a].cards)
  const newIdx = new Map(order.map((o, i) => [o, i]))
  const size = new Map(), cells = new Map()
  for (const [i, pl] of m.players.entries()) for (const k of pl.pairs) {
    const x = Math.floor(k / PAIR), y = k % PAIR
    if (x === y) { size.set(x, (size.get(x) || 0) + 1); continue }
    let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(newIdx.get(i))
  }
  // Categories: common enough to have answers, rare enough to mean something (a brand on 90% of
  // players says nothing). Teams and products: the biggest 40 of each.
  const N = m.players.length
  const okCat = new Set()
  const byKind = new Map()
  for (const [c, n] of size) {
    const kind = m.cats[c][0]
    const min = kind === 'team' ? Math.max(MIN_CAT, Math.round(N * 0.02)) : MIN_CAT
    if (n < min || (kind !== 'type' && kind !== 'team' && n > N * 0.6)) continue
    let l = byKind.get(kind); if (!l) byKind.set(kind, l = []); l.push([c, n])
  }
  for (const [kind, l] of byKind) { l.sort((a, b) => b[1] - a[1]); for (const [c] of l.slice(0, kind === 'team' || kind === 'product' ? 40 : 30)) okCat.add(c) }
  const allowed = (a, b) => { const ka = m.cats[a][0], kb = m.cats[b][0]; if (ka === kb) return ka === 'team' || ka === 'type'; return !(ka === 'decade' && kb === 'series') && !(ka === 'series' && kb === 'decade') }   // an era already fixes its decade
  const outCells = {}, usedCats = new Set()
  for (const [k, list] of cells) {
    const x = Math.floor(k / PAIR), y = k % PAIR
    if (!okCat.has(x) || !okCat.has(y) || !allowed(x, y) || list.length < MIN_ANSWERS) continue
    // rookie autograph x rookie card / autograph says nothing new
    const lx = m.cats[x][1], ly = m.cats[y][1]
    if (m.cats[x][0] === 'type' && m.cats[y][0] === 'type' && (/rookie autograph/i.test(lx + ly) || lx === ly)) continue
    outCells[x + '-' + y] = list.sort((a, b) => a - b); usedCats.add(x); usedCats.add(y)
  }
  // renumber categories to the used ones
  const catMap = new Map([...usedCats].sort((a, b) => a - b).map((c, i) => [c, i]))
  const cats = [...catMap.keys()].map(c => [...m.cats[c], size.get(c)])
  const finalCells = {}
  for (const [k, v] of Object.entries(outCells)) { const [x, y] = k.split('-').map(Number); const a = catMap.get(x), b = catMap.get(y); finalCells[Math.min(a, b) + '-' + Math.max(a, b)] = v }
  const players = order.map(i => m.kind === 'multi' ? [m.players[i].name, m.players[i].cards, m.players[i].sport] : [m.players[i].name, m.players[i].cards])
  const nCells = Object.keys(finalCells).length
  if (cats.length < 6 || nCells < 9) { console.log('grid:', m.id, 'skipped (not enough data:', cats.length, 'categories,', nCells, 'squares)'); continue }
  writeFileSync(new URL(m.id + '.json', outDir), JSON.stringify({ v: 1, id: m.id, label: m.label, players, cats, cells: finalCells }))
  index.push({ id: m.id, label: m.label, group: m.group, players: players.length, cats: cats.length })
  console.log('grid:', m.id, players.length, 'players,', cats.length, 'categories,', nCells, 'squares')
}
writeFileSync(new URL('modes.json', outDir), JSON.stringify({ v: 1, modes: index }))
console.log('grid: read', rows.toLocaleString(), 'card rows')
