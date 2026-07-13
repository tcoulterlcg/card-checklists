'use client'

// Checklist HQ — searchable sports card checklist database.
// Data lives as static JSON under /public/data: index.json lists the sets,
// each set file carries its cards. No backend needed.
import { useEffect, useMemo, useState } from 'react'

const GOLD = '#d4a843'
const condensed = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

const SPORT_COLORS = {
  Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e'
}

export default function Home() {
  const [sets, setSets] = useState([])
  const [activeSet, setActiveSet] = useState(null)
  const [cards, setCards] = useState([])
  const [query, setQuery] = useState('')
  const [globalHits, setGlobalHits] = useState(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    fetch('/data/index.json').then(r => r.json()).then(j => setSets(j.sets || [])).catch(() => {})
  }, [])

  const openSet = async (s) => {
    setActiveSet(s)
    setGlobalHits(null)
    try {
      const r = await fetch('/data/' + s.slug + '.json')
      const j = await r.json()
      setCards(j.cards || [])
    } catch (e) { setCards([]) }
  }

  // Global player search across every set file.
  const runGlobalSearch = async () => {
    const term = query.trim().toLowerCase()
    if (term.length < 3) return
    setSearching(true)
    setActiveSet(null)
    const hits = []
    for (const s of sets) {
      try {
        const r = await fetch('/data/' + s.slug + '.json')
        const j = await r.json()
        for (const c of (j.cards || [])) {
          if ((c.player || '').toLowerCase().indexOf(term) !== -1) {
            hits.push(Object.assign({ set: s.name, year: s.year, sport: s.sport }, c))
          }
        }
      } catch (e) { /* skip */ }
    }
    setGlobalHits(hits)
    setSearching(false)
  }

  const filteredCards = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!activeSet || !term) return cards
    return cards.filter(c =>
      (c.player || '').toLowerCase().includes(term) ||
      (c.team || '').toLowerCase().includes(term) ||
      String(c.number || '').toLowerCase() === term
    )
  }, [cards, query, activeSet])

  const bySport = useMemo(() => {
    const g = {}
    for (const s of sets) (g[s.sport] = g[s.sport] || []).push(s)
    return g
  }, [sets])

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
      <header style={{ padding: '34px 0 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ ...condensed, fontSize: 34, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1 }}>
            Checklist<span style={{ color: GOLD }}>HQ</span>
          </div>
          <p style={{ margin: '6px 0 0', color: '#8a8a8a', fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Sports Card Checklist Database
          </p>
        </div>
        <span style={{ color: '#666', fontSize: 12 }}>{sets.length} set{sets.length === 1 ? '' : 's'} indexed · a Coulter Companies product</span>
      </header>

      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !activeSet) runGlobalSearch() }}
          placeholder={activeSet ? 'Filter this checklist (player, team, card #)…' : 'Search any player across all sets…'}
          style={{
            flex: 1, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10,
            padding: '13px 16px', color: '#f5f5f5', fontSize: 15, outline: 'none'
          }}
        />
        {!activeSet && (
          <button onClick={runGlobalSearch} disabled={searching || query.trim().length < 3}
            style={{
              background: GOLD, color: '#111', border: 'none', borderRadius: 10, padding: '0 22px',
              fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: searching || query.trim().length < 3 ? 0.5 : 1
            }}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        )}
      </div>

      {activeSet ? (
        <section>
          <button onClick={() => { setActiveSet(null); setGlobalHits(null); setQuery('') }}
            style={{ background: 'none', border: 'none', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← All sets
          </button>
          <h1 style={{ ...condensed, fontSize: 30, fontWeight: 800, textTransform: 'uppercase', margin: '0 0 4px' }}>{activeSet.name}</h1>
          <p style={{ color: '#8a8a8a', fontSize: 13, margin: '0 0 20px' }}>
            {activeSet.sport} · {activeSet.year} · {cards.length.toLocaleString()} cards{activeSet.source ? ' · source: ' + activeSet.source : ''}
          </p>
          <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
            {filteredCards.slice(0, 800).map((c, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, padding: '9px 16px', fontSize: 14,
                background: i % 2 === 0 ? '#0f0f0f' : '#141414', alignItems: 'baseline'
              }}>
                <span style={{ color: GOLD, fontWeight: 700, minWidth: 52, fontVariantNumeric: 'tabular-nums' }}>#{c.number}</span>
                <span style={{ fontWeight: 600 }}>{c.player}</span>
                <span style={{ color: '#777', fontSize: 13 }}>{c.team}</span>
                {c.note && <span style={{ color: '#555', fontSize: 12, marginLeft: 'auto' }}>{c.note}</span>}
              </div>
            ))}
            {filteredCards.length === 0 && <p style={{ padding: 20, color: '#666', fontSize: 14 }}>No cards match.</p>}
          </div>
        </section>
      ) : globalHits ? (
        <section>
          <h2 style={{ ...condensed, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', margin: '0 0 14px' }}>
            {globalHits.length} result{globalHits.length === 1 ? '' : 's'} for “{query}”
          </h2>
          <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
            {globalHits.slice(0, 500).map((c, i) => (
              <div key={i} style={{
                display: 'flex', gap: 14, padding: '9px 16px', fontSize: 14,
                background: i % 2 === 0 ? '#0f0f0f' : '#141414', alignItems: 'baseline', flexWrap: 'wrap'
              }}>
                <span style={{ color: GOLD, fontWeight: 700, minWidth: 52 }}>#{c.number}</span>
                <span style={{ fontWeight: 600 }}>{c.player}</span>
                <span style={{ color: '#777', fontSize: 13 }}>{c.team}</span>
                <span style={{ color: '#555', fontSize: 12, marginLeft: 'auto' }}>{c.year} {c.set}</span>
              </div>
            ))}
            {globalHits.length === 0 && <p style={{ padding: 20, color: '#666', fontSize: 14 }}>No player matches across the indexed sets.</p>}
          </div>
        </section>
      ) : (
        <section>
          {Object.keys(bySport).sort().map((sport) => (
            <div key={sport} style={{ marginBottom: 30 }}>
              <h2 style={{ ...condensed, fontSize: 20, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: SPORT_COLORS[sport] || GOLD, margin: '0 0 12px' }}>
                {sport}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {bySport[sport].sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name)).map((s) => (
                  <button key={s.slug} onClick={() => openSet(s)}
                    style={{
                      textAlign: 'left', background: '#111', border: '1px solid #242424', borderRadius: 12,
                      padding: '16px 18px', color: '#f5f5f5', cursor: 'pointer'
                    }}>
                    <span style={{ color: '#777', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em' }}>{s.year}</span>
                    <p style={{ ...condensed, margin: '4px 0 6px', fontSize: 19, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.1 }}>{s.name}</p>
                    <span style={{ color: '#8a8a8a', fontSize: 12 }}>{(s.cardCount || 0).toLocaleString()} cards</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {sets.length === 0 && (
            <p style={{ color: '#666', fontSize: 14 }}>No sets indexed yet — the first imports are on the way.</p>
          )}
        </section>
      )}
    </main>
  )
}
