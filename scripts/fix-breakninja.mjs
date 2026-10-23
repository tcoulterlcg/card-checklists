// Break Ninja data fixes. Safe to re-run.
//  1. Truncated checklists: Break Ninja's free preview stops at 250 rows
//     (sorted by player, so only A–M names come through). Any Break Ninja set
//     with exactly 250/251 cards is marked incomplete (hidden) and queued in
//     scripts/data/tcdb-hole-jobs.json for a full TCDB re-import.
//  2. Repeated rows: Break Ninja tables append a second, unnumbered listing of
//     some players (rookies/retired) under the same insert. A row with no card
//     number whose player already has a numbered card in that section is a
//     duplicate and is dropped.
//   node scripts/fix-breakninja.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const jobsPath = new URL('./data/tcdb-hole-jobs.json', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const WHY = 'Break Ninja preview cut off at 250 cards (A–M players only)'

const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'))
const jobSlugs = new Set(jobs.map(j => j.slug))
const newJobs = []
const stats = { truncated: 0, dupRows: 0, setsDeduped: 0, jobsAdded: 0 }

for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const p = new URL(f, dataDir)
  const s = JSON.parse(readFileSync(p, 'utf8'))
  if (s.source !== 'breakninja.com' || !Array.isArray(s.sections)) continue
  let changed = false
  const total = s.sections.reduce((n, x) => n + (x.cards || []).length, 0)

  if ((total === 250 || total === 251) && !s.incompleteWhy) {
    s.incomplete = true
    s.incompleteWhy = WHY
    stats.truncated++
    changed = true
    if (!jobSlugs.has(s.slug)) {
      newJobs.push({ slug: s.slug, name: s.name, year: s.year, sport: s.sport, cards: total, source: s.source, why: [WHY], status: 'todo' })
      jobSlugs.add(s.slug)
    }
  }

  let removed = 0
  for (const sec of s.sections) {
    const cards = sec.cards || []
    const numbered = new Map()
    for (const c of cards) if (c.n) numbered.set(c.p, c.t || '')
    if (!numbered.size || numbered.size === cards.length) continue
    const keep = cards.filter(c => {
      if (c.n || !numbered.has(c.p)) return true
      const t = numbered.get(c.p)
      if (t && c.t && t !== c.t) return true
      removed++
      return false
    })
    if (keep.length !== cards.length) sec.cards = keep
  }
  if (removed) { stats.dupRows += removed; stats.setsDeduped++; changed = true }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(s))
}

if (newJobs.length) {
  stats.jobsAdded = newJobs.length
  if (!DRY) writeFileSync(jobsPath, JSON.stringify(newJobs.concat(jobs), null, 1))
}
console.log(DRY ? '(dry run)' : '', stats)
