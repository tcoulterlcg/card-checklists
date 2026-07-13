// Comprehensive soccer + soccer-sticker backfill. The soccer hub only covers
// 2018-2024 and set slugs come in many suffixes (-soccer-cards, -stickers,
// -sticker-collection, World-Cup/Adrenalyn products), so we (a) capture ALL
// soccer-relevant slugs from every hub year, and (b) test candidate older
// (2014-2017) flagship soccer + World-Cup sticker sets that predate the hubs.
//   node scripts/soccer-full.mjs
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
  if (/^(cards?|hobby|jumbo|blaster|per\b|box|pack|case|of\b|odds|stickers?)/i.test(player)) return null
  const card = { n: m[1], p: player }; if (team) card.t = team; if (note) card.x = note; return card
}
function extractSections(html) {
  const start = html.indexOf('set-checklist'); if (start === -1) return []
  let block = html.slice(start); const end = block.search(/post_anchor_divs clearfix (?!set-checklist)/); if (end > 0) block = block.slice(0, end)
  const sections = []; let cur = null
  const parts = block.split(/<h[2345][^>]*>([\s\S]*?)<\/h[2345]>/i)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) { const ht = stripTags(parts[i]).trim(); if (/checklist/i.test(ht) && ht.length < 90) { const title = ht.replace(/\s*Set Checklist\s*$/i, '').replace(/\s*Checklist\s*$/i, '').trim(); if (/^\d{4}/.test(title) || title === '') { cur = null; continue } cur = { title, cards: [] }; sections.push(cur) } else cur = null; continue }
    if (!cur) continue
    for (const line of stripTags(parts[i]).split('\n')) { const card = parseLine(line); if (card) cur.cards.push(card) }
  }
  return sections.filter(s => s.cards.length > 0)
}

const SOCCER_RE = /soccer|world-cup|world cup|uefa|champions-league|premier-league|la-?liga|bundesliga|serie-a|\bmls\b|nwsl|adrenalyn|fifa|euro-20|obsidian|donruss|prizm|select|mosaic|chronicles|eminence|immaculate|national-treasures|panini-instant|topps-chrome|sticker/i

async function scrapeSlug(slug, year) {
  const r = await fetch(BASE + '/' + slug, { headers: HDRS }); if (!r.ok) return 0
  const html = await r.text(); const sections = extractSections(html); if (sections.length === 0) return 0
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const name = h1 ? stripTags(h1[1]).replace(/checklist.*$/i, '').replace(/, set.*$/i, '').trim() : slug
  const yr = year || parseInt((slug.match(/(19|20)\d\d/) || ['0'])[0]) || null
  writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year: yr, sport: 'Soccer', source: 'cardboardconnection.com', sections }))
  return sections.reduce((n, s) => n + s.cards.length, 0)
}

const have = new Set(readdirSync(dataDir))
const candidates = new Set()

// 1. Hub years 2018-2024: capture ALL soccer-relevant slugs (any suffix).
for (let y = 2016; y <= 2024; y++) {
  const r = await fetch(BASE + '/sports-cards-sets/soccer-card-sets/' + y + '-soccer-cards', { headers: HDRS })
  if (r.ok) { const t = await r.text(); for (const m of t.matchAll(/cardboardconnection\.com\/(\d{4}-[a-z0-9-]+)["']/g)) { const s = m[1]; if (SOCCER_RE.test(s)) candidates.add(s) } }
  await sleep(140)
}
// parent hub too
{ const r = await fetch(BASE + '/sports-cards-sets/soccer-card-sets', { headers: HDRS }); if (r.ok) { const t = await r.text(); for (const m of t.matchAll(/cardboardconnection\.com\/(\d{4}-[a-z0-9-]+)["']/g)) { if (SOCCER_RE.test(m[1])) candidates.add(m[1]) } } }

// 2. Candidate OLDER (2014-2017) soccer + World-Cup sticker sets predating the hubs.
const brands = ['panini-prizm', 'panini-select', 'panini-donruss', 'panini-obsidian', 'panini-mosaic', 'panini-chronicles', 'panini-immaculate', 'panini-national-treasures', 'panini-eminence', 'topps-chrome', 'topps-finest', 'panini-prizm-premier-league', 'panini-prizm-world-cup', 'panini-select-world-cup']
for (const y of [2014, 2015, 2016, 2017]) for (const b of brands) candidates.add(y + '-' + b + '-soccer-cards')
for (const y of [2014, 2015, 2016, 2018, 2019, 2020, 2021, 2022, 2023]) { candidates.add(y + '-panini-world-cup-stickers'); candidates.add(y + '-panini-sticker-collection-soccer'); candidates.add(y + '-topps-uefa-champions-league-stickers') }

console.log('soccer candidates:', candidates.size)
let ok = 0, cards = 0
for (const slug of candidates) {
  if (have.has(slug + '.json')) { continue }
  try { const c = await scrapeSlug(slug); if (c > 0) { ok++; cards += c; process.stdout.write('.') } } catch (e) { /* skip */ }
  await sleep(150)
}
console.log('\nsoccer-full ->', ok, 'new sets,', cards.toLocaleString(), 'cards')
