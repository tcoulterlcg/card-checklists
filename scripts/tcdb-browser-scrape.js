// TCDB set scraper — runs INSIDE a tcdb.com tab (Claude in Chrome javascript_tool),
// because TCDB blocks server-side fetches. Load it once per tab:
//   eval(await (await fetch("https://raw.githubusercontent.com/tcoulterlcg/card-checklists/main/scripts/tcdb-browser-scrape.js")).text())
// then:
//
//   __tcdb.find("2018 Topps Chrome", "Baseball")   -> Promise<[{sid, path, name}]>  (search)
//   __tcdb.queue([{ sid, path, slug, name, year, sport }, ...])                 (start / add work)
//
// `path` is TCDB's name slug from the set's link ("2018-Topps-Chrome"): TCDB serves a
// 404 page (with HTTP 200) for /Checklist.cfm/sid/N without it.
//   __tcdb.status()                                 -> progress summary
//   await __tcdb.take(maxChars)                     -> gzip+base64 chunk of finished sets (removes them)
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
  if (window.__tcdb && window.__tcdb.version >= 2) return
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const parse = (h) => new DOMParser().parseFromString(h, 'text/html')
  const st = { version: 2, gap: 6000, minGap: 4000, maxGap: 120000, todo: [], done: [], failed: [], current: null, requests: 0, throttled: 0, running: false, log: [] }

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
        p = people.length ? people.join(' / ') : nameCell.textContent.replace(/\s+/g, ' ').trim()
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
      const cards = await checklist(sid, path)
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

  const status = () => ({ gap: st.gap, requests: st.requests, throttled: st.throttled, running: st.running, todo: st.todo.length, done: st.done.length, failed: st.failed.map(f => f.slug + ': ' + f.error), current: st.current && { slug: st.current.slug, ...st.current.progress, mins: Math.round((Date.now() - st.current.started) / 60000) } })

  window.__tcdb = { version: 2, st, find, queue: (jobs) => { st.todo.push(...jobs); run(); return st.todo.length }, status, take, stage, slice, checklist, rowsOf, flagsToX }
})()
