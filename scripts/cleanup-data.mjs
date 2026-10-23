// Data hygiene pass over every set file. Safe to re-run.
//  - player text: move trailing flags (RC, SP, SSP, AU, USA/RC) into the flag;
//    strip TCDB note tails ("AU, MEM, SN25MEM: Game-Used Memorabilia" -> flags);
//    drop rows that are prose, not cards ("teams. 1 per pack.", "*Does Not Exist*")
//  - team text: move print runs ("Edmonton Oilers 1/1*") into the flag
//  - section titles that are just a year -> "Base Set"
//  - year field = the season's end year / the name's leading year
//  - sets with < 10 cards (sports) are marked incomplete and hidden from browse
//  - blog posts scraped as sets are removed (redirect recorded when a real set exists)
//   node scripts/cleanup-data.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs'
const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const TCG = /Pokémon|Magic|Lorcana|Yu-Gi-Oh/
// Subset/blog pages scraped as if they were sets; the real set exists (redirected below).
const NOT_SETS = new Set(['davis-schneider-card-guide-and', 'series-1-young-guns', '2017-18-young-guns', '2019-20-upper-deck-series-1-young-guns'])
const NOT_SET_REDIRECT = { '2019-20-upper-deck-series-1-young-guns': '19-20-ud-upper-deck-series-1-hockey', '2017-18-young-guns': '2017-18-upper-deck-series-1-hockey-cards' }
const FIX = {
  // name/sport fixes that need a human call
  '2023-24-bowman-chrome-sapphire-university-basketball': { sport: 'Basketball', name: '2023-24 Bowman Chrome Sapphire University Basketball' },
}
const stats = { prose: 0, flagMoved: 0, tcdbTail: 0, teamRun: 0, yearSec: 0, year: 0, incomplete: 0, removed: 0, fixed: 0 }
const addFlag = (c, f) => { const x = (c.x || '').split(/\s+/).filter(Boolean); for (const t of f.split(/\s+/)) if (t && !x.includes(t)) x.push(t); c.x = x.join(' ') }
const PROSE = /^(teams|coins|stickers|panels|inserted|variations?|odds|note|total cards|set per|hot box|- |players|cads|intentionally removed|manufactured relic cards|group per)\b|^#\d+-\d+$|^\d{4}$|\b(per pack|listed below|inserted in|included in|are listed|were inserted|one per)\b|^\*?\s*does not exist\s*\*?$/i

const redirectsPath = new URL('redirects.json', dataDir)
const redirects = existsSync(redirectsPath) ? JSON.parse(readFileSync(redirectsPath, 'utf8')) : {}

for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const p = new URL(f, dataDir)
  let s; try { s = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
  if (NOT_SETS.has(s.slug)) { stats.removed++; if (NOT_SET_REDIRECT[s.slug]) redirects[s.slug] = NOT_SET_REDIRECT[s.slug]; if (!DRY) unlinkSync(p); continue }
  let changed = false
  if (FIX[s.slug]) { Object.assign(s, FIX[s.slug]); stats.fixed++; changed = true }
  // year field from the name
  const m = (s.name || '').match(/^((?:19|20)\d\d)(?:-(\d\d))?\b/)
  if (m && !TCG.test(s.sport || '')) {
    const y = m[2] ? +m[1] + 1 : +m[1]
    if (s.year !== y) { s.year = y; stats.year++; changed = true }
  }
  let total = 0
  for (const sec of s.sections || []) {
    if (/^(19|20)\d\d$/.test((sec.title || '').trim())) { sec.title = 'Base Set'; stats.yearSec++; changed = true }
    const keep = []
    for (const c of sec.cards || []) {
      let pl = String(c.p || '').trim()
      if (!pl || (PROSE.test(pl) && !/[A-Z][a-z]+ [A-Z][a-z]+/.test(pl.replace(PROSE, ''))) || (/\.\s*$/.test(pl) && /^[a-z]/.test(pl))) { stats.prose++; changed = true; continue }
      // TCDB note tail: "Name AU, MEM, SN25MEM: Game-Used Memorabilia"
      const FL = '(?:AU|MEM|SN\\d+|RC|SP|SSP|VAR|FOIL|ROO|EXCH|ERR|COR|UER|HOF|TC|CL|PROMO)'
      const tail = pl.match(new RegExp('^(.*?)\\s+(' + FL + '(?:,\\s*' + FL + ')*)(?:\\s*[A-Z]{2,5}:.*)?$'))
      if (tail && tail[1].length > 2) {
        pl = tail[1]
        for (const t of tail[2].split(/,\s*/)) if (!/^(ROO|EXCH|TC|CL|PROMO)$/.test(t)) addFlag(c, /^SN\d+$/.test(t) ? '/' + t.slice(2) : t)
        stats.tcdbTail++; changed = true
      }
      // trailing flag words
      const fm = pl.match(/^(.*?\S)\s+((?:USA\/)?(?:RC|SP|SSP|AU|SP\/RC))$/)
      if (fm && fm[1].length > 2) { pl = fm[1]; addFlag(c, fm[2].replace(/^USA\//, '').replace('SP/RC', 'SP RC')); stats.flagMoved++; changed = true }
      const ps = pl.match(/^(.*?\S)\s+#?\/\s*(\d{1,5})$/)
      if (ps && ps[1].length > 2) { pl = ps[1]; addFlag(c, '/' + ps[2]); stats.teamRun++; changed = true }
      if (/^[a-z]/.test(pl) && /^[a-z]+ [A-Z]/.test(pl)) pl = pl[0].toUpperCase() + pl.slice(1)
      if (pl !== c.p) c.p = pl
      // print run in team
      if (c.t) {
        const tm = c.t.match(/^(.*?\S)\s+(1\s*\/\s*1|#?\/\s*\d{1,5})\s*\**\.?$/)
        if (tm) { c.t = tm[1]; addFlag(c, /^1\s*\/\s*1$/.test(tm[2]) ? '/1' : '/' + tm[2].replace(/[#\/\s]/g, '')); stats.teamRun++; changed = true }
      }
      keep.push(c)
    }
    sec.cards = keep
    total += keep.length
  }
  s.sections = (s.sections || []).filter(x => x.cards.length)
  // incompleteWhy = flagged on purpose (e.g. fix-breakninja.mjs truncation); keep it hidden
  const inc = (total < 10 && !TCG.test(s.sport || '')) || !!s.incompleteWhy
  if (!!s.incomplete !== inc) { if (inc) s.incomplete = true; else delete s.incomplete; changed = true }
  if (inc) stats.incomplete++
  if (changed && !DRY) writeFileSync(p, JSON.stringify(s))
}
if (!DRY) writeFileSync(redirectsPath, JSON.stringify(redirects))
console.log(JSON.stringify(stats))
