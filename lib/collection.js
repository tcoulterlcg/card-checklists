'use client'
// My Collection data (collection v2 — scripts/sql/2026-10-27-collection-v2.sql).
// One row per copy in cardhq_collection_items: a raw copy and a graded copy of the same card are two
// rows; identical raw copies can share a row with qty > 1. Rows live in GrailFindr's Supabase project
// with the rest of the account data; row-level security limits every read and write to the owner
// (other people's cards only through cardhq_public_items: safe columns, shared collections).
import { supa, collectionCardN, GRAILFINDR_URL } from './supa'
import { sectionKey } from './catalog'

export const STATUSES = [
  ['have', 'In collection'], ['trade', 'For trade'], ['sale', 'For sale'],
  ['in_transit_in', 'In transit (coming)'], ['in_transit_out', 'In transit (going)'], ['in_transaction', 'In a deal'],
]
export const STATUS_LABEL = Object.fromEntries(STATUSES)
export const STATUS_COLOR = { have: '#7FA2FF', trade: '#4ade80', sale: '#facc15', in_transit_in: '#f59e0b', in_transit_out: '#f59e0b', in_transaction: '#a1a1aa' }
export const CONDITIONS = ['Gem Mint', 'Mint', 'NM-MT', 'NM', 'EX-MT', 'EX', 'VG-EX', 'VG', 'Good', 'Fair', 'Poor']
export const GRADERS = ['PSA', 'BGS', 'SGC', 'CGC', 'CSG', 'HGA', 'TAG', 'ISA', 'GMA', 'KSA', 'Beckett', 'Other']
export const GRADES = ['10', '9.5', '9', '8.5', '8', '7.5', '7', '6.5', '6', '5.5', '5', '4.5', '4', '3.5', '3', '2.5', '2', '1.5', '1', 'Auth']

// The fields a copy can carry; used by the editor, CSV export and imports.
export const ITEM_FIELDS = ['set_slug', 'set_name', 'section', 'card_n', 'player', 'collection_id', 'status', 'qty', 'price_paid', 'value', 'condition', 'grader', 'grade', 'cert_no', 'serial_no', 'autographed', 'notes', 'tags', 'image_url', 'acquired_on', 'source', 'source_item_id', 'tcdb_sid', 'tcdb_cid']
export const pick = (o, keys = ITEM_FIELDS) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))

// Card identity used for check marks everywhere: set + (tolerant) section + number.
export const cardKey = (slug, section, cardN) => String(slug || '') + '||' + sectionKey(section) + '||' + String(cardN ?? '')
export const itemKey = (it) => cardKey(it.set_slug, it.section, it.card_n)
export const cardKeyOf = (slug, section, card) => cardKey(slug, section, collectionCardN(card))
// rows that didn't match a Card HQ checklist yet keep the source's own description
export const UNMATCHED = 'unmatched'

async function allRows(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) return Object.assign(out, { failed: true, error })
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}
const chunks = (a, n) => { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }

// ---------- items ----------
export const listItems = (userId) => allRows(() => supa.from('cardhq_collection_items').select('*').eq('user_id', userId).order('id'))
// Inserts go through cardhq_insert_items: the database makes the ids and skips rows already saved
// (same source id), so a retried import neither doubles up nor fails on the rows that made it.
const full = (r) => Object.fromEntries(ITEM_FIELDS.map(k => [k, r[k] === undefined ? null : r[k]]))
export async function insertItems(userId, rows, onProgress) {
  const out = []
  let done = 0
  for (const part of chunks(rows, 500)) {
    const { data, error } = await supa.rpc('cardhq_insert_items', { rows: part.map(r => ({ ...pick(r), tags: r.tags || [] })) })
    if (error) return { data: out, error }
    out.push(...(data || [])); done += part.length; onProgress?.(done, rows.length)
  }
  return { data: out, error: null }
}
export async function updateItem(id, fields) {
  return supa.from('cardhq_collection_items').update(pick(fields)).eq('id', id).select().single()
}
export async function updateItems(ids, fields) {
  for (const part of chunks(ids, 200)) {
    const { error } = await supa.from('cardhq_collection_items').update(pick(fields)).in('id', part)
    if (error) return { error }
  }
  return { error: null }
}
// whole rows by id (re-imports, re-match): one request per 500 rows, only the caller's own rows
export async function updateWholeItems(rows) {
  for (const part of chunks(rows, 500)) {
    const { error } = await supa.rpc('cardhq_update_items', { rows: part.map(r => ({ ...full(r), id: r.id, tags: r.tags || [] })) })
    if (error) return { error }
  }
  return { error: null }
}
export async function deleteItems(ids) {
  for (const part of chunks(ids, 200)) {
    const { error } = await supa.from('cardhq_collection_items').delete().in('id', part)
    if (error) return { error }
  }
  return { error: null }
}

// ---------- named collections ----------
export const listCollections = async (userId) => {
  const { data, error } = await supa.from('cardhq_collections').select('*').eq('user_id', userId).order('sort').order('name')
  return error ? Object.assign([], { failed: true }) : data
}
export const createCollection = (userId, name) => supa.from('cardhq_collections').insert({ user_id: userId, name: name.trim().slice(0, 60) }).select().single()
export const renameCollection = (id, name) => supa.from('cardhq_collections').update({ name: name.trim().slice(0, 60) }).eq('id', id).select().single()
export const setCollectionPublic = (id, is_public) => supa.from('cardhq_collections').update({ is_public }).eq('id', id)
export const deleteCollection = (id) => supa.from('cardhq_collections').delete().eq('id', id)   // its cards stay, unfiled
export async function ensureCollections(userId, names, existing) {
  const have = new Map((existing || []).map(c => [c.name.toLowerCase(), c]))
  for (const n of names) {
    const name = String(n || '').trim().slice(0, 60)
    if (!name || have.has(name.toLowerCase())) continue
    const { data, error } = await createCollection(userId, name)
    if (error && !/duplicate|unique/i.test(error.message)) return { error }
    if (data) have.set(name.toLowerCase(), data)
  }
  return { map: have, error: null }
}

// ---------- wantlist + rules ----------
export const listWants = (userId) => allRows(() => supa.from('cardhq_wantlist_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }).order('id'))
// cards already on the wantlist are skipped, not an error
export async function insertWants(userId, rows) {
  for (const part of chunks(rows, 500)) {
    const { error } = await supa.rpc('cardhq_insert_wants', { rows: part })
    if (error) return { error }
  }
  return { error: null }
}
export const listRules = async (userId) => { const { data, error } = await supa.from('cardhq_want_rules').select('*').eq('user_id', userId).order('created_at'); return error ? Object.assign([], { failed: true }) : data }
export const addRule = (userId, rule) => supa.from('cardhq_want_rules').insert({ ...rule, user_id: userId }).select().single()
export const removeRule = (id) => supa.from('cardhq_want_rules').delete().eq('id', id)
// Does a card (player-index row or set-page card) fall under one of the rules?
export function ruleMatches(rule, { slug, player, team, serial, rookie, auto, sport }) {
  const v = String(rule.value || '').trim().toLowerCase()
  if (rule.sport && sport && rule.sport !== sport) return false
  if (rule.kind === 'player' && String(player || '').trim().toLowerCase() !== v) return false
  if (rule.kind === 'team' && !String(team || '').toLowerCase().includes(v)) return false
  if (rule.kind === 'set' && String(slug || '').toLowerCase() !== v) return false
  if (rule.max_print_run && !(serial > 0 && serial <= rule.max_print_run)) return false
  if (rule.rookies_only && !rookie) return false
  if (rule.autos_only && !auto) return false
  return true
}

// ---------- public collector pages ----------
export async function collectorByName(username) {
  const name = String(username || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24)
  if (!name) return null
  // case-insensitive but literal: _ and % are wildcards to ilike
  const { data } = await supa.from('cardhq_profiles').select('id, username, display_name, is_public, created_at').ilike('username', name.replace(/[\\%_]/g, '\\$&')).limit(1).maybeSingle()
  return data || null
}
// Only safe columns, and only what the owner shares (cardhq_public_items decides): everything when the
// profile is public, otherwise cards in collections made public.
export const publicItems = (userId) => allRows(() => supa.rpc('cardhq_public_items', { p_user: userId }))

// ---------- stats ----------
// indexBySlug: slug -> index row { name, year, sport, brand? }; brandOf(name, year) for brands.
export function collectionStats(items, indexBySlug, brandOf) {
  const s = { entries: items.length, cards: 0, paid: 0, value: 0, valued: 0, graded: 0, autos: 0, unmatched: 0, sets: new Map(), players: new Map(), years: new Map(), sports: new Map(), brands: new Map(), statuses: new Map(), graders: new Map() }
  const bump = (m, k, n = 1) => { if (k) m.set(k, (m.get(k) || 0) + n) }
  for (const it of items) {
    const q = it.qty || 1
    s.cards += q
    if (it.price_paid != null) s.paid += +it.price_paid * q
    if (it.value != null) { s.value += +it.value * q; s.valued += q }
    if (it.grader) { s.graded += q; bump(s.graders, it.grader, q) }
    if (it.autographed) s.autos += q
    bump(s.statuses, it.status || 'have', q)
    if (it.set_slug === UNMATCHED) { s.unmatched += q; continue }
    const ix = indexBySlug.get(it.set_slug)
    bump(s.sets, it.set_slug, q)
    bump(s.players, it.player, q)
    if (ix) { bump(s.years, ix.year, q); bump(s.sports, ix.sport, q); if (brandOf) bump(s.brands, brandOf(ix.name, ix.year), q) }
  }
  const top = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  return { ...s, top }
}

// admins: sets collectors imported that Card HQ doesn't have yet
export async function unmatchedSummary() {
  const { data, error } = await supa.rpc('cardhq_unmatched_summary')
  return error ? [] : data || []
}

// ---------- market value (GrailFindr's sold archive) ----------
// An eBay-style query for one copy: season start year, the set's own words, player, parallel and number;
// graded copies ask for that grade, raw copies leave graded sales out.
const SPORT_WORDS = /\b(baseball|football|basketball|hockey|soccer|racing|wrestling|golf|tennis|ufc|mma|boxing|entertainment|checklist|cards?|trading)\b/gi
export function marketValueQuery(it) {
  const name = String(it.set_name || '')
  const year = (/\b(18|19|20)\d\d\b/.exec(name) || [''])[0]
  const setWords = name.replace(/\b(18|19|20)\d\d(-\d{2,4})?\b/g, ' ').replace(SPORT_WORDS, ' ')
  const sec = it.section && !/^base( set| cards?)?$/i.test(it.section.trim()) ? it.section.replace(/\b(parallel|parallels|set|insert|inserts|variation)\b/gi, ' ') : ''
  const clean = (t) => String(t || '').replace(/["()\-,]/g, ' ').replace(/\s+/g, ' ').trim()
  const num = String(it.card_n || '').startsWith('—') || !it.card_n ? '' : String(it.card_n).replace(/^#/, '').replace(/[^A-Za-z0-9-]/g, '')
  const parts = [year, clean(setWords), clean(it.player), clean(sec)]
  if (num) parts.push(`(#${num},${num})`)
  if (it.grader && it.grade) parts.push(`"${it.grader} ${it.grade}"`)
  else parts.push('-psa -bgs -sgc -cgc -graded -lot')
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200)
}
export async function fetchMarketValue(it) {
  try {
    const r = await fetch(GRAILFINDR_URL + '/api/value?q=' + encodeURIComponent(marketValueQuery(it)))
    if (!r.ok) return { error: r.status === 429 ? 'Too many lookups — wait a minute.' : 'Value lookup isn’t available right now.' }
    return await r.json()
  } catch { return { error: 'Value lookup isn’t available right now.' } }
}
