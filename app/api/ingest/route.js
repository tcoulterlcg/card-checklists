// Bulk catalog import endpoint. The browser-side importer (TCDB / Break Ninja
// pulls run in Chrome) POSTs gzipped set JSON here; this writes it to Supabase
// with the service-role key, so no write access is ever granted to anon.
//
// Required env vars (Vercel project settings):
//   SUPABASE_SERVICE_ROLE_KEY  service-role key of the Cards-HQ Supabase project
//   INGEST_SECRET              shared secret the importer sends as x-ingest-secret
//
// Body: gzip(JSON) of [{ slug, name, year, sport, source, sid?, sections:[{title, cards:[{n,p,t,x}]}] }]
// Response: { ok, written: [{ slug, cards }], skipped: [slug] }
import { NextResponse } from 'next/server'
import { gunzipSync } from 'node:zlib'
import { timingSafeEqual, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

const SUPABASE_URL = 'https://vnweopuivwnmtdkqhbse.supabase.co'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, content-encoding, x-ingest-secret',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req) {
  const secret = process.env.INGEST_SECRET
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || !key) return NextResponse.json({ ok: false, error: 'ingest not configured' }, { status: 503, headers: CORS })
  // constant-time compare (hash both sides so lengths match)
  const h = (v) => createHash('sha256').update(String(v || '')).digest()
  if (!timingSafeEqual(h(req.headers.get('x-ingest-secret')), h(secret))) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: CORS })

  let sets
  try {
    const buf = Buffer.from(await req.arrayBuffer())
    if (buf.length > 20 * 1024 * 1024) throw new Error('too big')
    // maxOutputLength caps a gzip bomb before it can exhaust the function's memory
    const text = req.headers.get('content-encoding') === 'gzip' || (buf[0] === 0x1f && buf[1] === 0x8b) ? gunzipSync(buf, { maxOutputLength: 200 * 1024 * 1024 }).toString('utf8') : buf.toString('utf8')
    sets = JSON.parse(text)
    if (!Array.isArray(sets)) sets = [sets]
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'bad body' }, { status: 400, headers: CORS })
  }

  const db = createClient(SUPABASE_URL, key, { auth: { persistSession: false } })
  const written = [], skipped = []
  for (const s of sets) {
    const sections = (s.sections || []).map(sec => ({ title: sec.title || 'Base', cards: (sec.cards || []).filter(c => c && c.p) })).filter(sec => sec.cards.length)
    const cardCount = sections.reduce((a, sec) => a + sec.cards.length, 0)
    if (!s.slug || !s.name || !s.sport || !cardCount) { skipped.push(s.slug || s.name || '?'); continue }
    const data = { slug: s.slug, name: s.name, year: s.year ?? null, sport: s.sport, source: s.source || null, sections }
    const { error: e1 } = await db.from('card_sets').upsert({
      slug: s.slug, name: s.name, year: s.year ?? null, sport: s.sport, source: s.source || null,
      card_count: cardCount, section_count: sections.length, tcdb_sid: s.sid ? Number(s.sid) : null, data, updated_at: new Date().toISOString(),
    }, { onConflict: 'slug' })
    if (e1) return NextResponse.json({ ok: false, error: e1.message, slug: s.slug, written }, { status: 500, headers: CORS })

    // Search rows: one per (number, name) — parallels collapse onto the first section listing them.
    const seen = new Set(), rows = []
    for (const sec of sections) for (const c of sec.cards) {
      const k = (c.n || '') + '\u0000' + c.p
      if (seen.has(k)) continue
      seen.add(k)
      rows.push({ slug: s.slug, p: c.p, n: c.n || null, section: sec.title, t: c.t || null, x: c.x || null })
    }
    const { error: e2 } = await db.from('card_search').delete().eq('slug', s.slug)
    if (e2) return NextResponse.json({ ok: false, error: e2.message, slug: s.slug, written }, { status: 500, headers: CORS })
    for (let i = 0; i < rows.length; i += 5000) {
      const { error: e3 } = await db.from('card_search').insert(rows.slice(i, i + 5000))
      if (e3) return NextResponse.json({ ok: false, error: e3.message, slug: s.slug, written }, { status: 500, headers: CORS })
    }
    written.push({ slug: s.slug, cards: cardCount })
  }
  return NextResponse.json({ ok: true, written, skipped }, { headers: CORS })
}
