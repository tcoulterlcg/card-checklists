// Player-name hygiene for sports sets. Safe to re-run; run after cleanup-data.mjs.
//  - drops rows that are page junk, not cards (ad-script text, hobby supplies)
//  - repairs encoding damage ("Ronald Acu?a Jr." -> "Ronald Acuña Jr.") by matching
//    against the clean spelling used elsewhere in the data
//  - strips subset/variant tails stuck to names ("Brayden Point UR,", "Gordie Howe (R)",
//    "Elias Pettersson 2025", "Josh Gibson)")
//  - unifies punctuation/accent spellings of one name to the most-used spelling
//    ("Shaquille ONeal" / "Shaquille O'Neal", "CJ Stroud" / "C.J. Stroud").
//    Suffix differences (Jr., II, III) are left alone: "Vladimir Guerrero" and
//    "Vladimir Guerrero Jr" are different people.
// TCG and entertainment sets are not touched (their card names are not people).
//   node scripts/cleanup-names.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fixFlagTail } from './flag-tail.mjs'

const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const REPORT = process.argv.find(a => a.startsWith('--report='))  // --report=<file>: write every rename
const renames = new Map()
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const SPORTS = new Set(['Baseball', 'Football', 'Basketball', 'Hockey', 'Soccer', 'UFC', 'Boxing', 'Wrestling', 'Racing', 'Golf', 'Tennis', 'Lacrosse', 'Bowling', 'Cricket', 'Multi-Sport'])

const JUNK = /adsbygoogle|window\.|\.push\(\{|^(toploaders?.*|sleeves|piece wall display)$|\beBay\b/i   // eBay listing titles scraped as cards
const TEAM_TAG = /^(one of ones|all rookies|top rookies|retired players|no team|rookies|veterans|legends)$/i
const key = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim()

function tidy(p) {
  let s = String(p || '').trim().replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u00AE\u2122]/g, '')
  s = s.replace(/^[-\u2013\u2014]\s+/, '').replace(/\s+[-\u2013\u2014]$/, '').replace(/\*+$/, '').trim()
  // TCDB editor notes glued on: "Carey Price AUWhere does this belong?", "... AU, SN10Was this issued here?"
  s = s.replace(/\s*(?:AUR?|MEM|SN\d+)?(?:,\s*(?:AUR?|MEM|SN\d+))*\s*(?:Where (?:does|was) this|Was this issued).*$/, '').replace(/\?{2,}$/, '').trim()
  // TCDB flag tails: "Brayden Point AU, SN1Trilogy", "X AU, MEM, SN25"
  s = s.replace(/^(\S+(?:\s+\S+)+?)\s+(?:AUR?|MEM)(?:,\s*(?:AUR?|MEM|SN\d+[A-Za-z' ]*))+$/, '$1')
  // card-variation letter or "Auto" glued to a full name: "Wayne Gretzky A", "Wayne Gretzky Auto"
  s = s.replace(/^([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+)+)\s+(?:[A-F]|Auto|Autograph)$/, '$1')
  s = s.replace(/\s+(UR|RAP|ROO|PROS|FY)\s*,?$/, '')   // subset tags glued to names ("UR" = Ultimate Rookie)
  s = s.replace(/,\s*$/, '')
  s = s.replace(/\s*\(R\)$/, '')                     // "(R)" marker
  s = s.replace(/\s*\(\$\d[\d,]*(?:\.\d\d)?\)$/, '')   // retail price glued on: "Trevor Lawrence ($750)"
  // trailing year on a person's name ("Elias Pettersson 2025"), not on "Badge 1900"
  s = s.replace(/\s+(19|20)\d\d$/, (m) => { const rest = s.slice(0, -m.length); return /^[A-Z][\w'.-]+( [A-Z][\w'.-]+)+$/.test(rest) && !/\d/.test(rest) ? '' : m })
  if (/\)$/.test(s) && !s.includes('(')) s = s.slice(0, -1).trim()
  if (/^\(/.test(s) && !s.includes(')')) s = s.slice(1).trim()
  return s
}

const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !SKIP.test(f))
const sets = []
for (const f of files) {
  try {
    const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))
    // Section titles that repeat the set name ("2026 Fleer Ultra Golf – Base Set" -> "Base"), every sport.
    if (s.name && Array.isArray(s.sections)) {
      const re = new RegExp('^' + s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(?:[–—:-]\\s*)?', 'i')
      const titles = new Set(s.sections.map(x => x.title))
      let renamed = false
      for (const sec of s.sections) {
        if (!re.test(sec.title || '')) continue
        const t = sec.title.replace(re, '').replace(/\s+Set$/, '').trim()
        if (t && !titles.has(t)) { titles.add(t); sec.title = t; renamed = true }
      }
      if (renamed && !DRY) writeFileSync(new URL(f, dataDir), JSON.stringify(s))
    }
    if (SPORTS.has(s.sport)) { sets.push([f, s]); continue }
    // Non-sport sets keep their names as-is, but TCDB flag notes in the team column ("SN25",
    // "AU, MEM") are fixed here too — they show as a "team" otherwise.
    let ch = false
    for (const sec of s.sections || []) for (const c of sec.cards || []) {
      if (fixFlagTail(c)) ch = true   // "Pete PR3600", "X AU, MEM, SN25": flags glued onto the name
      // TCDB variation / error notes in the team column ("VARVAR: Black hair", "UERUER: name misspelled")
      if (c.t && /^(VAR|UER)\1:?/.test(c.t)) { const k = c.t.slice(0, 3); const x = (c.x || '').split(/\s+/).filter(Boolean); if (!x.includes(k)) x.push(k); c.x = x.join(' '); delete c.t; ch = true; continue }
      if (!c.t || !/^(?:(?:URA?|AUR?|MEM|RC|SP|SSP|SN\d+)(?:,\s*|$))+$/.test(c.t.trim())) continue
      const x = (c.x || '').split(/\s+/).filter(Boolean)
      for (const g of c.t.trim().split(/,\s*/)) { const v = /^SN(\d+)$/.test(g) ? '/' + g.slice(2) : (g === 'URA' || g === 'AUR') ? 'AU' : g; if (!x.includes(v)) x.push(v) }
      c.x = x.join(' '); delete c.t; ch = true
    }
    if (ch && !DRY) writeFileSync(new URL(f, dataDir), JSON.stringify(s))
  } catch {}
}

// Affiliate text scraped from Cardboard Connection ("Shop parallels on eBay.") in pack-odds
// notes and team fields, every sport.
const SHOP = /\s*[-*·]?\s*(?:Shop|Buy)(?: [A-Za-z0-9'.]+){0,6}? (?:on )?eBay\.?/gi
let shopFixed = 0

// Cardboard Connection page widgets scraped as cards:
//  - the eBay listing strip under a checklist ("1965 Topps Joe Morgan RC SGC 6 EXMT ... #16"):
//    the year lands in the number field, the listing title in the name. It shows up as a run of
//    year-numbered rows at the end of a section (or filling a whole section on pages with no list).
//  - the box-price tables ("Count 6 Boxes", "Heritage Blaster"), in sections titled "<file>.xlsx".
// A run is dropped only when it reads like listings, so real year-numbered lists
// (Recollection Collection buybacks, Under Wraps team baseballs, "1953 World Series") stay.
const WIDGET_N = /^(?:1[89]\d\d|20[0-3]\d|\d{7,})$/
const LISTING = /\b(?:PSA|SGC|BGS|BVG|CGC|CSG|HGA|GMA|RC|Rookie|Auto|Autograph|Refractor|Parallel|Lot|Box|Blaster|Hobby|Hanger|Tin|Pack|Sealed|Card|Cards|Free|Rare|NM|EX|SP|HOF|Vintage|Poster|Puck|Jacket|Photo|Pokemon|Signed)\b|#\s?\w*\d|\/\s?\d/i
const GRADED = /\b(?:PSA|SGC|BGS|BVG|CGC|CSG|HGA|GMA)\s?(?:GRADED\s)?(?:10|[1-9](?:\.5)?)\b/i
const looksListing = (c) => { const s = (c.p || '') + ' ' + (c.t || ''); return LISTING.test(s) || s.length > 46 }
const STRONG = /\b(?:Box|Blaster|Hobby|Hanger|Tin|Mega|Lot|Free Ship\w*|in hand|Pick)\b|#\s?\d|\bPR:/i
const strongListing = (c) => { const s = (c.p || '') + ' ' + (c.t || ''); return GRADED.test(s) || STRONG.test(s) || s.length > 46 }
let widgetDropped = 0
function dropWidgets(set) {
  let n = 0
  const secs = []
  for (const x of set.sections || []) {
    if (/\.xlsx?$/i.test(String(x.title || ''))) { n += (x.cards || []).length || 1; continue }
    const cs = x.cards || []
    let i = cs.length
    while (i > 0 && WIDGET_N.test(String(cs[i - 1].n || ''))) i--
    const run = cs.slice(i)
    let keep = cs
    // Panini "Update" lists (year of the original product, insert name, "1 Troy Polamalu - USC Trojans / ...") are real
    const panUpdate = (c) => /^\d+ [^/]+ - /.test(c.t || '')
    // a short run (1-3 rows) after a real list is often a real tail card ("2016 Chicago Cubs Team Signed",
    // "2015 Rookie Set /10"), so every row must read like an eBay listing or a box-price row
    const ok = run.length >= 4 ? run.filter(looksListing).length / run.length >= 0.5 : run.length > 0 && run.every(strongListing)
    if (ok) keep = cs.slice(0, i).concat(run.filter(panUpdate))
    // a graded-copy listing anywhere else (number is a year, an eBay item id, or blank)
    const kept = keep.filter(c => !(GRADED.test((c.p || '') + ' ' + (c.t || '')) && (!c.n || WIDGET_N.test(String(c.n)))))
    n += cs.length - kept.length
    if (kept.length !== cs.length) x.cards = kept
    if (!x.cards || x.cards.length || !cs.length) secs.push(x)
  }
  if (n) set.sections = secs
  return n
}

for (const f of files) {
  const fp = new URL(f, dataDir); let s2; try { s2 = JSON.parse(readFileSync(fp, 'utf8')) } catch { continue }
  let ch = false
  if (Array.isArray(s2.sections)) { const w = dropWidgets(s2); if (w) { widgetDropped += w; ch = true } }
  // "22 23 Panini Revolution Basketball" (year 22) -> "2022-23 Panini Revolution Basketball" (year 2023)
  // import-name leftovers: "2023 Upper Deck Marvel Platinum Checklist" / "… Trading"
  if (/\s+(Checklist|Trading)$/.test(s2.name || '')) { s2.name = s2.name.replace(/\s+(Checklist|Trading)$/, ''); ch = true; shopFixed++ }
  const yy = (s2.name || '').match(/^(\d\d) (\d\d) (.+)$/)
  if (yy && +yy[2] === (+yy[1] + 1) % 100) { const y1 = (+yy[1] > 40 ? 1900 : 2000) + +yy[1]; s2.name = y1 + '-' + yy[2] + ' ' + yy[3]; s2.year = y1 + 1; ch = true; shopFixed++ }
  else if (s2.year && s2.year < 100 && /^\d{4}/.test(s2.name || '')) { s2.year = +s2.name.slice(0, 4) + (/^\d{4}-\d\d/.test(s2.name) ? 1 : 0); ch = true; shopFixed++ }
  for (const x of s2.sections || []) {
    // HTML numeric entities left in titles/names ("Fro &#x1f440;") -> the characters
    const ent = (v) => v.replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d{1,7});/g, (_, d) => String.fromCodePoint(+d))
    if (x.title && /&#x?[0-9a-f]+;/i.test(x.title)) { x.title = ent(x.title); ch = true; shopFixed++ }
    if (x.cards) {
      const before = x.cards.length
      // marketplace listing titles scraped as cards ("... -Free Shipping!", "Factory Sealed Set Box ... Mint")
      x.cards = x.cards.filter(c => !/free shipping!?|factory sealed .*\bmint$/i.test(c.p || ''))
      if (x.cards.length !== before) { ch = true; shopFixed += before - x.cards.length }
      for (const c of x.cards) {
        if (c.p && /&#x?[0-9a-f]+;/i.test(c.p)) { c.p = ent(c.p); ch = true; shopFixed++ }
        if (c.t && /&#x?[0-9a-f]+;/i.test(c.t)) { c.t = ent(c.t); ch = true; shopFixed++ }
        // trademark marks from licensor copy ("Los Angeles Dodgers®", "Braves™") split teams in filters
        if (c.t && /[\u2122\u00AE]/.test(c.t)) { c.t = c.t.replace(/\s*[\u2122\u00AE]/g, ''); ch = true; shopFixed++ }
        if (c.p && /[\u2122\u00AE]/.test(c.p)) { c.p = c.p.replace(/\s*[\u2122\u00AE]/g, ''); ch = true; shopFixed++ }
        if (c.t && /\s*\(eBay\)$/i.test(c.t)) { c.t = c.t.replace(/\s*\(eBay\)$/i, ''); ch = true; shopFixed++ }
      }
    }
    // dead pointers to Cardboard Connection's spreadsheets/guides ("View the full spreadsheet for specific print runs.")
    const CTA = /(?:^|(?<=[.!?:]\s))(?:View|See|Click here)\b[^.!?]{0,110}?(?:spreadsheet|excel|checklist at the bottom|guide|gallery|tab above|click here|for (?:full|complete|specific) (?:details|variation details|breakdowns?))[^.!?]*[.!?]?\s*/gi
    if (x.odds && x.odds.match(CTA)) { const o = x.odds.replace(CTA, '').replace(/\s*·\s*$/, '').replace(/^\s*·\s*/, '').replace(/\s{2,}/g, ' ').trim(); if (o !== x.odds) { x.odds = o; ch = true; shopFixed++ } }
    if (x.odds && /eBay/i.test(x.odds) && x.odds.match(SHOP)) { x.odds = x.odds.replace(SHOP, '').replace(/\s+·\s*$/, '').replace(/\s{2,}/g, ' ').trim(); ch = true; shopFixed++ }
    for (const c of x.cards || []) if (c.t && /eBay/i.test(c.t) && c.t.match(SHOP)) {
      let t = c.t.replace(SHOP, '').trim().replace(/\s*[-*]$/, '').trim()
      const pr = t.match(/^(.*?\S)\s+#?\/\s*(\d{1,5})$/); if (pr) { t = pr[1]; const fx = new Set((c.x || '').split(/\s+/).filter(Boolean)); fx.add('/' + pr[2]); c.x = [...fx].join(' ') }
      t = t.replace(/\s+RC$/, (m) => { const fx = new Set((c.x || '').split(/\s+/).filter(Boolean)); fx.add('RC'); c.x = [...fx].join(' '); return '' })
      c.t = t; ch = true; shopFixed++
    }
  }
  if (ch && !DRY) writeFileSync(fp, JSON.stringify(s2))
  const k = sets.findIndex(([ff]) => ff === f); if (ch && k >= 0) sets[k][1] = s2
}

// Pass 1: spelling counts of clean names.
const counts = new Map() // key -> Map(spelling -> n)
for (const [, s] of sets) for (const sec of s.sections || []) for (const c of sec.cards || []) {
  const p = tidy(c.p)
  if (!p || /[?�]/.test(p)) continue
  const k = key(p); let m = counts.get(k); if (!m) counts.set(k, m = new Map())
  m.set(p, (m.get(p) || 0) + 1)
}
// Pick the best spelling, not just the most common one: keep accents and
// apostrophes (O'Neal, Mbappé), avoid ALL-CAPS and lower-case words, then by use.
const PARTICLE = /^(de|da|del|della|der|di|du|la|le|van|von|y|e|dos|das|ten|ter|al|el|bin|ibn)$/
function quality(v) {
  let q = 0
  if (/[^\x00-\x7f]/.test(v)) q += 2
  if (/[A-Za-z]'[A-Za-z]/.test(v)) q += 2
  for (const w of v.split(/[\s-]+/)) {
    if (/^[A-Z]{3,}$/.test(w) && !/^(II|III|IV|VI|VII|VIII|JR|SR)$/.test(w)) q -= 3
    if (/^[a-z]+$/.test(w) && !PARTICLE.test(w)) q -= 3   // all-lower word; "deGrom" is fine
    if (/^[A-Z][A-Z][a-z]/.test(w)) q -= 1           // "LA" in "De LA Cruz", stray caps
  }
  if (/^[^A-Za-z\u00C0-\u024F]/.test(v)) q -= 4
  return q
}
const best = new Map()
for (const [k, m] of counts) {
  const tot = [...m.values()].reduce((a, b) => a + b, 0)
  // a spelling needs some real use (>=5% or 3 cards) before quality can outrank volume
  const ok = [...m.entries()].filter(([, n]) => n >= 3 || n / tot >= 0.05)
  const pool = ok.length ? ok : [...m.entries()]
  best.set(k, pool.sort((a, b) => quality(b[0]) - quality(a[0]) || b[1] - a[1])[0][0])
}
// Index clean names by length+shape for mojibake repair.
const byLen = new Map()
for (const k of best.keys()) { const v = best.get(k); const n = v.length; if (!byLen.has(n)) byLen.set(n, []); byLen.get(n).push(v) }
const repairCache = new Map()
function repair(p) {
  if (repairCache.has(p)) return repairCache.get(p)
  // each "?" stood for one accented character; try same length, then ± a little (ñ -> "?" is 1:1, but some feeds use "??")
  const re = new RegExp('^' + p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+^${}()|[\]\\]/g, '\\$&').replace(/\?+/g, '[^ ]{1,2}') + '$', 'i')
  let hit = null, hitN = 0
  for (let n = p.length - 2; n <= p.length + 2; n++) for (const cand of byLen.get(n) || []) {
    if (!re.test(cand) && !re.test(cand.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) continue
    const c = counts.get(key(cand)); const tot = c ? [...c.values()].reduce((a, b) => a + b, 0) : 0
    if (tot > hitN) { hit = cand; hitN = tot }
  }
  repairCache.set(p, hit); return hit
}

const stats = { merged: 0, team: 0, junk: 0, tidied: 0, repaired: 0, unrepaired: new Set(), unified: 0, files: 0 }
for (const [f, s] of sets) {
  let changed = false
  for (const sec of s.sections || []) {
    const keep = []
    for (const c of sec.cards || []) {
      if (fixFlagTail(c)) { stats.flagTails = (stats.flagTails || 0) + 1; changed = true }   // "Dustin Pedroia MEM, SN99" -> name + flags
      const raw = String(c.p || '')
      if (JUNK.test(raw.trim())) { stats.junk++; changed = true; continue }
      let p = tidy(raw)
      if (p !== raw.trim()) stats.tidied++
      if (/\?/.test(p) && /[A-Za-z]\?|\?[A-Za-z]/.test(p)) {
        const r = repair(p)
        if (r) { p = r; stats.repaired++ } else stats.unrepaired.add(p)
      }
      const b = best.get(key(p))
      if (b && b !== p && !/[?�]/.test(p)) { p = b; stats.unified++ }
      // team field: card flags and print runs glued on ("Anaheim Ducks FOIL", "Winnipeg Jets*",
      // "Anaheim Ducks #/ 1,299", "Vancouver)"), or TCDB flag notes where the team should be ("AU, MEM, SN25")
      if (c.t) {
        const flag = (f) => { const x = (c.x || '').split(/\s+/).filter(Boolean); for (const t of f.split(/\s+/)) if (t && !x.includes(t)) x.push(t); c.x = x.join(' ') }
        let t = c.t.trim()
        if (/^(VAR|UER)\1:?/.test(t)) { flag(t.slice(0, 3)); t = '' }   // TCDB variation / error note, not a team
        else if (/^(?:(?:URA?|AUR?|MEM|RC|SP|SSP|SN\d+)(?:,\s*|$))+$/.test(t)) {   // flags, not a team
          for (const f of t.split(/,\s*/)) flag(/^SN(\d+)$/.test(f) ? '/' + f.slice(2) : f === 'URA' || f === 'AUR' ? 'AU' : f)
          t = ''
        }
        const run = t.match(/\s+#?\/\s*([\d,]+)$/)
        if (run) { flag('/' + run[1].replace(/,/g, '')); t = t.slice(0, run.index) }
        t = t.replace(/\s+(FOIL|Auto|XRC|C \d+:\d+)$/i, '').replace(/\s*\*+$/, '').trim()
        if (/\)$/.test(t) && !t.includes('(')) t = t.slice(0, -1).trim()
        if (t !== c.t) { if (t) c.t = t; else delete c.t; stats.team++; changed = true }
      }
      // team field: Break Ninja tags merged in ("Anaheim Ducks / All Rookies / One Of Ones"), repeated teams
      if (c.t && c.t.includes('/')) {
        const segs = c.t.split(/\s+\/\s+/).map(x => x.trim()).filter(x => x && !TEAM_TAG.test(x))
        const uniq = []; for (const x of segs) if (!uniq.some(u => key(u) === key(x))) uniq.push(x)
        const t = uniq.length ? uniq.join(' / ') : (segs[0] || c.t)
        if (t !== c.t) { c.t = t; stats.team++; changed = true }
      }
      if (p !== raw) { const k2 = raw + ' -> ' + p; renames.set(k2, (renames.get(k2) || 0) + 1); c.p = p; changed = true }
      keep.push(c)
    }
    // Break Ninja lists a card again from its "One Of Ones"/"All Rookies" pages; the copy
    // differs only by a flag and a tag-as-team. Merge same number + player, union the flags.
    const byKey = new Map(), merged = []
    for (const c of keep) {
      const tagged = !!(c.t && TEAM_TAG.test(c.t.trim()))
      if (tagged) { delete c.t; c._tag = 1; changed = true }
      const k = (c.n || '') + '|' + c.p
      const prev = c.n ? byKey.get(k) : null
      // only when one copy came from a tag page; a photo variation sharing the number stays
      if (prev && (c._tag || prev._tag) && (!prev.t || !c.t || key(prev.t) === key(c.t))) {
        const fx = new Set((prev.x || '').split(/\s+/).filter(Boolean)); for (const f of (c.x || '').split(/\s+/).filter(Boolean)) fx.add(f)
        prev.x = [...fx].join(' '); if (!prev.x) delete prev.x
        if (!prev.t && c.t) prev.t = c.t
        stats.merged++; changed = true; continue
      }
      byKey.set(k, c); merged.push(c)
    }
    for (const c of merged) delete c._tag
    if (merged.length !== (sec.cards || []).length) sec.cards = merged
  }
  const before = (s.sections || []).length
  s.sections = (s.sections || []).filter(x => (x.cards || []).length)
  if (s.sections.length !== before) changed = true
  if (changed) { stats.files++; if (!DRY) writeFileSync(new URL(f, dataDir), JSON.stringify(s)) }
}
console.log(`widget listings dropped ${widgetDropped}, affiliate text removed ${shopFixed}, duplicate rows merged ${stats.merged}, team fields cleaned ${stats.team}, junk rows dropped ${stats.junk}, names tidied ${stats.tidied}, flag tails moved ${stats.flagTails || 0}, encoding repaired ${stats.repaired}, spellings unified ${stats.unified}, files changed ${stats.files}${DRY ? ' (dry run)' : ''}`)
if (REPORT) writeFileSync(REPORT.slice(9), [...renames.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => n + '\t' + k).join('\n'))
if (stats.unrepaired.size) console.log(`unrepaired (${stats.unrepaired.size}):`, [...stats.unrepaired].slice(0, 40).join(' | '))
