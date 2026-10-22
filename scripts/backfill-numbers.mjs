// Fill in missing card numbers from the same set. Break Ninja parallel pages
// often omit numbers ("Base Prizm No Huddle Blue", "Stained Glass Gold") while
// the parent section ("Base", "Stained Glass") has them. For an unnumbered
// card we take the number from the numbered section whose title is the longest
// leading match of this section's title, when that player appears there exactly
// once (so a player with two cards in the parent is never guessed). Safe to re-run.
//   node scripts/backfill-numbers.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
// strip the set name prefix some sources put on titles: "2023-24 Panini Prizm – Base Set" -> "base set"
const stem = (t, setName) => { let x = String(t || ''); const i = x.indexOf(' – '); if (i > 0 && /\d{4}/.test(x.slice(0, i))) x = x.slice(i + 3); return norm(x).replace(/\bset\b/g, '').replace(/\s+/g, ' ').trim() }
// The extra words must only describe a parallel finish ("blue", "no huddle", "gold vinyl", "/25");
// "autographs", "dual", "jumbo", "booklet", "variation" etc. are different cards with their own numbers.
const PAR = new Set(('gold silver black red blue green orange purple pink teal white yellow bronze platinum copper aqua lavender magenta cyan ' +
  'rose maroon navy sky light dark neon emerald ruby sapphire diamond diamonds amethyst onyx ice cracked shimmer wave mojo holo foil rainbow ' +
  'refractor refractors xfractor fractor superfractor prizm prizms parallel parallels plate plates printing vinyl lava speckle sparkle ' +
  'geometric disco pulsar velocity hyper camo tie dye checkerboard snakeskin pandora pinwheel atomic laser lazer flash fluorescent glossy matte ' +
  'and no huddle fotl red white blue mini blizzard galactic cosmic nebula raywave sepia canvas glitch zebra tiger leopard dragon scale scales ' +
  'gem gems mosaic optic stained glass rated rookie press proof artist proofs proof premium premiere edition exclusive exclusives ' +
  'hobby retail fast break choice fanatics hyper mojo sp ssp numbered one of ones 1 1s').split(' '))
const parallelOnly = (extra) => extra.split(' ').filter(Boolean).every(w => PAR.has(w) || /^\d+$/.test(w))
let filled = 0, files = 0, still = 0
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || SKIP.test(f)) continue
  const p = new URL(f, dataDir); let s; try { s = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
  const secs = s.sections || []
  if (!secs.some(x => x.cards.some(c => !c.n))) continue
  // numbered sections: stem -> Map(player -> number | null when ambiguous)
  const numbered = []
  for (const x of secs) {
    const withN = x.cards.filter(c => c.n)
    if (withN.length < x.cards.length * 0.9 || withN.length < 3) continue
    const m = new Map()
    for (const c of withN) { const k = norm(c.p); m.set(k, m.has(k) ? null : c.n) }
    numbered.push([stem(x.title, s.name), m])
  }
  if (!numbered.length) continue
  let changed = false
  for (const x of secs) {
    if (!x.cards.some(c => !c.n)) continue
    const t = stem(x.title, s.name)
    // longest numbered stem that this title starts with (word boundary), e.g. "base prizm blue" -> "base"
    let best = null
    for (const [st, m] of numbered) if (st && st !== t && t.startsWith(st + ' ') && parallelOnly(t.slice(st.length)) && (!best || st.length > best[0].length)) best = [st, m]
    if (!best) { still += x.cards.filter(c => !c.n).length; continue }
    for (const c of x.cards) {
      if (c.n) continue
      const n = best[1].get(norm(c.p))
      if (n) { c.n = n; filled++; changed = true } else still++
    }
  }
  if (changed) { files++; if (!DRY) writeFileSync(p, JSON.stringify(s)) }
}
console.log(`card numbers filled ${filled.toLocaleString()} in ${files} sets; still unnumbered ${still.toLocaleString()}${DRY ? ' (dry run)' : ''}`)
