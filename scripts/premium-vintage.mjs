// Premium 2000s backfill. High-end lines (Ultimate Collection, Exquisite, SP
// Authentic, The Cup, National Treasures, …) predate CC's year-hubs and use
// varied slug suffixes (-baseball, -baseball-cards, -baseball-hobby). We test
// candidate brand×year×suffix combos and scrape the ones that parse, using the
// dual-format parser (modern set-checklist div OR older "Checklist" <h2>).
//   node scripts/premium-vintage.mjs
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
  if (/^(cards?|hobby|jumbo|blaster|per\b|box|pack|case|of\b|odds|shares?|tweet)/i.test(player)) return null
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

const PREMIUM = {
  Baseball: ['upper-deck-ultimate-collection', 'upper-deck-sp-authentic', 'upper-deck-spx', 'upper-deck-sweet-spot', 'upper-deck-sp-game-used', 'upper-deck-sp-legendary-cuts', 'upper-deck-premier', 'upper-deck-exquisite-collection', 'topps-finest', 'topps-triple-threads', 'topps-sterling', 'topps-co-signers', 'bowman-sterling', 'bowman-chrome', 'donruss-elite', 'playoff-prime-cuts', 'playoff-absolute-memorabilia', 'playoff-national-treasures', 'leaf-limited', 'leaf-certified-materials', 'fleer-showcase'],
  Football: ['upper-deck-exquisite-collection', 'upper-deck-ultimate-collection', 'upper-deck-sp-authentic', 'upper-deck-spx', 'upper-deck-sweet-spot', 'upper-deck-premier', 'topps-finest', 'topps-triple-threads', 'playoff-national-treasures', 'playoff-contenders', 'playoff-absolute-memorabilia', 'playoff-prime-signatures', 'donruss-elite', 'donruss-gridiron-gear', 'leaf-limited', 'leaf-certified-materials', 'bowman-sterling', 'bowman-chrome'],
  Basketball: ['upper-deck-exquisite-collection', 'upper-deck-ultimate-collection', 'upper-deck-sp-authentic', 'upper-deck-spx', 'topps-finest', 'topps-chrome', 'fleer-showcase', 'fleer-e-x', 'playoff-national-treasures', 'panini-national-treasures', 'panini-immaculate'],
  Hockey: ['upper-deck-the-cup', 'upper-deck-ultimate-collection', 'upper-deck-sp-authentic', 'upper-deck-spx', 'upper-deck-black-diamond', 'upper-deck-ice', 'upper-deck-trilogy', 'upper-deck-artifacts']
}
const SPORT_WORD = { Baseball: 'baseball', Football: 'football', Basketball: 'basketball', Hockey: 'hockey' }
const SEASON = { Baseball: false, Football: false, Basketball: true, Hockey: true }

function candidateSlugs(sport, brand) {
  const w = SPORT_WORD[sport]
  const out = []
  for (let y = 2000; y <= 2012; y++) {
    const yStr = SEASON[sport] ? (y + '-' + String((y + 1) % 100).padStart(2, '0')) : String(y)
    for (const suf of ['', '-cards', '-hobby']) out.push(yStr + '-' + brand + '-' + w + suf)
  }
  return out
}

const have = new Set(readdirSync(dataDir))
let ok = 0, cards = 0
for (const [sport, brands] of Object.entries(PREMIUM)) {
  for (const brand of brands) {
    for (const slug of candidateSlugs(sport, brand)) {
      if (have.has(slug + '.json')) { break } // year already captured for this brand
      try {
        const r = await fetch(BASE + '/' + slug, { headers: HDRS })
        if (r.ok) {
          const html = await r.text()
          const sections = extractSections(html)
          if (sections.length > 0) {
            const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
            const name = h1 ? stripTags(h1[1]).replace(/checklist.*$/i, '').replace(/, set.*$/i, '').trim() : slug
            const ym = slug.match(/^(\d{4})(?:-(\d\d))?/); const y = ym ? parseInt(ym[1]) + (ym[2] ? 1 : 0) : null
            writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year: y, sport, source: 'cardboardconnection.com', sections }))
            ok++; cards += sections.reduce((n, s) => n + s.cards.length, 0); process.stdout.write('.')
          }
        }
      } catch (e) { /* skip */ }
      await sleep(120)
    }
  }
}
console.log('\npremium-vintage ->', ok, 'sets,', cards.toLocaleString(), 'cards')
