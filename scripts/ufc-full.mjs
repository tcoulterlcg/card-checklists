// Comprehensive UFC/MMA backfill. The original extra-scrape got only ~11 Panini
// sets because it used the set-checklist-only parser; Topps held the UFC license
// ~2009-2018 (and Topps/Fanatics produces it again now) and those older pages use
// the "Checklist" <h2> layout. We capture EVERY ufc/mma slug from the combat hub
// (no year hubs — the hub lists set pages directly) + candidate Topps rounds and
// recent years, and scrape with the dual-format parser.
//   node scripts/ufc-full.mjs
import { writeFileSync, readdirSync } from 'node:fs'

const BASE = 'https://www.cardboardconnection.com'
const HDRS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', accept: 'text/html' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)

function decode(s) { return s.replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x[aA]0;|&#160;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n))).replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/[ \t\f\v]+/g, ' ') }
function stripTags(h) { return decode(h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|td|th)>/gi, '\n').replace(/<[^>]+>/g, '')) }
const LINE_RE = /^#?([A-Za-z]{0,6}-?\d+[A-Za-z]{0,2})\s+(.{2,90})$/
function parseLine(line) {
  const m = line.trim().match(LINE_RE); if (!m) return null
  let rest = m[2].trim(), note = ''
  const flag = rest.match(/\s+(RC|SP|SSP|AU|LL|WSH|BH|FS|CL|HL)\s*$/); if (flag) { note = flag[1]; rest = rest.slice(0, flag.index).trim() }
  let player = rest, team = ''
  const c = rest.match(/^(.*?),\s+(.+)$/) || rest.match(/^(.*?)\s+[-–—]\s+(.+)$/); if (c) { player = c[1].trim(); team = c[2].trim() }
  if (!player || player.length < 2) return null
  if (/^(cards?|hobby|jumbo|blaster|per\b|box|pack|case|of\b|odds|shares?|tweet|weight)/i.test(player)) return null
  const card = { n: m[1], p: player }; if (team) card.t = team; if (note) card.x = note; return card
}
function extractSections(html) {
  let start = html.indexOf('set-checklist')
  if (start === -1) { const m = html.search(/<h2[^>]*>\s*(?:\d{4}[^<]*)?Checklist\s*<\/h2>/i); if (m === -1) return []; start = m }
  let block = html.slice(start); const end = block.search(/post_anchor_divs clearfix (?!set-checklist)|>\s*(?:Product Review|User Reviews|Related Products)\b|id=["']comments["']/i); if (end > 0) block = block.slice(0, end)
  const sections = []; let cur = null; const parts = block.split(/<h[2345][^>]*>([\s\S]*?)<\/h[2345]>/i)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { const ht = stripTags(parts[i]).trim(); if (/checklist/i.test(ht) && ht.length < 90) { const title = ht.replace(/\s*Set Checklist\s*$/i, '').replace(/\s*Checklist\s*$/i, '').trim(); if (/^\d{4}/.test(title) || title === '') { cur = null; continue } cur = { title, cards: [] }; sections.push(cur) } else cur = null; continue }
    if (!cur) continue
    for (const line of stripTags(parts[i]).split('\n')) { const card = parseLine(line); if (card) cur.cards.push(card) }
  }
  return sections.filter(s => s.cards.length > 0)
}

async function scrapeSlug(slug) {
  const r = await fetch(BASE + '/' + slug, { headers: HDRS }); if (!r.ok) return 0
  const html = await r.text(); const sections = extractSections(html); if (sections.length === 0) return 0
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const name = h1 ? stripTags(h1[1]).replace(/checklist.*$/i, '').replace(/, set.*$/i, '').trim() : slug
  const ym = slug.match(/^(\d{4})/); const year = ym ? parseInt(ym[1]) : null
  writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year, sport: 'UFC', source: 'cardboardconnection.com', sections }))
  return sections.reduce((n, s) => n + s.cards.length, 0)
}

const have = new Set(readdirSync(dataDir))
const candidates = new Set()

// 1. The combat hub lists set pages directly — capture EVERY ufc/mma slug.
for (const h of ['/sports-cards-sets/other-sets/ufc-card', '/sports-cards-sets/other-sets/mma-card']) {
  const r = await fetch(BASE + h, { headers: HDRS })
  if (r.ok) { const t = await r.text(); for (const m of t.matchAll(/cardboardconnection\.com\/(\d{4}-[a-z0-9-]+)["']/gi)) { if (/ufc|mma/i.test(m[1]) && !/buying-guide$/.test(m[1])) candidates.add(m[1]) } }
  await sleep(150)
}
// 2. Candidate Topps UFC that predate/postdate the hub listing.
for (const y of [2009, 2010]) for (const p of ['topps-ufc-round-1', 'topps-ufc-round-2', 'topps-ufc-round-3', 'topps-ufc-round-4', 'topps-ufc-series-1', 'topps-ufc-series-2', 'topps-ufc-series-3', 'topps-ufc-series-4', 'topps-ufc-main-event']) candidates.add(y + '-' + p)
// 3. Recent Topps + Panini (Topps/Fanatics makes UFC again now).
for (const y of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) for (const p of ['topps-ufc', 'topps-ufc-chrome', 'topps-chrome-ufc', 'topps-ufc-knockout', 'topps-ufc-museum-collection', 'topps-finest-ufc', 'topps-ufc-flagship', 'panini-prizm-ufc', 'panini-select-ufc', 'panini-donruss-ufc', 'panini-chronicles-ufc', 'panini-immaculate-ufc', 'panini-instant-ufc']) candidates.add(y + '-' + p)

console.log('UFC candidates:', candidates.size)
let ok = 0, cards = 0
for (const slug of candidates) {
  if (have.has(slug + '.json')) continue
  try { const c = await scrapeSlug(slug); if (c > 0) { ok++; cards += c; process.stdout.write('.') } } catch (e) { /* skip */ }
  await sleep(180)
}
console.log('\nufc-full ->', ok, 'new sets,', cards.toLocaleString(), 'cards')
