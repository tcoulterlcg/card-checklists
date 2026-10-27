// CSV in and out for My Collection. No dependencies, so it runs in the browser and in node tests.

// RFC 4180: quoted fields, "" escapes, commas/newlines inside quotes, CRLF or LF, optional BOM.
// Tab- and semicolon-separated files are detected from the header line.
export function parseCsv(text) {
  let s = String(text || '')
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1)
  const head = s.slice(0, s.search(/\r?\n|$/))
  const counts = { ',': 0, '\t': 0, ';': 0 }
  let q = false
  for (const ch of head) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++ }
  const sep = counts['\t'] > counts[','] && counts['\t'] >= counts[';'] ? '\t' : counts[';'] > counts[','] ? ';' : ','
  const rows = []
  let row = [], field = '', inQ = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += ch
    } else if (ch === '"' && field === '') inQ = true
    else if (ch === sep) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(v => v !== '')) rows.push(row)
      row = []
    } else field += ch
  }
  row.push(field)
  if (row.some(v => v !== '')) rows.push(row)
  if (!rows.length) return { headers: [], rows: [] }
  const headers = rows[0].map(h => h.trim())
  return { headers, rows: rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) }
}

// Excel-safe: BOM so accents survive, CRLF, quotes everywhere, and a leading = + - @ can't run as a formula.
export function toCsv(headers, rows) {
  const cell = (v) => {
    let t = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t
    return '"' + t.replace(/"/g, '""') + '"'
  }
  return '﻿' + [headers.map(cell).join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\r\n') + '\r\n'
}

// Column names other tools use, mapped to ours. Matching ignores case, spaces and punctuation.
export const IMPORT_FIELDS = [
  ['set', 'Set', ['set', 'setname', 'product', 'cardset', 'series', 'release', 'set title']],
  ['year', 'Year', ['year', 'season', 'yr']],
  ['sport', 'Sport', ['sport', 'category', 'type']],
  ['section', 'Insert / parallel', ['section', 'insert', 'parallel', 'subset', 'variation', 'variety', 'insertparallel', 'setsection']],
  ['card_n', 'Card #', ['card', 'cardnumber', 'cardno', 'number', 'no', 'num', '#', 'card#', 'cardnum']],
  ['player', 'Player / name', ['player', 'name', 'playername', 'subject', 'person', 'character', 'description', 'cardname', 'title']],
  ['qty', 'Quantity', ['qty', 'quantity', 'count', 'copies', 'owned', 'have']],
  ['status', 'Status', ['status', 'list', 'listedin']],
  ['collection', 'Collection', ['collection', 'binder', 'folder', 'box', 'location', 'pc']],
  ['condition', 'Condition', ['condition', 'cond']],
  ['grader', 'Grader', ['grader', 'gradingcompany', 'grading company', 'company', 'slab']],
  ['grade', 'Grade', ['grade', 'gradevalue', 'score']],
  ['cert_no', 'Cert #', ['cert', 'certnumber', 'certno', 'certification', 'serialcert']],
  ['serial_no', 'Serial # (e.g. 12/99)', ['serialnumber', 'serial', 'sn', 'numbered', 'printrun']],
  ['autographed', 'Autographed', ['autographed', 'auto', 'signed', 'autograph']],
  ['price_paid', 'Price paid', ['pricepaid', 'paid', 'cost', 'purchaseprice', 'price', 'costbasis', 'buyprice']],
  ['value', 'Value', ['value', 'marketvalue', 'estimatedvalue', 'currentvalue', 'worth']],
  ['acquired_on', 'Date acquired', ['dateacquired', 'acquired', 'purchasedate', 'dateadded', 'added', 'date']],
  ['tags', 'Tags', ['tags', 'tag', 'labels']],
  ['notes', 'Notes', ['notes', 'note', 'comment', 'comments', 'memo']],
  ['set_slug', 'Card HQ set ID', ['cardhqsetid', 'setslug', 'setid', 'slug']],
]
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9#]+/g, '')
export function guessMapping(headers) {
  const map = {}, used = new Set()
  for (const [key, , syns] of IMPORT_FIELDS) {
    const want = syns.map(squash)
    const h = headers.find(h => !used.has(h) && want.includes(squash(h)))
    if (h) { map[key] = h; used.add(h) }
  }
  return map
}

// "$1,234.50" -> 1234.5; "" -> null
export const money = (v) => { const t = String(v ?? '').replace(/[^0-9.\-]/g, ''); if (!t || isNaN(+t)) return null; const n = Math.round(+t * 100) / 100; return n >= 0 && n < 1e8 ? n : null }
export const yesNo = (v) => /^(y|yes|true|1|x|auto|au|signed)$/i.test(String(v ?? '').trim())
export function isoDate(v) {
  const t = String(v ?? '').trim(); if (!t) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) + 'T12:00:00' : t)
  return isNaN(d) || d.getFullYear() < 1900 || d.getFullYear() > 2100 ? null : d.toISOString().slice(0, 10)
}
