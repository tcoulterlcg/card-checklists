// Collapse cards listed twice in the same section (Break Ninja team pages list a
// multi-team card once per team). Same number + player + flag = one card; teams merge.
//   node scripts/dedupe-cards.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const dataDir = new URL('../public/data/', import.meta.url)
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
let removed = 0, files = 0
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const p = new URL(f, dataDir); let s; try { s = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
  let changed = false
  for (const sec of s.sections || []) {
    const by = new Map(), out = []
    for (const c of sec.cards || []) {
      const k = c.n + '|' + c.p + '|' + (c.x || '')
      const prev = by.get(k)
      if (!prev) { by.set(k, c); out.push(c); continue }
      if (c.t && prev.t !== c.t && !(prev.t || '').split(' / ').includes(c.t)) prev.t = prev.t ? prev.t + ' / ' + c.t : c.t
      removed++; changed = true
    }
    sec.cards = out
  }
  if (changed) { files++; writeFileSync(p, JSON.stringify(s)) }
}
console.log('duplicate card rows removed:', removed.toLocaleString(), 'in', files, 'sets')
