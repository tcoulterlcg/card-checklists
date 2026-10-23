// Add SuperFractor parallels as real card rows, only where a checklist source states them.
//
// Two kinds of evidence, nothing else:
//   odds      The set's own checklist source lists "SuperFractor 1/1" in that section's
//             parallel note (Cardboard Connection pack-odds text), with no exception note.
//   research  scripts/data/superfractor-research.json — sections a published checklist
//             (Topps, Beckett, Checklist Insider, TCDB…) explicitly gives a SuperFractor,
//             with the source URL. Only "yes" rows with no stated exceptions are used.
//
// Each added section copies its parent's cards (number, player, team, RC/AU/MEM flags),
// numbered /1, and carries `derived: { from, src, url? }` so it can be traced or removed.
// Re-running replaces earlier derived SuperFractor sections; it never touches scraped ones.
//
//   node scripts/add-superfractors.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const researchFile = new URL('./data/superfractor-research.json', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const SF = /super[\s-]?fractor/i
const DERIVED = new Set(['odds-superfractor', 'research-superfractor'])

// Odds notes that qualify the parallel list ("Vladimir Guerrero Jr. does not have Refractor
// parallels", "Only parallels seen for cards noted") — the whole section is skipped.
const EXCEPTION = /does not have|do not have|only parallels seen|let us know|it appears|\bno card|\bno #|except|not all\b|not every|unconfirmed|missing/i

const norm = (s) => String(s || '').toLowerCase().replace(/super[\s-]?fractor/g, 'superfractor').replace(/[^a-z0-9]+/g, ' ').trim()

// "REFRACTOR PARALLELS: SuperFractor 1/1 (1:407 …" -> "SuperFractor"; null unless numbered 1/1.
function sfFromOdds(odds) {
  for (const raw of String(odds || '').split(/[,;·]/)) {
    if (!SF.test(raw)) continue
    const item = raw.replace(/^.*?:\s*(?=\S*\s*super)/i, '').replace(/^.*(parallels?|versions?):\s*/i, '').trim()
    if (!/(^|\s)#?\s*1\s*\/\s*1\b|#\s*\/\s*1\b/.test(item)) return null       // "SuperFractor (2 per set)" is not a 1/1
    const name = item.replace(/#?\s*\d*\s*\/\s*1\b.*$/, '').replace(/\s*\(.*$/, '').replace(/[.\s]+$/, '').trim()
    return name.replace(/super[\s-]?fractor/i, 'SuperFractor') || 'SuperFractor'
  }
  return null
}

function cloneCards(cards) {
  return (cards || []).map(c => {
    const flags = String(c.x || '').split(/\s+/).filter(w => /^(RC|AU|MEM)$/.test(w))
    const o = { n: c.n, p: c.p }
    if (c.t) o.t = c.t
    o.x = [...flags, '/1'].join(' ')
    return o
  })
}

// research rows: slug -> [{ section, name, url }]
const research = new Map()
if (existsSync(researchFile)) {
  for (const r of JSON.parse(readFileSync(researchFile, 'utf8'))) {
    if (r.superfractor !== 'yes' || (r.exceptions && String(r.exceptions).trim()) || !r.url) continue
    if (!(String(r.print_run || '1/1').replace(/\s/g, '') === '1/1')) continue
    const list = research.get(r.slug) || []
    list.push({ section: r.section, name: (r.parallel_name || 'SuperFractor').replace(/super[\s-]?fractor/i, 'SuperFractor'), url: r.url })
    research.set(r.slug, list)
  }
}

const stats = { sets: 0, odds: 0, research: 0, cards: 0, skippedException: 0, skippedExisting: 0, researchUnmatched: [] }
const log = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const path = new URL(f, dataDir)
  let s
  try { s = JSON.parse(readFileSync(path, 'utf8')) } catch { continue }
  if (!s.slug || !Array.isArray(s.sections)) continue
  const before = JSON.stringify(s.sections)
  s.sections = s.sections.filter(x => !(x.derived && DERIVED.has(x.derived.src)))
  const scraped = s.sections.slice()
  // a scraped SuperFractor section already covers this parent?
  const covered = (title) => {
    const t = norm(title)
    return scraped.some(x => SF.test(x.title || '') && (norm(x.title).includes(t) || (/^base( set)?$/.test(t) && /^superfractors?$/.test(norm(x.title)))))
  }
  const add = (sec, name, src, url) => {
    const title = sec.title.replace(/\s+refractors?$/i, '') + ' ' + name   // "Future Stars Refractor" -> "Future Stars SuperFractor"
    if (s.sections.some(x => x.title === title)) return
    const out = { title, cards: cloneCards(sec.cards), derived: { from: sec.title, src } }
    if (url) out.derived.url = url
    if (sec.mem) out.mem = sec.mem
    s.sections.splice(s.sections.indexOf(sec) + 1, 0, out)
    stats.cards += out.cards.length
    log.push([s.slug, title, out.cards.length, src, url || ''].join(' | '))
  }
  for (const sec of scraped) {
    if (SF.test(sec.title || '') || !(sec.cards || []).length) continue
    if (/subset breakdown/i.test(sec.title)) continue   // a second listing of the base cards, not its own cards
    const name = sfFromOdds(sec.odds)
    if (!name) continue
    if (EXCEPTION.test(sec.odds)) { stats.skippedException++; continue }
    if (covered(sec.title)) { stats.skippedExisting++; continue }
    add(sec, name, 'odds-superfractor'); stats.odds++
  }
  for (const r of research.get(s.slug) || []) {
    const sec = scraped.find(x => x.title === r.section)
    if (!sec || !(sec.cards || []).length) { stats.researchUnmatched.push(s.slug + ' :: ' + r.section); continue }
    if (covered(sec.title) || s.sections.some(x => x.derived && x.derived.from === sec.title && SF.test(x.title))) { stats.skippedExisting++; continue }
    add(sec, r.name, 'research-superfractor', r.url); stats.research++
  }
  if (JSON.stringify(s.sections) !== before) { stats.sets++; if (!DRY) writeFileSync(path, JSON.stringify(s)) }
}
console.log(log.join('\n'))
console.log(`\nSuperFractor sections added: ${stats.odds} from odds notes, ${stats.research} from research; ${stats.cards.toLocaleString()} cards in ${stats.sets} sets` +
  `\nskipped: ${stats.skippedException} with exception notes, ${stats.skippedExisting} already listed` +
  (stats.researchUnmatched.length ? `\nresearch rows with no matching section (${stats.researchUnmatched.length}):\n  ` + stats.researchUnmatched.join('\n  ') : '') +
  (DRY ? '\n(dry run — nothing written)' : ''))
