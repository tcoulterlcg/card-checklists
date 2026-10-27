/* Card HQ — "Import from TCDB" bookmark.
 * Runs on tcdb.com in the collector's own signed-in tab: TCDB has no export or API, and its pages
 * are behind a bot check, so only the member's own browser can read their collection. It reads the
 * collection list pages (and, for a full import, each card's edit page for condition / grading /
 * notes), then hands the data to the Card HQ tab it opened with postMessage. Nothing is sent
 * anywhere else, and nothing on TCDB is changed — every request is a plain page read.
 *
 * My Collection > Import builds the bookmark from this file (CARDHQ_ORIGIN is filled in there).
 * Keep it self-contained: no imports, no globals besides window.__cardhqTcdb.
 */
(function () {
  var ORIGIN = 'CARDHQ_ORIGIN'
  if (!/(^|\.)tcdb\.com$/.test(location.hostname)) { alert('Open tcdb.com and sign in, then click the "Card HQ import" bookmark again.'); return }
  if (window.__cardhqTcdb) { window.__cardhqTcdb.show(); return }

  var SPORTS = ['Baseball', 'Basketball', 'Boxing', 'Cricket', 'Football', 'Gaming', 'Golf', 'Hockey', 'Misc Sports', 'MMA', 'Multi-Sport', 'Non-Sport', 'Racing', 'Soccer', 'Tennis', 'Wrestling']
  // row colours on TCDB's collection list (its own legend)
  var STATUS_BY_COLOR = { '#D9EDF7': 'have', '#9DFF9D': 'trade', '#FFCECE': 'want', '#D6D6D6': 'in_transaction', '#F2E28A': 'in_transit', '#FFFFFF': 'have' }
  var st = { phase: 'ready', gap: 1200, pages: 0, items: [], collections: [], member: '', full: false, detailsDone: 0, stop: false, error: '', win: null, sent: false, cardhqReady: false }
  window.__cardhqTcdb = st

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  var parse = function (h) { return new DOMParser().parseFromString(h, 'text/html') }
  async function get(url) {
    for (var attempt = 0; attempt < 6; attempt++) {
      await sleep(st.gap)
      var r
      try { r = await fetch(url, { credentials: 'include' }) } catch (e) { st.gap = Math.min(30000, st.gap * 2); continue }
      if (r.status === 429 || r.status === 503) { st.gap = Math.min(30000, st.gap * 2); continue }
      if (!r.ok) throw new Error('TCDB returned ' + r.status)
      var html = await r.text()
      if (/Just a moment|Performing security verification/.test(html)) { st.gap = Math.min(30000, st.gap * 2); continue }
      st.gap = Math.max(800, Math.round(st.gap * 0.9))
      st.pages++
      return parse(html)
    }
    throw new Error('TCDB is busy right now — wait a few minutes and try again.')
  }

  // ---------- overlay ----------
  var box = document.createElement('div')
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Import to Card HQ')
  box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));background:#0F1320;color:#EDEDEF;border:1px solid #2E3D6B;border-radius:14px;padding:18px 18px 16px;font:14px/1.5 Inter,system-ui,sans-serif;box-shadow:0 12px 40px #0009'
  document.body.appendChild(box)
  var btn = 'border:none;border-radius:10px;padding:10px 14px;font:600 14px Inter,system-ui,sans-serif;cursor:pointer;width:100%;margin-top:8px;'
  function render() {
    var h = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b style="font-size:16px">Import to Card HQ</b><button data-a="close" aria-label="Close" style="background:none;border:none;color:#8A93A8;font-size:20px;cursor:pointer">×</button></div>'
    if (st.phase === 'ready') {
      h += '<p style="margin:0 0 6px;color:#A1A1AA">Copies your TCDB collection' + (st.member ? ' (<b style="color:#EDEDEF">' + esc(st.member) + '</b>)' : '') + ', wantlist and trade list into Card HQ. Nothing on TCDB changes.</p>'
      h += '<button data-a="quick" style="' + btn + 'background:#3B6EF5;color:#fff">Quick import · about a minute</button>'
      h += '<button data-a="full" style="' + btn + 'background:#121626;color:#EDEDEF;border:1px solid #232A3E">Full import · adds condition, grading, serial # and notes<br><span style="font-weight:400;color:#8A93A8;font-size:12px">about 1 second per card — keep this tab open</span></button>'
    } else if (st.phase === 'list' || st.phase === 'details') {
      var pct = st.phase === 'details' && st.items.length ? Math.round(100 * st.detailsDone / st.items.length) : null
      h += '<p style="margin:0;color:#A1A1AA" role="status">' + (st.phase === 'list' ? 'Reading your collection… ' + st.items.length.toLocaleString() + ' cards so far' : 'Reading card details… ' + st.detailsDone.toLocaleString() + ' of ' + st.items.length.toLocaleString() + (st.items.length - st.detailsDone > 60 ? ' (about ' + Math.ceil((st.items.length - st.detailsDone) * st.gap / 60000) + ' min left)' : '')) + '</p>'
      h += '<div style="height:6px;background:#232A3E;border-radius:4px;overflow:hidden;margin-top:10px"><div style="height:100%;background:#3B6EF5;width:' + (pct == null ? 15 + Math.min(80, st.pages * 3) : pct) + '%"></div></div>'
      if (st.phase === 'details') h += '<button data-a="stop" style="' + btn + 'background:#121626;color:#EDEDEF;border:1px solid #232A3E">Stop and send what I have</button>'
    } else if (st.phase === 'send') {
      h += '<p style="margin:0;color:#A1A1AA">' + st.items.length.toLocaleString() + ' cards read from TCDB.</p>'
      if (st.sent) h += '<p style="margin:8px 0 0;color:#4ade80;font-weight:600">Sent to Card HQ — finish in the Card HQ tab.</p>'
      else h += '<p style="margin:8px 0 0;color:#A1A1AA">Waiting for the Card HQ tab…</p>'
      h += '<button data-a="open" style="' + btn + 'background:#3B6EF5;color:#fff">' + (st.sent ? 'Go to Card HQ' : 'Open Card HQ') + '</button>'
      h += '<button data-a="file" style="' + btn + 'background:#121626;color:#EDEDEF;border:1px solid #232A3E">Download as a file instead</button><p style="margin:6px 0 0;color:#8A93A8;font-size:12px">Then upload it in My Collection → Import.</p>'
    } else if (st.phase === 'error') {
      h += '<p style="margin:0;color:#f87171">' + esc(st.error) + '</p>'
      if (st.items.length) h += '<button data-a="file" style="' + btn + 'background:#121626;color:#EDEDEF;border:1px solid #232A3E">Download the ' + st.items.length + ' cards read so far</button>'
    }
    box.innerHTML = h
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  st.show = function () { box.style.display = ''; render() }
  box.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-a]'); if (!a) return
    var k = a.getAttribute('data-a')
    if (k === 'close') { box.style.display = 'none' }
    else if (k === 'quick' || k === 'full') { st.full = k === 'full'; openCardHQ(); run() }
    else if (k === 'stop') { st.stop = true }
    else if (k === 'open') { openCardHQ(); trySend() }
    else if (k === 'file') { download() }
  })

  // ---------- Card HQ hand-off ----------
  function openCardHQ() {
    // opened on the click (a pop-up opened later would be blocked); Card HQ answers "ready" when it can take the data
    if (!st.win || st.win.closed) st.win = window.open(ORIGIN + '/?view=collection&ctab=import&from=tcdb', 'cardhq-import')
    else try { st.win.focus() } catch (e) {}
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.type !== 'cardhq-tcdb-ready') return
    st.cardhqReady = true
    if (!st.win || st.win.closed) st.win = e.source
    trySend()
  })
  function payload() {
    return { type: 'cardhq-tcdb-import', v: 1, member: st.member, full: st.full, at: new Date().toISOString(), collections: st.collections, items: st.items }
  }
  function trySend() {
    if (st.phase !== 'send' || !st.win || st.win.closed || !st.cardhqReady) return
    try { st.win.postMessage(payload(), ORIGIN); st.sent = true; render() } catch (e) {}
  }
  function download() {
    var a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(payload())], { type: 'application/json' }))
    a.download = 'tcdb-collection-' + (st.member || 'export') + '.json'
    document.body.appendChild(a); a.click(); a.remove()
  }

  // ---------- reading the collection ----------
  function memberName() {
    var a = document.querySelector('a[href^="/Collections.cfm/"]')
    var m = a && /\/Collections\.cfm\/([^/?#]+)/.exec(a.getAttribute('href'))
    return m ? decodeURIComponent(m[1]) : ''
  }
  function q(params) { return Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]) }).join('&') }
  function rows(doc) {
    var out = []
    doc.querySelectorAll('tr.collection_row').forEach(function (tr) {
      var edit = tr.querySelector('a[href*="CollectionEdit.cfm"]')
      var card = tr.querySelector('a[href*="/ViewCard.cfm/"]')
      if (!edit || !card) return
      var href = edit.getAttribute('href')
      var id = function (k) { var m = new RegExp('[?&]' + k + '=(\\d+)', 'i').exec(href); return m ? m[1] : '' }
      var price = ''
      tr.querySelectorAll('td').forEach(function (td) { var t = td.textContent.trim(); if (/^\$[\d,]+(\.\d+)?$/.test(t)) price = t.replace(/[$,]/g, '') })
      var badge = tr.querySelector('.badge')
      out.push({
        itemId: id('ItemID'), sid: +id('SetID') || null, cid: +id('CardID') || null,
        title: card.textContent.replace(/\s+/g, ' ').trim(),
        qty: Math.max(1, parseInt(badge ? badge.textContent : '1', 10) || 1),
        price: price ? +price : null,
        status: STATUS_BY_COLOR[(tr.getAttribute('bgcolor') || '').toUpperCase()] || 'have',
      })
    })
    return out
  }
  async function listAll(params) {
    var base = '/ViewCollectionMode.cfm?' + q(Object.assign({ Member: st.member }, params))
    var doc = await get(base)
    var n = parseInt(((doc.body.textContent.match(/([\d,]+)\s+record/) || [])[1] || '0').replace(/,/g, ''), 10)
    var got = rows(doc)
    var pages = Math.ceil(n / 100)
    for (var p = 2; p <= pages && !st.stop; p++) { got = got.concat(rows(await get(base + '&Records=' + n + '&PageIndex=' + p))); render() }
    return got
  }
  async function run() {
    try {
      st.phase = 'list'; render()
      // named collections ("Patrick Kane PC")
      var cm = await get('/CollectionManager.cfm/member/' + encodeURIComponent(st.member) + '/collection/?MODE=Collection')
      var sel = cm.querySelector('#collectionSelector')
      st.collections = sel ? Array.prototype.filter.call(sel.options, function (o) { return o.value }).map(function (o) { return { id: o.value, name: o.textContent.trim() } }) : []
      var byItem = {}
      var sportsWith = []
      for (var i = 0; i < SPORTS.length; i++) {
        var got = await listAll({ CollectionID: '', Filter: '', Type: SPORTS[i] })
        if (got.length) sportsWith.push(SPORTS[i])
        got.forEach(function (r) { r.sport = SPORTS[i]; if (!byItem[r.itemId]) { byItem[r.itemId] = r; st.items.push(r) } })
        render()
      }
      // in-transit rows share one colour: ask TCDB which ones are outbound
      if (st.items.some(function (r) { return r.status === 'in_transit' })) {
        for (var s = 0; s < sportsWith.length; s++) {
          (await listAll({ CollectionID: '', Filter: 'O', Type: sportsWith[s] })).forEach(function (r) { if (byItem[r.itemId]) byItem[r.itemId].status = 'in_transit_out' })
        }
        st.items.forEach(function (r) { if (r.status === 'in_transit') r.status = 'in_transit_in' })
      }
      // which named collection each card is in
      if (st.collections.length === 1) st.items.forEach(function (r) { r.collection = st.collections[0].name })
      else if (st.collections.length > 1) {
        for (var c = 0; c < st.collections.length; c++) for (var s2 = 0; s2 < sportsWith.length; s2++) {
          (await listAll({ CollectionID: st.collections[c].id, Filter: '', Type: sportsWith[s2] })).forEach(function (r) { if (byItem[r.itemId]) byItem[r.itemId].collection = st.collections[c].name })
        }
      }
      if (st.full) {
        st.phase = 'details'; render()
        for (var k = 0; k < st.items.length && !st.stop; k++) {
          var it = st.items[k]
          if (it.status !== 'want') {
            try { it.details = details(await get('/CollectionEdit.cfm?' + q({ SetID: it.sid, CardID: it.cid, ItemID: it.itemId }))) } catch (e) { if (/busy/.test(e.message)) throw e }
          }
          st.detailsDone = k + 1
          if (k % 5 === 0) render()
        }
      }
      st.phase = 'send'; render(); trySend()
    } catch (e) {
      st.phase = 'error'; st.error = (e && e.message) || 'Something went wrong reading TCDB.'; render()
    }
  }
  function details(doc) {
    var val = function (name) {
      var el = doc.querySelector('[name="' + name + '"]'); if (!el) return ''
      if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; return o && o.value ? o.textContent.trim() : '' }
      return (el.value || '').trim()
    }
    var added = (doc.body.textContent.match(/Added on:\s*([A-Z][a-z]{2} \d{1,2}, \d{4})/) || [])[1] || ''
    var tags = val('Tags')
    return {
      condition: val('Condition'), graded: val('Graded') === 'Y', grader: val('Grader'), grade: val('Grade'),
      autographed: val('Autographed') === 'Y', serial: val('SerialNum'), comment: val('Comment'),
      tags: tags ? tags.split(/\s*,\s*/).filter(Boolean) : [], added: added, price: val('Price'),
    }
  }

  st.member = memberName()
  if (!st.member) { st.phase = 'error'; st.error = 'Sign in to TCDB first, then click the bookmark again.' }
  render()
})()
