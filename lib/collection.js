'use client'
// My Collection data (collection v2 — scripts/sql/2026-10-27-collection-v2.sql).
// One row per copy in cardhq_collection_items: a raw copy and a graded copy of the same card are two
// rows; identical raw copies can share a row with qty > 1. Rows live in GrailFindr's Supabase project
// with the rest of the account data; row-level security limits every read and write to the owner

import { supa, collectionCardN } from './supa'
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
