// One set's checklist from Supabase (sets that are not static files in public/data).
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const URL_ = 'https://vnweopuivwnmtdkqhbse.supabase.co/rest/v1/card_sets'
const KEY = 'sb_publishable_VF3xtbiS94XJcrtvk6JsRQ_Gmx1vCFp'

export async function GET(req) {
  const slug = new URL(req.url).searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  const r = await fetch(URL_ + '?select=data&slug=eq.' + encodeURIComponent(slug), {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
    cache: 'no-store',
  })
  const rows = r.ok ? await r.json() : []
  if (!rows.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(rows[0].data, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } })
}
