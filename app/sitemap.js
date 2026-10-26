// /sitemap.xml — every set page (static + bulk catalog) plus the most-carded
// players, so search engines can find deep pages. Rebuilt hourly.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HIDDEN_SOURCES } from '../lib/catalog'

const BASE = 'https://cardhq.vercel.app'
const RAW = 'https://raw.githubusercontent.com/tcoulterlcg/card-checklists/catalog/'
const MAX = 50000   // one sitemap file's URL limit; split with generateSitemaps before this is reached
export const revalidate = 3600

const getJson = async (url) => { try { const r = await fetch(url, { next: { revalidate: 3600 } }); return r.ok ? await r.json() : null } catch { return null } }

export default async function sitemap() {
  const now = new Date()
  const out = [{ url: BASE + '/', lastModified: now, changeFrequency: 'daily', priority: 1 }]
  const seen = new Set()
  const addSet = (slug) => { if (!seen.has(slug)) { seen.add(slug); out.push({ url: BASE + '/?set=' + encodeURIComponent(slug), changeFrequency: 'weekly', priority: 0.7 }) } }
  // public/ may not be bundled with the function on an hourly revalidation: fall back to the deployed copy
  const local = (p) => { try { return JSON.parse(readFileSync(join(process.cwd(), 'public', p), 'utf8')) } catch { return null } }
  const idx = local('data/index.json') || await getJson(BASE + '/data/index.json')
  for (const s of idx?.sets || []) addSet(s.slug)
  const m = await getJson(RAW + 'manifest.json')
  const files = m?.visible?.file ? [m.visible.file] : Object.values(m?.sports || {}).map(s => s.file)
  const parts = await Promise.all(files.map(f => f && getJson(RAW + f)))
  for (const p of parts) for (const s of (p && p.sets) || []) if (!HIDDEN_SOURCES.has(s.source)) addSet(s.slug)
  const top = local('data/players/top.json') || await getJson(BASE + '/data/players/top.json')
  if (top) {
    const list = (top.players || []).slice(0, 3000)
    const dup = new Map(); for (const p of list) dup.set(p[0], (dup.get(p[0]) || 0) + 1)
    // two players with one name (Will Smith, baseball and football): the sport tells their pages apart
    for (const p of list) out.push({ url: BASE + '/?player=' + encodeURIComponent(p[0]) + (dup.get(p[0]) > 1 && top.sports?.[p[3]] ? '&sport=' + encodeURIComponent(top.sports[p[3]]) : ''), changeFrequency: 'weekly', priority: 0.6 })
  }
  return out.slice(0, MAX)
}
