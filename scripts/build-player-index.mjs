// Build the player search index that powers the omnibox and player pages.
//
//   public/data/players/dir.json            — the player directory
//     { v, shards, sports: [...], players: [[name, shard, cards, sportIdx, minYear, maxYear], ...],
//       aka: [[playerIdx, "Other name"], ...] }
//   public/data/players/<shard>.json        — one shard (0..shards-1) of card rows
//     { slugs: [...], sections: [...], teams: [...], labels: [...],
//       rows: [[pid, slugId, sectionId, number, teamId, serial, type, mem, labelId?], ...] }
//
// One player = one page (except one name that is two people in two sports, see pass 0).
// Different spellings of the same person or character
// ("Shoeless Joe Jackson" / "Joe Jackson", "Elsa — Snow Queen" / "Elsa",
// "Charizard ex" / "Charizard") roll up into a single entry; see scripts/player-names.mjs.
// Rows printed under another name carry labelId (index into `labels`) so the
// player page can narrow to that variant; `aka` lets search find the page by
// any of its names.
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
import { splitPlayers, subjects, mergePlayers, splitComposites, norm } from './player-names.mjs'

const dataDir = new URL('../public/data/', import.meta.url)
const outDir = new URL('../public/data/players/', import.meta.url)
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const SHARDS = 512

// Memorabilia code: low 3 bits kind, +8 when it is the maker's typical practice rather than stated.
const MEM_K = { GU: 1, PW: 2, EW: 3, MX: 4, MFG: 5, UNK: 6 }
const memCode = (m) => (MEM_K[m.k] || 6) + (m.src === 'typical' ? 8 : 0)
export const TYPE = { BASE: 1, PARALLEL: 2, INSERT: 4, AU: 8, PATCH: 16, RELIC: 32, RC: 64, PLATE: 128, MULTI: 256 }

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0) % SHARDS }

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

const intern = (v, pool, map) => { if (map.has(v)) return map.get(v); const id = pool.length; pool.push(v); map.set(v, id); return id }
const newShard = () => ({ slugs: [], slugId: new Map(), sections: [], secId: new Map(), teams: [], teamId: new Map(), labels: [], labelId: new Map(), rows: [] })

// ---- pass 0: who is who ----
// One name can be two people. Cards are keyed by normalized name, except:
//  * a name with 30+ cards in a second sport is a different person there
//    (Larry Johnson basketball vs football; Ace Bailey hockey vs basketball):
//    that sport gets its own key "<name>|<sport>". Smaller counts in other sports
//    (Magic Johnson in a baseball product) stay with the main player.
//  * "Allen Robinson" and "Allen Robinson II" are one person when only one suffixed
//    form exists in that sport and their card years overlap — merged under the
//    suffixed name. Jr./Sr. pairs (Ken Griffey) are never merged.
const SPLIT_MIN = 30
const NON_PERSON_SPORTS = new Set(['', 'Multi-Sport', 'Entertainment', 'Non-Sport', 'Lorcana', 'Disney', 'Pokémon', 'Magic', 'One Piece', 'Yu-Gi-Oh!'])
const SUFFIX = / (jr|sr|ii|iii|iv)$/
const stats = new Map() // key -> { sports: Map(sport -> n), min, max }
const setFiles = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.slug || !Array.isArray(s.sections) || s.incomplete) continue
  setFiles.push(f)
  for (const sec of s.sections) for (const c of sec.cards || []) for (const name of splitPlayers(c.p)) for (const { base } of subjects(name, s.sport)) {
    const k = norm(base); if (!k || k.length < 2) continue
    let st = stats.get(k); if (!st) stats.set(k, st = { sports: new Map(), min: 9999, max: 0 })
    st.sports.set(s.sport || '', (st.sports.get(s.sport || '') || 0) + 1)
    if (s.year) { st.min = Math.min(st.min, s.year); st.max = Math.max(st.max, s.year) }
  }
}
const primarySport = (st) => [...st.sports.entries()].filter(([sp]) => !NON_PERSON_SPORTS.has(sp)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
const splitSports = new Map() // key -> Set(sports that are a different person)
for (const [k, st] of stats) {
  const main = primarySport(st)
  const others = [...st.sports.entries()].filter(([sp, n]) => sp !== main && !NON_PERSON_SPORTS.has(sp) && n >= SPLIT_MIN).map(([sp]) => sp)
  if (others.length) splitSports.set(k, new Set(others))
}
const suffixInto = new Map() // plain key -> suffixed key
for (const [k, st] of stats) {
  if (SUFFIX.test(k)) continue
  // only suffixed forms in this player's sport count ("Patrick Mahomes Sr." the baseball dad
  // doesn't stop "Patrick Mahomes" folding into "Patrick Mahomes II")
  const forms = ['jr', 'sr', 'ii', 'iii', 'iv'].map(x => k + ' ' + x).filter(x => stats.has(x) && primarySport(stats.get(x)) === primarySport(st))
    .filter(x => !x.endsWith(' sr') || [...stats.get(x).sports.values()].reduce((a, b) => a + b, 0) >= 10)   // a 1-card "Sr." typo isn't a second person
  if (forms.length !== 1 || forms[0].endsWith(' sr')) continue
  const t = stats.get(forms[0])
  if (st.min > t.max + 1 || t.min > st.max + 1) continue   // different eras: different people
  suffixInto.set(k, forms[0])
}
stats.clear()
const keyFor = (base, sport) => {
  const k = norm(base)
  if (splitSports.get(k)?.has(sport)) return k + '|' + sport
  return suffixInto.get(k) || k
}

// ---- pass 1: read every set; rows bucketed by the printed name's key ----
const shards = Array.from({ length: SHARDS }, newShard)
// key -> { cards, sports:Map, teams:Map, base:Map(name->n), labels:Map(label->n), minYear, maxYear }
const players = new Map()
const sportsPool = [], sportIdx = new Map()

let files = 0
for (const f of setFiles) {
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.slug || !Array.isArray(s.sections) || s.incomplete) continue
  const setNo = files++
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
      const serial = serialFromText(flag) || secSerial
      let type = stype
      if (/\bRC\b/.test(flag)) type |= TYPE.RC
      if (/\bAU\b/.test(flag)) type |= TYPE.AU
      if (/\bMEM\b/.test(flag) && !(type & TYPE.PATCH)) type |= TYPE.RELIC
      if (names.length > 1) type |= TYPE.MULTI
      for (const name of names) {
        for (const { label, base } of subjects(name, s.sport)) {
          if (norm(base).length < 2) continue
          const key = keyFor(base, s.sport || '')
          // Break Ninja team pages sometimes list the same card twice.
          const dk = key + '|' + sec.title + '|' + c.n + '|' + serial
          if (seen.has(dk)) continue
          seen.add(dk)
          let pl = players.get(key)
          if (!pl) { pl = { cards: 0, sports: new Map(), teams: new Map(), base: new Map(), labels: new Map(), sets: new Set(), minYear: s.year || 0, maxYear: s.year || 0 }; players.set(key, pl) }
          pl.cards++
          pl.sets.add(setNo)
          pl.sports.set(sp, (pl.sports.get(sp) || 0) + 1)
          pl.base.set(base, (pl.base.get(base) || 0) + 1)
          pl.labels.set(label, (pl.labels.get(label) || 0) + 1)
          if (c.t) pl.teams.set(c.t, (pl.teams.get(c.t) || 0) + 1)
          if (s.year) { if (!pl.minYear || s.year < pl.minYear) pl.minYear = s.year; if (s.year > pl.maxYear) pl.maxYear = s.year }
          const sh = shards[hash(key)]
          let mem = c.m ? memCode(c.m) : secMem
          if (!c.m && sec.mem && sec.mem.rk && (type & TYPE.RC)) mem = memCode({ k: sec.mem.rk, src: sec.mem.src })
          sh.rows.push([key, intern(s.slug, sh.slugs, sh.slugId), intern(sec.title || '', sh.sections, sh.secId), c.n == null ? '' : String(c.n), c.t ? intern(c.t, sh.teams, sh.teamId) : -1, serial, type, mem, intern(label, sh.labels, sh.labelId)])
        }
      }
    }
  }
}

// ---- pass 2: roll spellings of one person / character into one player ----
const moved = mergePlayers(players, sportsPool)
const canon = (k) => moved.get(k) || k
const groups = new Map() // canonical key -> { cards, sports, minYear, maxYear, base:Map, labels:Map }
for (const [k, pl] of players) {
  const c = canon(k)
  let g = groups.get(c)
  if (!g) { g = { cards: 0, sports: new Map(), base: new Map(), labels: new Map(), sets: new Set(), minYear: 0, maxYear: 0 }; groups.set(c, g) }
  g.cards += pl.cards
  for (const x of pl.sets) g.sets.add(x)
  for (const [s, n] of pl.sports) g.sports.set(s, (g.sports.get(s) || 0) + n)
  for (const [b, n] of pl.base) g.base.set(b, (g.base.get(b) || 0) + n)
  for (const [l, n] of pl.labels) g.labels.set(l, (g.labels.get(l) || 0) + n)
  if (pl.minYear && (!g.minYear || pl.minYear < g.minYear)) g.minYear = pl.minYear
  if (pl.maxYear > g.maxYear) g.maxYear = pl.maxYear
}
// Cards naming several players / characters ("Elsa and Anna") go to each of them.
const splits = splitComposites(groups, sportsPool)
for (const [k, ts] of splits) {
  const g = groups.get(k)
  for (const t of ts) groups.get(t).cards += g.cards   // its printed names stay off the targets' search aliases
  groups.delete(k)
}
for (const g of groups.values()) g.sets = null
// Display name: the canonical page's most-printed spelling; prefer one without quoted
// nicknames or scrape codes when it is close in volume.
function displayName(c) {
  const own = [...players.get(c).base.entries()].sort((a, b) => b[1] - a[1])
  const clean = own.find(([n, k]) => !/["“”]/.test(n) && k * 3 >= own[0][1])
  return (clean || own[0])[0]
}

// ---- pass 3: directory + shard files (rows re-bucketed under the canonical player) ----
const dir = [], pid = new Map(), names = new Map()
const sorted = [...groups.entries()].sort((a, b) => b[1].cards - a[1].cards)
for (const [key, g] of sorted) {
  const topSport = [...g.sports.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const name = displayName(key)
  names.set(key, name)
  pid.set(key, dir.length)
  dir.push([name, hash(key), 0, topSport, g.minYear, g.maxYear])
}
// Other names search should find each page by (spellings that differ in more than spacing/case).
const aka = []
for (const [key, g] of sorted) {
  const i = pid.get(key), own = norm(names.get(key)), seenAka = new Set([own, own.replace(/ /g, '')])
  const alts = [...g.base.entries(), ...g.labels.entries()].sort((a, b) => b[1] - a[1])
  for (const [n] of alts) {
    const k = norm(n)
    if (!k || seenAka.has(k) || seenAka.has(k.replace(/ /g, ''))) continue
    seenAka.add(k); seenAka.add(k.replace(/ /g, ''))
    aka.push([i, n])
    if (seenAka.size > 24) break
  }
}

const out = Array.from({ length: SHARDS }, newShard)
const dedupe = new Set(), mergedInto = new Set([...moved.values(), ...[...splits.values()].flat()])
let total = 0
for (let si = 0; si < SHARDS; si++) {
  const sh = shards[si]
  for (const r of sh.rows) {
    const c0 = canon(r[0]), targets = splits.get(c0) || [c0]
    const slug = sh.slugs[r[1]], section = sh.sections[r[2]], label = sh.labels[r[8]]
    for (const c of targets) {
      // the same card listed under two spellings in one set counts once
      if (mergedInto.has(c)) {
        const dk = c + '|' + slug + '|' + section + '|' + r[3] + '|' + r[5]
        if (dedupe.has(dk)) continue
        dedupe.add(dk)
      }
      const id = pid.get(c), o = out[dir[id][1]]
      const row = [id, intern(slug, o.slugs, o.slugId), intern(section, o.sections, o.secId), r[3], r[4] >= 0 ? intern(sh.teams[r[4]], o.teams, o.teamId) : -1, r[5], targets.length > 1 ? r[6] | TYPE.MULTI : r[6], r[7]]
      if (norm(label) !== norm(names.get(c))) row.push(intern(label, o.labels, o.labelId))
      o.rows.push(row)
      dir[id][2]++
    }
  }
  shards[si] = null
}
out.forEach((o, i) => {
  total += o.rows.length
  writeFileSync(new URL(i + '.json', outDir), JSON.stringify({ slugs: o.slugs, sections: o.sections, teams: o.teams, labels: o.labels, rows: o.rows }))
})
writeFileSync(new URL('dir.json', outDir), JSON.stringify({ v: 2, shards: SHARDS, sports: sportsPool, players: dir, aka }))
// top.json: the 5,000 most-carded players with their directory index at [6], so the
// search box can suggest instantly while the full directory (~2 MB gzipped) loads.
// Plus all-time icons whose checklists are thin (Michael Jordan, Tiger Woods), so "jordan" suggests MJ instantly.
const { ICONS } = await import('../lib/query.js')
const ranked = dir.map((p, i) => [...p.slice(0, 6), i]).sort((a, b) => b[2] - a[2])
const top = ranked.slice(0, 5000).concat(ranked.slice(5000).filter(p => ICONS.has(norm(p[0]))))
const inTop = new Set(top.map(p => p[6]))
writeFileSync(new URL('top.json', outDir), JSON.stringify({ v: 2, shards: SHARDS, sports: sportsPool, players: top, aka: aka.filter(a => inTop.has(a[0])), partial: true }))
console.log('player index:', dir.length.toLocaleString(), 'players (' + moved.size.toLocaleString() + ' spellings merged, ' + splits.size.toLocaleString() + ' multi-name cards credited to each),', total.toLocaleString(), 'card rows across', SHARDS, 'shards from', files, 'sets')
