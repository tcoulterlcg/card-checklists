// Enrich every set JSON with pack odds pulled from its cardboardconnection
// page: per-section odds/parallel notes (attached to section.odds) and the
// set's Hobby Box Break configuration (set.boxBreak). Cards are untouched.
//   node scripts/enrich-odds.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'

const HDRS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9'
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function strip(h) {
  return h.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|td|th)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&#8217;|&#8216;|&rsquo;|&lsquo;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '-').replace(/&nbsp;|&#x[aA]0;|&#160;/g, ' ')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n)))
    .replace(/[ \t\f\v]+/g, ' ').trim()
}
function cleanDesc(s) {
  return s.replace(/Shop for[^.]*on eBay\.?/gi, '').replace(/Buy on eBay\.?/gi, '')
    .replace(/\s+·?\s*$/, '').replace(/\s+/g, ' ').trim()
}
const ODDS_RE = /\d+\s*:\s*\d|#\/\s*\d|per pack|per box|packs?\b|hobby|retail|blaster|jumbo|serial|parallel|odds|1\/1|one-of-one/i

function extractOdds(html) {
  const start = html.indexOf('set-checklist')
  if (start < 0) return { map: {}, box: [] }
  let block = html.slice(start)
  const end = block.search(/post_anchor_divs clearfix (?!set-checklist)/)
  if (end > 0) block = block.slice(0, end)

  // Per-section odds: walk headings + checklistdesc divs in document order.
  const tokRe = /<h[2345][^>]*>([\s\S]*?)<\/h[2345]>|<div class="checklistdesc"[^>]*>([\s\S]*?)<\/div>/g
  const map = {}
  let cur = null, m
  while ((m = tokRe.exec(block))) {
    if (m[1] !== undefined) {
      const ht = strip(m[1])
      if (/checklist/i.test(ht) && ht.length < 90 && !/^\d{4}/.test(ht)) {
        cur = ht.replace(/\s*Set Checklist\s*$/i, '').replace(/\s*Checklist\s*$/i, '').trim()
      } else cur = null
    } else if (cur) {
      const d = cleanDesc(strip(m[2]))
      if (d && d.length > 4 && ODDS_RE.test(d)) map[cur] = map[cur] ? map[cur] + ' · ' + d : d
    }
  }

  // Box break: capture the config list under a "Box Break/Configuration" heading.
  const box = []
  const bm = html.search(/(Hobby|Retail|Jumbo)?\s*Box (Break|Configuration)/i)
  if (bm >= 0) {
    const seg = strip(html.slice(bm, bm + 1400))
    for (const line of seg.split('\n').map(l => l.trim()).filter(Boolean).slice(1)) {
      if (/^\d+(\.\d+)?\s+[A-Za-z]/.test(line) && line.length < 70) box.push(line)
      else if (box.length > 0 && !/^\d/.test(line)) break
      if (box.length >= 16) break
    }
  }
  return { map, box }
}

const dataDir = new URL('../public/data/', import.meta.url)
const files = readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'search-index.json')
let withOdds = 0, withBox = 0, done = 0

for (const f of files) {
  const set = JSON.parse(readFileSync(new URL(f, dataDir), 'utf8'))
  try {
    const res = await fetch('https://www.cardboardconnection.com/' + set.slug, { headers: HDRS })
    if (res.ok) {
      const { map, box } = extractOdds(await res.text())
      let hit = 0
      for (const sec of set.sections) {
        if (map[sec.title]) { sec.odds = map[sec.title]; hit++ }
      }
      if (box.length) { set.boxBreak = box; withBox++ }
      if (hit > 0) withOdds++
      writeFileSync(new URL(f, dataDir), JSON.stringify(set))
    }
  } catch (e) { /* skip */ }
  done++
  if (done % 40 === 0) process.stdout.write(' ' + done)
  await sleep(200)
}
console.log('\nenrich-odds ->', done, 'sets processed;', withOdds, 'got section odds;', withBox, 'got a box break')
