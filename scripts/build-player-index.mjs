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
import { fixFlagTail } from '../lib/flag-tail.js'
import { isMultiYear } from '../lib/catalog.js'
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
export const TYPE = { BASE: 1, PARALLEL: 2, INSERT: 4, AU: 8, PATCH: 16, RELIC: 32, RC: 64, PLATE: 128, MULTI: 256, TRIBUTE: 512, BUYBACK: 1024, PROSPECT: 2048 }

// ---- rookie status ----
// A rookie card only exists in a player's rookie season (or the season right after, when the
// card itself is a real rookie card: late call-ups, split-season rookies). Rookie season =
// the earliest season with a run of true rookie cards. Everything else that looks like a rookie:
//   * rookie-styled cards of a veteran (Rookie Tribute, Retro Rookies, Young Guns Renewed,
//     Rookie Year photo variants, crossovers of an old product…) -> TRIBUTE
//   * buybacks (original cards re-stamped and re-inserted later) -> BUYBACK, never RC
//   * prospect cards (1st Bowman, Bowman Prospects, draft / college / minor-league / junior
//     products, and unlicensed "rookie" cards printed before the rookie season) -> PROSPECT
//   * mixed sections ("Stars and Rookies") outside the rookie season -> no rookie tag
// Row hints (bits) collected in pass 1, applied in pass 3 once each player's rows are merged.
// Bits above 10 hold the season printed in the section title when it is older than the product.
const H = { FLAG: 1, SEC: 2, TRIB: 4, MIX: 8, PROS: 16, BUY: 32, WEAK: 64, CAL: 128 }
const NON_SPORT = new Set(['Entertainment', 'Non-Sport', 'Lorcana', 'Disney', 'Pokémon', 'Magic', 'One Piece', 'Yu-Gi-Oh!'])
// ("Retro" alone is an O-Pee-Chee parallel on current rookies' cards: not a tribute by itself.)
const TRIB_RE = /tribute|renewed|rookie year|throwback|flashback|rewind|reprint|anniversary|homage|rookie sensations|rookie cup|all-rookie|rookie remembrance|rookie of the year|rookie history|all-time/i
// Set names only count when the whole product is a look back (not "Platinum Anniversary" or
// "Finest Flashbacks", which carry real rookie cards of that season's rookies).
const TRIB_SET_RE = /tribute|retrospective|renewed|rookie year/i
const BUY_RE = /buy ?backs?\b/i
const PROS_RE = /\bprospects?\b|1st bowman|first bowman|draft picks?|bowman draft|\bchl\b|\bohl\b|\bwhl\b|qmjhl|\bjuniors?\b/i
// Pre-debut products: minor league, college, draft.
const PROS_SET_RE = /\b(ahl|echl|khl|ote|nbl)\b|overtime elite|g league|pro debut|collegiate|\buniversity\b|\bcollege\b|\bncaa\b|\bmilb\b|minor league|perfect game|usa baseball|team usa|\bdraft\b/i
// Unlicensed and multi-sport products print "rookie" cards before a player's debut (Leaf, Goodwin
// Champions, Panini baseball): they
// count as rookies inside the rookie season but never set it, and earlier ones are prospects.
const weakMaker = (s) => !s.sport || s.sport === 'Multi-Sport' || /\bleaf\b/i.test(s.name || '') || (s.sport === 'Baseball' && /\bpanini\b|\bchronicles\b/i.test(s.name || '') && s.year >= 2010)
const MIX_RE = /\b(stars?|veterans?|legends?|goalies?|greats?)\s*(\/|,|&|\band\b)[^]*\brookies?\b|\brookies?\s*(\/|,|&|\band\b)\s*(stars?|veterans?|legends?|greats?)\b|memorable|idols?\b/i
// A section naming an older season than its product is either a throwback ("2005-06 Clear Cut
// Retro Rookies" in 2022-23 Artifacts) or an earlier product's own cards inserted later
// ("2020-21 Ice Premieres" in 2021-22 Ice, "2021 Eminence Rookie Patch Autos" in 2024 Eminence).
// Returns that season (hockey/basketball "2020-21" = 2021), or 0.
const datedSeason = (title, year) => {
  const m = /\b((?:19|20)\d\d)(?:[-\u2013\/](\d\d))?\b/.exec(String(title || ''))
  if (!m || !year) return 0
  const y = m[2] ? +m[1] + 1 : +m[1]
  return y < year && year - y <= 5 ? y : 0   // decades back is a design throwback ("1993 Football's Finest"), not a crossover
}
const SEASONAL = new Set(['Hockey', 'Basketball'])
function sectionHints(title, s, stype) {
  if (NON_SPORT.has(s.sport || '')) return 0
  let h = 0
  if (stype & TYPE.RC) h |= H.SEC
  if (TRIB_RE.test(title || '') || TRIB_SET_RE.test(s.name || '')) h |= H.TRIB
  const dated = datedSeason(title, s.year)
  if (dated) h |= dated << 10
  // calendar-year product in a season sport ("2012 Panini Black Friday" during 2012-13)
  if (SEASONAL.has(s.sport) && !/\b\d{2,4}[-\u2013\/]\d{2}\b/.test(s.name || '')) h |= H.CAL
  if (MIX_RE.test(title || '')) h |= H.MIX
  const pt = (title || '') + ' | ' + (s.name || '')
  if ((PROS_RE.test(pt) && !/hot prospects/i.test(pt)) || PROS_SET_RE.test(s.name || '')) h |= H.PROS
  if (weakMaker(s)) h |= H.WEAK
  if (BUY_RE.test(title || '') || BUY_RE.test(s.name || '')) h |= H.BUY
  return h
}
// A true rookie card: sets the rookie season.
const isTrueRookie = (type, h) => (type & TYPE.RC) && !(h & (H.TRIB | H.PROS | H.BUY | H.WEAK)) && !(h >>> 10) && (!(h & H.MIX) || (h & H.FLAG))
function rookieClass(type, yr, h, Y, nextY) {
  if (!h) return type
  const noRC = type & ~TYPE.RC
  if (h & H.BUY) return noRC | TYPE.BUYBACK
  if (!(type & TYPE.RC)) return type
  const flag = h & H.FLAG, trib = h & H.TRIB, mix = h & H.MIX, pros = h & H.PROS
  const dated = h >>> 10
  if (dated && !trib) yr = dated                  // an earlier product's card inserted later belongs to its own season
  if ((h & H.CAL) && Y && yr === Y - 1) yr = Y
  const inWindow = Y && (yr === Y || yr === Y + 1)
  if (pros && !(flag && inWindow)) return noRC | TYPE.PROSPECT
  if ((h & H.WEAK) && Y && (yr < Y || (nextY && yr < nextY && yr > Y + 1))) return noRC | TYPE.PROSPECT
  if (!Y) return trib ? noRC | TYPE.TRIBUTE : type          // no true rookie card on file: leave it
  if (yr === Y) return type                                  // rookie season: every rookie card counts
  if (yr === Y + 1 && !trib && (!mix || flag)) return type   // season after: real rookie cards only
  if (yr < Y) return noRC
  if (trib || ((h & H.SEC) && !mix)) return noRC | TYPE.TRIBUTE   // rookie-styled card of a veteran
  return noRC                                                // "Stars and Rookies", stray RC flags
}

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
// Rows are kept in packed integer columns, not one JS array per row: with ~23,000 catalog sets the
// array-per-row version ran Vercel's build machine out of memory. Text columns (strCols) are
// interned per store. Reading a row (for…of) rebuilds the same array the old code pushed;
// a missing trailing value (out rows' optional label) is stored as NONE and left off.
const NONE = -2147483648
class RowStore {
  constructor(width, strCols) { this.w = width; this.isStr = Array.from({ length: width }, (_, i) => strCols.includes(i)); this.pool = []; this.poolId = new Map(); this.buf = new Int32Array(width * 256); this.length = 0 }
  push(row) {
    const w = this.w
    if ((this.length + 1) * w > this.buf.length) { const nb = new Int32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb }
    const o = this.length++ * w
    for (let i = 0; i < w; i++) { const v = row[i]; this.buf[o + i] = v === undefined ? NONE : this.isStr[i] ? intern(v, this.pool, this.poolId) : v }
  }
  trim() { this.buf = this.buf.slice(0, this.length * this.w) }   // drop the spare room left by doubling
  *[Symbol.iterator]() {
    const w = this.w, b = this.buf
    for (let j = 0; j < this.length; j++) {
      const o = j * w, r = []
      for (let i = 0; i < w; i++) { const v = b[o + i]; if (v === NONE) break; r.push(this.isStr[i] ? this.pool[v] : v) }
      yield r
    }
  }
}
const newShard = (width, strCols) => ({ slugs: [], slugId: new Map(), sections: [], secId: new Map(), teams: [], teamId: new Map(), labels: [], labelId: new Map(), rows: new RowStore(width, strCols) })

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
// Bulk-catalog (TCDB) sets live on the repo's `catalog` branch, not in public/data. Fetch the
// visible ones into a local cache so their cards count on player pages too (vintage Jordan,
// Gretzky…). Best effort: no network or no catalog -> static sets only.
const catalogFiles = await fetchCatalogSets()
async function fetchCatalogSets() {
  if (process.env.SKIP_CATALOG) return []
  const RAW = 'https://raw.githubusercontent.com/trevorcoulter42-creator/card-checklists/catalog/'
  const { HIDDEN_SOURCES, setPath, fixSeasonYear } = await import('../lib/catalog.js')
  const get = async (u) => { try { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); return r.ok ? await r.json() : null } catch { return null } }
  const m = await get(RAW + 'manifest.json'); if (!m) return []
  // static files shadow catalog sets with the same slug, unless they are hidden (incomplete) or empty
  const staticSlugs = new Set(readdirSync(dataDir).filter(f => f.endsWith('.json')).filter(f => {
    try { const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')); return !s.incomplete && (s.sections || []).some(x => x.cards?.length) } catch { return true }
  }).map(f => f.slice(0, -5)))
  const wanted = []
  const files = m.visible && m.visible.file ? [m.visible.file] : Object.values(m.sports || {}).map(sp => sp.file)
  for (const f of files) { const ix = f && await get(RAW + f); for (const e of (ix && ix.sets) || []) if (!HIDDEN_SOURCES.has(e.source) && !staticSlugs.has(e.slug)) wanted.push(e.slug) }
  const cacheDir = new URL('../node_modules/.cache/catalog-sets/', import.meta.url)
  mkdirSync(cacheDir, { recursive: true })
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (i < wanted.length) {
      const slug = wanted[i++]
      const s = await get(RAW + setPath(slug))
      if (!s || !Array.isArray(s.sections) || HIDDEN_SOURCES.has(s.source)) continue
      fixSeasonYear(s)
      for (const sec of s.sections) for (const c of sec.cards || []) tidyTcdbCard(c)
      const u = new URL(encodeURIComponent(slug) + '.json', cacheDir)
      writeFileSync(u, JSON.stringify(s))
      out.push(u.href)
    }
  }))
  console.log('catalog sets for player pages:', out.length, 'of', wanted.length)
  return out
}
// TCDB rows can carry their flags where the team goes ("AU, MEM, SN25"); same fix as cleanup-names.mjs.
function tidyTcdbCard(c) {
  fixFlagTail(c)   // "Pelé / Lionel Messi MEM, SN25": flags glued onto catalog names
  if (!c.t || !/^(?:(?:URA?|AUR?|MEM|RC|SP|SSP|SN\d+)(?:,\s*|$))+$/.test(c.t.trim())) return
  const x = (c.x || '').split(/\s+/).filter(Boolean)
  for (const f of c.t.split(/,\s*/)) { const v = /^SN(\d+)$/.test(f) ? '/' + f.slice(2) : (f === 'URA' || f === 'AUR') ? 'AU' : f; if (!x.includes(v)) x.push(v) }
  c.x = x.join(' '); delete c.t
}
for (const f of [...readdirSync(dataDir), ...catalogFiles]) {
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
const GENERIC_SPORTS = new Set(['Multi-Sport', 'Misc Sports'])
const primarySport = (st) => [...st.sports.entries()].filter(([sp]) => !NON_PERSON_SPORTS.has(sp)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
const splitSports = new Map() // key -> Set(sports that are a different person)
// Real two-sport athletes: one person, one page (their baseball cards stay with the main page).
const TWO_SPORT = new Set(['michael jordan', 'bo jackson', 'deion sanders', 'brian jordan', 'danny ainge', 'dave winfield', 'kyler murray', 'tim tebow', 'jim thorpe', 'john elway', 'charlie ward', 'drew henson', 'chad hutchinson', 'russell wilson', 'jameis winston', 'gene conley', 'dave debusschere', 'ron reed', 'kenny lofton'])
for (const [k, st] of stats) {
  if (TWO_SPORT.has(k)) continue
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
const shards = Array.from({ length: SHARDS }, () => newShard(13, [0, 3]))   // [0] player key, [3] card number
// key -> { cards, sports:Map, teams:Map, base:Map(name->n), labels:Map(label->n), minYear, maxYear }
const players = new Map()
const sportsPool = [], sportIdx = new Map()

const setMeta = {}
let files = 0
for (const f of setFiles) {
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.slug || !Array.isArray(s.sections) || s.incomplete) continue
  const setNo = files++
  setMeta[s.slug] = [s.name || s.slug, s.year || 0, s.sport || '']   // for the grid game (scripts/build-grid-index.mjs)
  const sp = intern(s.sport || '', sportsPool, sportIdx)
  const multiYear = isMultiYear(s.name)
  const seen = new Set()
  // TCDB flags RC on the base card only; its parallels (same number, same player, same set —
  // "Black /1", "Gold Rainbow /10") are the same rookie card. Season and tribute/buyback/prospect
  // rules below still decide whether each one counts.
  const rcCards = new Set()
  for (const sec of s.sections) for (const c of sec.cards || []) if (c.n && /\bRC\b/.test(c.x || '')) rcCards.add(c.n + '|' + c.p)
  for (const sec of s.sections) {
    const stype = sectionType(sec.title)
    const secSerial = serialFromText(sec.title) || serialFromText(sec.odds)
    const secMem = sec.mem ? memCode(sec.mem) : 0
    const secHint = sectionHints(sec.title, s, stype)
    for (const c of sec.cards || []) {
      if (/\b\d{1,2}:\d\d\s?[AP]M by \S/.test(c.p || '')) continue   // TCDB "recent uploads" lines scraped into a catalog set
      const names = splitPlayers(c.p)
      if (!names.length) continue
      const flag = c.x || ''
      const serial = serialFromText(flag) || secSerial
      let type = stype
      const rcFlag = /\bRC\b/.test(flag) || (!!c.n && rcCards.has(c.n + '|' + c.p))
      if (rcFlag) type |= TYPE.RC
      if (/\bAU\b/.test(flag)) type |= TYPE.AU
      if (/\bMEM\b/.test(flag) && !(type & TYPE.PATCH)) type |= TYPE.RELIC
      if (names.length > 1) type |= TYPE.MULTI
      const hint = NON_SPORT.has(s.sport || '') ? 0 : secHint | (rcFlag ? H.FLAG : 0)
      for (const name of names) {
        for (const { label, base } of subjects(name, s.sport)) {
          if (norm(base).length < 2) continue
          const key = keyFor(base, s.sport || '')
          // Break Ninja team pages sometimes list the same card twice.
          const dk = key + '|' + sec.title + '|' + c.n + '|' + serial
          if (seen.has(dk)) continue
          seen.add(dk)
          let pl = players.get(key)
          if (!pl) { pl = { cards: 0, sports: new Map(), teams: new Map(), base: new Map(), labels: new Map(), sets: new Set(), minYear: 0, maxYear: 0, rMin: 0, rMax: 0 }; players.set(key, pl) }
          pl.cards++
          pl.sets.add(setNo)
          pl.sports.set(sp, (pl.sports.get(sp) || 0) + 1)
          pl.base.set(base, (pl.base.get(base) || 0) + 1)
          pl.labels.set(label, (pl.labels.get(label) || 0) + 1)
          if (c.t) pl.teams.set(c.t, (pl.teams.get(c.t) || 0) + 1)
          // a multi-year issue ("1996-17 BBM ...") only sets the career span when nothing else does
          if (s.year && !multiYear) { if (!pl.minYear || s.year < pl.minYear) pl.minYear = s.year; if (s.year > pl.maxYear) pl.maxYear = s.year }
          else if (s.year) { if (!pl.rMin || s.year < pl.rMin) pl.rMin = s.year; if (s.year > pl.rMax) pl.rMax = s.year }
          const sh = shards[hash(key)]
          const vetMem = c.m ? memCode(c.m) : secMem
          let mem = vetMem
          if (!c.m && sec.mem && sec.mem.rk && (type & TYPE.RC)) mem = memCode({ k: sec.mem.rk, src: sec.mem.src })
          // [9] season, [10] rookie hints, [11] memorabilia code if the card turns out not to be a rookie, [12] sport
          sh.rows.push([key, intern(s.slug, sh.slugs, sh.slugId), intern(sec.title || '', sh.sections, sh.secId), c.n == null ? '' : String(c.n), c.t ? intern(c.t, sh.teams, sh.teamId) : -1, serial, type, mem, intern(label, sh.labels, sh.labelId), s.year || 0, hint, vetMem, sp])
        }
      }
    }
  }
}

for (const sh of shards) sh.rows.trim()

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
  if (!pl.minYear && pl.rMin) { g.rMin = g.rMin ? Math.min(g.rMin, pl.rMin) : pl.rMin; g.rMax = Math.max(g.rMax || 0, pl.rMax) }
}
for (const g of groups.values()) if (!g.minYear && g.rMin) { g.minYear = g.rMin; g.maxYear = g.rMax }
for (const pl of players.values()) { pl.teams = pl.sets = pl.labels = null }   // only .base is read from here on (display names); frees memory
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
// Player ids are stable across builds (a hash of the canonical key), not the directory position:
// a visitor holding an older directory (open tab, cached file) still finds their player's rows in
// a newer shard, instead of an id that now belongs to someone else (or no one -> "0 cards").
const dir = [], pid = new Map(), dirIdx = new Map(), names = new Map(), usedIds = new Set()
const stableId = (key) => { for (let n = 0; ; n++) { let h = 0x811c9dc5; const s = n ? key + '#' + n : key; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } h = (h >>> 1) || 1; if (!usedIds.has(h)) { usedIds.add(h); return h } } }
const sorted = [...groups.entries()].sort((a, b) => b[1].cards - a[1].cards || (a[0] < b[0] ? -1 : 1))
for (const [key, g] of sorted) {
  // Multi-sport / misc sets (Leaf, Panini Flawless Collegiate…) don't make Jordan a "Multi-Sport" player:
  // a real sport with at least 5% of their cards labels the page.
  const bySport = [...g.sports.entries()].sort((a, b) => b[1] - a[1])
  const total = bySport.reduce((n, e) => n + e[1], 0)
  const specific = bySport.find(([sp]) => { const n = sportsPool[sp]; return n && !GENERIC_SPORTS.has(n) && !NON_PERSON_SPORTS.has(n) })   // keys are sportsPool indexes
  const topSport = specific && specific[1] >= total * 0.05 ? specific[0] : bySport[0][0]
  const name = displayName(key)
  names.set(key, name)
  const id = stableId(key)
  pid.set(key, id); dirIdx.set(key, dir.length)
  dir.push([name, hash(key), 0, topSport, g.minYear, g.maxYear, id])
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

// Rookie season per page: the earliest season with a true rookie card. One page can hold two
// people with the same name (Bobby Witt Sr. / Jr., two Chris Johnsons): a strong run of rookie
// cards (RC-flagged cards, or 4+ sets in one season) 5+ seasons later opens a second rookie
// season. A legend's modern rookie-design cards (no RC flag) don't.
// Rookie seasons are per sport (a same-name soccer player isn't a baseball player's tribute;
// two-sport athletes have a rookie season in each). Multi-sport sets count toward the page's main sport.
const rkKey = (c, sp) => { const n = sportsPool[sp]; return c + '|' + (!n || n === 'Multi-Sport' ? dir[dirIdx.get(c)][3] : sp) }
const rookieCounts = new Map()
const cardSeasons = new Map()   // seasons with ordinary cards (not prospect / unlicensed / buyback / crossover) per page+sport
const firstRookieish = new Map() // earliest rookie-flagged card of any kind
for (const sh of shards) for (const r of sh.rows) {
  if (r[9] && !(r[10] & (H.PROS | H.WEAK | H.BUY)) && !(r[10] >>> 10)) {
    const c0 = canon(r[0])
    for (const c of splits.get(c0) || [c0]) { const k = rkKey(c, r[12]); let st = cardSeasons.get(k); if (!st) cardSeasons.set(k, st = new Set()); st.add(r[9]) }
  }
  if (r[9] && (r[6] & TYPE.RC)) {
    const c0 = canon(r[0])
    for (const c of splits.get(c0) || [c0]) { const k = rkKey(c, r[12]), y = firstRookieish.get(k); if (!y || r[9] < y) firstRookieish.set(k, r[9]) }
  }
  if (!r[9] || !isTrueRookie(r[6], r[10])) continue
  const c0 = canon(r[0])
  for (const c of splits.get(c0) || [c0]) {
    const k = rkKey(c, r[12]); let m = rookieCounts.get(k); if (!m) rookieCounts.set(k, m = new Map())
    let st = m.get(r[9]); if (!st) m.set(r[9], st = { sets: new Set(), flagged: 0 })
    st.sets.add(sh.slugs[r[1]]); if (r[10] & H.FLAG) st.flagged++
  }
}
const rookieSeasons = new Map()
// A legend: first card 10+ seasons before rookie-looking card y, and still on cards in the seasons
// just before it (a brand-new rookie who shares an old player's name isn't). Returns the first card's season.
function legendStart(k, y) {
  const st = cardSeasons.get(k); if (!st) return 0
  const fc = Math.min(...st); if (fc > y - 10) return 0
  let recent = 0; for (let x = y - 6; x < y; x++) if (st.has(x)) recent++
  return recent >= 2 ? fc : 0
}
for (const [c, m] of rookieCounts) {
  const years = [...m.keys()].sort((a, b) => a - b)
  // A legend whose real rookie card isn't flagged in the data (vintage) but whose first
  // "rookie" card is a modern rookie-design card decades later: rookie season = first card.
  const strong = (y) => m.get(y).flagged > 0 || m.get(y).sets.size >= 4
  // a stray early card (one set, no RC flag) gives way to a real run of rookie cards a few seasons later
  const firstStrong = years.find(y => strong(y) || m.get(y).sets.size >= 3 * m.get(years[0]).sets.size)
  const y0 = firstStrong && firstStrong - years[0] <= 4 ? firstStrong : years[0]
  const fc = legendStart(c, y0)
  const starts = [fc && !strong(y0) ? fc : y0]
  for (const y of years) if (y >= starts[starts.length - 1] + 5 && strong(y)) starts.push(y)
  rookieSeasons.set(c, starts)
}
// No true rookie card on file (vintage legends): the rookie season is the first card's season.
for (const [k, y] of firstRookieish) if (!rookieSeasons.has(k)) { const fc = legendStart(k, y); if (fc) rookieSeasons.set(k, [fc]) }
rookieCounts.clear(); cardSeasons.clear(); firstRookieish.clear()
const rookieSeasonsFor = (c, yr, sp) => { const st = rookieSeasons.get(rkKey(c, sp)); if (!st) return [0, 0]; let Y = st[0], next = 0; for (const y of st) { if (y <= yr) Y = y; else if (!next) next = y } return [Y, next] }
const reclassed = { TRIBUTE: 0, BUYBACK: 0, PROSPECT: 0, dropped: 0 }

const out = Array.from({ length: SHARDS }, () => newShard(9, [3]))   // [3] card number; [8] label is optional
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
      const id = pid.get(c), d = dir[dirIdx.get(c)], o = out[d[1]]
      const [Y, nextY] = rookieSeasonsFor(c, (r[10] >>> 10) || r[9], r[12])
      let type = rookieClass(r[6], r[9], r[10], Y, nextY), mem = r[7]
      if ((r[6] & TYPE.RC) && !(type & TYPE.RC)) {
        mem = r[11]
        const k = type & TYPE.TRIBUTE ? 'TRIBUTE' : type & TYPE.BUYBACK ? 'BUYBACK' : type & TYPE.PROSPECT ? 'PROSPECT' : 'dropped'
        reclassed[k]++
      } else if (type & TYPE.BUYBACK) reclassed.BUYBACK++
      const row = [id, intern(slug, o.slugs, o.slugId), intern(section, o.sections, o.secId), r[3], r[4] >= 0 ? intern(sh.teams[r[4]], o.teams, o.teamId) : -1, r[5], targets.length > 1 ? type | TYPE.MULTI : type, mem]
      if (norm(label) !== norm(names.get(c))) row.push(intern(label, o.labels, o.labelId))
      o.rows.push(row)
      d[2]++
    }
  }
  shards[si] = null
}
out.forEach((o, i) => {
  total += o.rows.length
  writeFileSync(new URL(i + '.json', outDir), JSON.stringify({ slugs: o.slugs, sections: o.sections, teams: o.teams, labels: o.labels, rows: [...o.rows] }))
  out[i] = null
})
writeFileSync(new URL('sets.json', outDir), JSON.stringify(setMeta))
writeFileSync(new URL('dir.json', outDir), JSON.stringify({ v: 2, shards: SHARDS, sports: sportsPool, players: dir, aka }))
// top.json: the 5,000 most-carded players with their directory index at [6], so the
// search box can suggest instantly while the full directory (~2 MB gzipped) loads.
// Plus all-time icons whose checklists are thin (Michael Jordan, Tiger Woods), so "jordan" suggests MJ instantly.
const { ICONS } = await import('../lib/query.js')
const ranked = dir.map(p => p.slice(0, 7)).sort((a, b) => b[2] - a[2])
const top = ranked.slice(0, 5000).concat(ranked.slice(5000).filter(p => ICONS.has(norm(p[0]))))
const inTop = new Set(top.map(p => p[6]))
writeFileSync(new URL('top.json', outDir), JSON.stringify({ v: 2, shards: SHARDS, sports: sportsPool, players: top, aka: aka.filter(a => inTop.has(a[0])), partial: true }))
console.log('rookie reclassing:', JSON.stringify(reclassed), '(TRIBUTE/BUYBACK/PROSPECT tagged; dropped = rookie flag removed, no tag)')
console.log('player index:', dir.length.toLocaleString(), 'players (' + moved.size.toLocaleString() + ' spellings merged, ' + splits.size.toLocaleString() + ' multi-name cards credited to each),', total.toLocaleString(), 'card rows across', SHARDS, 'shards from', files, 'sets')
