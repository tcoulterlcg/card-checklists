'use client'
// Accounts for Card HQ community features (profiles, wantlists, collections,
// forum). Card HQ shares one account with GrailFindr — like a Google account
// across Gmail and Drive — so sign-in and per-user data live in GrailFindr's
// Supabase project (tables prefixed cardhq_). The card catalog itself stays in
// the Cards-HQ project (see app/api/ingest). The publishable key is designed to
// ship to browsers — row-level security policies guard every table.
import { createClient } from '@supabase/supabase-js'

const ACCOUNT_URL = 'https://kfudhwuyxtfkmwcolavs.supabase.co'
const ACCOUNT_PUBLISHABLE_KEY = 'sb_publishable_JrVbQ7zwFXd-LHAkZ-NZoA_55VWSyBa'

export const supa = createClient(ACCOUNT_URL, ACCOUNT_PUBLISHABLE_KEY, {
  auth: { storageKey: 'cardhq-auth' },
})

// --- GrailFindr (the shared account's home) ---
export const GRAILFINDR_URL = 'https://grailfindr.vercel.app'
const herePath = () => (typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search)
// "Continue with GrailFindr": signs in there if needed, then comes back here signed in.
export const grailfindrConnectUrl = (next = herePath()) =>
  `${GRAILFINDR_URL}/connect?app=cardhq&next=${encodeURIComponent(next)}`
// New accounts and password resets happen on GrailFindr, then return here.
export const grailfindrSignupUrl = (next = herePath()) =>
  `${GRAILFINDR_URL}/login?mode=signup&app=cardhq&next=${encodeURIComponent('/connect?app=cardhq&next=' + encodeURIComponent(next))}`
export const grailfindrForgotUrl = () => `${GRAILFINDR_URL}/login?app=cardhq`
// "Find it": a GrailFindr saved-search form pre-filled for one card (searches every marketplace).
export function grailfindrFindUrl({ setName, player, n, section }) {
  const set = String(setName || '').replace(/\s+(Baseball|Football|Basketball|Hockey|Soccer|Racing|Wrestling|UFC|Golf|Tennis|Entertainment)$/i, '')
  const num = n && !String(n).startsWith('—') ? '#' + String(n) : ''
  const sec = section && !/^\s*base( set)?\s*$/i.test(section) && !/[–-]\s*base set\s*$/i.test(section) ? section.replace(/^.*[–-]\s*/, '') : ''
  const keywords = [set, player, sec, num].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  const name = [player, set].filter(Boolean).join(' · ')
  return `${GRAILFINDR_URL}/searches/new?keywords=${encodeURIComponent(keywords)}&name=${encodeURIComponent(name.slice(0, 80))}`
}

// --- profile helpers ---
// null = this account has no Card HQ profile yet; undefined = couldn't tell (network/server error),
// so callers never mistake a failed load for "pick a username" and overwrite an existing profile.
export async function getProfile(userId) {
  const { data, error } = await supa.from('cardhq_profiles').select('*').eq('id', userId).maybeSingle()
  return error ? undefined : data
}
// Creates the profile only; an existing one (opened in another tab, or a slow load) is returned unchanged.
export async function ensureProfile(userId, username) {
  const { data, error } = await supa.from('cardhq_profiles').insert({ id: userId, username }).select().single()
  if (error && /pkey/i.test(error.message || '')) { const p = await getProfile(userId); if (p) return { data: p, error: null } }
  return { data, error }
}
// Card HQ shares the account with GrailFindr: sign out here only, not on every site and device.
export const signOutHere = () => supa.auth.signOut({ scope: 'local' })

export async function updateProfile(userId, fields) {   // RLS: own row only
  const { data, error } = await supa.from('cardhq_profiles').update(fields).eq('id', userId).select().single()
  return { data, error }
}

// --- wantlist ---
export async function addWant(userId, item) { // {set_slug,set_name,card_n?,section?,player?}
  const r = await supa.from('cardhq_wantlist_items').insert({ user_id: userId, ...item })
  return r.error && r.error.code === '23505' ? { ...r, error: null, duplicate: true } : r
}
export async function removeWant(id) { return supa.from('cardhq_wantlist_items').delete().eq('id', id) }
// Supabase returns at most 1,000 rows per request: page until a short page comes back.
// A failed read comes back as an array marked `failed`, so callers can keep what they had.
async function allRows(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) return Object.assign(out, { failed: true })
    out.push(...(data || []))
    if (!data || data.length < 1000) return out
  }
}
export async function myWantlist(userId) {
  return allRows(() => supa.from('cardhq_wantlist_items').select('*').eq('user_id', userId).order('created_at', { ascending: false }).order('id'))
}

// --- collection ---
// A collected card is (set, section, number). Cards with no number use the
// player name in its place ("—Mike Trout"), since card_n is required and unique
// per section; parallels of the same number are separate cards. "NNO" (no number)
// counts as no number, or every NNO card in a section would be checked at once.
export const noCardNumber = (n) => n == null || /^\s*(?:#?\s*)?(?:|nno|n\/?a|[-–—?])\s*$/i.test(String(n))
export const collectionCardN = (c) => (noCardNumber(c.n) ? '—' + (c.p || '') : String(c.n))
export async function toggleCollected(userId, item, collected) { // item: {set_slug,card_n,section?,player?}
  if (collected) {
    const r = await supa.from('cardhq_collection_items').insert({ user_id: userId, ...item })
    return r.error && r.error.code === '23505' ? { ...r, error: null } : r   // already collected (double click)
  }
  let q = supa.from('cardhq_collection_items').delete().match({ user_id: userId, set_slug: item.set_slug, card_n: item.card_n })
  q = item.section ? q.eq('section', item.section) : q.is('section', null)
  return q
}
export async function myCollection(userId, setSlug) {
  return allRows(() => { let q = supa.from('cardhq_collection_items').select('*').eq('user_id', userId); if (setSlug) q = q.eq('set_slug', setSlug); return q.order('id') })
}
// Matches the cardhq-images bucket limits (8 MB, photos only).
const IMG_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif)$/
export async function uploadCardImage(userId, file) {
  if (!IMG_TYPES.test(file.type || '')) return { error: { message: 'Use a JPG, PNG, WebP or HEIC photo.' } }
  if (file.size > 8 * 1024 * 1024) return { error: { message: 'That photo is over 8 MB — try a smaller one.' } }
  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const { error } = await supa.storage.from('cardhq-images').upload(path, file, { contentType: file.type })
  if (error) return { error }
  const { data } = supa.storage.from('cardhq-images').getPublicUrl(path)
  return { url: data.publicUrl }
}
export async function setCollectionImage(id, url) {
  return supa.from('cardhq_collection_items').update({ image_url: url }).eq('id', id)
}

// --- forum ---
// Aliases keep the shapes the UI expects (post.profiles, post.forum_reactions, ...).
export async function forumFeed() {
  const { data } = await supa.from('cardhq_forum_posts')
    .select('*, profiles:cardhq_profiles(username, avatar_url), forum_reactions:cardhq_forum_reactions(emoji, user_id), forum_comments:cardhq_forum_comments(id)')
    .order('created_at', { ascending: false }).limit(50)
  return data || Object.assign([], { failed: true })   // failed: show "couldn't load", not "be the first to post"
}
export async function createPost(userId, post) { // {title,body,set_slug?,achievement?,image_urls?}
  return supa.from('cardhq_forum_posts').insert({ user_id: userId, ...post }).select().single()
}
export async function react(postId, userId, emoji, on = true) {
  if (!on) return supa.from('cardhq_forum_reactions').delete().match({ post_id: postId, user_id: userId, emoji })
  return supa.from('cardhq_forum_reactions').upsert({ post_id: postId, user_id: userId, emoji })
}
export async function comments(postId) {
  const { data } = await supa.from('cardhq_forum_comments').select('*, profiles:cardhq_profiles(username)').eq('post_id', postId).order('created_at')
  return data || []
}
export async function deletePost(postId) { return supa.from('cardhq_forum_posts').delete().eq('id', postId) }   // RLS: own posts only
export async function addComment(postId, userId, body) {
  return supa.from('cardhq_forum_comments').insert({ post_id: postId, user_id: userId, body })
}


// --- community feedback (data corrections + feature ideas) ---
// Corrections need an account (RLS); feature ideas can be anonymous. Admins
// (rows in public.owners) see and triage everything at ?view=feedback.
export async function submitFeedback(row) { // {kind,message,details?,set_slug?,set_name?,card_n?,player?,page_url?}
  const { data: { session } } = await supa.auth.getSession()
  return supa.from('cardhq_feedback').insert({ ...row, user_id: session?.user?.id || null })
}
export async function isAdmin() {
  const { data } = await supa.rpc('cardhq_is_admin')
  return !!data
}
// RLS returns everything for admins, only your own reports otherwise.
export async function listFeedback({ status } = {}) {
  let q = supa.from('cardhq_feedback').select('*').order('created_at', { ascending: false }).limit(200)
  if (status && status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) return Object.assign([], { failed: true })
  // usernames (user_id points at the account, which may not have a Card HQ profile yet)
  const ids = [...new Set((data || []).map(r => r.user_id).filter(Boolean))]
  if (ids.length) {
    const { data: profs } = await supa.from('cardhq_profiles').select('id, username').in('id', ids)
    const byId = new Map((profs || []).map(p => [p.id, p.username]))
    for (const r of data) r.username = byId.get(r.user_id) || null
  }
  return data || []
}
export async function newFeedbackCount() {
  const { count } = await supa.from('cardhq_feedback').select('id', { count: 'exact', head: true }).eq('status', 'new')
  return count || 0
}
export async function setFeedbackStatus(id, status, admin_note) {
  const fields = { status }
  if (admin_note !== undefined) fields.admin_note = admin_note
  return supa.from('cardhq_feedback').update(fields).eq('id', id)
}

// --- data fixes (admin only; see lib/corrections.js) ---
export async function addCorrection(row) { // {set_slug, op, payload, feedback_id?, note?}
  return supa.from('cardhq_corrections').insert(row).select().single()
}
export async function listCorrections(slug) {   // admins also see reverted ones
  const { data } = await supa.from('cardhq_corrections').select('*').eq('set_slug', slug).order('id', { ascending: false })
  return data || []
}
export async function revertCorrection(id) { return supa.from('cardhq_corrections').update({ status: 'reverted' }).eq('id', id) }
export async function restoreCorrection(id) { return supa.from('cardhq_corrections').update({ status: 'active' }).eq('id', id) }
