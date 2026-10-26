// Break Ninja data fixes. Safe to re-run.
//  1. Truncated checklists: Break Ninja's free preview stops at 250 rows
//     (sorted by player, so only A–M names come through). Any Break Ninja set
//     with exactly 250/251 cards is marked incomplete (hidden) and queued in
//     scripts/data/tcdb-hole-jobs.json for a full TCDB re-import.
//  2. Repeated rows: Break Ninja tables append a second, unnumbered listing of
//     some players (rookies/retired) under the same insert. A row with no card
//     number whose player already has a numbered card in that section is a
//     duplicate and is dropped.
//  3. Team tables: the page ends with per-team tables (insert name in the number
//     column, "No Team / One Of Ones" in the team column), scraped as sections named
//     after teams. Rows already in their insert section are dropped; the rest (often
//     legends on defunct teams) move into it, unnumbered, keeping the team.
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
const stats = { truncated: 0, dupRows: 0, setsDeduped: 0, jobsAdded: 0, teamSections: 0, teamRowsMoved: 0 }
// an insert name in the number column ("Mr. 3000 Black", "2023 World Baseball Classic Stars Gold"), not a card number
const insertish = (n) => {
  const v = String(n || '').trim()
  if ((v.match(/\b[A-Za-z]*[a-z]{2,}\b/g) || []).length >= 2) return true   // two real words: "Treasure Chest 32 Booklet", "20-80 Scale Prizm"
  return v.length > 3 && /[a-z]{2}/.test(v) && !/\d{2,}/.test(v.replace(/^(?:19|20)\d\d\s/, '').replace(/\b\d{4}\b/g, ''))
}

// 3. fold team-table sections back into their inserts; returns true when the set changed
function foldTeamTables(s) {
  const titles = new Set(s.sections.map(x => x.title))
  const teams = new Set()
  for (const x of s.sections) for (const c of x.cards || []) if (c.t && !insertish(c.n)) teams.add(c.t)
  const teamSecs = s.sections.filter(x => {
    const cards = x.cards || [], ins = cards.filter(c => insertish(c.n))
    if (!cards.length || ins.length / cards.length < 0.5) return false
    // titled like a team (a team this set's own cards name, "No Team", a country table), or most rows point at real inserts
    return teams.has(x.title) || /^(no team|international|usa|canada|japan|mexico|[a-z .]+ republic|[a-z ]+ prospect league)$/i.test(x.title) ||
      cards.some(c => /no team \/ one of ones/i.test(c.t || '')) || ins.filter(c => titles.has(String(c.n).trim())).length / ins.length >= 0.6
  })
  if (!teamSecs.length) return false
  const byTitle = new Map(s.sections.map(x => [x.title, x]))
  for (const sec of teamSecs) {
    for (const c of sec.cards) {
      if (!insertish(c.n)) continue
      const ins = String(c.n).trim()
      let target = byTitle.get(ins)
      if (target && target.cards.some(k => k.p === c.p)) continue
      if (!target) { target = { title: ins, cards: [] }; byTitle.set(ins, target); s.sections.push(target) }
      const o = { n: '', p: c.p }
      if (sec.title && !/^(no team|international)$/i.test(sec.title)) o.t = sec.title
      else if (c.t && !/one of ones|no team/i.test(c.t)) o.t = c.t
      if (c.x) o.x = c.x
      target.cards.push(o); stats.teamRowsMoved++
    }
    sec.cards = sec.cards.filter(c => !insertish(c.n))
  }
  s.sections = s.sections.filter(x => x.cards.length)
  stats.teamSections += teamSecs.length
  return true
}

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

  if (foldTeamTables(s)) changed = true

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
