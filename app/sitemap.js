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
  const addSet = (slug) => { if (!seen.has(slug)) { seen.add(slug); out.push({ url: BASE + '/?set=' + encodeURIComponent(slug), lastModified: now, changeFrequency: 'weekly', priority: 0.7 }) } }
  try {
    const idx = JSON.parse(readFileSync(join(process.cwd(), 'public/data/index.json'), 'utf8'))
    for (const s of idx.sets || []) addSet(s.slug)
  } catch {}
  const m = await getJson(RAW + 'manifest.json')
  const files = m?.visible?.file ? [m.visible.file] : Object.values(m?.sports || {}).map(s => s.file)
  const parts = await Promise.all(files.map(f => f && getJson(RAW + f)))
  for (const p of parts) for (const s of (p && p.sets) || []) if (!HIDDEN_SOURCES.has(s.source)) addSet(s.slug)
  try {
    const top = JSON.parse(readFileSync(join(process.cwd(), 'public/data/players/top.json'), 'utf8'))
    for (const p of (top.players || []).slice(0, 3000)) out.push({ url: BASE + '/?player=' + encodeURIComponent(p[0]), lastModified: now, changeFrequency: 'weekly', priority: 0.6 })
  } catch {}
  return out.slice(0, MAX)
}
