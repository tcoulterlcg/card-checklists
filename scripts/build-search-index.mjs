// Build public/data/search-index.json — a compact, dictionary-encoded index so
// global player search is a single fetch. Repeated strings (set slugs, section
// titles, teams) are pooled and referenced by integer id; each card row is
//   [player, slugId, number, sectionId, teamId, flag]
//   node scripts/build-search-index.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const skip = new Set(['index.json', 'search-index.json', 'patch-swaps.json'])

const slugs = [], sections = [], teams = []
const slugId = new Map(), secId = new Map(), teamId = new Map()
const intern = (val, pool, map) => {
  if (val == null || val === '') return -1
  if (map.has(val)) return map.get(val)
  const id = pool.length
  pool.push(val); map.set(val, id)
  return id
}

const rows = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || skip.has(f)) continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch (e) { continue }
  const sid = intern(s.slug, slugs, slugId)
  for (const sec of (s.sections || [])) {
    const secIdx = intern(sec.title, sections, secId)
    for (const c of sec.cards) {
      rows.push([c.p, sid, c.n, secIdx, intern(c.t || '', teams, teamId), c.x || ''])
    }
  }
}
writeFileSync(new URL('search-index.json', dataDir), JSON.stringify({ slugs, sections, teams, rows }))
console.log('search index:', rows.length.toLocaleString(), 'cards |', slugs.length, 'slugs,', sections.length, 'sections,', teams.length, 'teams')
