// checklistcenter.com bulk import via its WordPress REST API (wp-json) —
// ~3,568 checklist posts across every sport incl. 2024-2026 (the CC gap),
// plus Boxing/F1/Cricket/Golf/Tennis/Wrestling/Entertainment. Post bodies use
// CC-style card lines ("1 Player – Team") sectioned by h2-h4 headings, so the
// proven CC line parser applies. Fuzzy-dedupes against every source already on
// disk (slug normalized of -cards/-checklist suffixes).
//
//   node scripts/checklistcenter-scrape.mjs [maxPages]   (50 posts/page)
import { writeFileSync, readdirSync } from 'node:fs'

const API = 'https://www.checklistcenter.com/wp-json/wp/v2'
const HDRS = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', accept: 'application/json' }
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const dataDir = new URL('../public/data/', import.meta.url)
const maxPages = parseInt(process.argv[2] || '999')

function decode(s) { return s.replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&amp;/g, '&').replace(/&quot;|&#8221;|&#8220;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/[ \t\f\v]+/g, ' ') }
function stripTags(h) { return decode(h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|td|th)>/gi, '\n').replace(/<[^>]+>/g, '')) }
const LINE_RE = /^#?([A-Za-z]{0,6}-?\d+[A-Za-z]{0,2})\s+(.{2,90})$/
function parseLine(line) {
  const m = line.trim().match(LINE_RE); if (!m) return null
  let rest = m[2].trim(), note = ''
  const flag = rest.match(/\s+(RC|SP|SSP|AU|LL|WSH|BH|FS|CL|HL)\s*$/); if (flag) { note = flag[1]; rest = rest.slice(0, flag.index).trim() }
  let player = rest, team = ''
  const c = rest.match(/^(.*?),\s+(.+)$/) || rest.match(/^(.*?)\s+[-–—]\s+(.+)$/); if (c) { player = c[1].trim(); team = c[2].trim() }
  if (!player || player.length < 2) return null
  if (/^(cards?|hobby|jumbo|blaster|per\b|box|pack|case|of\b|odds|shares?|tweet|weight|hits?|serial)/i.test(player)) return null
  const card = { n: m[1], p: player }; if (team) card.t = team; if (note) card.x = note; return card
}
function extractSections(html) {
  const sections = []; let cur = null
  const parts = html.split(/<h[234][^>]*>([\s\S]*?)<\/h[234]>/i)
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const ht = stripTags(parts[i]).replace(/\n/g, ' ').trim()
      if (ht.length > 0 && ht.length < 100 && !/box break|order|price|release date|sell sheet/i.test(ht)) {
        const title = ht.replace(/\s*Set Checklist\s*$/i, '').replace(/\s*Checklist\s*$/i, '').trim()
        cur = { title: title || 'Base Set', cards: [] }; sections.push(cur)
      } else cur = null
      continue
    }
    if (!cur) continue
    for (const line of stripTags(parts[i]).split('\n')) { const card = parseLine(line); if (card) cur.cards.push(card) }
  }
  return sections.filter(s => s.cards.length > 2) // drop junk fragments
}

// slug normalization for cross-source dedupe
const norm = (s) => s.toLowerCase().replace(/-(card|trading-card|mma-card|hockey-card|sticker)s?-checklist$/, '').replace(/-checklist$/, '').replace(/-(cards|trading-cards|hobby)$/, '')
const existingNorm = new Set(readdirSync(dataDir).map(f => norm(f.replace('.json', ''))))

// sport from category slugs (fetched once) or slug keywords
const catRes = await fetch(API + '/categories?per_page=100&_fields=id,slug', { headers: HDRS })
const cats = catRes.ok ? await catRes.json() : []
const catMap = {}
for (const c of cats) catMap[c.id] = c.slug
const SPORT_BY_CAT = { 'baseball-checklists': 'Baseball', 'basketball-checklists': 'Basketball', 'football-checklists': 'Football', 'hockey-checklists': 'Hockey', 'soccer-checklist': 'Soccer', 'soccer-checklists': 'Soccer', boxing: 'Boxing', 'cfl-checklists': 'Football', 'combat-sport': 'UFC', 'cricket-checklist': 'Cricket', 'formula-1-checklists': 'Racing', 'indy-car-checklists': 'Racing', 'nascar-checklists': 'Racing', 'golf-checklists': 'Golf', 'tennis-checklists': 'Tennis', 'wrestling-checklists': 'Wrestling', lacrosse: 'Lacrosse', 'entertainment-checklists': 'Entertainment', 'multi-sport': 'Multi-Sport', bowling: 'Bowling' }
const SKIP_CATS = new Set(['daily-events-for-this-day', 'flashback-friday', 'baseball-player-card-checklists', 'basketball-player-card-checklists', 'football-player-card-checklists', 'hockey-player-card-checklists', 'entertainment-card-gallery', 'funko-pop-vinyl', 'comic-book-checklists'])
function sportOf(post) {
  const slugs = (post.categories || []).map(id => catMap[id]).filter(Boolean)
  if (slugs.some(s => SKIP_CATS.has(s))) return null
  for (const s of slugs) if (SPORT_BY_CAT[s]) {
    if (SPORT_BY_CAT[s] === 'UFC' && !/ufc|mma/i.test(post.slug)) return /boxing/i.test(post.slug) ? 'Boxing' : 'Wrestling'
    return SPORT_BY_CAT[s]
  }
  const sl = post.slug
  for (const [k, v] of Object.entries({ baseball: 'Baseball', basketball: 'Basketball', football: 'Football', hockey: 'Hockey', soccer: 'Soccer', ufc: 'UFC', boxing: 'Boxing', golf: 'Golf', tennis: 'Tennis', wrestling: 'Wrestling', wwe: 'Wrestling', 'formula-1': 'Racing', f1: 'Racing', nascar: 'Racing', cricket: 'Cricket' })) if (sl.includes(k)) return v
  return null
}
function yearOf(slug) {
  let m = slug.match(/^(\d{4})-(\d{2})-/); if (m && +m[1] >= 1900 && +m[1] <= 2030) return parseInt(m[1]) + 1
  m = slug.match(/(19|20)\d\d/); return m ? parseInt(m[0]) : null
}

let page = 1, ok = 0, skipped = 0, cards = 0
while (page <= maxPages) {
  const r = await fetch(`${API}/posts?per_page=50&page=${page}&_fields=id,slug,title,categories,content`, { headers: HDRS })
  if (!r.ok) break
  const posts = await r.json()
  if (!posts.length) break
  for (const post of posts) {
    if (!/checklist/.test(post.slug)) { skipped++; continue }
    const sport = sportOf(post)
    if (!sport) { skipped++; continue }
    const slug = post.slug.replace(/-card-checklist$|-checklist$/, '')
    if (existingNorm.has(norm(post.slug)) || existingNorm.has(norm(slug))) { skipped++; continue }
    const sections = extractSections(post.content?.rendered || '')
    if (!sections.length) { skipped++; continue }
    const name = decode((post.title?.rendered || slug).replace(/<[^>]+>/g, '')).replace(/\s*(Card\s*)?Checklist\s*$/i, '').trim()
    const year = yearOf(post.slug)
    writeFileSync(new URL(slug + '.json', dataDir), JSON.stringify({ slug, name, year, sport, source: 'checklistcenter.com', sections }))
    existingNorm.add(norm(slug))
    ok++; cards += sections.reduce((n, s) => n + s.cards.length, 0)
    if (ok % 50 === 0) process.stdout.write('.')
  }
  const totalPages = parseInt(r.headers.get('x-wp-totalpages') || '0')
  if (page >= totalPages) break
  page++
  await sleep(350)
}
console.log(`\nchecklistcenter -> ${ok} sets, ${cards.toLocaleString()} cards (${skipped} skipped)`)
