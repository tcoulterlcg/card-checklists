// The site only shows catalog sets from visible sources (lib/catalog.js HIDDEN_SOURCES), but the
// per-sport indexes are ~4 MB, mostly hidden SportsCardsPro rows. This writes index/visible.json —
// just the shown sets — and points manifest.visible at it, so each visit loads one small file.
// Called by catalog-build.mjs and catalog-prune.mjs; run alone with: node scripts/catalog-visible.mjs ../catalog
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HIDDEN_SOURCES } from '../lib/catalog.js'

export function writeVisibleIndex(root, manifest) {
  const sets = []
  for (const s of Object.values(manifest.sports || {})) {
    const p = s.file && join(root, s.file)
    if (!p || !existsSync(p)) continue
    for (const e of JSON.parse(readFileSync(p, 'utf8')).sets || []) if (!HIDDEN_SOURCES.has(e.source)) sets.push(e)
  }
  sets.sort((a, b) => (b.year || 0) - (a.year || 0) || String(a.name).localeCompare(String(b.name)))
  writeFileSync(join(root, 'index', 'visible.json'), JSON.stringify({ sets }))
  manifest.visible = { file: 'index/visible.json', sets: sets.length }
  return sets.length
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2] || '../catalog'
  const mp = join(root, 'manifest.json')
  const manifest = JSON.parse(readFileSync(mp, 'utf8'))
  console.log('visible catalog sets:', writeVisibleIndex(root, manifest))
  writeFileSync(mp, JSON.stringify(manifest, null, 1))
}
