// Sets stored in Supabase (bulk TCDB import), in the same shape as
// public/data/index.json entries. Cached at the edge; the page merges this with
// the static index (static files win on a slug collision).
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const URL_ = 'https://vnweopuivwnmtdkqhbse.supabase.co/rest/v1/card_sets'
const KEY = 'sb_publishable_VF3xtbiS94XJcrtvk6JsRQ_Gmx1vCFp'

export async function GET() {
  const sets = []
  const page = 1000
  for (let from = 0; from < 2_000_000; from += page) {
    let r
    try { r = await fetch(URL_ + '?select=slug,name,year,sport,source,card_count,section_count&order=slug', {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Range: from + '-' + (from + page - 1) },
      cache: 'no-store',
    }) } catch { break }
    if (!r.ok) break
    const rows = await r.json()
    for (const s of rows) sets.push({ slug: s.slug, name: s.name, year: s.year, sport: s.sport, cardCount: s.card_count, sections: s.section_count, source: s.source })
    if (rows.length < page) break
  }
  return NextResponse.json({ sets }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
