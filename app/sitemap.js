// /sitemap.xml — every set page plus the most-carded players, built from the
// static index at build time so search engines can find deep pages.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'https://cardhq.vercel.app'

export default function sitemap() {
  const out = [{ url: BASE + '/', changeFrequency: 'daily', priority: 1 }]
  try {
    const idx = JSON.parse(readFileSync(join(process.cwd(), 'public/data/index.json'), 'utf8'))
    for (const s of idx.sets || []) out.push({ url: BASE + '/?set=' + encodeURIComponent(s.slug), changeFrequency: 'weekly', priority: 0.7 })
  } catch {}
  try {
    const top = JSON.parse(readFileSync(join(process.cwd(), 'public/data/players/top.json'), 'utf8'))
    for (const p of (top.players || []).slice(0, 3000)) out.push({ url: BASE + '/?player=' + encodeURIComponent(p[0]), changeFrequency: 'weekly', priority: 0.6 })
  } catch {}
  return out
}
