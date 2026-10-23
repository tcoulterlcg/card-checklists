// Merge TCDB re-scrapes (scripts/tcdb-browser-scrape.js) over curated sets with holes.
//   node scripts/tcdb-repair-merge.mjs <dump.json | dump.json.gz.b64> [...]
//
// For each scraped set (same slug as the curated file it repairs):
//   - replaces public/data/<slug>.json only when the TCDB copy has at least as many
//     cards AND contains ≥95% of the cards already listed (number + surname), so a
//     wrong match or a partial scrape can never make a set worse;
//   - keeps the curated name, year and sport (slugs and titles stay stable);
//   - marks the job in scripts/data/tcdb-hole-jobs.json: done | review (with why).
// Afterwards: node scripts/cleanup-names.mjs && node scripts/classify-memorabilia.mjs && node scripts/build-index.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const files = process.argv.slice(2)
if (!files.length) { console.error('usage: node scripts/tcdb-repair-merge.mjs <dump.json | dump.b64> ...'); process.exit(1) }
const dataDir = new URL('../public/data/', import.meta.url)
const jobsPath = new URL('data/tcdb-hole-jobs.json', import.meta.url)
const jobs = existsSync(jobsPath) ? JSON.parse(readFileSync(jobsPath, 'utf8')) : []
const jobBySlug = new Map(jobs.map(j => [j.slug, j]))

const load = (f) => {
  const raw = readFileSync(f, 'utf8').trim()
  if (raw.startsWith('[') || raw.startsWith('{')) return JSON.parse(raw)
  return JSON.parse(gunzipSync(Buffer.from(raw, 'base64')).toString('utf8'))
}
// Expand the scraper's compact export: rows are [n, p, t, x]; { same: i, x } repeats section i.
const expand = (set) => {
  if (!set.compact) return set
  const out = []
  for (const sec of set.sections) {
    if (sec.same !== undefined) out.push({ title: sec.title, cards: out[sec.same].cards.map(c => { const o = { n: c.n, p: c.p }; if (c.t) o.t = c.t; if (sec.x) o.x = sec.x; return o }) })
    else out.push({ title: sec.title, cards: sec.cards.map(([n, p, t, x]) => { const o = { n, p }; if (t) o.t = t; if (x) o.x = x; return o }) })
  }
  return { ...set, sections: out }
}
const surname = (p) => {
  const w = String(p || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').trim().split(/\s+/)
  while (w.length > 1 && /^(jr|sr|ii|iii|iv)$/.test(w[w.length - 1])) w.pop()
  return w[w.length - 1] || ''
}
const keys = (set) => new Set((set.sections || []).flatMap(s => s.cards.map(c => String(c.n || '').trim().replace(/^#/, '').toLowerCase() + '|' + surname(c.p))))
const count = (set) => (set.sections || []).reduce((a, s) => a + s.cards.length, 0)

let replaced = 0, review = 0
for (const f of files) {
  for (const s of [].concat(load(f)).map(expand)) {
    const path = new URL(s.slug + '.json', dataDir)
    const job = jobBySlug.get(s.slug)
    const sections = (s.sections || []).map(x => ({ title: x.title, cards: x.cards.filter(c => c.p) })).filter(x => x.cards.length)
    const fresh = { sections }
    if (!existsSync(path)) { if (job) Object.assign(job, { status: 'review', note: 'no curated file with this slug' }); review++; continue }
    const old = JSON.parse(readFileSync(path, 'utf8'))
    const oldKeys = keys(old), newKeys = keys(fresh)
    let inside = 0; for (const k of oldKeys) if (newKeys.has(k)) inside++
    const cover = oldKeys.size ? inside / oldKeys.size : 1
    const nOld = count(old), nNew = count(fresh)
    const line = `${s.slug}: ${nOld} -> ${nNew} cards, ${old.sections.length} -> ${sections.length} sections, covers ${(cover * 100).toFixed(1)}% of current`
    if (nNew >= nOld && cover >= 0.95) {
      const out = { slug: old.slug, name: old.name, year: old.year, sport: old.sport, source: 'tcdb.com', tcdbSid: s.sid, sections }
      writeFileSync(path, JSON.stringify(out))
      if (job) Object.assign(job, { status: 'done', note: line, at: new Date().toISOString().slice(0, 10) })
      replaced++; console.log('replaced', line)
    } else {
      if (job) Object.assign(job, { status: 'review', note: line, tcdbSid: s.sid })
      review++; console.log('REVIEW  ', line)
    }
  }
}
if (jobs.length) writeFileSync(jobsPath, JSON.stringify(jobs, null, 1))
console.log(`tcdb-repair: ${replaced} replaced, ${review} need review`)
