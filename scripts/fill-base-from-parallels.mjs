// Restore base cards that a source dropped but whose parallels are listed.
// If "Base Gold" / "Base Rainbow Foil" has #452 Player X and "Base" has no #452,
// the base card #452 Player X exists. Only numbers inside the base section's
// own number range, only when every parallel agrees on the player. Safe to re-run.
//   node scripts/fill-base-from-parallels.mjs [--dry-run] [--validate]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run'), VALIDATE = process.argv.includes('--validate')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const TCG = /Pokémon|Magic|Lorcana|Yu-Gi-Oh|One Piece/
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const stem = (t) => { let x = String(t || ''); const i = x.indexOf(' – '); if (i > 0 && /\d{4}/.test(x.slice(0, i))) x = x.slice(i + 3); return norm(x).replace(/\bset\b/g, '').replace(/\s+/g, ' ').trim() }
const src = readFileSync(new URL('./backfill-numbers.mjs', import.meta.url), 'utf8')
const PAR = eval(src.match(/const PAR = (new Set\([\s\S]*?\.split\(' '\)\))/)[1])
const parallelOnly = (extra) => { const w = extra.split(' ').filter(Boolean); return w.length > 0 && w.every(x => PAR.has(x) || /^\d+$/.test(x)) }
let added = 0, files = 0, right = 0, wrong = 0
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const p = new URL(f, dataDir); let s; try { s = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
  if (TCG.test(s.sport || '')) continue
  const secs = s.sections || []
  const base = secs.find(x => stem(x.title) === 'base'); if (!base || base.cards.length < 20) continue
  const nums = base.cards.map(c => parseInt(c.n)).filter(n => n > 0)
  if (nums.length < base.cards.length * 0.9) continue
  const lo = Math.min(...nums), hi = Math.max(...nums)
  // number -> player (null if parallels disagree)
  const fromPar = new Map()
  for (const x of secs) {
    if (x === base) continue
    const st = stem(x.title); if (!st.startsWith('base ') || !parallelOnly(st.slice(5))) continue
    for (const c of x.cards) { const n = parseInt(c.n); if (!(n >= lo && n <= hi) || String(n) !== String(c.n).trim() || /\//.test(c.p)) continue
      const prev = fromPar.get(n); if (prev === undefined) fromPar.set(n, { p: c.p, t: c.t, x: c.x }); else if (prev && norm(prev.p) !== norm(c.p)) fromPar.set(n, null) }
  }
  if (VALIDATE) { for (const c of base.cards) { const n = parseInt(c.n); const g = fromPar.get(n); if (g) { if (norm(g.p) === norm(c.p)) right++; else wrong++ } } continue }
  const have = new Set(base.cards.map(c => parseInt(c.n)))
  const add = []
  for (const [n, g] of fromPar) if (g && !have.has(n)) { const c = { n: String(n), p: g.p }; if (g.t) c.t = g.t; const rc = /\bRC\b/.test(g.x || ''); if (rc) c.x = 'RC'; add.push(c) }
  if (!add.length) continue
  base.cards.push(...add); base.cards.sort((a, b) => (parseInt(a.n) || 0) - (parseInt(b.n) || 0))
  added += add.length; files++
  if (!DRY) writeFileSync(p, JSON.stringify(s))
}
if (VALIDATE) console.log('validation: parallels name the same player as the base card for', right, 'numbers; disagree for', wrong, '(' + (100 * right / (right + wrong)).toFixed(2) + '%)')
else console.log(`base cards restored ${added.toLocaleString()} in ${files} sets${DRY ? ' (dry run)' : ''}`)
