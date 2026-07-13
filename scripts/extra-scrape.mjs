// Scrape the CC categories that don't follow the standard year-hub pattern:
// Soccer (hub /soccer-card-sets/<year>-soccer-cards) and the combat sports
// UFC + Boxing (their /other-sets/ hubs list set pages directly).
//   node scripts/extra-scrape.mjs
import { writeFileSync, readdirSync } from 'node:fs'

const BASE = 'https://www.cardboardconnection.com'
const HDRS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', accept: 'text/html' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)

function decode(s) {
  return s.replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x[aA]0;|&#160;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n))).replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16))).replace(/[ \t\f\v]+/g, ' ')
}
function stripTags(html) { return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|td|th)>/gi, '\n').replace(/<[^>]+>/g, '')) }
const LINE_RE = /^#?([A-Za-z]{0,6}-?\d+[A-Za-z]{0,2})\s+(.{2,90})$/
function parseLine(line) {
  const m = line.trim().match(LINE_RE); if (!m) return null
  let rest = m[2].trim(), note = ''
  const flag = rest.match(/\s+(RC|SP|SSP|AU|LL|WSH|BH|FS|CL|HL)\s*$/); if (flag) { note = flag[1]; rest = rest.slice(0, flag.index).trim() }
  let player = rest, team = ''
  const c = rest.match(/^(.*?),\s+(.+)$/) || rest.match(/^(.*?)\s+[-–—]\s+(.+)$/); if (c) { player = c[1].trim(); team = c[2].trim() }
  if (!player || player.length < 2) return null
  if (/^(cards?|hobby|jumbo|blaster|per\b|box|pack|case|of\b|odds)/i.test(player)) return null
  const card = { n: m[1], p: player }; if (team) card.t = team; if (note) card.x = note; return card
}
function extractSections(html) {
  const start = html.indexOf('set-checklist'); if (start === -1) return []
  let block = html.slice(start); const end = block.search(/post_anchor_divs clearfix (?!set-checklist)/); if (end > 0) block = block.slice(0, end)
  const sections = []; let cur = null
  const parts = block.split(/<h[2345][^>]*>([\s\S]*?)<\/h[2345]>/i)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const ht = stripTags(parts[i]).trim()
      if (/checklist/i.test(ht) && ht.length < 90) {
        const title = ht.replace(/\s*Set Checklist\s*$/i, '').replace(/\s*Checklist\s*$/i, '').trim()
        if (/^\d{4}/.test(title) || title === '') { cur = null; continue }
        cur = { title, cards: [] }; sections.push(cur)
      } else cur = null
      continue
    }
    if (!cur) continue
    for (const line of stripTags(parts[i]).split('\n')) { const card = parseLine(line); if (card) cur.cards.push(card) }
  }
  return sections.filter(s => s.cards.length > 0)
}

async function scrapeSlug(slug, sport, year) {
  const r = await fetch(BASE + '/' + slug, { headers: HDRS })
  if (!r.ok) return 0
  const html = await r.text()
  const sections = extractSections(html)
  if (sections.length === 0) return 0
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const name = h1 ? stripTags(h1[1]).replace(/checklist.*$/i, '').replace(/, set.*$/i, '').trim() : slug
  const yr = year || parseInt((slug.match(/(19|20)\d\d/) || ['0'])[0]) || null
  writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year: yr, sport, source: 'cardboardconnection.com', sections }))
  return sections.reduce((n, s) => n + s.cards.length, 0)
}

async function slugsFrom(url, re) {
  const r = await fetch(url, { headers: HDRS }); if (!r.ok) return []
  const t = await r.text()
  return [...new Set([...t.matchAll(re)].map(m => m[1]))]
}

const have = new Set(readdirSync(dataDir))
let totalSets = 0, totalCards = 0
async function run(slugs, sport) {
  for (const slug of slugs) {
    if (have.has(slug + '.json')) { continue }
    const c = await scrapeSlug(slug, sport)
    if (c > 0) { totalSets++; totalCards += c; process.stdout.write('.') }
    await sleep(160)
  }
}

// Soccer — year hubs under soccer-card-sets
let soccer = []
for (let y = 2013; y <= 2024; y++) {
  soccer.push(...await slugsFrom(BASE + '/sports-cards-sets/soccer-card-sets/' + y + '-soccer-cards', /cardboardconnection\.com\/(\d{4}-[a-z0-9-]+-soccer-cards)["']/g))
  await sleep(150)
}
soccer = [...new Set(soccer)]
console.log('soccer slugs:', soccer.length)
await run(soccer, 'Soccer')

// UFC + Boxing — direct set listings on their /other-sets/ hubs
const ufc = await slugsFrom(BASE + '/sports-cards-sets/other-sets/ufc-card', /cardboardconnection\.com\/([a-z0-9-]*ufc-cards)["']/g)
console.log('ufc slugs:', ufc.length)
await run(ufc, 'UFC')
const boxing = await slugsFrom(BASE + '/sports-cards-sets/other-sets/boxing-card-sets', /cardboardconnection\.com\/([a-z0-9-]*boxing-cards)["']/g)
console.log('boxing slugs:', boxing.length)
await run(boxing, 'Boxing')

console.log('\nextra-scrape ->', totalSets, 'sets,', totalCards.toLocaleString(), 'cards (soccer + UFC + boxing)')
