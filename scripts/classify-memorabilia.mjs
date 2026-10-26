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

export const MEM_SECTION = /relic|memorabilia|material|jersey|swatch|game.?used|game.?worn|player.?worn|event.?worn|threads|fabric|\bgu\b|patch|laundry tag|nameplate|logo ?man|\blogos?\b|shield|emblem|button|\bstick\b|net cord|foundations|booklet.*(relic|patch|jersey)|\bbat\b|bat barrel|\bknob\b|glove|cleat|helmet|\bshoe|\bsock|\bhat\b|\bcap\b|\bpants\b|\bball\b|base.*used|\btag\b|\bprime\b|fabric|sweater|\bgear\b|bench|\bseats?\b|\btowel|\bnet\b|\bpuck|\bturf\b|\bbanner|nhl glory/i

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

// Card-level facts a manufacturer has stated outright (override everything).
const CARD_OVERRIDES = [
  // Upper Deck: Bedard's 2023-24 The Cup Rookie Auto Patch uses game-worn material from 5 Mar 2024 vs Arizona.
  { slug: /23-24.*the-cup-hockey|2023-24.*the-cup-hockey/, section: /rookie auto patch/i, player: /connor bedard/i,
    mem: { k: 'GU', src: 'maker', note: 'Upper Deck: game-worn memorabilia from the Blackhawks\' March 5, 2024 game vs Arizona.', url: 'https://upperdeck.com/?p=11711' } }
]

// Documented manufacturer practice, used only where nothing more specific is stated.
// Upper Deck hockey: veteran memorabilia is game-used; rookie memorabilia comes from the
// NHLPA Rookie Showcase photo shoot and is event-worn (Upper Deck's own wording).
const UD_HOCKEY = /upper deck|\bud\b|o-pee-chee|\bspx?\b|sp authentic|sp game used|the cup|ultimate collection|artifacts|black diamond|trilogy|synergy|allure|parkhurst|\bmvp\b|credentials|stature|engrained|premier|\bice\b|clear cut|splendor|fleer|skybox|exquisite|chronology|compendium|tim hortons|ultra/i
// Things a player wears; seats, pucks, nets, banners and sticks are not covered by the convention.
const WORN = /jersey|patch|material|swatch|relic|memorabilia|threads|fabric|sweater|\btags?\b|\blogos?\b|shield|emblem|nameplate|laundry|letter|numbers?|apparel|gear|premium|prime|booklet|foundations/i
const ROOKIE_SEC = /\brookie|\brc\b|\brpa\b|young guns|future watch|premieres|rookie gems|hot prospects|draft|debut|prospect|freshmen|future legacy|first impressions|rookie showcase/i
const UD_SRC = { rookieUrl: 'https://upperdeck.com/nhlpa-rookie-showcase-get-your-skates-on/', vetUrl: 'https://upperdeck.com/2025-26-sp-game-used-hockey/' }

// Lines whose patches are made for the card (never worn). Each is verified against a listing or guide.
// `set` limits the rule to one product so look-alike titles elsewhere aren't caught.
export const MFG_LINES = [
  { re: /team logo jumbo|logo jumbo puzzle/i, set: /black diamond/i,
    note: 'Black Diamond Team Logo Jumbo patches are manufactured patches, not cut from a worn jersey.', url: 'https://www.comc.com/Cards/Hockey/2024-25/Upper_Deck_Black_Diamond_-_Rookie_Team_Logo_Jumbo_Puzzle_Manufactured_Patches_-_Retro' },
  { re: /letterman/i, set: /upper deck|\bud\b|chronology/i, need: /patch/i,
    note: 'Upper Deck Letterman Patches are manufactured letter patches.', url: 'https://collectibles.com/2019-upper-deck-chronology-letterman-patches-manufactured-letter-relics-l-mo-ga-brendan-gallagher' },
  { re: /patch/i, set: /o-pee-chee|\bopc\b/i,
    note: 'O-Pee-Chee patch inserts (trophies, team logos, mascots, draft patches) are manufactured patches.', url: 'https://www.cardboardconnection.com/2012-13-o-pee-chee-hockey-team-logo-patches-guide' },
  { re: /nhl glory/i, set: /the cup/i,
    note: 'The Cup NHL Glory shields are manufactured (verified by Trevor, 2026-10-23).' },
  { re: /\bstickers?\b/i, orSet: true, note: 'Stickers are printed for the card, not memorabilia.' }   // a title in a sticker set ("Sweater Weather") or a sticker insert
]
export function manufactured(set, title) {
  if (/manufactured|\bmfg\b/i.test(title)) return { k: 'MFG', src: 'title' }
  for (const r of MFG_LINES) {
    if (!(r.re.test(title) || (r.orSet && r.re.test(set.name || ''))) || (r.set && !r.set.test(set.name || '')) || (r.need && !r.need.test(title))) continue
    return { k: 'MFG', src: 'source', note: r.note, ...(r.url ? { url: r.url } : {}) }
  }
  return null
}
// Not something a player wears, so the "veteran memorabilia is game-used" convention says nothing about it.
const NOT_WORN = /\bpucks?\b|net cord|\bbanners?\b|\bseats?\b|\bsticks?\b|materialisticks|etching|draft boards?|\bglass\b|towel|dodgeball|target|carpet|microphone|ticket|mascot/i
// Jersey parts Upper Deck doesn't describe as game-worn (shields, logos, tags, nameplates…). Many are
// unworn or come from team-issued stock, so don't assume. Mega Patch / Supreme Patch are cut from
// game-used jerseys per Upper Deck, so they keep the convention.
// Also commemorative/theme patches (Hall of Fame, Hockey History, Cup Winners, Captains, Pride of a Nation
// flags) that are likely made for the card but that we haven't confirmed either way.
const UNSTATED_PART = /shield|laundry|\btags?\b|nameplate|\blogos?\b|emblem|button|\bletters?\b|\bnumbers?\b|\bflag\b|patch-taculars|logoman|pride of a nation|hall of fame|hockey history|cup winners|captains? patch/i
const PART_OK = /mega patch|supreme/i
function convention(set, title) {
  if (set.sport !== 'Hockey' || !UD_HOCKEY.test(set.name || '')) return null
  if (/o-pee-chee|\bopc\b/i.test(set.name || '')) return null // OPC has no game-used convention; its patches are manufactured
  if (NOT_WORN.test(title)) return null
  // Verified by Trevor (2026-10-23): veteran shields in The Cup and Ultimate Collection are game-used;
  // rookie shields are event-worn (NHLPA Rookie Showcase).
  if (/shield/i.test(title) && /the cup|ultimate collection/i.test(set.name || '') && !/(tag|logo|nameplate|emblem|button|letter|number|flag)/i.test(title.replace(/shield/gi, '')))
    return ROOKIE_SEC.test(title)
      ? { k: 'EW', src: 'verified', note: 'Rookie shields in The Cup / Ultimate Collection are event-worn (Rookie Showcase).' }
      : { k: 'GU', src: 'verified', note: 'Veteran shields in The Cup / Ultimate Collection are game-used.' }
  if (UNSTATED_PART.test(title) && !PART_OK.test(title)) return { k: 'UNK', src: 'none', note: 'Upper Deck does not say this logo, shield, tag or nameplate piece was game-worn, so we do not assume it.' }
  if (!WORN.test(title)) return null
  if (/debut/i.test(title) && /extended/i.test(set.name || '') && (set.year || 0) >= 2026) return { k: 'GU', src: 'maker', note: 'Upper Deck Rookie Debut Jersey program: jersey worn in the player\'s first NHL game.', url: 'https://upperdeck.com/upper-deck-introduces-nhl-rookie-debut-jersey-cards-30-years-after-pioneering-first-ever-game-used-jersey-trading-cards/' }
  if (ROOKIE_SEC.test(title)) return { k: 'EW', src: 'typical', note: 'Upper Deck rookie memorabilia comes from the NHLPA Rookie Showcase and is event-worn unless the card says otherwise.', url: UD_SRC.rookieUrl }
  return { k: 'GU', src: 'typical', rk: 'EW', note: 'Upper Deck veteran memorabilia is game-used unless the card says otherwise; rookies in mixed subsets are event-worn.', url: UD_SRC.vetUrl }
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
    const title = (sec.title || '').replace(/new jersey/gi, 'NJ') // "New Jersey Devils" is a team, not a jersey relic
    const hasMemFlag = (sec.cards || []).some(c => /\bMEM\b/.test(c.x || ''))
    // Printing plates (incl. The Cup "Rookie Plates - … Cyan/Magenta/Yellow") are metal plates, not memorabilia.
    const isPlate = /printing plate|\brookie plates\b|\bplates?\b.*\b(cyan|magenta|yellow)\b/i.test(title)
    if (isPlate || !(MEM_SECTION.test(title) || hasMemFlag)) {
      if (sec.mem) { delete sec.mem; changed = true }
      for (const c of sec.cards || []) if (c.m && c.m.f) { delete c.m; changed = true }
      continue
    }
    let mem = null
    const m = matchInsert(ins, title)
    if (m && m.k) mem = { k: m.k, src: 'tcdb', note: m.note.slice(0, 220) }
    // "SP Game Used" / "In The Game Used" are product names, not a statement about the material.
    if (!mem) { const k = classifyText(title.replace(/\b(sp|in the) game[- ]used\b/gi, '')); if (k && k !== 'UNK') mem = { k, src: 'title' } }
    if (!mem && sec.odds) { const k = classifyText(sec.odds); if (k && k !== 'UNK') mem = { k, src: 'odds' } }
    if (!mem) mem = manufactured(s, title)
    if (!mem) mem = convention(s, title)
    if (!mem) mem = m && m.note ? { k: 'UNK', src: 'tcdb', note: m.note.slice(0, 220) } : { k: 'UNK', src: 'none' }
    // card-level overrides the maker has stated
    for (const o of CARD_OVERRIDES) {
      if (!o.slug.test(s.slug) || !o.section.test(title)) continue
      for (const c of sec.cards || []) if (o.player.test(c.p || '')) { if (JSON.stringify(c.m) !== JSON.stringify(o.mem)) { c.m = o.mem; changed = true } }
    }
    // A section that is memorabilia only because some of its cards carry TCDB's MEM flag
    // (The Cup "Base Set": plain veteran cards plus rookie patch autos) is tagged card by card,
    // so the plain cards don't show "Unknown material".
    const flagged = (sec.cards || []).filter(c => /\bMEM\b/.test(c.x || ''))
    if (!MEM_SECTION.test(title) && flagged.length < (sec.cards || []).length) {
      for (const c of sec.cards) {
        const want = /\bMEM\b/.test(c.x || '') && !(c.m && !c.m.f)
          ? (({ rk, ...rest }) => ({ ...rest, ...(rk && /\bRC\b/.test(c.x || '') ? { k: rk } : {}), f: 1 }))(mem)
          : (c.m && !c.m.f ? c.m : undefined)
        if (JSON.stringify(c.m) !== JSON.stringify(want)) { if (want) c.m = want; else delete c.m; changed = true }
      }
      if (sec.mem) { delete sec.mem; changed = true }
      stats.memSecs++; stats.cards += flagged.length
      stats.byK[mem.k] = (stats.byK[mem.k] || 0) + flagged.length
      stats.bySrc[mem.src] = (stats.bySrc[mem.src] || 0) + 1
      continue
    }
    for (const c of sec.cards || []) if (c.m && c.m.f) { delete c.m; changed = true }   // section is tagged as a whole again
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
