'use client'
// Supabase client for Checklist HQ community features (profiles, wantlists,
// collections, forum). The publishable key is designed to ship to browsers —
// row-level security policies guard every table.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://vnweopuivwnmtdkqhbse.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_VF3xtbiS94XJcrtvk6JsRQ_Gmx1vCFp'

export const supa = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// --- profile helpers ---
export async function getProfile(userId) {
  const { data } = await supa.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data
}
export async function ensureProfile(userId, username) {
  const { data, error } = await supa.from('profiles').upsert({ id: userId, username }, { onConflict: 'id' }).select().single()
  return { data, error }
}

// --- wantlist ---
export async function addWant(userId, item) { // {set_slug,set_name,card_n?,section?,player?}
  return supa.from('wantlist_items').insert({ user_id: userId, ...item })
}
export async function removeWant(id) { return supa.from('wantlist_items').delete().eq('id', id) }
export async function myWantlist(userId) {
  const { data } = await supa.from('wantlist_items').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  return data || []
}

// --- collection ---
export async function toggleCollected(userId, item, collected) { // item: {set_slug,card_n,section?,player?}
  if (collected) return supa.from('collection_items').insert({ user_id: userId, ...item })
  return supa.from('collection_items').delete().match({ user_id: userId, set_slug: item.set_slug, card_n: item.card_n })
}
export async function myCollection(userId, setSlug) {
  let q = supa.from('collection_items').select('*').eq('user_id', userId)
  if (setSlug) q = q.eq('set_slug', setSlug)
  const { data } = await q
  return data || []
}
export async function uploadCardImage(userId, file) {
  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const { error } = await supa.storage.from('card-images').upload(path, file)
  if (error) return { error }
  const { data } = supa.storage.from('card-images').getPublicUrl(path)
  return { url: data.publicUrl }
}
export async function setCollectionImage(id, url) {
  return supa.from('collection_items').update({ image_url: url }).eq('id', id)
}

// --- forum ---
export async function forumFeed() {
  const { data } = await supa.from('forum_posts')
    .select('*, profiles(username, avatar_url), forum_reactions(emoji), forum_comments(id)')
    .order('created_at', { ascending: false }).limit(50)
  return data || []
}
export async function createPost(userId, post) { // {title,body,set_slug?,achievement?,grail_tier?,image_urls?}
  return supa.from('forum_posts').insert({ user_id: userId, ...post }).select().single()
}
export async function react(postId, userId, emoji) {
  return supa.from('forum_reactions').upsert({ post_id: postId, user_id: userId, emoji })
}
export async function comments(postId) {
  const { data } = await supa.from('forum_comments').select('*, profiles(username)').eq('post_id', postId).order('created_at')
  return data || []
}
export async function addComment(postId, userId, body) {
  return supa.from('forum_comments').insert({ post_id: postId, user_id: userId, body })
}

// --- grail sets + admin notifications ---
export async function grailSets() {
  const { data } = await supa.from('grail_sets').select('*')
  return data || []
}
// Fires when a user reports completing a grail-tier set: notifies the site manager.
export async function notifyGrailCompletion(userId, username, setSlug, setName, tier) {
  return supa.from('admin_notifications').insert({
    kind: 'grail_completion',
    payload: { user_id: userId, username, set_slug: setSlug, set_name: setName, tier, at: new Date().toISOString() },
  })
}
