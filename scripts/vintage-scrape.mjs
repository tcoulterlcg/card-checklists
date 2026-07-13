// Vintage backfill: CC has flagship pre-2013 set pages but no year-hub
// discovery for them, so we generate candidate flagship slugs (by brand era)
// plus the marquee pre-war tobacco/gum sets, test each, and scrape the ones
// that carry a checklist. Reuses the proven parser (copied to stay isolated
// from the live hub scraper).
//   node scripts/vintage-scrape.mjs
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'

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

// ---- candidate flagship slugs by brand era ----
function range(a, b) { const o = []; for (let y = a; y <= b; y++) o.push(y); return o }
const ERAS = {
  Baseball: [
    ['topps', range(1951, 2012)], ['topps-traded', range(1974, 2008)], ['bowman', range(1948, 1955).concat(range(1989, 2012))],
    ['bowman-chrome', range(1997, 2012)], ['fleer', range(1959, 1963).concat(range(1981, 2007))], ['donruss', range(1981, 2005)],
    ['upper-deck', range(1989, 2012)], ['score', range(1988, 2012)], ['leaf', range(1990, 2012)], ['stadium-club', range(1991, 2012)],
    ['goudey', [1933, 1934, 1935, 1936, 1938, 1939, 1941]], ['play-ball', [1939, 1940, 1941]]
  ],
  Football: [['topps', range(1955, 2012)], ['bowman', range(1948, 1955).concat(range(2004, 2012))], ['fleer', range(1960, 1963).concat(range(1990, 2007))], ['score', range(1989, 2012)], ['upper-deck', range(1991, 2012)], ['donruss', range(1991, 2012)]],
  Basketball: [['topps', range(1957, 2012)], ['fleer', range(1986, 1996)], ['hoops', range(1989, 2012)], ['upper-deck', range(1991, 2012)], ['skybox', range(1990, 1999)]],
  Hockey: [['topps', range(1954, 2012)], ['o-pee-chee', range(1968, 2012)], ['parkhurst', range(1951, 1964).concat(range(1991, 2012))], ['upper-deck', range(1990, 2012)]]
}
const SPECIALS = { Baseball: ['t206-white-border', 't205-gold-border', 't207-brown-background', '1911-t205-gold-border', '1914-cracker-jack', '1915-cracker-jack', '1948-leaf', '1949-leaf'] }

const candidates = []
for (const [sport, brands] of Object.entries(ERAS)) {
  const suf = sport.toLowerCase().replace('baseball', 'baseball') // sport slug word
  const word = { Baseball: 'baseball', Football: 'football', Basketball: 'basketball', Hockey: 'hockey' }[sport]
  for (const [brand, years] of brands) for (const y of years) candidates.push([y + '-' + brand + '-' + word + '-cards', sport, y])
}
for (const [sport, slugs] of Object.entries(SPECIALS)) for (const s of slugs) candidates.push([s, sport, parseInt((s.match(/(19|20)\d\d/) || ['1909'])[0]) || 1909])

console.log('vintage candidates:', candidates.length)
const have = new Set(readdirSync(dataDir))
let ok = 0, cards = 0
for (const [slug, sport, year] of candidates) {
  if (have.has(slug + '.json')) { ok++; continue }
  try {
    const r = await fetch(BASE + '/' + slug, { headers: HDRS })
    if (r.ok) {
      const html = await r.text()
      const sections = extractSections(html)
      if (sections.length > 0) {
        const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
        const name = h1 ? stripTags(h1[1]).replace(/checklist.*$/i, '').replace(/, set.*$/i, '').trim() : slug
        writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year, sport, source: 'cardboardconnection.com', sections }))
        ok++; cards += sections.reduce((n, s) => n + s.cards.length, 0)
        process.stdout.write('.')
      }
    }
  } catch (e) { /* skip */ }
  await sleep(140)
}
console.log('\nvintage-scrape ->', ok, 'sets present,', cards.toLocaleString(), 'new cards')
