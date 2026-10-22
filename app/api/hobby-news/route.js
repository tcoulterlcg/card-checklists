// CardHQ bottom line: ESPN-style news ticker that runs league by league.
// Sports segments are real league news (ESPN, CBS Sports as fallback), not
// hobby blogs. "Card News" is set/product news straight from the manufacturers.
// TCG stays as its own segment. Aggregated server-side and cached 30 minutes.
import { NextResponse } from 'next/server'

export const revalidate = 1800

const PER_SEGMENT = 6

const SEGMENTS = [
  { key: 'nfl', label: 'NFL', color: '#4ade80', feeds: ['https://www.espn.com/espn/rss/nfl/news', 'https://www.cbssports.com/rss/headlines/nfl/'] },
  { key: 'nba', label: 'NBA', color: '#f97316', feeds: ['https://www.espn.com/espn/rss/nba/news', 'https://www.cbssports.com/rss/headlines/nba/'] },
  { key: 'mlb', label: 'MLB', color: '#60a5fa', feeds: ['https://www.espn.com/espn/rss/mlb/news', 'https://www.cbssports.com/rss/headlines/mlb/'] },
  { key: 'nhl', label: 'NHL', color: '#a78bfa', feeds: ['https://www.espn.com/espn/rss/nhl/news', 'https://www.cbssports.com/rss/headlines/nhl/'] },
  { key: 'ncaaf', label: 'NCAAF', color: '#facc15', feeds: ['https://www.espn.com/espn/rss/ncf/news', 'https://www.cbssports.com/rss/headlines/college-football/'] },
  { key: 'soccer', label: 'Soccer', color: '#f43f5e', feeds: ['https://www.espn.com/espn/rss/soccer/news', 'https://www.cbssports.com/rss/headlines/soccer/'] },
  {
    key: 'cards', label: 'Card News', color: '#7FA2FF',
    // Manufacturer newsrooms only. Weekly redemption/admin posts are dropped.
    feeds: ['https://blog.paniniamerica.net/feed/', 'https://upperdeck.com/feed/'],
    drop: /redemption|giveaway|sweepstakes|contest|winners?\b/i
  },
  {
    key: 'tcg', label: 'TCG', color: '#e879f9',
    feeds: ['https://pokemonblog.com/feed/', 'https://bleedingcool.com/games/feed/', 'https://comicbook.com/category/gaming/feed/'],
    keep: /\btcg\b|trading card|booster|elite trainer|\bETB\b|expansion|scarlet\s*&?\s*violet|lorcana|yu-?gi-?oh|magic:? the gathering|\bmtg\b|one piece card/i
  }
]

const SOURCE_NAMES = { espn: 'ESPN', cbssports: 'CBS Sports', paniniamerica: 'Panini', upperdeck: 'Upper Deck', pokemonblog: 'PokémonBlog', bleedingcool: 'Bleeding Cool', comicbook: 'ComicBook' }

function decode(s) {
  return (s || '').replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&apos;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '–')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function sourceOf(url) {
  const host = new URL(url).hostname.replace(/^www\.|^blog\./, '').split('.')[0]
  return SOURCE_NAMES[host] || host
}

function parseFeed(xml, source) {
  const items = []
  for (const b of xml.split(/<item[ >]/).slice(1)) {
    const title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1])
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1])
    const date = Date.parse(decode((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1])) || 0
    if (title && title.length > 8 && link) items.push({ title, link, source, date })
    if (items.length >= 15) break
  }
  return items
}

async function pull(url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; CardHQ/1.0; +https://cardhq.vercel.app)', accept: 'application/rss+xml, application/xml, text/xml' },
      next: { revalidate: 1800 }
    })
    if (!r.ok) return []
    return parseFeed(await r.text(), sourceOf(url))
  } catch (e) { return [] }
}

async function buildSegment(seg) {
  // Feeds are in priority order: use the first feed that returns anything,
  // then top up from the rest (so ESPN leads and CBS fills gaps).
  const lists = await Promise.all(seg.feeds.map(pull))
  const seen = new Set()
  let items = []
  for (const list of lists) {
    for (const it of list) {
      const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60)
      if (seen.has(k)) continue
      if (seg.keep && !seg.keep.test(it.title)) continue
      if (seg.drop && seg.drop.test(it.title)) continue
      seen.add(k); items.push(it)
    }
  }
  // Manufacturer/TCG feeds are merged by recency; league feeds keep feed order.
  if (seg.key === 'cards' || seg.key === 'tcg') items.sort((a, b) => b.date - a.date)
  items = items.slice(0, PER_SEGMENT).map(({ title, link, source }) => ({ title, link, source }))
  return { key: seg.key, label: seg.label, color: seg.color, items }
}

export async function GET() {
  const segments = (await Promise.all(SEGMENTS.map(buildSegment))).filter(s => s.items.length > 0)
  return NextResponse.json({ segments })
}
