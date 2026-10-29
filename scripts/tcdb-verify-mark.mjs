// Record __tcdb.verdicts() results in scripts/data/tcdb-hole-jobs.json.
//   node scripts/tcdb-verify-mark.mjs <verdicts.json> [...]
//   ok      -> status "verified" (TCDB has no more than we do)
//   nomatch -> status "review" (no TCDB set with that name; check by hand)
//   short   -> left for tcdb-repair-merge.mjs, which marks done/review from the scrape
//   error   -> back to "verify" so the next run retries it
import { readFileSync, writeFileSync } from 'node:fs'

const jobsPath = new URL('data/tcdb-hole-jobs.json', import.meta.url)
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'))
const bySlug = new Map(jobs.map(j => [j.slug, j]))
const count = {}
for (const f of process.argv.slice(2)) {
  for (const v of JSON.parse(readFileSync(f, 'utf8'))) {
    const j = bySlug.get(v.slug); if (!j) continue
    const at = new Date().toISOString().slice(0, 10)
    const tc = v.sid ? { tcdbSid: v.sid, tBase: v.tBase, tSecs: v.tSecs } : {}
    if (v.verdict === 'ok') Object.assign(j, { status: 'verified', at, ...tc })
    else if (v.verdict === 'nomatch') Object.assign(j, { status: 'review', note: 'verify: no TCDB set with this name', at })
    else if (v.verdict === 'error') Object.assign(j, { status: 'verify', note: 'verify error: ' + v.error })
    else if (v.verdict === 'short') Object.assign(j, tc, { note: `verify: TCDB base ${v.tBase} vs ours ${v.ourBase}, sections ${v.tSecs} vs ${v.ourSecs}` })
    count[v.verdict] = (count[v.verdict] || 0) + 1
  }
}
writeFileSync(jobsPath, JSON.stringify(jobs, null, 1) + '\n')
console.log(count)
