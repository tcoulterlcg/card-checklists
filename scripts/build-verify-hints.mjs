// "Help verify" banners: sets the data audit thinks have gaps (open jobs in
// scripts/data/tcdb-hole-jobs.json) get a short note on their set page asking
// collectors to confirm or report what's missing. Writes public/verify-hints.json
// ({ slug: [line, ...] }); runs in prebuild. Finished jobs drop off automatically.
//   node scripts/build-verify-hints.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const jobs = JSON.parse(readFileSync(new URL('./data/tcdb-hole-jobs.json', import.meta.url), 'utf8'))
const cap = (s) => s.replace(/(^|\s)\S/g, c => c.toUpperCase())   // word starts only: \"player's\" stays, not \"Player'S\"
const out = {}
for (const j of jobs) {
  if (!j.slug || j.status === 'done') continue
  const lines = []
  for (const w of j.why || []) {
    let m
    if ((m = w.match(/^missing inserts:\s*(.+)$/i))) {
      const names = m[1].split(',').map(s => s.trim()).filter(Boolean)
      lines.push('Inserts we may be missing: ' + names.slice(0, 5).map(cap).join(', ') + (names.length > 5 ? ' and ' + (names.length - 5) + ' more' : ''))
    } else if ((m = w.match(/^(\d+) players? sold .* not on checklist/i))) {
      lines.push(m[1] + ' player' + (m[1] === '1' ? '' : 's') + ' with cards from this product aren’t on the checklist yet')
    } else if ((m = w.match(/^(.+?) skips (\d+) numbers? in (#[\w-]+)/i))) {
      lines.push(m[2] + ' card number' + (m[2] === '1' ? '' : 's') + ' look skipped in ' + cap(m[1].trim()) + ' (' + m[3] + ')')
    }
  }
  if (lines.length) out[j.slug] = lines
}
writeFileSync(new URL('../public/verify-hints.json', import.meta.url), JSON.stringify(out))
console.log('verify hints:', Object.keys(out).length, 'sets')
