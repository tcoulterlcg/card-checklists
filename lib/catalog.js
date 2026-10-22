// Set data comes from two places:
//   1. public/data (static files deployed with the site) — curated sets
//   2. the bulk catalog on the repo's `catalog` branch (TCDB imports), served
//      free through raw.githubusercontent.com (manifest + indexes, ~5 min fresh)
//      and the jsDelivr CDN (set files). It never touches the Vercel deploy.
const REPO = 'tcoulterlcg/card-checklists'
const RAW = 'https://raw.githubusercontent.com/' + REPO + '/catalog/'
const CDN = 'https://cdn.jsdelivr.net/gh/' + REPO + '@catalog/'

// Must match fnv() in scripts/catalog-build.mjs.
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
const setPath = (slug) => 'sets/' + (fnv(slug) & 0xff).toString(16).padStart(2, '0') + '/' + slug + '.json'

const getJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null } }

let manifestPromise = null
export function loadCatalogManifest() {
  if (!manifestPromise) manifestPromise = getJson(RAW + 'manifest.json').then(m => m || { sports: {} })
  return manifestPromise
}

// Load one set's checklist: static file first, then the bulk catalog.
export async function loadSet(slug) {
  const local = await getJson('/data/' + slug + '.json')
  if (local) return local
  return (await getJson(CDN + setPath(slug))) || (await getJson(RAW + setPath(slug)))
}

// Static index + every catalog sport index; static wins on slug collisions.
export async function loadIndex() {
  const [a, m] = await Promise.all([getJson('/data/index.json'), loadCatalogManifest()])
  const base = (a && a.sets) || []
  const files = Object.values(m.sports || {}).map(s => s.file).filter(Boolean)
  const parts = await Promise.all(files.map(f => getJson(RAW + f)))
  const have = new Set(base.map(s => s.slug))
  const extra = []
  for (const p of parts) for (const s of (p && p.sets) || []) if (!have.has(s.slug)) { have.add(s.slug); extra.push(s) }
  return base.concat(extra)
}
