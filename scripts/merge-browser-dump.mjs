// Merge a browser-scraped dump (array of sets) into public/data.
//   node scripts/merge-browser-dump.mjs <dump.json> [--replace-thin]
// --replace-thin: when a set with the same season+product exists from a
// thinner source (fewer cards), delete it in favour of this one.
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs'
const dataDir = new URL('../public/data/', import.meta.url)
const file = process.argv[2]
const replaceThin = process.argv.includes('--replace-thin')
if (!file) { console.error('usage: merge-browser-dump.mjs <dump.json> [--replace-thin]'); process.exit(1) }
const STOP = new Set(['and','the','card','cards','trading','checklist','checklists','x','edition','series','set','mlb','nba','nfl','nhl','mma','autographed','photo','box','ud','upper','deck','panini','topps','hobby'])
const key = (s) => { s = s.toLowerCase().replace(/^(\d{2})-(\d{2})-/, '20$1-$2-'); return s.split('-').filter(t => t && !STOP.has(t)).sort().join('-') }
const existing = new Map()
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || /^(index|search-index|rpa-index|patch-swaps)\.json$/.test(f)) continue
  try { const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')); const n = (s.sections || []).reduce((a, x) => a + x.cards.length, 0); existing.set(key(s.slug), { slug: s.slug, n, sport: s.sport }) } catch {}
}
let w = 0, r = 0, skip = 0
for (const s of JSON.parse(readFileSync(file, 'utf8'))) {
  const { replaces, ...set } = s
  const n = set.sections.reduce((a, x) => a + x.cards.length, 0)
  const k = key(set.slug)
  const ex = existing.get(k)
  if (ex && ex.slug !== set.slug) {
    if (replaceThin && ex.n < n && ex.sport === set.sport) { unlinkSync(new URL(ex.slug + '.json', dataDir)); r++ }
    else { skip++; continue }
  }
  if (replaces && replaces !== set.slug && existsSync(new URL(replaces + '.json', dataDir))) { unlinkSync(new URL(replaces + '.json', dataDir)); r++ }
  writeFileSync(new URL(set.slug + '.json', dataDir), JSON.stringify(set))
  existing.set(k, { slug: set.slug, n, sport: set.sport }); w++
}
console.log(`merge: wrote ${w}, replaced ${r}, skipped ${skip} (existing fuller/equal)`)
