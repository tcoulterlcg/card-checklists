// Admin-approved data fixes (table cardhq_corrections in the account project).
// They sit on top of the set files instead of editing them, so a re-import or
// catalog rebuild never wipes a fix:
//   - the site applies them when a set loads (lib/catalog.js loadSet), so a fix
//     is live the moment it's saved
//   - scripts/apply-corrections.mjs bakes them into the data at build time, so
//     search, player pages and indexes pick them up on the next deploy
// Every op is idempotent: applying the same list twice gives the same set.
// Plain fetch (no supabase-js) so this runs in the browser, on the server and in node scripts.

const URL_ = 'https://kfudhwuyxtfkmwcolavs.supabase.co/rest/v1/cardhq_corrections'
const KEY = 'sb_publishable_JrVbQ7zwFXd-LHAkZ-NZoA_55VWSyBa'

export const OPS = {
  add_card: 'Add a card',
  edit_card: 'Fix a card',
  remove_card: 'Remove a card',
  copy_section: 'Add a parallel (copy of a section)',
  add_section: 'Add a section (paste a list)',
  rename_section: 'Rename a section',
}

async function get(qs) {
  try {
    const r = await fetch(URL_ + '?' + qs, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
    return r.ok ? await r.json() : null
  } catch { return null }
}

// Active fixes for one set, oldest first (the order they're applied in).
export async function correctionsFor(slug) {
  return (await get('select=id,op,payload&status=eq.active&set_slug=eq.' + encodeURIComponent(slug) + '&order=id.asc')) || []
}
// Every active fix, grouped by set slug (for the build script). null = couldn't load.
export async function allCorrections() {
  const out = new Map()
  for (let from = 0; ; from += 1000) {
    const rows = await get('select=id,set_slug,op,payload&status=eq.active&order=id.asc&limit=1000&offset=' + from)
    if (!rows) return from === 0 ? null : out
    for (const r of rows) { if (!out.has(r.set_slug)) out.set(r.set_slug, []); out.get(r.set_slug).push(r) }
    if (rows.length < 1000) return out
  }
}

const norm = (s) => String(s ?? '').trim().toLowerCase()
const sameCard = (c, n, p) => norm(c.n) === norm(n) && (p == null || norm(c.p) === norm(p))
const cleanCard = (c) => {
  const out = { n: String(c.n ?? '').trim(), p: String(c.p ?? '').trim() }
  if (c.t) out.t = String(c.t).trim()
  if (c.x) out.x = String(c.x).trim()
  return out
}

// Parse a pasted list: one card per line — "#, player, team, flag" (tabs or commas).
export function parseCardList(text) {
  return String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const [n, p, t, x] = l.split(/\t|,/).map(s => s.trim())
    return cleanCard({ n: (n || '').replace(/^#/, ''), p, t, x })
  }).filter(c => c.p)
}

// Apply fixes to a set (returns a new object; the input isn't mutated).
export function applyCorrections(set, list) {
  if (!set || !Array.isArray(set.sections) || !list || !list.length) return set
  const s = { ...set, sections: set.sections.map(sec => ({ ...sec, cards: (sec.cards || []).slice() })) }
  const find = (title) => s.sections.find(sec => norm(sec.title) === norm(title))
  // A section added and later renamed already exists under its new name on a re-run.
  const renames = new Map(list.filter(f => f.op === 'rename_section' && f.payload).map(f => [norm(f.payload.from), f.payload.title]))
  // Look a section up by name, following later renames (on a re-run it already has its new name).
  const findR = (title, seen = new Set()) => find(title) || (renames.has(norm(title)) && !seen.has(norm(title)) ? findR(renames.get(norm(title)), seen.add(norm(title))) : undefined)
  const exists = (title) => !!findR(title)
  let applied = 0   // ops that changed something (handy when debugging)
  // A card added and later fixed already exists in its fixed form on a re-run.
  const finalForm = (card, from) => {
    let c = { ...card }
    for (const f of list.slice(from + 1)) if (f.op === 'edit_card' && f.payload?.match && sameCard(c, f.payload.match.n, f.payload.match.p)) c = { ...c, ...f.payload.set }
    return c
  }
  for (const [idx, { op, payload: p = {} }] of list.entries()) {
    try {
      if (op === 'add_card') {
        let sec = findR(p.section)
        if (!sec) { sec = { title: String(p.section).trim(), cards: [] }; s.sections.push(sec) }
        const fin = finalForm(p.card, idx)
        if (!sec.cards.some(c => sameCard(c, p.card.n, p.card.p) || sameCard(c, fin.n, fin.p))) { sec.cards.push(cleanCard(p.card)); applied++ }
      } else if (op === 'edit_card') {
        const sec = findR(p.section); if (!sec) continue
        const i = sec.cards.findIndex(c => sameCard(c, p.match.n, p.match.p))
        if (i >= 0) { const c = { ...sec.cards[i], ...p.set }; for (const k of ['t', 'x']) if (!c[k]) delete c[k]; sec.cards[i] = c; applied++ }
      } else if (op === 'remove_card') {
        const sec = findR(p.section); if (!sec) continue
        const before = sec.cards.length
        sec.cards = sec.cards.filter(c => !sameCard(c, p.match.n, p.match.p))
        if (sec.cards.length < before) applied++
      } else if (op === 'copy_section') {
        const from = findR(p.from); if (!from || exists(p.title)) continue
        const sec = { title: String(p.title).trim(), cards: from.cards.map(c => ({ ...c })) }
        if (from.mem) sec.mem = from.mem
        if (p.mem) sec.mem = p.mem
        s.sections.splice(s.sections.indexOf(from) + 1, 0, sec); applied++
      } else if (op === 'add_section') {
        if (exists(p.title)) continue
        const sec = { title: String(p.title).trim(), cards: (p.cards || []).map(cleanCard) }
        if (p.mem) sec.mem = p.mem
        s.sections.push(sec); applied++
      } else if (op === 'rename_section') {
        const sec = find(p.from); if (!sec || find(p.title)) continue
        sec.title = String(p.title).trim(); applied++
      }
    } catch { /* a malformed fix never breaks the set */ }
  }
  s.sections = s.sections.filter(sec => sec.cards.length)
  return s
}

// One-line summary for lists and admin notes.
export function describe(op, p = {}) {
  const card = (c) => (c?.n ? '#' + c.n + ' ' : '') + (c?.p || '')
  if (op === 'add_card') return 'Added ' + card(p.card) + ' to ' + p.section
  if (op === 'edit_card') return 'Fixed ' + card(p.match) + ' in ' + p.section + ' → ' + Object.entries(p.set || {}).map(([k, v]) => ({ n: '#', p: 'player ', t: 'team ', x: 'flag ' }[k] || k) + (v || '—')).join(', ')
  if (op === 'remove_card') return 'Removed ' + card(p.match) + ' from ' + p.section
  if (op === 'copy_section') return 'Added parallel ' + p.title + ' (copy of ' + p.from + ')'
  if (op === 'add_section') return 'Added section ' + p.title + ' (' + (p.cards || []).length + ' cards)'
  if (op === 'rename_section') return 'Renamed section ' + p.from + ' → ' + p.title
  return op
}
