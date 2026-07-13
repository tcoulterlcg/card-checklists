// Scrape cardboardconnection.com checklists straight into public/data/.
// Their archive-era set pages carry full card-by-card checklists inside
// <div class="... set-checklist ...">, sectioned by <h2-5> headings, with
// card lines like "1 Derek Jeter - New York Yankees" or "IP-5 Player, Team RC".
//
//   node scripts/scrape-cc.mjs baseball 2015
//   node scripts/scrape-cc.mjs football 2014
//   node scripts/scrape-cc.mjs basketball 2014-15
//   node scripts/scrape-cc.mjs hockey 2014-15
//
// Writes one JSON per set and rebuilds index.json (idempotent per set slug).
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'

// Each entry returns [hubPath, sportName, slugYear]. slugYear is how set slugs
// spell the year (may differ from the hub's year token — notably hockey, whose
// hub uses the full "2015-2016" season but whose set slugs use "2015-16").
function fullSeason(y) { // "2015-16" -> "2015-2016"
  const m = y.match(/^(\d{4})-(\d{2})$/)
  return m ? m[1] + '-' + m[1].slice(0, 2) + m[2] : y
}
const HUBS = {
  baseball: (y) => ['/sports-cards-sets/mlb-baseball-cards/' + y + '-baseball-cards', 'Baseball', y],
  football: (y) => ['/sports-cards-sets/nfl-football-cards/' + y + '-football-cards', 'Football', y],
  basketball: (y) => ['/sports-cards-sets/nba-basketball-cards/' + fullSeason(y) + '-basketball-cards', 'Basketball', y],
  hockey: (y) => ['/sports-cards-sets/nhl-hockey-cards/' + fullSeason(y) + '-hockey-cards', 'Hockey', y],
  soccer: (y) => ['/sports-cards-sets/soccer-cards/' + y + '-soccer-cards', 'Soccer', y],
}

const [, , sportArg, yearArg] = process.argv
if (!HUBS[sportArg] || !yearArg) {
  console.error('Usage: node scripts/scrape-cc.mjs <baseball|football|basketball|hockey|soccer> <year|2015-16>')
  process.exit(1)
}

const BASE = 'https://www.cardboardconnection.com'
const HDRS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9'
}

function decode(s) {
  return s
    .replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x[aA]0;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCharCode(parseInt(n, 16)))
    // Collapse horizontal whitespace only — newlines are the card-line
    // separators that stripTags relies on, so they must survive.
    .replace(/[ \t\f\v]+/g, ' ')
}

function stripTags(html) {
  // Break on table cells too — hockey (and some other) checklists lay cards
  // out in <td>/<th> cells rather than <p>/<div> lines.
  return decode(html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|td|th)>/gi, '\n').replace(/<[^>]+>/g, ''))
}

const LINE_RE = /^#?([A-Za-z]{0,6}-?\d+[A-Za-z]{0,2})\s+(.{2,90})$/
function parseLine(line) {
  const m = line.trim().match(LINE_RE)
  if (!m) return null
  let rest = m[2].trim(), note = ''
  const flag = rest.match(/\s+(RC|SP|SSP|AU|LL|WSH|BH|FS|CL|HL)\s*$/)
  if (flag) { note = flag[1]; rest = rest.slice(0, flag.index).trim() }
  let player = rest, team = ''
  let c = rest.match(/^(.*?),\s+(.+)$/) || rest.match(/^(.*?)\s+[-–—]\s+(.+)$/)
  if (c) { player = c[1].trim(); team = c[2].trim() }
  if (!player || player.length < 2) return null
  if (/^(cards?|hobby|jumbo|blaster|per\b|box|pack|case|of\b|odds)/i.test(player)) return null
  const card = { n: m[1], p: player }
  if (team) card.t = team
  if (note) card.x = note
  return card
}

function extractSections(html) {
  // Modern pages wrap the checklist in a `set-checklist` div; older (2000s)
  // pages just have a "Checklist" <h2> followed by ezcol/tablechecklist cards.
  let start = html.indexOf('set-checklist')
  if (start === -1) {
    const m = html.search(/<h2[^>]*>\s*(?:\d{4}[^<]*)?Checklist\s*<\/h2>/i)
    if (m === -1) return []
    start = m
  }
  let block = html.slice(start)
  const end = block.search(/post_anchor_divs clearfix (?!set-checklist)|>\s*(?:Product Review|User Reviews|Related Products)\b|id=["']comments["']/i)
  if (end > 0) block = block.slice(0, end)

  const sections = []
  let cur = null
  // Tokenize on headings; text between headings belongs to the open section.
  const parts = block.split(/<h[2345][^>]*>([\s\S]*?)<\/h[2345]>/i)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const ht = stripTags(parts[i]).trim()
      if (/checklist/i.test(ht) && ht.length < 90) {
        const title = ht.replace(/\s*Set Checklist\s*$/i, '').replace(/\s*Checklist\s*$/i, '').trim()
        if (/^\d{4}/.test(title) || title === '') { cur = null; continue }
        cur = { title, cards: [] }
        sections.push(cur)
      } else cur = null
      continue
    }
    if (!cur) continue
    for (const line of stripTags(parts[i]).split('\n')) {
      const card = parseLine(line)
      if (card) cur.cards.push(card)
    }
  }
  return sections.filter(s => s.cards.length > 0)
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const [hubPath, sportName, slugYear] = HUBS[sportArg](yearArg)
const yearNum = parseInt(yearArg.slice(0, 4)) + (yearArg.includes('-') ? 1 : 0)

const hubRes = await fetch(BASE + hubPath, { headers: HDRS })
if (!hubRes.ok) { console.error('hub fetch failed:', hubRes.status, hubPath); process.exit(1) }
const hubHtml = await hubRes.text()
// Broad capture: any set slug on the hub that starts with a year and contains
// the sport word — catches season ("2011-12-...") AND single-year ("2011-...")
// formats and every product/brand, not just the requested year prefix.
const linkRe = new RegExp('cardboardconnection\\.com/(\\d{4}(?:-\\d\\d)?-[a-z0-9-]*' + sportArg + '[a-z0-9-]*)["\\\']', 'g')
const slugs = [...new Set([...hubHtml.matchAll(linkRe)].map(m => m[1]))].filter(s => !/^sports-cards-sets/.test(s) && !/buying-guide$/.test(s))
console.log(sportName, yearArg, '-> hub lists', slugs.length, 'sets')

const dataDir = new URL('../public/data/', import.meta.url)
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

const existing = new Set(readdirSync(dataDir))
let ok = 0, empty = 0, skipped = 0
for (const slug of slugs) {
  if (existing.has(slug + '.json')) { skipped++; continue }
  try {
    const res = await fetch(BASE + '/' + slug, { headers: HDRS })
    if (!res.ok) { empty++; continue }
    const html = await res.text()
    const sections = extractSections(html)
    if (sections.length === 0) { empty++; continue }
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const name = h1 ? stripTags(h1[1]).replace(/checklist.*$/i, '').replace(/, set.*$/i, '').trim() : slug
    // Year from the slug itself (season "2011-12" -> 2012, single-year "2011" -> 2011).
    const ym = slug.match(/^(\d{4})(?:-(\d\d))?/)
    const y = ym ? (parseInt(ym[1]) + (ym[2] ? 1 : 0)) : yearNum
    writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({
      slug, name, year: y, sport: sportName, source: 'cardboardconnection.com', sections
    }))
    ok++
    process.stdout.write('.')
  } catch (e) { empty++ }
  await sleep(220)
}
console.log('\nscraped', ok, 'sets (', empty, 'without parseable checklists )')

// Rebuild index from disk.
const sets = []
for (const f of readdirSync(dataDir)) {
  if (!f.endsWith('.json') || f === 'index.json') continue
  try {
    const s = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))
    const cardCount = (s.sections || []).reduce((n, sec) => n + sec.cards.length, 0)
    sets.push({ slug: s.slug, name: s.name, year: s.year, sport: s.sport, cardCount, sections: (s.sections || []).length, source: s.source })
  } catch (e) { /* skip */ }
}
sets.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name))
writeFileSync(new URL('index.json', dataDir), JSON.stringify({ sets }))
console.log('index:', sets.length, 'sets,', sets.reduce((n, s) => n + s.cardCount, 0).toLocaleString(), 'cards total')
