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
import { fixFlagTail } from './flag-tail.mjs'

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

// Keep what TCDB doesn't have: set-level extras (box-break details …) and each section's pack odds,
// matched to the new section with the same title (or the same title once wording is ignored).
const SET_KEEP_OUT = new Set(['slug', 'name', 'year', 'sport', 'source', 'sections', 'incomplete', 'incompleteWhy', 'tcdbSid'])
function carryOver(old, out, norm, core) {
  for (const [k, v] of Object.entries(old)) if (!SET_KEEP_OUT.has(k) && out[k] === undefined) out[k] = v
  const byTitle = new Map(), byCore = new Map()
  for (const sec of old.sections || []) {
    if (!sec.odds) continue
    if (!byTitle.has(norm(sec.title))) byTitle.set(norm(sec.title), sec.odds)
    const c = core(sec.title); if (c && !byCore.has(c)) byCore.set(c, sec.odds)
  }
  let n = 0
  for (const sec of out.sections) {
    if (sec.odds) continue
    const o = byTitle.get(norm(sec.title)) || byCore.get(core(sec.title))
    if (o) { sec.odds = o; n++ }
  }
  return n
}

let replaced = 0, review = 0
for (const f of files) {
  for (const s of [].concat(load(f)).map(expand)) {
    const path = new URL(s.slug + '.json', dataDir)
    const job = jobBySlug.get(s.slug)
    for (const x of s.sections || []) for (const c of x.cards) fixFlagTail(c)   // older scrapes glued flags onto names
    const sections = (s.sections || []).map(x => ({ title: x.title, cards: x.cards.filter(c => c.p) })).filter(x => x.cards.length)
    const fresh = { sections }
    if (!existsSync(path)) { if (job) Object.assign(job, { status: 'review', note: 'no curated file with this slug' }); review++; continue }
    const old = JSON.parse(readFileSync(path, 'utf8'))
    const oldKeys = keys(old), newKeys = keys(fresh)
    // A current card also counts as covered when TCDB has the same number and its name is
    // the start of ours — older imports glued the team onto the name ("Xander Bogaerts Boston Red Sox").
    const norm = (x) => String(x || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    const byNum = new Map()
    for (const sec of sections) for (const c of sec.cards) { const k = norm(c.n); if (!byNum.has(k)) byNum.set(k, []); byNum.get(k).push(norm(c.p), ...String(c.p || '').split(/\s*\/\s*/).map(norm)) }
    // Same-titled section, same player, different numbering: older checklists number inserts 1, 2, 3…
    // where TCDB uses the card code ("A-CB"). Count those too — the section and the player must both match.
    const bySec = new Map()
    for (const sec of sections) { const t = norm(sec.title); if (!bySec.has(t)) bySec.set(t, new Set()); for (const c of sec.cards) for (const part of String(c.p || '').split(/\s*\/\s*/)) bySec.get(t).add(surname(part)) }
    const nameWords = new Set(norm(old.name).split(' '))
    const WORDING = /^(set|auto|autos|autograph|autographs|autographed|signature|signatures|signed|relic|relics|jersey|jerseys|memorabilia|card|cards|insert|inserts)$/
    const core = (t) => {
      const w = norm(t).replace(/ s\b/g, 's').split(' ').filter(Boolean)   // "pacific s" (from Pacific's) -> "pacifics"
      while (w.length > 1 && (nameWords.has(w[0]) || /^\d{2,4}$/.test(w[0]))) w.shift()
      return w.filter(x => !WORDING.test(x)).map(x => x.length > 3 ? x.replace(/s$/, '') : x).join(' ')
    }
    const byCore = new Map()
    for (const [t, set] of bySec) { const k = core(t); if (!k) continue; if (!byCore.has(k)) byCore.set(k, new Set()); for (const x of set) byCore.get(k).add(x) }
    const coreCache = new Map()
    const coreSurnames = (t) => {
      if (coreCache.has(t)) return coreCache.get(t)
      const c = core(t), out = new Set()
      if (c.length >= 4) for (const [k, set] of byCore) if (k === c || k.startsWith(c + ' ')) for (const x of set) out.add(x)
      coreCache.set(t, out); return out
    }
    const oldCards = new Map()
    for (const sec of old.sections || []) for (const c of sec.cards) {
      const k = String(c.n || '').trim().replace(/^#/, '').toLowerCase() + '|' + surname(c.p)
      if (!oldCards.has(k)) oldCards.set(k, { c, titles: [] })
      oldCards.get(k).titles.push(norm(sec.title))
    }
    let inside = 0
    const missed = {}
    for (const k of oldKeys) {
      if (newKeys.has(k)) { inside++; continue }
      const { c, titles } = oldCards.get(k) || {}, p = c && norm(c.p)
      // TCDB lists multi-player cards (league leaders, combos) as "A / B / C"; ours may name one of them.
      const qs = (c && byNum.get(norm(c.n))) || []
      if (p && qs.some(q => q && (p === q || p.startsWith(q + ' ')))) { inside++; continue }
      if (c && titles.some(t => bySec.get(t) && bySec.get(t).has(surname(c.p)))) { inside++; continue }
      // Same player in a section whose title differs only in wording: "2018 Donruss Signature Marks Set" vs
      // "Signature Marks", "Pen Pals Autographs" vs "Pen Pals", "Draft Class Autograph RPS" vs "Draft Class Autographs RPS".
      if (c && titles.some(t => coreSurnames(t).has(surname(c.p)))) { inside++; continue }
      // Older imports glued the team onto the name ("Dansby Swanson Atlanta Braves"): accept any name word
      // (3+ letters) that is a surname in the matching TCDB section.
      if (c && titles.some(t => { const set = coreSurnames(t); return norm(c.p).split(' ').some(w => w.length > 2 && set.has(w)) })) { inside++; continue }
      if (process.env.MISSES && c) (missed[titles[0]] = missed[titles[0]] || []).push(c.n + ' ' + c.p)
    }
    if (process.env.MISSES) for (const [t, l] of Object.entries(missed)) console.log('   miss', t, l.length, '::', l.slice(0, 4).join(' | '))
    const cover = oldKeys.size ? inside / oldKeys.size : 1
    const nOld = count(old), nNew = count(fresh)
    const line = `${s.slug}: ${nOld} -> ${nNew} cards, ${old.sections.length} -> ${sections.length} sections, covers ${(cover * 100).toFixed(1)}% of current`
    // PREFER_TCDB=1: Trevor's call (2026-10-30) — when TCDB has the set, its checklist replaces ours outright.
    if ((nNew >= nOld && cover >= 0.95) || process.env.PREFER_TCDB) {
      const out = { slug: old.slug, name: old.name, year: old.year, sport: old.sport, source: 'tcdb.com', tcdbSid: s.sid, sections }
      carryOver(old, out, norm, core)
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
