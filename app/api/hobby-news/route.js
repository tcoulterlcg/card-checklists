// Hobby news for the Checklist HQ tickers — aggregates card-hobby RSS feeds
// server-side (avoids CORS/one cache) and splits into Sports and TCG streams.
import { NextResponse } from 'next/server'

export const revalidate = 1800

const SPORTS_FEEDS = [
  'https://www.cardboardconnection.com/feed',
  'https://www.sportscardinvestor.com/feed/'
]
const TCG_FEEDS = [
  'https://pokemonblog.com/feed/',
  'https://bleedingcool.com/games/feed/',
  'https://comicbook.com/category/gaming/feed/'
]
// Keep only items that are actually about trading CARDS (the Pokémon/gaming
// feeds also carry anime, video-game and console news we don't want).
const TCG_RE = /\btcg\b|trading card|booster|elite trainer|\bETB\b|\bdeck\b|expansion|\bcards?\b|scarlet\s*&?\s*violet|lorcana|yu-?gi-?oh|magic:? the gathering|\bmtg\b|one piece card/i

function decode(s) {
  return (s || '').replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&#8217;|&#039;|&apos;/g, "'").replace(/&#8211;|&#8212;/g, '–')
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function parseFeed(xml, source) {
  const items = []
  const blocks = xml.split(/<item[ >]/).slice(1)
  for (const b of blocks) {
    const title = decode((b.match(/<title>([\s\S]*?)<\/title>/) || [])[1])
    const link = decode((b.match(/<link>([\s\S]*?)<\/link>/) || [])[1])
    if (title && title.length > 8) items.push({ title, link, source })
    if (items.length >= 12) break
  }
  return items
}

async function pull(url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ChecklistHQ/1.0)', accept: 'application/rss+xml, application/xml' },
      next: { revalidate: 1800 }
    })
    if (!r.ok) return []
    const host = new URL(url).hostname.replace('www.', '').split('.')[0]
    return parseFeed(await r.text(), host)
  } catch (e) { return [] }
}

function dedupe(items) {
  const seen = new Set(), out = []
  for (const it of items) { const k = it.title.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(it) } }
  return out
}

export async function GET() {
  const [sportsArrs, tcgArrs] = await Promise.all([
    Promise.all(SPORTS_FEEDS.map(pull)),
    Promise.all(TCG_FEEDS.map(pull))
  ])
  const sports = dedupe(sportsArrs.flat()).slice(0, 18)
  const tcg = dedupe(tcgArrs.flat()).filter(it => TCG_RE.test(it.title)).slice(0, 18)
  return NextResponse.json({ sports, tcg })
}
