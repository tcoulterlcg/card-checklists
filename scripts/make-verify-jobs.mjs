// Queue every non-TCDB sports/non-sport set for a "verify against TCDB" check.
//   node scripts/make-verify-jobs.mjs [--write]
//
// Why: the bottom-up TCDB import skips any product the site already has, so a partial
// Cardboard Connection / Break Ninja / Checklist Center copy blocks TCDB's full one
// (1962 Topps Football had only its 48 variations). This adds one job per such set to
// scripts/data/tcdb-hole-jobs.json with status "verify". The browser scraper's
// __tcdb.verify() then checks TCDB's base size and insert count (≈4 requests a set),
// fully scrapes only the sets that come up short, and tcdb-repair-merge.mjs swaps them
// in under its usual ≥ cards / ≥95% coverage rule.
//
// TCG sets from official sources (Scryfall, pokemontcg.io, YGOPRODeck, Lorcast,
// Limitless, Bulbapedia) are complete already and are left alone.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const WRITE = process.argv.includes('--write')
const dataDir = new URL('../public/data/', import.meta.url)
const jobsPath = new URL('data/tcdb-hole-jobs.json', import.meta.url)
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'))
const have = new Set(jobs.map(j => j.slug))
const SOURCES = /cardboardconnection|breakninja|checklistcenter/
const BASE = /^(base( set| cards| checklist| veterans| rookies| legends)?|rookies|veterans)$/i
const ORDER = ['Football', 'Hockey', 'Basketball', 'Baseball', 'Soccer']

const add = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || f === 'index.json' || f === 'redirects.json') continue
  let s
  try { s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')) } catch { continue }
  if (!s.sections || !SOURCES.test(s.source || '')) continue
  const slug = f.slice(0, -5)
  if (have.has(slug)) continue
  if (s.year && +String(s.year).slice(0, 4) > new Date().getFullYear()) continue // unreleased: CLAUDE.md
  const cards = s.sections.reduce((n, x) => n + (x.cards || []).length, 0)
  const base = s.sections.filter(x => BASE.test((x.title || '').trim())).reduce((n, x) => n + x.cards.length, 0)
  add.push({ slug, name: s.name, year: s.year, sport: s.sport, cards, base, sections: s.sections.length, source: s.source, why: ['verify against TCDB (partial copies block the TCDB import)'], status: 'verify' })
}
const rank = (j) => { const i = ORDER.indexOf(j.sport); return i < 0 ? ORDER.length : i }
add.sort((a, b) => rank(a) - rank(b) || String(a.year).localeCompare(String(b.year)) || a.slug.localeCompare(b.slug))

const by = {}
for (const j of add) by[j.sport] = (by[j.sport] || 0) + 1
console.log(add.length, 'verify jobs', by)
if (WRITE) { writeFileSync(jobsPath, JSON.stringify(jobs.concat(add), null, 1) + '\n'); console.log('written') }
