// Bake admin-approved data fixes (cardhq_corrections, see lib/corrections.js)
// into set files, so search, player pages and indexes include them.
//   node scripts/apply-corrections.mjs              -> public/data (runs in prebuild)
//   node scripts/apply-corrections.mjs ../catalog   -> catalog branch worktree (run after catalog-build / prune)
// Idempotent. If the fixes can't be fetched it changes nothing and exits 0, so a
// network hiccup never fails a deploy (the site still applies fixes when a set loads).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { allCorrections, applyCorrections } from '../lib/corrections.js'
import { setPath } from '../lib/catalog.js'

const catalogDir = process.argv[2]
const fileFor = (slug) => catalogDir ? join(catalogDir, setPath(slug)) : new URL('../public/data/' + slug + '.json', import.meta.url)

const fixes = await allCorrections()
if (!fixes) { console.log('corrections: could not load fixes — skipped'); process.exit(0) }
let sets = 0, missing = 0
for (const [slug, list] of fixes) {
  const f = fileFor(slug)
  if (!existsSync(f)) { missing++; continue }
  const before = readFileSync(f, 'utf8')
  const out = JSON.stringify(applyCorrections(JSON.parse(before), list))
  if (out !== before) { writeFileSync(f, out); sets++ }
}
console.log('corrections:', [...fixes.values()].reduce((n, l) => n + l.length, 0), 'fixes,', sets, 'set files updated,', missing, 'sets not in', catalogDir || 'public/data')
