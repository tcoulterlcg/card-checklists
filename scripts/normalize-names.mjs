// Give every set one consistent display name:  "<season> <Product> <Sport>"
//   e.g. "20-21 UD Upper Deck Ultimate Hockey"          -> "2020-21 Upper Deck Ultimate Collection Hockey"
//        "2016-17 SPGU Hockey Cards – Checklist Added"   -> "2016-17 SP Game Used Hockey"
// Slugs (URLs) never change. Run after any import, before build-index.
//   node scripts/normalize-names.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps)\.json$/
const SEASON_SPORTS = new Set(['Hockey', 'Basketball'])
const SPORT_WORD = { Hockey: 'Hockey', Basketball: 'Basketball', Football: 'Football', Baseball: 'Baseball', Soccer: 'Soccer', UFC: 'UFC', Wrestling: 'Wrestling', Racing: 'Racing', Golf: 'Golf', Tennis: 'Tennis' }

// Product-line aliases: [pattern on the cleaned product, canonical]. First match wins.
// Hockey-only aliases are prefixed with "Hockey|".
const ALIASES = [
  ['Hockey|^(?:upper deck |ud )?ultimate(?: collection)?$', 'Upper Deck Ultimate Collection'],
  ['^(?:upper deck |ud )?(?:spgu|sp game used)(?: edition)?$', 'SP Game Used'],
  ['^(?:upper deck |ud )(sp (?:signature|authentic|game used).*)$', '$1'],
  ['^(?:upper deck |ud )(skybox .*)$', '$1'],
  ['Hockey|^(?:upper deck |ud )?sp game used chl(?: canadian hockey league)?$', 'SP Game Used CHL'],
  ['Hockey|^(?:upper deck |ud )?sp authentic$', 'SP Authentic'],
  ['Hockey|^(?:upper deck |ud )?spx$', 'SPx'],
  ['Hockey|^(?:upper deck |ud )?sp(?: hockey)?$', 'SP'],
  ['Hockey|^(?:upper deck |ud )?(?:opc|o pee chee|o-pee-chee)$', 'O-Pee-Chee'],
  ['Hockey|^(?:upper deck |ud )?(?:opc|o pee chee|o-pee-chee) platinum$', 'O-Pee-Chee Platinum'],
  ['Hockey|^(?:upper deck |ud )?(?:opc|o pee chee|o-pee-chee) coast to coast(.*)$', 'O-Pee-Chee Coast to Coast$1'],
  ['Hockey|^(?:upper deck )?(?:the )?cup$', 'Upper Deck The Cup'],
  ['Hockey|^(?:upper deck |ud )(skybox .*|fleer .*|flair|parkhurst.*)$', '$1'],
  ['Hockey|^(?:ud )(.+)$', 'Upper Deck $1'],
  ['Hockey|^(mvp|premier|trilogy|synergy|artifacts|black diamond|ice|series [12]|allure|credentials|stature|clear cut|engrained|splendor|chronology|compendium|extended series|ahl|chl|pwhl|team canada juniors|national hockey card day)$', 'Upper Deck $1'],
  ['Hockey|^upper deck extended$', 'Upper Deck Extended Series'],
  ['Hockey|^upper deck (ahl|chl)(?: american hockey league| canadian hockey league)?$', 'Upper Deck $1'],
  ['^(?:leaf )?(?:in the game|itg)(?: used)?$', 'Leaf ITG Used'],
  ['^leaf (?:in the game |itg )?(?:itg )?used$', 'Leaf ITG Used'],
  ['^leaf (?:in the game|itg) (.+)$', 'Leaf ITG $1'],
  ['^in the game (.+)$', 'Leaf ITG $1'],
  ['^leaf (stickwork|superlative|heroes (?:&|and) prospects|enshrined)$', 'Leaf ITG $1'],
  ['^leaf itg superlative$', 'Leaf ITG Superlative Collection'],
  ['^skybox (.+)$', 'SkyBox $1'],
  ['Hockey|^tim hortons(.*)$', 'Upper Deck Tim Hortons$1'],
  ['Hockey|^overtime(.*)$', 'Upper Deck Overtime$1'],
  ['^panini donruss elite$', 'Donruss Elite'],
  ['^panini clearly donruss$', 'Clearly Donruss'],
  ['^panini score$', 'Score'],
  // Select was Pinnacle's (1993-98) and Prestige was Playoff / Donruss-Playoff's until Panini
  // bought Donruss-Playoff in March 2009 — only Panini-era sets get the Panini name.
  ['Y2010|^(select|prestige|flawless collegiate|nba hoops(?: premium.*)?)$', 'Panini $1'],
  ['Y0|^(?:panini )?prestige$', 'Playoff Prestige'],
  ['^(?:panini )?immaculate(?: collection)? collegiate$', 'Panini Immaculate Collection Collegiate'],
  ['^(.*) vol\\.? (\\d+)$', '$1 Volume $2'],
  ['^presidents? choice (.+)$', "President's Choice $1"],
  ['^pro set (?:hockey )?blaster$', 'Pro Set Blaster'],
  ['^panini nhl stickers?(?: collection)?$', 'Panini NHL Sticker Collection'],
  ['^topps nhl stickers?(?: collection)?$', 'Topps NHL Sticker Collection'],
]
const CANON_CASE = { ahl: 'AHL', chl: 'CHL', pwhl: 'PWHL', spx: 'SPx', mvp: 'MVP', itg: 'ITG', nhl: 'NHL', nba: 'NBA', nfl: 'NFL', mlb: 'MLB', wnba: 'WNBA', mls: 'MLS', ufc: 'UFC', wwe: 'WWE', aew: 'AEW', uefa: 'UEFA', fifa: 'FIFA', efl: 'EFL', nscc: 'NSCC', liv: 'LIV', usa: 'USA', rc: 'RC', ud: 'UD', sp: 'SP', ii: 'II', iii: 'III', 'o-pee-chee': 'O-Pee-Chee', skybox: 'SkyBox', 'e-x': 'E-X', 'ex': 'E-X', 'epack': 'ePack', 'e-pack': 'e-Pack' }

function seasonOf(s) {
  // Prefer the slug/name's own season; fall back to `year` (end year).
  const src = s.slug + ' ' + s.name
  let m = src.match(/\b(19|20)(\d\d)-(\d\d)\b/)
  if (m) return m[1] + m[2] + '-' + m[3]
  m = s.slug.match(/^(\d\d)-(\d\d)-/)
  if (m) return '20' + m[1] + '-' + m[2]
  if (SEASON_SPORTS.has(s.sport) && s.year && /^\d{4}-\d{2}/.test(s.name)) { const y = s.year; return (y - 1) + '-' + String(y).slice(2) }
  m = s.name.match(/^\s*((?:19|20)\d\d)\b/) || s.slug.match(/^((?:19|20)\d\d)-/)
  return m ? m[1] : (s.year ? String(s.year) : '')
}

function cleanProduct(name, sport, year = 0) {
  let p = name
    .replace(/^(?:ninja update|breaking news|checklist revealed)\s*:\s*/i, '')
    .replace(/^\/?\s*/, '')
    .replace(/^and\s+/i, '')
    .replace(/^(?:\d{4}(?:-\d{2,4})?|\d\d[- ]\d\d)\s+/, '')       // leading season/year
    .replace(/^\d\d\s+/, '')                                         // stray "22 " left from "2021-22 22 …"
    .replace(/\s+[–—-]\s+(checklist added|full|basic|out now|official|updated?.*|final.*list|.*list added|.*e-?pack release|review added|.*info added|.*\badded)\s*$/i, '')
    .replace(/\s+checklist e-?pack$/i, '')
    .replace(/\s+(?:database\s+)?full$/i, '').replace(/\s+&\s+checklists?$/i, '').replace(/\s+(?:card\s+)?checklists?$/i, '')
    .replace(/\s+exclusives guide and$/i, ' Exclusives').replace(/\s+cards(?=\s|$)/gi, '')
    .replace(/\s+[–—-]\s+(factory set|hobby edition|wave \d+|wave one|series \d+|rookie redemptions?.*|final rookie redemptions?.*)\s*$/i, ' $1')
    .replace(/\s+[–—-]\s*$/, '')
    .replace(/\s+\d[\d,]*\s+total(\s+cards)?\s*$/i, '')
    .replace(/\s+[–—-]\s+multi-sport$/i, '')
    .replace(/\b(?:hockey|basketball|football|baseball|soccer)\s+(?:trading\s+)?cards?(?=\s*(?:[–—-]|$))/ig, '')
    .replace(/\s+(?:nhl|nba|nfl|mlb)?\s*(?:trading\s+)?cards?\s*$/i, '')
    .replace(/\s+checklist\s*$/i, '')
    .replace(/\s+[–—-]\s*$/, '')
  // drop the sport word wherever it sits at the end (re-added later)
  const sw = SPORT_WORD[sport]
  if (sw) p = p.replace(new RegExp('\\s*[–—-]?\\s*\\b' + sw + '\\b(\\s+(nhl|nba|nfl|mlb))?\\s*$', 'i'), '')
  // second pass: junk suffixes that sat before the sport word, then keep any other " – X" as " X"
  p = p.replace(/\s+[–—-]\s+(?:checklist added|review added|product review.*|.*\badded.*|.*print runs?.*|sp odds.*|.*info)\s*$/i, '')
  p = p.replace(/\s+[–—]\s+/g, ' ')
  p = p.replace(/\s+(?:database\s+)?full$/i, '').replace(/\s+&\s+checklists?$/i, '').replace(/\s+(?:card\s+)?checklists?$/i, '')
  // a sport word in the middle of the product ("Topps Baseball Japan Edition") moves to the end (re-added later)
  if (sw && !/World Baseball|National Hockey|Hockey Card|Football Nation|Baseball Nation|Hockey Night|Baseball Heroes|Football League|Hockey League/i.test(p)) p = p.replace(new RegExp('\\s+' + sw + '\\b(?=\\s+\\S)', 'i'), '')
  p = p.replace(/\bMega Boxl\b/, 'Mega Box')
  p = p.replace(/\bUD Upper Deck\b/i, 'Upper Deck').replace(/\bCurrated\b/i, 'Curated').replace(/\s+/g, ' ').trim()
  p = p.replace(/\s+(NFL|NBA|MLB|NHL)$/i, '').replace(/\s+(American|Canadian) Hockey League$/i, '').replace(/\s+Canadian Football League$/i, '')
    for (const [pat, canon] of ALIASES) {
    let re = pat, onlySport = null
    if (/^(?:[A-Z][a-z]+|Y\d+)\|/.test(pat)) { onlySport = pat.split('|')[0]; re = pat.slice(onlySport.length + 1) }
    if (/^Y\d+$/.test(onlySport || '')) { const minY = +onlySport.slice(1); onlySport = null; if (minY === 0 ? year >= 2010 : year < minY) continue }
    if (onlySport && onlySport !== sport) continue
    const m = p.match(new RegExp(re, 'i'))
    if (m) { p = canon.replace(/\$(\d)/g, (x, i) => keepCase(m[+i] || '')); break }
  }
  return p.replace(/\s+/g, ' ').trim()
}
// Keep the source's casing, only fixing all-lowercase words and known acronyms.
function keepCase(s) {
  return s.split(' ').map(w => CANON_CASE[w.toLowerCase()] || (/^[a-z]/.test(w) && !/^(of|the|to|and|de|la|in)$/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ')
}
function titleCase(s) {
  return s.split(' ').map(w => CANON_CASE[w.toLowerCase()] || (w.length <= 2 && /^(of|the|to|and|de|la)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

// Pass 1: clean every name, and count spellings per (sport, case-folded key)
const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !SKIP.test(f))
const cleaned = []
const sportFixes = []
const spellings = new Map()
// Cluster key ignores word order and filler that sources add or drop
// ("Update Series"/"Update", "Sapphire Edition"/"Sapphire", "Immaculate Collection"/"Immaculate").
const FILLER = /\b(and|the|of)\b/g
const keyOf = (sport, p) => {
  let t = p.toLowerCase().replace(/&/g, ' and ').replace(/\bvol(ume)?\b\.?/g, 'volume')
    .replace(/\bupdate series\b/g, 'update')
    .replace(sport === 'Soccer' ? /\bteam set\b/g : /^$/, '')
    .replace(/\b(sapphire|ben baller|hall of fame|japan|uk|captain'?s) edition\b/g, '$1')
    .replace(/\b(immaculate|transcendent|quarterback) collection\b/g, '$1')
    .replace(/\bworld baseball classic\b/g, 'world classic')
    .replace(/\bfootball nation\b/g, 'nation').replace(/\bbaseball nation\b/g, 'nation')
    .replace(/[^a-z0-9]+/g, ' ').replace(FILLER, ' ')
    .replace(/\b(hockey|basketball|football|baseball|soccer|nhl|nba|nfl|mlb)\b/g, ' ')
  return sport + '|' + [...new Set(t.split(' ').filter(Boolean))].sort().join(' ')
}
for (const f of files) {
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.name || !s.sport || /Pokémon|Magic|Lorcana|Yu-Gi-Oh/.test(s.sport)) continue
  // The name's own sport word beats a mis-filed sport field ("1948 Leaf Football" filed as Baseball).
  const named = (s.name.match(/\b(Hockey|Basketball|Football|Baseball)\b/g) || [])
  if (named.length === 1 && named[0] !== s.sport && ['Hockey', 'Basketball', 'Football', 'Baseball'].includes(s.sport) && !/multi|soccer|futbol|fútbol/i.test(s.name)) { sportFixes.push(s.name + ': ' + s.sport + ' -> ' + named[0]); s.sport = named[0]; s.__dirty = true }
  const product = cleanProduct(s.name, s.sport, parseInt(seasonOf(s)) || s.year || 0)
  if (!product) continue
  const k = keyOf(s.sport, product)
  const m = spellings.get(k) || new Map(); m.set(product, (m.get(product) || 0) + 1); spellings.set(k, m)
  cleaned.push({ f, s, product, k })
}
// Pick the canonical spelling: the most common; ties -> the one with more capitals/ampersand-free
const canon = new Map()
for (const [k, m] of spellings) {
  // most common; ties -> fewer Capitalised Small Words ("x", "of", "the"), then keeps punctuation, then more capitals (acronyms)
  const smallCaps = (t) => (t.match(/\s(?:X|Of|The|And|In|To|A)\b/g) || []).length
  const inner = (t) => /\b(Hockey|Basketball|Football|Baseball|NHL|NBA|NFL|MLB)\b/.test(t) && !/^(NBA|NFL|NHL) |World Baseball|National Hockey|Football Nation|Baseball Nation|Hockey Card|Hockey Day/.test(t) ? 1 : 0
  const best = [...m.entries()].sort((a, b) => inner(a[0]) - inner(b[0]) || b[1] - a[1] || smallCaps(a[0]) - smallCaps(b[0]) || (/[:']/.test(b[0]) - /[:']/.test(a[0])) || (b[0].match(/[A-Z]/g) || []).length - (a[0].match(/[A-Z]/g) || []).length)[0][0]
  canon.set(k, best)
}

let changed = 0
const samples = []
for (const { f, s, k } of cleaned) {
  const season = seasonOf(s)
  const sw = SPORT_WORD[s.sport] || ''
  const product = canon.get(k)
  const name = [season, product, sw && !new RegExp('\\b' + sw + '\\b', 'i').test(product) ? sw : ''].filter(Boolean).join(' ')
  const dirty = s.__dirty; delete s.__dirty
  if (name !== s.name || dirty) {
    if (name !== s.name && !/^\d{4} .* Cards$/.test(s.name) && samples.length < 120) samples.push(s.name + '  →  ' + name)
    s.name = name; changed++
    if (!DRY) writeFileSync(new URL(f, dataDir), JSON.stringify(s))
  }
}
console.log('renamed', changed, 'of', cleaned.length, 'sets;', canon.size, 'distinct products')
console.log('sport fixes', sportFixes.length); if (DRY) { console.log(sportFixes.slice(0, 15).join('\n')); console.log(samples.join('\n')) }
