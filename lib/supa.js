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
// Hand-off check value: made here and saved before going to GrailFindr, echoed back with the
// sign-in token. app/auth/grailfindr only accepts a token carrying it, so a link holding someone
// else's token can't sign a visitor into the wrong account. localStorage (not sessionStorage) so a
// sign-up confirmed from the email in another tab still matches; it expires after an hour.
const GF_STATE_KEY = 'cardhq-gf-state', GF_STATE_TTL = 60 * 60 * 1000
export function grailfindrState() {
  if (typeof window === 'undefined') return ''
  try {
    const cur = JSON.parse(localStorage.getItem(GF_STATE_KEY) || 'null')
    if (cur && typeof cur.v === 'string' && Date.now() - cur.t < GF_STATE_TTL) return cur.v
    const b = new Uint8Array(24); crypto.getRandomValues(b)
    const v = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    localStorage.setItem(GF_STATE_KEY, JSON.stringify({ v, t: Date.now() }))
    return v
  } catch { return '' }
}
// true once, for the state this browser made; then it's used up
export function takeGrailfindrState(v) {
  try {
    const cur = JSON.parse(localStorage.getItem(GF_STATE_KEY) || 'null')
    const ok = !!(v && cur && cur.v === v && Date.now() - cur.t < GF_STATE_TTL)
    if (ok) localStorage.removeItem(GF_STATE_KEY)
    return ok
  } catch { return false }
}
const connectPath = (next) => '/connect?app=cardhq&next=' + encodeURIComponent(next) + '&state=' + grailfindrState()
// "Continue with GrailFindr": signs in there if needed, then comes back here signed in.
export const grailfindrConnectUrl = (next = herePath()) => GRAILFINDR_URL + connectPath(next)
// New accounts and password resets happen on GrailFindr, then return here.
export const grailfindrSignupUrl = (next = herePath()) =>
  `${GRAILFINDR_URL}/login?mode=signup&app=cardhq&next=${encodeURIComponent(connectPath(next))}`
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

// Collectors who opted in to "Show my collection on checklists" (profile.show_owned), per card of a set.
// slugs: the set's slug plus old slugs that redirect to it. Returns [{ section, card_n, username }] or null on error.
export async function setOwners(slugs) {
  const { data, error } = await supa.rpc('cardhq_set_owners', { slugs: slugs.slice(0, 20) })
  return error ? null : data || []
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

// --- collection (data in lib/collection.js) ---
// A collected card is (set, section, number). Cards with no number use the
// player name in its place ("—Mike Trout"), since card_n is required and unique
// per section; parallels of the same number are separate cards. "NNO" (no number)
// counts as no number, or every NNO card in a section would be checked at once.
export const noCardNumber = (n) => n == null || /^\s*(?:#?\s*)?(?:|nno|n\/?a|[-–—?])\s*$/i.test(String(n))
export const collectionCardN = (c) => (noCardNumber(c.n) ? '—' + (c.p || '') : String(c.n))
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
// --- forum (community boards) ---
// Posts carry a board, a tag, an optional linked set/card, and a score kept by database
// triggers from cardhq_forum_votes. Comments thread through parent_id.
const POST_COLS = 'id, user_id, board, tag, title, body, set_slug, player, card_section, card_n, image_urls, score, comment_count, pinned, created_at, edited_at, profiles:cardhq_profiles(username, avatar_url)'
// opts: { board?, sort: 'hot'|'new'|'top', topDays?, setSlug?, limit? }. Hot is ranked in the browser
// over the newest posts, so it fetches by date; Top fetches by score within the window.
export async function forumPosts({ board, sort = 'hot', topDays = 7, setSlug, limit = 100 } = {}) {
  let q = supa.from('cardhq_forum_posts').select(POST_COLS)
  if (board) q = q.eq('board', board)
  if (setSlug) q = q.eq('set_slug', setSlug)
  if (sort === 'top') {
    if (topDays) q = q.gte('created_at', new Date(Date.now() - topDays * 86400000).toISOString())
    q = q.order('score', { ascending: false }).order('created_at', { ascending: false })
  } else q = q.order('created_at', { ascending: false })
  const { data, error } = await q.limit(sort === 'hot' ? 200 : limit)
  if (error) return Object.assign([], { failed: true })
  return data || []
}
export async function forumPost(id) {
  const { data, error } = await supa.from('cardhq_forum_posts').select(POST_COLS).eq('id', id).maybeSingle()
  if (error) return { failed: true }
  return data   // null: deleted or never existed
}
// Posts made today per board (for the board directory).
export async function forumBoardStats() {
  const since = new Date(Date.now() - 86400000).toISOString()
  const { data, error } = await supa.from('cardhq_forum_posts').select('board, title, id, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(1000)
  if (error) return null
  const out = {}
  for (const r of data || []) { const b = out[r.board] || (out[r.board] = { today: 0, latest: null }); b.today++; if (!b.latest) b.latest = r }
  return out
}
export async function createPost(userId, post) { // {board, tag, title, body?, set_slug?, player?, card_section?, card_n?, image_urls?}
  return supa.from('cardhq_forum_posts').insert({ user_id: userId, ...post }).select('id').single()
}
export async function updatePost(id, fields) { return supa.from('cardhq_forum_posts').update(fields).eq('id', id) }   // RLS: own posts (admins: any)
export async function deletePost(postId) { return supa.from('cardhq_forum_posts').delete().eq('id', postId) }   // RLS: own posts (admins: any)
export async function myPostVotes(userId, postIds) {
  if (!userId || !postIds.length) return new Map()
  const { data } = await supa.from('cardhq_forum_votes').select('post_id, value').eq('user_id', userId).in('post_id', postIds.slice(0, 300))
  return new Map((data || []).map(r => [r.post_id, r.value]))
}
export async function votePost(postId, userId, value) {   // value: 1, -1, or 0 to clear
  if (!value) return supa.from('cardhq_forum_votes').delete().match({ post_id: postId, user_id: userId })
  return supa.from('cardhq_forum_votes').upsert({ post_id: postId, user_id: userId, value })
}
export async function comments(postId) {
  const { data, error } = await supa.from('cardhq_forum_comments')
    .select('id, post_id, parent_id, user_id, body, score, deleted, created_at, edited_at, profiles:cardhq_profiles(username)')
    .eq('post_id', postId).order('created_at').limit(2000)
  if (error) return Object.assign([], { failed: true })
  return data || []
}
export async function myCommentVotes(userId, commentIds) {
  if (!userId || !commentIds.length) return new Map()
  const out = new Map()
  for (let i = 0; i < commentIds.length; i += 300) {
    const { data } = await supa.from('cardhq_comment_votes').select('comment_id, value').eq('user_id', userId).in('comment_id', commentIds.slice(i, i + 300))
    for (const r of data || []) out.set(r.comment_id, r.value)
  }
  return out
}
export async function voteComment(commentId, userId, value) {
  if (!value) return supa.from('cardhq_comment_votes').delete().match({ comment_id: commentId, user_id: userId })
  return supa.from('cardhq_comment_votes').upsert({ comment_id: commentId, user_id: userId, value })
}
export async function addComment(postId, userId, body, parentId = null) {
  return supa.from('cardhq_forum_comments').insert({ post_id: postId, user_id: userId, body, parent_id: parentId }).select('id').single()
}
export async function editComment(id, body) { return supa.from('cardhq_forum_comments').update({ body }).eq('id', id) }
// A comment with replies is blanked (its replies stay); one without is removed.
export async function removeComment(id, hasReplies) {
  if (hasReplies) return supa.from('cardhq_forum_comments').update({ body: '[deleted]', deleted: true }).eq('id', id)
  return supa.from('cardhq_forum_comments').delete().eq('id', id)
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
