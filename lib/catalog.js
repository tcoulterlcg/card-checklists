// Set data comes from two places:
//   1. public/data (static files deployed with the site) — curated sets
//   2. the bulk catalog on the repo's `catalog` branch (TCDB imports), served
//      free through raw.githubusercontent.com (manifest + indexes, ~5 min fresh)
//      and the jsDelivr CDN (set files). It never touches the Vercel deploy.
import { correctionsFor, applyCorrections } from './corrections.js'
import { fixFlagTail } from './flag-tail.js'

const REPO = 'tcoulterlcg/card-checklists'
const RAW = 'https://raw.githubusercontent.com/' + REPO + '/catalog/'
const CDN = 'https://cdn.jsdelivr.net/gh/' + REPO + '@catalog/'

// Sources kept out of the site. SportsCardsPro entries are price-guide pages —
// only cards that have sold — not checklists, and the site doesn't show sets
// with holes. They stay in the catalog until a full checklist replaces them
// (catalog-build keeps whichever copy of a product has more cards), and that
// full set shows up on its own. lib/meta.js reads this too.
export const HIDDEN_SOURCES = new Set(['sportscardspro.com'])
export const isHidden = (s) => !!s && HIDDEN_SOURCES.has(s.source)

// Must match fnv() in scripts/catalog-build.mjs.
export const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
export const setPath = (slug) => 'sets/' + (fnv(slug) & 0xff).toString(16).padStart(2, '0') + '/' + slug + '.json'

// Static sets file a season ("2005-06") under its end year; the catalog build
// used the first year. Normalize so year filters and sorting agree site-wide.
// A span of several years ("1996-17 BBM Sports Card Magazine", "1982-92 Nike Poster Cards") is a
// long-running issue, not a season: it keeps its first year, and player pages don't take a first
// card or a first year from it.
const SEASON = /^(\d{4})-(\d{2}|\d{4})\b/
export function yearSpan(name) {
  const m = SEASON.exec(name || ''); if (!m) return 0
  const a = +m[1]; let b = m[2].length === 2 ? Math.floor(a / 100) * 100 + +m[2] : +m[2]
  if (b < a) b += 100
  return b - a
}
export const isMultiYear = (name) => yearSpan(name) > 2   // "1909-11 T206" is still one issue's run; "1996-99" isn't
export function fixSeasonYear(s) {
  if (s && s.name && /\s{2}/.test(s.name)) s.name = s.name.replace(/\s+/g, ' ').trim()   // catalog names sometimes carry double spaces
  const m = s && SEASON.exec(s.name || '')
  if (m && s.year === +m[1] && yearSpan(s.name) === 1) s.year = +m[1] + 1
  return s
}

// Break Ninja lists sections in scrape order (a relic insert can come before Base).
// Show Base first, then its parallels, then everything else A–Z so families sit together.
const BASE_RANK = (t) => (/^base( set| cards?)?$/i.test(t) ? 0 : /^base\b/i.test(t) ? 1 : 2)
export function orderSections(set) {
  if (Array.isArray(set.sections)) set.sections = set.sections.slice().sort((a, b) =>
    BASE_RANK(a.title || '') - BASE_RANK(b.title || '') || String(a.title || '').localeCompare(String(b.title || ''), 'en', { numeric: true, sensitivity: 'base' }))
  return set
}

// Section titles shift when a checklist is re-imported or tidied ("Base" / "Base Set", letter case,
// "2021-22 Panini Prizm Premier League – Signatures Set" -> "Signatures"). Saved wantlist and
// collection rows compare this key, so they keep their check marks after data updates.
export const sectionKey = (t) => String(t || '').toLowerCase().replace(/^\d{4}(?:-\d{2,4})?\s.+?\s+[–—]\s+/, '').replace(/(\s+(set|cards?|checklist))+$/, '').replace(/[^a-z0-9/]+/g, ' ').trim()

const getJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null } }

// Renamed/merged set slugs (old -> new); fetched once per visit.
let redirectsPromise = null
export function loadRedirects() {
  if (!redirectsPromise) redirectsPromise = getJson('/data/redirects.json').then(r => { if (!r) redirectsPromise = null; return r || {} })
  return redirectsPromise
}

let manifestPromise = null
export function loadCatalogManifest() {
  // a failed fetch isn't cached for the whole visit: the next call tries GitHub again
  if (!manifestPromise) manifestPromise = getJson(RAW + 'manifest.json').then(m => { if (!m) manifestPromise = null; return m || { sports: {} } })
  return manifestPromise
}

// Load one set's checklist: static file first, then the bulk catalog.
// Admin-approved fixes (lib/corrections.js) are applied on top, so they show
// right away instead of waiting for the next deploy.
export async function loadSet(slug) {
  const fixes = correctionsFor(slug)
  let local = await getJson('/data/' + slug + '.json')
  // a hidden (incomplete) static file doesn't shadow a full catalog set with the same slug
  if (local && (local.incomplete || !(local.sections || []).some(x => x.cards?.length))) {
    const cat = (await getJson(CDN + setPath(slug))) || (await getJson(RAW + setPath(slug)))
    if (cat && !isHidden(cat)) local = null
  }
  const set = local || (await getJson(CDN + setPath(slug))) || (await getJson(RAW + setPath(slug)))
  if (!set || (!local && isHidden(set))) return null
  if (!local) {
    fixSeasonYear(set)
    for (const sec of set.sections || []) for (const c of sec.cards || []) fixFlagTail(c)   // catalog names can carry TCDB flags ("… MEM, SN25")
    // TCDB sometimes lists one parallel twice: drop the exact repeat (two sections with one title
    // would also share collection check marks)
    const seen = new Set()
    if (Array.isArray(set.sections)) set.sections = set.sections.filter(sec => { const k = sec.title + '\u0000' + JSON.stringify(sec.cards); if (seen.has(k)) return false; seen.add(k); return true })
  }
  if (set.source === 'breakninja.com') orderSections(set)
  return applyCorrections(set, await fixes)
}

// Static index + every catalog sport index; static wins on slug collisions.
// onStatic(base) fires as soon as the static index is in, so a slow GitHub never holds up the page.
export async function loadIndex(onStatic) {
  const staticP = getJson('/data/index.json').then(a => { const base = (a && a.sets) || []; if (onStatic && base.length) onStatic(base); return base })
  const [base, m] = await Promise.all([staticP, loadCatalogManifest()])
  // visible.json holds only the sets the site shows (~1/20th of the per-sport indexes)
  const files = m.visible && m.visible.file ? [m.visible.file] : Object.values(m.sports || {}).map(s => s.file).filter(Boolean)
  const parts = await Promise.all(files.map(f => getJson(RAW + f)))
  const have = new Set(base.map(s => s.slug))
  const extra = []
  for (const p of parts) for (const s of (p && p.sets) || []) if (!have.has(s.slug) && !isHidden(s)) { have.add(s.slug); extra.push(fixSeasonYear(s)) }
  return base.concat(extra)
}
