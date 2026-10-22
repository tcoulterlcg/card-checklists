// Build the player search index that powers the omnibox and player pages.
//
//   public/data/players/dir.json            — the player directory
//     { v, shards, sports: [...], players: [[name, shard, cards, sportIdx, minYear, maxYear], ...] }
//   public/data/players/<shard>.json        — one shard (0..shards-1) of card rows
//     { slugs: [...], sections: [...], teams: [...],
//       rows: [[pid, slugId, sectionId, number, teamId, serial, type], ...] }
//
// Unlike search-index.json (which collapses parallels so the file stays small),
// every parallel row is kept here — "Kucherov 1/1" needs every one-of-one.
// A card listing several players ("A / B / C") yields one row per player, each
// tagged MULTI. `serial` is the print run (1 = one-of-one, 0 = unnumbered) read
// from the card flag ("/25"), the section title ("Gold /10", "1/1", printing
// plates) or the section's pack odds. `type` is a bit mask (TYPE below).
//
//   node scripts/build-player-index.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const outDir = new URL('../public/data/players/', import.meta.url)
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const SKIP = /^(index|search-index|rpa-index|patch-swaps)\.json$/
const SHARDS = 512

// Memorabilia code: low 3 bits kind, +8 when it is the maker's typical practice rather than stated.
const MEM_K = { GU: 1, PW: 2, EW: 3, MX: 4, MFG: 5, UNK: 6 }
const memCode = (m) => (MEM_K[m.k] || 6) + (m.src === 'typical' ? 8 : 0)
export const TYPE = { BASE: 1, PARALLEL: 2, INSERT: 4, AU: 8, PATCH: 16, RELIC: 32, RC: 64, PLATE: 128, MULTI: 256 }

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ')
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) % SHARDS }

// Clean a raw player string from the scrapes: drop trailing flag junk some TCDB
// pages carry ("AU, MEM, SN10MEM: Game-Used Memorabilia"), parenthetical
// variants and stray asterisks, then split multi-player cards.
function splitPlayers(raw) {
  let p = String(raw || '')
    .replace(/\s+(AU|MEM|SN\d+)(,\s*(AU|MEM|SN\d+))*\s*MEM:.*$/i, '')
    .replace(/\s*\((foil|gold|silver|black|variation|sp|ssp|rc)\)\s*$/i, '')
    .replace(/\s*\*+\s*$/, '')
    .replace(/\s+:\s+.*$/, '')
    .replace(/\s+(CL|SP|SSP|RC|AU|VAR|HOF|UER|COR|ERR|Gold|Silver|Black|Red|Blue|Green|Orange|Purple|Pink|Variation|Refractor|Checklist)$/i, '')
    .trim()
  // memorabilia piece glued to the name: "Austin Jackson (Pants)", "Eddie Murray #/ 25 Pants", "Don Mattingly (Jacket)"
  p = p.replace(/\s*\(?\s*(?:#?\s*\/\s*\d+\s*)?\b(?:jersey|jerseys|pants|jacket|bat|bats|shoes?|gloves?|helmet|cap|hat|socks?|wristband|fabric|swatch|button|jersey number|jersey auto)\s*\)?$/i, (m) => /\S+\s+\S+/.test(p.slice(0, p.length - m.length).trim()) ? '' : m).trim()
  // "Best There Is...Best There Was (Mike Piazza/Josh Gibson)" -> the players in the parentheses
  const inner = p.match(/^[^()]+\(([^()]*\/[^()]*)\)$/)
  if (inner) p = inner[1]
  if (!p) return []
  const parts = p.split(/\s*\/\s*|\s+\|\s+/)
    .map(x => {
      x = x.trim()
      if (x.endsWith(')') && !x.includes('(')) x = x.slice(0, -1).trim()     // "Josh Gibson)"
      if (x.startsWith('(') && !x.includes(')')) x = x.slice(1).trim()
      if (x.includes('(') && !x.includes(')')) x = x.replace(/\s*\(.*$/, '') // "5 (Jersey"
      return x
    })
    // drop bare numbers and piece counts: "25", "10)", "25 Jersey", "15\""
    .filter(x => x.length > 1 && /[A-Za-z\u00C0-\u024F]{2}/.test(x) && !/^\d+["']?\s*\(?(jersey|jerseys|pants|jacket|bat|shoes?|gloves?|helmet|cap|hat|socks?|patch|auto)\b/i.test(x))
  return parts
}

const PARALLEL_WORDS = /\b(gold|silver|black|red|blue|green|orange|purple|pink|teal|white|bronze|platinum|rainbow|refractor|prizm|prizms|holo|foil|spectrum|mojo|wave|cracked ice|shimmer|disco|velocity|hyper|camo|tie-dye|laser|pulsar|mosaic|optic|chrome|sapphire|x-fractor|xfractor|atomic|superfractor|printing plate|emerald|ruby|sepia|canvas|exclusives|high gloss|rookie exclusives|artist proof|press proof|die cut|die-cut|vintage stock|independence day|memorial day|mothers day|fathers day|rainbow foil|clear cut|outburst|magenta|cyan|yellow)\b/i

function serialFromText(s) {
  if (!s) return 0
  if (/\b1\s*(\/|of)\s*1\b|one[- ]of[- ]one|printing plate/i.test(s)) return 1
  const m = s.match(/#?\s*\/\s*([\d,]{1,5})\b/)
  if (m) { const n = parseInt(m[1].replace(/,/g, '')); if (n > 0 && n <= 25000) return n }
  const m2 = s.match(/\bSN(\d{1,5})\b/)
  if (m2) return parseInt(m2[1])
  return 0
}

function sectionType(title) {
  const t = (title || '').toLowerCase()
  let type = 0
  const auto = /\bauto|autograph|signature|signing|\bink\b|\bsig\b|chirography|scripted|endorsement|penmanship/.test(t)
  const patch = /\bpatch|laundry tag|nameplate|logo ?man|logos\b|tag\b|shield|button|emblem/.test(t)
  const relic = /relic|memorabilia|material|jersey|swatch|game.?used|game.?worn|threads|fabric|\bgu\b|stick\b|net cord|foundations/.test(t)
  const rookie = /\brookie|\brc\b|\brpa\b|young guns|future watch|first bowman|1st bowman|debut|hot prospects|premieres|rookie gems|rated rookie/.test(t)
  const plate = /printing plate|plates? (black|cyan|magenta|yellow)/.test(t)
  if (plate) type |= TYPE.PLATE
  if (auto) type |= TYPE.AU
  if (patch) type |= TYPE.PATCH
  if (relic && !patch) type |= TYPE.RELIC
  if (rookie) type |= TYPE.RC
  if (!(type & (TYPE.AU | TYPE.PATCH | TYPE.RELIC | TYPE.PLATE))) {
    if (/^(base( set| cards?)?|base checklist|veterans?|common|regular)$/i.test(t.trim())) type |= TYPE.BASE
    else if (/^base\b/.test(t) || PARALLEL_WORDS.test(t)) type |= TYPE.PARALLEL
    else type |= TYPE.INSERT
  }
  return type
}

// ---- pass 1: build rows per shard ----
const shards = Array.from({ length: SHARDS }, () => ({ slugs: [], slugId: new Map(), sections: [], secId: new Map(), teams: [], teamId: new Map(), rows: [] }))
const intern = (v, pool, map) => { if (map.has(v)) return map.get(v); const id = pool.length; pool.push(v); map.set(v, id); return id }
const players = new Map() // normName -> { name, shard, cards, sports:Map, minYear, maxYear }
const sportsPool = [], sportIdx = new Map()

let files = 0
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.slug || !Array.isArray(s.sections) || s.incomplete) continue
  files++
  const sp = intern(s.sport || '', sportsPool, sportIdx)
  const seen = new Set()
  for (const sec of s.sections) {
    const stype = sectionType(sec.title)
    const secSerial = serialFromText(sec.title) || serialFromText(sec.odds)
    const secMem = sec.mem ? memCode(sec.mem) : 0
    for (const c of sec.cards || []) {
      const names = splitPlayers(c.p)
      if (!names.length) continue
      const flag = c.x || ''
      let serial = serialFromText(flag) || secSerial
      let type = stype
      if (/\bRC\b/.test(flag)) type |= TYPE.RC
      if (/\bAU\b/.test(flag)) type |= TYPE.AU
      if (/\bMEM\b/.test(flag) && !(type & TYPE.PATCH)) type |= TYPE.RELIC
      if (names.length > 1) type |= TYPE.MULTI
      for (const name of names) {
        const key = norm(name)
        if (!key || key.length < 2) continue
        // Break Ninja team pages sometimes list the same card twice.
        const dk = key + '|' + sec.title + '|' + c.n + '|' + serial
        if (seen.has(dk)) continue
        seen.add(dk)
        let pl = players.get(key)
        if (!pl) { pl = { name, shard: hash(key), cards: 0, sports: new Map(), minYear: s.year || 0, maxYear: s.year || 0 }; players.set(key, pl) }
        pl.cards++
        pl.sports.set(sp, (pl.sports.get(sp) || 0) + 1)
        if (s.year) { if (!pl.minYear || s.year < pl.minYear) pl.minYear = s.year; if (s.year > pl.maxYear) pl.maxYear = s.year }
        const sh = shards[pl.shard]
        let mem = c.m ? memCode(c.m) : secMem
        if (!c.m && sec.mem && sec.mem.rk && (type & TYPE.RC)) mem = memCode({ k: sec.mem.rk, src: sec.mem.src })
        sh.rows.push([key, intern(s.slug, sh.slugs, sh.slugId), intern(sec.title || '', sh.sections, sh.secId), c.n == null ? '' : String(c.n), c.t ? intern(c.t, sh.teams, sh.teamId) : -1, serial, type, mem])
      }
    }
  }
}

// ---- pass 2: directory + shard files ----
const dir = [], pid = new Map()
const sorted = [...players.entries()].sort((a, b) => b[1].cards - a[1].cards)
for (const [key, pl] of sorted) {
  const topSport = [...pl.sports.entries()].sort((a, b) => b[1] - a[1])[0][0]
  pid.set(key, dir.length)
  dir.push([pl.name, pl.shard, pl.cards, topSport, pl.minYear, pl.maxYear])
}
let total = 0
shards.forEach((sh, i) => {
  for (const r of sh.rows) r[0] = pid.get(r[0])
  total += sh.rows.length
  writeFileSync(new URL(i + '.json', outDir), JSON.stringify({ slugs: sh.slugs, sections: sh.sections, teams: sh.teams, rows: sh.rows }))
})
writeFileSync(new URL('dir.json', outDir), JSON.stringify({ v: 1, shards: SHARDS, sports: sportsPool, players: dir }))
console.log('player index:', dir.length.toLocaleString(), 'players,', total.toLocaleString(), 'card rows across', SHARDS, 'shards from', files, 'sets')
