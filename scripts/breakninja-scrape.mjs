// Break Ninja scraper — closes the current-year gap (2024-2026) CC can't fill,
// with parallel-level detail. Structure: sport index pages list product pages
// (recent years directly; older years via per-year index pages); each product
// page links ~30 per-team pages whose table rows are
// [Player, Number, Card Set, Copies] — i.e. every card of every parallel with
// print run. We group rows by "Card Set" into sections and store print runs
// <= 2500 as serial flags ("/99") for the RPA tracker.
//
//   node scripts/breakninja-scrape.mjs <sport> [minYear] [maxYear]
//   sports: baseball basketball football hockey soccer ufc wrestling multisport
import { writeFileSync, readdirSync } from 'node:fs'

const BASE = 'https://www.breakninja.com'
const HDRS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', accept: 'text/html' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)

const INDEX = {
  baseball: ['/baseball_box_break_group_checklists.html', 'Baseball'],
  basketball: ['/basketball_box_break_group_checklists.html', 'Basketball'],
  football: ['/football_box_break_group_checklists.html', 'Football'],
  hockey: ['/hockey_box_break_group_checklists.html', 'Hockey'],
  soccer: ['/soccer-box-break-group-checklists.html', 'Soccer'],
  ufc: ['/UFC-Checklists.html', 'UFC'],
  wrestling: ['/Wrestling-Trading-Card-Checklists.php', 'Wrestling'],
  multisport: ['/Multiple-Sport-Checklists.html', 'Multi-Sport'],
}

const [, , sportArg, minYearArg, maxYearArg] = process.argv
if (!INDEX[sportArg]) { console.error('Usage: node scripts/breakninja-scrape.mjs <' + Object.keys(INDEX).join('|') + '> [minYear] [maxYear]'); process.exit(1) }
const [indexPath, sportName] = INDEX[sportArg]
const minYear = parseInt(minYearArg || '2024')
const maxYear = parseInt(maxYearArg || '2026')

function dec(s) { return s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;|&#8217;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)) }
async function get(url) { const r = await fetch(url, { headers: HDRS }); if (!r.ok) return null; return await r.text() }

// A product page's year: "2026-..." => 2026, "25-26-..." => 2026 season end.
function slugYear(file) {
  let m = file.match(/^(\d{2})-(\d{2})-/); if (m) return 2000 + parseInt(m[2])
  m = file.match(/^(20\d\d)/); return m ? parseInt(m[1]) : null
}

// 1. Collect product links from the sport index (+ per-year indexes).
const productUrls = new Set()
function harvest(html) {
  if (!html) return
  for (const m of html.matchAll(/href=["']([^"']*\/(?:[a-z]+cards?|baseball|basketball|football|hockey|soccer|ufc|wrestling|multisport)\/[^"']*Checklist[^"']*\.php[^"']*)["']/gi)) {
    let u = m[1].split('?')[0]
    if (!u.startsWith('http')) u = BASE + (u.startsWith('/') ? '' : '/') + u
    if (/-Checklist(-[A-Za-z-]+)?\.php$/.test(u) && !/Checklist-[A-Za-z-]+\.php$/.test(u)) productUrls.add(u) // product pages only (team pages excluded)
  }
}
const idx = await get(BASE + indexPath)
harvest(idx)
// per-year index pages like /2023-Baseball-Card-Product-Checklists.php
if (idx) {
  for (const m of idx.matchAll(/href=["']([^"']*20\d\d[^"']*Product-Checklists\.php)["']/g)) {
    const y = parseInt((m[1].match(/(20\d\d)/) || [])[1])
    if (y >= minYear && y <= maxYear) { harvest(await get(m[1].startsWith('http') ? m[1] : BASE + '/' + m[1].replace(/^\//, ''))); await sleep(150) }
  }
}
const products = [...productUrls]
  .map(u => ({ url: u, file: u.split('/').pop().replace('.php', ''), year: slugYear(u.split('/').pop()) }))
  .filter(p => p.year && p.year >= minYear && p.year <= maxYear)
console.log(sportName, `-> ${products.length} products in ${minYear}-${maxYear}`)

// 2. Scrape each product via its team drill-down pages.
const have = new Set(readdirSync(dataDir))
let done = 0, totalCards = 0
for (const prod of products) {
  const slug = prod.file.toLowerCase().replace(/-checklist$/, '')
  if (have.has(slug + '.json')) { continue }
  try {
    const html = await get(prod.url)
    if (!html) continue
    // team pages share the product filename prefix + "-TeamName.php"
    const prefix = prod.file
    const teamUrls = [...new Set([...html.matchAll(new RegExp('href=["\']([^"\']*' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-[A-Za-z0-9-]+\\.php)["\']', 'g'))].map(m => m[1]))]
      .map(u => (u.startsWith('http') ? u : BASE + (u.startsWith('/') ? '' : '/') + u))
    if (teamUrls.length === 0) continue
    const sections = new Map()
    for (const tu of teamUrls) {
      const th = await get(tu)
      if (!th) { await sleep(120); continue }
      const team = dec(tu.split('/').pop().replace('.php', '').slice(prefix.length + 1).replace(/-/g, ' '))
      for (const tb of th.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
        const rows = [...tb[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x => dec(x[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()))
        if (!rows.length || rows[0][0] !== 'Player') continue
        for (const r of rows.slice(1)) {
          if (r.length < 3 || !r[0]) continue
          const [player, num, setName, copies] = r
          const title = setName || 'Base'
          let sec = sections.get(title)
          if (!sec) { sec = { title, cards: [] }; sections.set(title, sec) }
          const card = { n: num || '', p: player, t: team }
          const cp = parseInt(copies)
          if (cp > 0 && cp <= 2500) card.x = '/' + cp
          sec.cards.push(card)
        }
      }
      await sleep(120)
    }
    const secs = [...sections.values()].filter(s => s.cards.length > 0)
    if (!secs.length) continue
    const name = dec(prod.file.replace(/-/g, ' ').replace(/ Checklist$/, ''))
    writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year: prod.year, sport: sportName, source: 'breakninja.com', sections: secs }))
    done++; totalCards += secs.reduce((n, s) => n + s.cards.length, 0)
    process.stdout.write('.')
  } catch (e) { /* skip product */ }
  await sleep(200)
}
console.log(`\nbreakninja ${sportArg} -> ${done} sets, ${totalCards.toLocaleString()} cards`)
