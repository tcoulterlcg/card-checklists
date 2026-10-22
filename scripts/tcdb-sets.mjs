// Convert a TCDB browser dump (parent set + every insert/parallel subset) into set files.
//   node scripts/tcdb-sets.mjs <dump.json>
// dump: [{ sid, name, year, sport, replaces?, sections: [{ title, cards: [{ n, p, t }] }] }]
// TCDB lists each insert/parallel as its own "set"; the browser pass already folded
// them under the parent, so here each parent becomes one site set with a section per
// subset. `replaces` names a thinner existing slug for the same product to delete.
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/tcdb-sets.mjs <dump.json>'); process.exit(1) }
const dataDir = new URL('../public/data/', import.meta.url)
const slugify = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

let ok = 0, total = 0, skipped = []
for (const s of JSON.parse(readFileSync(file, 'utf8'))) {
  const sections = (s.sections || [])
    .map(sec => ({ title: sec.title || 'Base', cards: sec.cards.filter(c => c.p).map(c => { const o = { n: c.n || '', p: c.p }; if (c.t) o.t = c.t; return o }) }))
    .filter(sec => sec.cards.length)
  if (!sections.length) { skipped.push(s.name); continue }
  const slug = s.slug || slugify(s.name)
  if (s.replaces && s.replaces !== slug && existsSync(new URL(s.replaces + '.json', dataDir))) unlinkSync(new URL(s.replaces + '.json', dataDir))
  writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name: s.name, year: s.year, sport: s.sport, source: 'tcdb.com', sections }))
  ok++; total += sections.reduce((a, x) => a + x.cards.length, 0)
}
console.log('tcdb-sets ->', ok, 'sets,', total.toLocaleString(), 'cards' + (skipped.length ? '; empty: ' + skipped.join(', ') : ''))
