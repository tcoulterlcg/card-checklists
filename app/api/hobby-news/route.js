// CardHQ bottom line: news ticker that runs segment by segment, card-hobby first.
// League segments carry that league's card news (Google News), falling back to
// ESPN headlines only when there's none. "New Releases" is product news from Topps/Bowman, Panini, Upper Deck
// and Leaf; "Hobby" is the SI / Sports Collectors Daily / Digest news desks.
// TCG stays as its own segment. Aggregated server-side and cached 30 minutes.
import { NextResponse } from 'next/server'

export const revalidate = 1800

const PER_SEGMENT = 6
const GN = (q) => 'https://news.google.com/rss/search?hl=en-US&gl=US&ceid=US:en&q=' + encodeURIComponent(q + ' when:14d')

// Card-hobby news first: each league segment is card news for that league (sales,
// rookie cards, releases, breaks) from Google News; general league headlines from
// ESPN/CBS are only a fallback when a league has no hobby stories that week.
const HOBBY_WORDS = '("trading card" OR "trading cards" OR "rookie card" OR "card sells" OR "card sold" OR PSA OR "1/1" OR "one-of-one" OR Panini OR Topps OR Bowman OR "Upper Deck" OR "card show" OR "card break")'
const HOBBY_KEEP = /card|psa|\b1\/1\b|one-of-one|panini|topps|bowman|upper deck|prizm|chrome|autograph|auto\b|patch|rookie|collect|hobby|break|graded|auction|sells?\b|sold\b/i
const league = (key, label, color, terms, fallback) => ({ key, label, color, feeds: [GN(terms + ' ' + HOBBY_WORDS)], keep: HOBBY_KEEP, fallback })

const SEGMENTS = [
  {
    // Hobby news desks: SI Collectibles, Sports Collectors Daily, Sports Collectors Digest.
    key: 'hobby', label: 'Hobby', color: '#c4b5fd',
    feeds: ['https://www.si.com/collectibles/feed', 'https://www.sportscollectorsdaily.com/feed/', 'https://sportscollectorsdigest.com/rss', GN('("sports cards" OR "trading cards") (hobby OR collectors OR auction OR record)')],
    drop: /betting|sportsbook|casino|fantasy football/i
  },
  {
    // New-product news from the manufacturers themselves. Topps/Fanatics has no
    // public newsroom feed, so Topps & Bowman announcements come via Google News.
    key: 'releases', label: 'New Releases', color: '#7FA2FF',
    feeds: [
      'https://ripped.topps.com/feed/',
      'https://blog.paniniamerica.net/feed/',
      'https://upperdeck.com/feed/',
      GN('(Topps OR Bowman OR "Fanatics Collectibles") (announces OR release OR unveils OR "first look" OR checklist OR debut) cards'),
      GN('(Panini OR "Upper Deck" OR Leaf) (announces OR release OR unveils OR "first look") trading cards')
    ],
    keep: /topps|bowman|fanatics|panini|upper deck|leaf|prizm|chrome|donruss|select|optic|o-pee-chee|young guns|\bset\b|release|cards?\b|checklist|box|break|rookie|patch|autograph|epic journey|ikorr/i,
    drop: /redemption|giveaway|sweepstakes|contest|winners?\b|betting|sportsbook|casino|odds/i
  },
  league('nfl', 'NFL', '#4ade80', '(NFL OR football)', ['https://www.espn.com/espn/rss/nfl/news']),
  league('nba', 'NBA', '#f97316', '(NBA OR basketball OR WNBA)', ['https://www.espn.com/espn/rss/nba/news']),
  league('mlb', 'MLB', '#60a5fa', '(MLB OR baseball)', ['https://www.espn.com/espn/rss/mlb/news']),
  league('nhl', 'NHL', '#a78bfa', '(NHL OR hockey)', ['https://www.espn.com/espn/rss/nhl/news']),
  league('soccer', 'Soccer', '#f43f5e', '(soccer OR "Premier League" OR MLS OR UEFA)', ['https://www.espn.com/espn/rss/soccer/news']),
  {
    key: 'tcg', label: 'TCG', color: '#e879f9',
    feeds: ['https://pokemonblog.com/feed/', 'https://bleedingcool.com/games/feed/', 'https://comicbook.com/category/gaming/feed/', GN('(Pokemon OR Lorcana OR "One Piece" OR "Magic: The Gathering") ("trading card game" OR TCG OR booster OR expansion)')],
    keep: /\btcg\b|trading card|booster|elite trainer|\bETB\b|expansion|scarlet\s*&?\s*violet|mega evolution|lorcana|yu-?gi-?oh|magic:? the gathering|\bmtg\b|one piece card/i
  }
]

const SOURCE_NAMES = { espn: 'ESPN', ripped: 'Topps', si: 'Sports Illustrated', sportscollectorsdaily: 'SC Daily', sportscollectorsdigest: 'SC Digest', cbssports: 'CBS Sports', paniniamerica: 'Panini', upperdeck: 'Upper Deck', pokemonblog: 'PokémonBlog', bleedingcool: 'Bleeding Cool', comicbook: 'ComicBook' }

function decode(s) {
  return (s || '').replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&apos;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"').replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, '–')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function sourceOf(url) {
  const host = new URL(url).hostname.replace(/^www\.|^blog\.|^news\./, '').split('.')[0]
  return SOURCE_NAMES[host] || host
}

function parseFeed(xml, source) {
  const items = []
  for (const b of xml.split(/<item[ >]/).slice(1)) {
    let title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1])
    const gnSource = decode((b.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1])
    if (gnSource && title.endsWith(' - ' + gnSource)) title = title.slice(0, -(gnSource.length + 3))
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1])
    const date = Date.parse(decode((b.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1])) || 0
    if (title && title.length > 8 && link) items.push({ title, link, source: gnSource || source, date })
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
  // Feeds are in priority order; a league with no card news this week falls back
  // to its general headlines.
  let lists = await Promise.all(seg.feeds.map(pull))
  if (seg.fallback && lists.flat().filter(it => !seg.keep || seg.keep.test(it.title)).length < 2) {
    lists = lists.concat(await Promise.all(seg.fallback.map(pull)))
    seg = { ...seg, keep: null }
  }
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
  items.sort((a, b) => b.date - a.date)   // newest first
  items = items.slice(0, PER_SEGMENT).map(({ title, link, source }) => ({ title, link, source }))
  return { key: seg.key, label: seg.label, color: seg.color, items }
}

export async function GET() {
  const built = await Promise.all(SEGMENTS.map(buildSegment))
  // the same story can surface in two segments (Hobby + a league): keep the first
  const seen = new Set()
  for (const s of built) s.items = s.items.filter(it => { const k = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true })
  const segments = built.filter(s => s.items.length > 0)
  return NextResponse.json({ segments })
}
