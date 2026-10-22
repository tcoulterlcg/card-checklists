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

const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const REPORT = process.argv.find(a => a.startsWith('--report='))  // --report=<file>: write every rename
const renames = new Map()
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const SPORTS = new Set(['Baseball', 'Football', 'Basketball', 'Hockey', 'Soccer', 'UFC', 'Boxing', 'Wrestling', 'Racing', 'Golf', 'Tennis', 'Lacrosse', 'Bowling', 'Cricket', 'Multi-Sport'])

const JUNK = /adsbygoogle|window\.|\.push\(\{|^(toploaders?.*|sleeves|piece wall display)$/i
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
  // trailing year on a person's name ("Elias Pettersson 2025"), not on "Badge 1900"
  s = s.replace(/\s+(19|20)\d\d$/, (m) => { const rest = s.slice(0, -m.length); return /^[A-Z][\w'.-]+( [A-Z][\w'.-]+)+$/.test(rest) && !/\d/.test(rest) ? '' : m })
  if (/\)$/.test(s) && !s.includes('(')) s = s.slice(0, -1).trim()
  if (/^\(/.test(s) && !s.includes(')')) s = s.slice(1).trim()
  return s
}

const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !SKIP.test(f))
const sets = []
for (const f of files) {
  try { const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')); if (SPORTS.has(s.sport)) sets.push([f, s]) } catch {}
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
console.log(`duplicate rows merged ${stats.merged}, team fields cleaned ${stats.team}, junk rows dropped ${stats.junk}, names tidied ${stats.tidied}, encoding repaired ${stats.repaired}, spellings unified ${stats.unified}, files changed ${stats.files}${DRY ? ' (dry run)' : ''}`)
if (REPORT) writeFileSync(REPORT.slice(9), [...renames.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => n + '\t' + k).join('\n'))
if (stats.unrepaired.size) console.log(`unrepaired (${stats.unrepaired.size}):`, [...stats.unrepaired].slice(0, 40).join(' | '))
