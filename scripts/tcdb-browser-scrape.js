// TCDB set scraper — runs INSIDE a tcdb.com tab (Claude in Chrome javascript_tool),
// because TCDB blocks server-side fetches. Load it once per tab:
//   eval(await (await fetch("https://raw.githubusercontent.com/trevorcoulter42-creator/card-checklists/main/scripts/tcdb-browser-scrape.js")).text())
// then:
//
//   __tcdb.find("2018 Topps Chrome", "Baseball")   -> Promise<[{sid, path, name}]>  (search)
//   __tcdb.queue([{ sid, path, slug, name, year, sport }, ...])                 (start / add work)
//
// `path` is TCDB's name slug from the set's link ("2018-Topps-Chrome"): TCDB serves a
// 404 page (with HTTP 200) for /Checklist.cfm/sid/N without it.
//   __tcdb.status()                                 -> progress summary
//   __tcdb.stageJson() -> length; __tcdb.sliceJson(i) -> 40k-char slices of one finished set
//                     (compact JSON; base64 output is blocked by the browser tool)
//
// One parent set -> one site set: the parent's checklist becomes "Base" and every
// insert/parallel TCDB lists under "Inserts & Related Sets" becomes its own section.
// Cards: { n, p, t, x } — p/t join multiple people/teams with " / "; x carries RC,
// AU, MEM and serial numbering ("/25") in the site's usual "/25 AU MEM" form.
//
// TCDB rate-limits hard (HTTP 429) and the limit is shared by every tab on this
// computer, so requests run one at a time with a gap that widens on 429 and
// narrows slowly on success. Long runs keep going in the background; the
// javascript_tool call itself must return within 45 s, so always poll.
(() => {
  if (window.__tcdb && window.__tcdb.version >= 4) return
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const parse = (h) => new DOMParser().parseFromString(h, 'text/html')
  // Reloading over an older copy keeps its state (queues, results, throttle). Empty the old
  // copy's vtodo and wait for st.vrunning to clear before calling verify() on this one.
  const st = (window.__tcdb && window.__tcdb.st) || { verified: [], vtodo: [], vrunning: false, gap: 6000, minGap: 4000, maxGap: 120000, todo: [], done: [], failed: [], current: null, requests: 0, throttled: 0, running: false, log: [] }
  st.version = 4

  async function get(url) {
    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(st.gap)
      st.requests++
      let r
      try { r = await fetch(url, { credentials: 'include' }) } catch (e) { st.gap = Math.min(st.maxGap, st.gap * 2); continue }
      if (r.status === 429 || r.status === 503) { st.throttled++; st.gap = Math.min(st.maxGap, st.gap * 2); continue }
      if (!r.ok || /Error404/.test(r.url)) throw new Error((r.ok ? 404 : r.status) + ' ' + url)
      st.gap = Math.max(st.minGap, Math.round(st.gap * 0.9))
      const html = await r.text()
      if (/Just a moment|Performing security verification/.test(html)) { st.gap = Math.min(st.maxGap, st.gap * 2); continue }
      return parse(html)
    }
    throw new Error('gave up (rate limit) ' + url)
  }

  const FLAG_X = { RC: 'RC', AU: 'AU', MEM: 'MEM', RELIC: 'MEM', PATCH: 'MEM' }
  function flagsToX(flagText) {
    const out = []; let serial = ''
    for (const raw of flagText.split(/[\s,]+/)) {
      const f = raw.trim().toUpperCase()
      if (!f) continue
      const sn = f.match(/^SN(\d+)$/)
      if (sn) { serial = '/' + sn[1]; continue }
      if (FLAG_X[f] && !out.includes(FLAG_X[f])) out.push(FLAG_X[f])
    }
    return [serial, ...['AU', 'MEM', 'RC'].filter(x => out.includes(x))].filter(Boolean).join(' ')
  }

  function rowsOf(doc) {
    const cards = []
    for (const tr of doc.querySelectorAll('table tr')) {
      const numA = tr.querySelector('a[href*="ViewCard.cfm"]')
      if (!numA) continue
      const cells = [...tr.cells]
      const nameCell = cells.find(c => c.querySelector('a[href*="Person.cfm"]')) || cells.find(c => c.textContent.trim() && !c.querySelector('a[href*="ViewCard.cfm"]') && !c.querySelector('a[href*="Team.cfm"]'))
      const n = (cells.find(c => c.querySelector('a[href*="ViewCard.cfm"]') && c.textContent.trim()) || numA).textContent.trim()
      let p = '', flags = ''
      if (nameCell) {
        const people = [...nameCell.querySelectorAll('a[href*="Person.cfm"]')].map(a => a.textContent.trim()).filter(Boolean)
        const clone = nameCell.cloneNode(true)
        clone.querySelectorAll('a, figcaption, br').forEach(e => e.remove())
        flags = clone.textContent.replace(/\s+/g, ' ').trim()
        // No person links: the cell text is name + flags ("Dustin Pedroia MEM, SN99"); keep the name only.
        p = people.length ? people.join(' / ') : nameCell.textContent.replace(/\s+/g, ' ').trim()
          .replace(/\s+(?:AUR?|URA?|MEM|MANU|RC|SN\d*|PR\d+|HN|EXCH|CUT|AS|ARP|SP|SSP|RS|VAR|UER|DP|TR|FS|LL|HL|CL)(?:,\s*(?:AUR?|URA?|MEM|MANU|RC|SN\d*|PR\d+|HN|EXCH|CUT|AS|ARP|SP|SSP|RS|VAR|UER|DP|TR|FS|LL|HL|CL))*$/, (m) => /\b(?:AUR?|URA?|MEM|MANU|RC|SN\d*|PR\d+|EXCH)\b/.test(m) ? '' : m)
      }
      const t = [...tr.querySelectorAll('a[href*="Team.cfm"]')].map(a => a.textContent.trim()).filter(Boolean).join(' / ')
      if (!p) continue
      const c = { n, p }
      if (t) c.t = t
      const x = flagsToX(flags)
      if (x) c.x = x
      cards.push(c)
    }
    return cards
  }

  async function checklist(sid, path) {
    const base = '/Checklist.cfm/sid/' + sid + '/' + path
    const first = await get(base)
    const pages = Math.max(1, ...[...first.querySelectorAll('a[href*="PageIndex="]')].map(a => +((a.getAttribute('href') || '').match(/PageIndex=(\d+)/) || [0, 1])[1]))
    let cards = rowsOf(first)
    for (let p = 2; p <= pages; p++) cards = cards.concat(rowsOf(await get(base + '?PageIndex=' + p)))
    return cards
  }

  async function scrape(job) {
    if (!job.path) throw new Error('job needs path (TCDB name slug)')
    const ins = await get('/Inserts.cfm/sid/' + job.sid + '/' + job.path)
    const subs = new Map()
    for (const a of ins.querySelectorAll('a[href*="/sid/"]')) {
      const m = (a.getAttribute('href') || '').match(/^\/(?:Checklist|ViewSet)\.cfm\/sid\/(\d+)\/([^/?#]+)/)
      const title = a.textContent.replace(/\s+/g, ' ').trim()
      if (m && title && m[1] !== String(job.sid) && !subs.has(m[1])) subs.set(m[1], { title, path: m[2] })
    }
    const sections = [{ title: 'Base', cards: await checklist(job.sid, job.path) }]
    if (!sections[0].cards.length) throw new Error('no cards parsed from the base checklist')
    job.progress = { subs: subs.size, done: 0 }
    for (const [sid, { title, path }] of subs) {
      // A dead insert link (TCDB 404, e.g. a promo/rewards listing) skips that insert, not the whole set;
      // rate-limit give-ups still fail the set so it is retried rather than merged short.
      let cards = []
      try { cards = await checklist(sid, path) }
      catch (e) { if (!/^Error: 404 /.test(String(e))) throw e; (job.skippedSubs = job.skippedSubs || []).push(title) }
      if (cards.length) sections.push({ title, cards, sid: +sid })
      job.progress.done++
    }
    return { slug: job.slug, name: job.name, year: job.year, sport: job.sport, source: 'tcdb.com', sid: +job.sid, sections: sections.filter(s => s.cards.length) }
  }

  async function run() {
    if (st.running) return
    st.running = true
    while (st.todo.length) {
      const job = st.current = st.todo.shift()
      job.started = Date.now()
      try { const set = await scrape(job); set.ms = Date.now() - job.started; st.done.push(set) }
      catch (e) { st.failed.push({ ...job, error: String(e) }) }
    }
    st.current = null
    st.running = false
  }

  async function find(q, sport) {
    const doc = await get('/Search.cfm?SearchCategory=' + encodeURIComponent(sport || '') + '&q=' + encodeURIComponent(q))
    const seen = new Map()
    for (const a of doc.querySelectorAll('a[href*="ViewSet.cfm/sid/"]')) {
      const m = a.getAttribute('href').match(/sid\/(\d+)\/([^/?#]+)/)
      if (!m) continue
      const name = a.textContent.replace(/\s+/g, ' ').trim() || m[2].replace(/-/g, ' ')
      if (!seen.has(m[1]) || seen.get(m[1]).name === 'Overview') seen.set(m[1], { path: m[2], name })
    }
    return [...seen].map(([sid, v]) => ({ sid: +sid, ...v }))
  }

  async function take(maxChars = 30000) {
    if (!st.done.length) return ''
    const batch = []
    while (st.done.length) { batch.push(st.done.shift()); if (JSON.stringify(batch).length > maxChars * 4) break }
    const gz = await new Response(new Blob([JSON.stringify(batch)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
    let s = ''; const b = new Uint8Array(gz); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
    const b64 = btoa(s)
    if (b64.length > maxChars) { st.done.unshift(...batch); return { tooBig: b64.length, sets: batch.length, hint: 'call again with a larger maxChars or take() returns chunk-by-chunk via takeChunk' } }
    return b64
  }

  // Large sets: stage one finished set as base64 and read it in slices.
  async function stage() {
    const set = st.done.shift(); if (!set) return 0
    const gz = await new Response(new Blob([JSON.stringify([set])]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
    let s = ''; const b = new Uint8Array(gz); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000))
    st.staged = { slug: set.slug, b64: btoa(s) }
    return st.staged.b64.length
  }
  const slice = (i, size = 40000) => st.staged ? st.staged.b64.slice(i * size, (i + 1) * size) : ''

  // Plain-JSON export (the browser tool blocks base64 output). Parallels that repeat an
  // earlier section card-for-card become { title, same: <section index>, x } — most of
  // a modern checklist's volume. scripts/tcdb-repair-merge.mjs expands them.
  function compact(set) {
    const sig = (c) => c.n + '\u0001' + c.p + '\u0001' + (c.t || '')
    const keys = [], sections = []
    for (const sec of set.sections) {
      const k = sec.cards.map(sig).join('\u0002')
      const xs = [...new Set(sec.cards.map(c => c.x || ''))]
      const j = keys.indexOf(k)
      if (j >= 0 && xs.length === 1) sections.push({ title: sec.title, same: j, x: xs[0] })
      else sections.push({ title: sec.title, cards: sec.cards.map(c => [c.n, c.p, c.t || '', c.x || '']) })
      keys.push(k)
    }
    return { ...set, sections, compact: 1 }
  }
  function stageJson() {
    const set = st.done.shift(); if (!set) return 0
    st.staged = { slug: set.slug, json: JSON.stringify(compact(set)) }
    return st.staged.json.length
  }
  const sliceJson = (i, size = 40000) => st.staged ? st.staged.json.slice(i * size, (i + 1) * size) : ''


  // ---- verify mode (scripts/make-verify-jobs.mjs) ----
  // For each job { slug, name, year, sport, base, sections }: find the TCDB set, read its
  // base size (first + last checklist page) and insert count, and queue a full scrape only
  // when TCDB has clearly more. ≈4 requests a set. Results: st.verified (all verdicts) and
  // st.done (full scrapes, export as usual and merge with tcdb-repair-merge.mjs).
  const CAT = { Entertainment: 'Non-Sport' }
  const norm = (t, sport) => String(t || '').toLowerCase()
    .replace(/&/g, ' and ').replace(/['’.]/g, '')
    .replace(new RegExp('\\b(' + [sport, 'cards?', 'checklist', 'trading', 'football', 'baseball', 'basketball', 'hockey', 'soccer', 'racing', 'ufc', 'mma', 'wrestling', 'golf', 'tennis', 'nfl', 'nba', 'nhl', 'mlb'].filter(Boolean).join('|').toLowerCase() + ')\\b', 'g'), ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim()
  // TCDB's search often leaves the parent set out (it returns its inserts instead), so
  // when search misses, read the sport's full set list for the year and match by name.
  const yearCache = new Map()
  async function yearList(sport, y) {
    const k = sport + '|' + y
    if (!yearCache.has(k)) {
      let doc = null
      try { doc = await get('/ViewAll.cfm/sp/' + encodeURIComponent(sport) + '/year/' + y) } catch (e) { doc = null }
      const out = []
      if (doc) for (const a of doc.querySelectorAll('a[href*="/ViewSet.cfm/sid/"]')) {
        const m = (a.getAttribute('href') || '').match(/\/ViewSet\.cfm\/sid\/(\d+)\/([^/?#]+)/)
        const name = a.textContent.replace(/\s+/g, ' ').trim()
        if (m && name) out.push({ sid: +m[1], path: m[2], name })
      }
      yearCache.set(k, out)
    }
    return yearCache.get(k)
  }
  async function locate(job) {
    if (job.sid && job.path) return { sid: +job.sid, path: job.path, name: job.name }
    const want = norm(job.name, job.sport)
    const hit = await locateBySearch(job, want)
    if (hit) return hit
    const sport = CAT[job.sport] || job.sport
    if (!sport) return null
    const y0 = +((String(job.name).match(/^((?:19|20)\d{2})/) || [])[1] || 0)
    const years = [...new Set([y0, +job.year, +job.year - 1].filter(y => y > 1800))]
    const noSeries = want.replace(/\bseries (1|2|3|one|two|three|i|ii|iii)\b/g, ' ').replace(/\s+/g, ' ').trim()
    for (const y of years) {
      const list = await yearList(sport, y)
      const exact = list.find(h => norm(h.name, job.sport) === want) || (noSeries !== want && list.find(h => norm(h.name, job.sport) === noSeries))
      if (exact) return exact
    }
    return null
  }
  async function locateBySearch(job, want) {
    for (const cat of [CAT[job.sport] || job.sport, '']) {
      const hits = await find(job.name.replace(/\b(cards?|checklist)\b/gi, '').trim(), cat)
      const exact = hits.filter(h => norm(h.name, job.sport) === want || norm(h.path.replace(/-/g, ' '), job.sport) === want)
      if (exact.length) return exact[0]
      // "Upper Deck Series 1" -> TCDB lists both series as one "Upper Deck" set
      const noSeries = want.replace(/\bseries (1|2|3|one|two|three|i|ii|iii)\b/g, ' ').replace(/\s+/g, ' ').trim()
      const whole = noSeries !== want && hits.find(h => norm(h.name, job.sport) === noSeries)
      if (whole) return whole
    }
    return null
  }
  async function baseSize(sid, path) {
    const url = '/Checklist.cfm/sid/' + sid + '/' + path
    const first = await get(url)
    const pages = Math.max(1, ...[...first.querySelectorAll('a[href*="PageIndex="]')].map(a => +((a.getAttribute('href') || '').match(/PageIndex=(\d+)/) || [0, 1])[1]))
    const n1 = rowsOf(first).length
    if (pages === 1) return n1
    return (pages - 1) * n1 + rowsOf(await get(url + '?PageIndex=' + pages)).length
  }
  async function verifyOne(job) {
    const hit = await locate(job)
    if (!hit) return { slug: job.slug, verdict: 'nomatch' }
    const ins = await get('/Inserts.cfm/sid/' + hit.sid + '/' + hit.path)
    const subs = new Set()
    for (const a of ins.querySelectorAll('a[href*="/sid/"]')) {
      const m = (a.getAttribute('href') || '').match(/^\/(?:Checklist|ViewSet)\.cfm\/sid\/(\d+)\//)
      if (m && m[1] !== String(hit.sid)) subs.add(m[1])
    }
    const tBase = await baseSize(hit.sid, hit.path)
    const ourBase = job.base || 0, ourSecs = job.sections || 0
    const baseShort = tBase > ourBase + Math.max(2, Math.round(ourBase * 0.03))
    const secsShort = subs.size + 1 > ourSecs * 1.5 + 3
    const r = { slug: job.slug, sid: hit.sid, path: hit.path, tcdbName: hit.name, tBase, ourBase, tSecs: subs.size + 1, ourSecs, verdict: baseShort || secsShort ? 'short' : 'ok' }
    if (r.verdict === 'short') {
      try { const set = await scrape({ ...job, sid: hit.sid, path: hit.path }); st.done.push(set); r.scraped = set.sections.reduce((n, x) => n + x.cards.length, 0) }
      catch (e) { r.verdict = 'error'; r.error = String(e) }
    }
    return r
  }
  async function vrun() {
    if (st.vrunning) return
    st.vrunning = true
    while (st.vtodo.length) {
      const job = st.current = st.vtodo.shift()
      job.started = Date.now()
      try { st.verified.push(await verifyOne(job)) }
      catch (e) { st.verified.push({ slug: job.slug, verdict: 'error', error: String(e) }) }
    }
    st.current = null
    st.vrunning = false
  }
  // Verdicts not yet exported (call with mark=true once saved).
  function verdicts(mark) {
    const out = st.verified.filter(v => !v.exported)
    if (mark) out.forEach(v => { v.exported = true })
    return out
  }

  const status = () => ({ gap: st.gap, requests: st.requests, throttled: st.throttled, running: st.running, todo: st.todo.length, vtodo: st.vtodo.length, verified: st.verified.length, short: st.verified.filter(v => v.verdict === 'short').length, done: st.done.length, failed: st.failed.map(f => f.slug + ': ' + f.error), current: st.current && { slug: st.current.slug, ...st.current.progress, mins: Math.round((Date.now() - st.current.started) / 60000) } })

  window.__tcdb = { version: 4, st, find, yearList, queue: (jobs) => { st.todo.push(...jobs); run(); return st.todo.length }, verify: (jobs) => { st.vtodo.push(...jobs); vrun(); return st.vtodo.length }, verdicts, locate, status, take, stage, slice, stageJson, sliceJson, compact, checklist, rowsOf, flagsToX }
})()
