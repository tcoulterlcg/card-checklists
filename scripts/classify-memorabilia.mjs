// Tag every memorabilia section with where the material came from:
//   GU  game-used / game-worn       PW  player-worn (practice, photo shoot by the player, "not from a specific game")
//   EW  event-worn / event-used     MX  varies by card ("game-worn or player-worn as listed on each card")
//   UNK memorabilia, source not stated anywhere we can find
// Sets `sec.mem = { k: 'GU'|'PW'|'EW'|'MX'|'UNK', src: 'tcdb'|'title'|'odds', note? }` on each
// memorabilia section of public/data/<slug>.json. Non-memorabilia sections are left alone.
//
// Evidence, strongest first:
//   1. TCDB insert notes ("The MEM Note in this set refers to a Game-worn Jersey relic")
//      from scripts/data/tcdb-mem-notes.json (pulled in the browser; see README-browser-import.md)
//   2. Wording in our own section title / pack-odds text ("Game-Used", "Player-Worn", "Rookie Photo Shoot")
//
//   node scripts/classify-memorabilia.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const notesFile = new URL('./data/tcdb-mem-notes.json', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps)\.json$/

export const MEM_SECTION = /relic|memorabilia|material|jersey|swatch|game.?used|game.?worn|player.?worn|event.?worn|threads|fabric|\bgu\b|patch|laundry tag|nameplate|logo ?man|\blogos?\b|shield|emblem|button|\bstick\b|net cord|foundations|booklet.*(relic|patch|jersey)|\bbat\b|bat barrel|\bknob\b|glove|cleat|helmet|\bshoe|\bsock|\bhat\b|\bcap\b|\bpants\b|\bball\b|base.*used|\btag\b|\bprime\b|fabric|sweater|\bgear\b|bench|stanley cup|seat|ticket|towel|\bnet\b|puck|turf|mat\b|ring/i

// Read a free-text note and decide what it says.
export function classifyText(t) {
  if (!t) return null
  const s = t.toLowerCase()
  const gu = /game[- ]?(used|worn)|worn (by .{0,40})?in (an? )?(official|actual|nhl|nba|nfl|mlb|regular[- ]season|playoff|game)|used in (an? )?(official|actual|game)|game[- ]issued and worn/.test(s)
  const pw = /player[- ]?worn|player[- ]?used|practice[- ]?(worn|used)|not from any (specific|particular) game|not (obtained|taken) from (a |any )?(game|specific)|worn by the player (at|during) (a |an )?(photo|practice|rookie)/.test(s)
  const ew = /event[- ]?(worn|used)|photo ?shoot|rookie (showcase|premiere|debut|symposium|transition)|draft[- ]?(day|night) (worn|used)|all[- ]?star (weekend|event|skills)|worn (at|during) (the |an? )?(event|ceremony|photo)/.test(s)
  const mixed = /as (listed|noted|indicated|stated) on (each|the) card|or player[- ]worn|game[- ]worn or|may or may not|varies by card|unspecified/.test(s)
  const hits = [gu && 'GU', pw && 'PW', ew && 'EW'].filter(Boolean)
  if (mixed && hits.length !== 1) return 'MX'
  if (hits.length === 1) return mixed && /unspecified/.test(s) && hits[0] !== 'GU' ? hits[0] : hits[0]
  if (hits.length > 1) return 'MX'
  if (/unspecified|not specified|non[- ]?game|manufactured|replica/.test(s)) return /manufactured|replica/.test(s) ? 'MFG' : 'UNK'
  return null
}

const norm = (s) => String(s || '').toLowerCase().replace(/^\d{4}(-\d{2})?\s*/, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
const PARALLEL_TAIL = /\s+(parallel|gold|silver|black|red|blue|green|orange|purple|pink|white|bronze|platinum|rainbow|spectrum|holo|foil|prime|emerald|ruby|sapphire|tag|tags|logo|logos|laundry tag|button|nameplate|jumbo|super prime|1 1|one of one|\d+)(\s|$).*$/

// Load TCDB notes: { slug -> [{ name, nameN, k, note }] }
const bySlug = new Map()
if (existsSync(notesFile)) {
  for (const p of JSON.parse(readFileSync(notesFile, 'utf8'))) {
    const ins = (p.ins || []).map(([name, note]) => ({ name, nameN: norm(name), note: note || '', k: classifyText(note) })).filter(x => x.nameN)
    for (const slug of p.slugs || []) bySlug.set(slug, ins)
  }
}

// Find the TCDB insert that names this section: exact, then the longest TCDB name the
// section title starts with / contains (so "Limited Logos Black" -> "Limited Logos"),
// then the section title with parallel words stripped.
function matchInsert(ins, title) {
  if (!ins || !ins.length) return null
  const t = norm(title.replace(/^.*?\s[-–]\s/, (m) => m)) // keep full
  const cands = [t, norm(title.split(/\s[-–]\s/).pop()), norm(title.split(/\s[-–]\s/)[0]), t.replace(PARALLEL_TAIL, '')]
  for (const c of cands) { const e = ins.find(x => x.nameN === c); if (e) return e }
  let best = null
  for (const x of ins) {
    if (x.nameN.length < 5) continue
    if ((t.startsWith(x.nameN + ' ') || t === x.nameN || t.includes(' ' + x.nameN + ' ') || t.endsWith(' ' + x.nameN)) && (!best || x.nameN.length > best.nameN.length)) best = x
  }
  return best
}

const stats = { sets: 0, memSecs: 0, cards: 0, byK: {}, bySrc: {} }
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const path = new URL(f, dataDir)
  let s
  try { s = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
  if (!Array.isArray(s.sections) || /Pokémon|Magic|Lorcana|Yu-Gi-Oh/.test(s.sport || '')) continue
  const ins = bySlug.get(s.slug)
  let changed = false
  for (const sec of s.sections) {
    const title = sec.title || ''
    const hasMemFlag = (sec.cards || []).some(c => /\bMEM\b/.test(c.x || ''))
    if (/printing plate/i.test(title) || !(MEM_SECTION.test(title) || hasMemFlag)) { if (sec.mem) { delete sec.mem; changed = true } continue }
    let mem = null
    const m = matchInsert(ins, title)
    if (m && m.k) mem = { k: m.k, src: 'tcdb', note: m.note.slice(0, 220) }
    if (!mem) { const k = classifyText(title); if (k && k !== 'UNK') mem = { k, src: 'title' } }
    if (!mem && sec.odds) { const k = classifyText(sec.odds); if (k && k !== 'UNK') mem = { k, src: 'odds' } }
    if (!mem) mem = m && m.note ? { k: 'UNK', src: 'tcdb', note: m.note.slice(0, 220) } : { k: 'UNK', src: 'none' }
    if (JSON.stringify(sec.mem) !== JSON.stringify(mem)) { sec.mem = mem; changed = true }
    stats.memSecs++; stats.cards += (sec.cards || []).length
    stats.byK[mem.k] = (stats.byK[mem.k] || 0) + (sec.cards || []).length
    stats.bySrc[mem.src] = (stats.bySrc[mem.src] || 0) + 1
  }
  if (changed) { stats.sets++; if (!DRY) writeFileSync(path, JSON.stringify(s)) }
}
console.log('memorabilia:', stats.memSecs.toLocaleString(), 'sections /', stats.cards.toLocaleString(), 'cards; sets updated', stats.sets)
console.log('cards by kind:', JSON.stringify(stats.byK))
console.log('sections by evidence:', JSON.stringify(stats.bySrc))
