// Stray double capitals in names and teams, judged against the rest of the data:
//   "Kevin ONeill" -> "Kevin O'Neill", "TChalla" -> "T'Challa"   (a source dropped the apostrophe)
//   "MIke Yastrzemski" -> "Mike Yastrzemski", "Detroit Red WIngs" -> "Detroit Red Wings"   (shift key held)
// A word is only changed when the data backs it: the apostrophe spelling appears elsewhere, the
// lower-case spelling is a common word elsewhere, or (names only) it is an O'/D' surname.
// Real double capitals stay (UConn, UMass, JWoww, CXyz). Runs from cleanup-names.mjs; also on its own:
//   node scripts/fix-name-caps.mjs [--dry-run]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const dataDir = new URL('../public/data/', import.meta.url)
const DRY = process.argv.includes('--dry-run')
const SKIP = /^(index|search-index|rpa-index|patch-swaps|redirects)\.json$/
const KEEP = new Set(['UConn', 'UMass', 'JWoww', 'CXyz', 'YJaylon', 'JBoom', 'JVini', 'AAlex', 'DDoom', 'LLama', 'MVPs', 'NHLers'])
const WORD = /(?<![\w'\u2019])([A-Z])([A-Z])([a-z]{2,})\b/g
// checked by hand: the data doesn't settle these
const FORCE = { TRina: "T'Rina", HGhar: "H'ghar", IIya: 'Ilya' }

const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && !SKIP.test(f))
const sets = []
for (const f of files) { try { const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8')); if (Array.isArray(s.sections)) sets.push([f, s]) } catch {} }

// word counts over every name and team
const freq = new Map()
const bump = (w) => freq.set(w, (freq.get(w) || 0) + 1)
for (const [, s] of sets) for (const sec of s.sections) for (const c of sec.cards || []) for (const v of [c.p, c.t]) if (v) for (const w of String(v).split(/[\s/(),"-]+/)) if (w) bump(w)

function fix(v, team) {
  return String(v).replace(WORD, (w, a, b, rest) => {
    if (KEEP.has(w)) return w
    if (FORCE[w]) return FORCE[w]
    const apos = a + "'" + b + rest, low = a + b.toLowerCase() + rest
    if (!team && ((freq.get(apos) || 0) + (freq.get(a + '’' + b + rest) || 0)) > 0) return apos
    if ((freq.get(low) || 0) >= 3 && (freq.get(low) || 0) > (freq.get(w) || 0)) return low
    if (!team && /[OD]/.test(a)) return apos
    return w
  })
}

let rows = 0, filesChanged = 0
const seen = new Map()
for (const [f, s] of sets) {
  let ch = false
  for (const sec of s.sections) for (const c of sec.cards || []) for (const k of ['p', 't']) {
    if (!c[k]) continue
    const n = fix(c[k], k === 't')
    if (n !== c[k]) { const key = k + ': ' + c[k] + ' -> ' + n; seen.set(key, (seen.get(key) || 0) + 1); c[k] = n; ch = true; rows++ }
  }
  if (ch) { filesChanged++; if (!DRY) writeFileSync(new URL(f, dataDir), JSON.stringify(s)) }
}
if (DRY || process.argv.includes('--verbose')) for (const [k, n] of [...seen].sort((x, y) => y[1] - x[1])) console.log(n, k)
console.log('fix-name-caps:', rows, 'fields in', filesChanged, 'files' + (DRY ? ' (dry run)' : ''))
