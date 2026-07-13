'use client'

// Checklist HQ v2 — sectioned checklist database (Base / Inserts / Autos …)
// imported from cardboardconnection.com. Static JSON under /public/data:
// index.json lists sets; each set file carries sections -> cards.
import { useEffect, useMemo, useState } from 'react'

const GOLD = '#d4a843'
const condensed = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

const SPORT_COLORS = {
  Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e'
}

function Chip({ children, color, solid }) {
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      background: solid ? (color || GOLD) : 'transparent',
      color: solid ? '#111' : (color || GOLD),
      border: '1px solid ' + (color || GOLD) + (solid ? '' : '55')
    }}>{children}</span>
  )
}

export default function Home() {
  const [sets, setSets] = useState([])
  const [activeSet, setActiveSet] = useState(null)
  const [setData, setSetData] = useState(null)
  const [activeSection, setActiveSection] = useState('All')
  const [query, setQuery] = useState('')
  const [sportFilter, setSportFilter] = useState('All')
  const [globalHits, setGlobalHits] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchIndex, setSearchIndex] = useState(null)

  useEffect(() => {
    fetch('/data/index.json').then(r => r.json()).then(j => setSets(j.sets || [])).catch(() => {})
  }, [])

  const totalCards = useMemo(() => sets.reduce((s, x) => s + (x.cardCount || 0), 0), [sets])
  const sports = useMemo(() => ['All', ...[...new Set(sets.map(s => s.sport))].sort()], [sets])

  const openSet = async (s) => {
    setActiveSet(s); setGlobalHits(null); setActiveSection('All'); setQuery('')
    try {
      const r = await fetch('/data/' + s.slug + '.json')
      setSetData(await r.json())
    } catch (e) { setSetData(null) }
    window.scrollTo(0, 0)
  }

  // One compact index (loaded once, then cached) powers instant cross-set
  // player search over every card, rather than fetching 300 set files.
  const runGlobalSearch = async () => {
    const term = query.trim().toLowerCase()
    if (term.length < 3) return
    setSearching(true); setActiveSet(null); setSetData(null)
    let idx = searchIndex
    if (!idx) {
      try {
        const r = await fetch('/data/search-index.json')
        idx = (await r.json()).rows
        setSearchIndex(idx)
      } catch (e) { idx = [] }
    }
    const setMeta = {}
    for (const s of sets) setMeta[s.slug] = s
    const hits = []
    for (let i = 0; i < idx.length && hits.length < 800; i++) {
      const row = idx[i] // [player, slug, number, section, team, flag]
      if (row[0].toLowerCase().includes(term)) {
        const m = setMeta[row[1]] || {}
        hits.push({ p: row[0], slug: row[1], n: row[2], section: row[3], t: row[4], x: row[5], set: m.name, year: m.year, sport: m.sport })
      }
    }
    hits.sort((a, b) => (b.year || 0) - (a.year || 0))
    setGlobalHits(hits); setSearching(false)
  }

  const visibleSections = useMemo(() => {
    if (!setData) return []
    let secs = setData.sections || []
    if (activeSection !== 'All') secs = secs.filter(s => s.title === activeSection)
    const term = query.trim().toLowerCase()
    if (!term) return secs
    return secs.map(s => ({
      ...s,
      cards: s.cards.filter(c =>
        (c.p || '').toLowerCase().includes(term) ||
        (c.t || '').toLowerCase().includes(term) ||
        String(c.n || '').toLowerCase() === term)
    })).filter(s => s.cards.length > 0)
  }, [setData, activeSection, query])

  const filteredSets = useMemo(() => {
    let list = sets
    if (sportFilter !== 'All') list = list.filter(s => s.sport === sportFilter)
    const term = query.trim().toLowerCase()
    if (term && !activeSet) list = list.filter(s => s.name.toLowerCase().includes(term))
    return list
  }, [sets, sportFilter, query, activeSet])

  const rcCount = (j) => (j.sections || []).reduce((s, sec) => s + sec.cards.filter(c => c.x === 'RC').length, 0)

  return (
    <main style={{ maxWidth: 1150, margin: '0 auto', padding: '0 24px 80px' }}>
      <header style={{ padding: '30px 0 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ ...condensed, fontSize: 36, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, cursor: 'pointer' }}
            onClick={() => { setActiveSet(null); setSetData(null); setGlobalHits(null); setQuery('') }}>
            Checklist<span style={{ color: GOLD }}>HQ</span>
          </div>
          <p style={{ margin: '6px 0 0', color: '#8a8a8a', fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Sports Card Checklist Database
          </p>
        </div>
        <div style={{ display: 'flex', gap: 22, textAlign: 'right' }}>
          <div>
            <p style={{ ...condensed, margin: 0, fontSize: 26, fontWeight: 800, color: GOLD }}>{sets.length.toLocaleString()}</p>
            <p style={{ margin: 0, color: '#777', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em' }}>SETS</p>
          </div>
          <div>
            <p style={{ ...condensed, margin: 0, fontSize: 26, fontWeight: 800, color: GOLD }}>{totalCards.toLocaleString()}</p>
            <p style={{ margin: 0, color: '#777', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em' }}>CARDS</p>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !activeSet) runGlobalSearch() }}
          placeholder={activeSet ? 'Filter this set (player, team, card #)…' : 'Search players across every set, or filter sets by name…'}
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
            {searching ? 'Searching…' : 'Player Search'}
          </button>
        )}
      </div>

      {!activeSet && !globalHits && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 26, flexWrap: 'wrap' }}>
          {sports.map(sp => (
            <button key={sp} onClick={() => setSportFilter(sp)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                background: sportFilter === sp ? (SPORT_COLORS[sp] || GOLD) : '#141414',
                color: sportFilter === sp ? '#111' : '#999',
                border: '1px solid ' + (sportFilter === sp ? 'transparent' : '#2a2a2a')
              }}>{sp}</button>
          ))}
        </div>
      )}

      {activeSet && setData ? (
        <section>
          <button onClick={() => { setActiveSet(null); setSetData(null); setQuery('') }}
            style={{ background: 'none', border: 'none', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← All sets
          </button>
          <div style={{ background: 'linear-gradient(140deg, #191919, #101010)', border: '1px solid #262626', borderRadius: 16, padding: '26px 28px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Chip color={SPORT_COLORS[activeSet.sport]} solid>{activeSet.sport}</Chip>
              <Chip>{activeSet.year}</Chip>
              <Chip>{(setData.sections || []).length} sections</Chip>
            </div>
            <h1 style={{ ...condensed, fontSize: 34, fontWeight: 800, textTransform: 'uppercase', margin: 0, lineHeight: 1.05 }}>{setData.name}</h1>
            <p style={{ color: '#8a8a8a', fontSize: 13, margin: '10px 0 0' }}>
              {(setData.sections || []).reduce((s, x) => s + x.cards.length, 0).toLocaleString()} cards
              {rcCount(setData) > 0 ? ' · ' + rcCount(setData) + ' rookies flagged' : ''} · source: {setData.source}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {['All', ...(setData.sections || []).map(s => s.title)].map(t => (
              <button key={t} onClick={() => setActiveSection(t)}
                style={{
                  padding: '6px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeSection === t ? GOLD : '#141414',
                  color: activeSection === t ? '#111' : '#999',
                  border: '1px solid ' + (activeSection === t ? 'transparent' : '#2a2a2a')
                }}>{t}</button>
            ))}
          </div>

          {visibleSections.map(sec => (
            <div key={sec.title} style={{ marginBottom: 26 }}>
              <h2 style={{ ...condensed, fontSize: 21, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>
                {sec.title} <span style={{ color: '#666', fontSize: 15 }}>· {sec.cards.length}</span>
              </h2>
              <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                {sec.cards.slice(0, 500).map((c, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 14, padding: '8px 16px', fontSize: 14,
                    background: i % 2 === 0 ? '#0f0f0f' : '#141414', alignItems: 'baseline'
                  }}>
                    <span style={{ color: GOLD, fontWeight: 700, minWidth: 56, fontVariantNumeric: 'tabular-nums' }}>#{c.n}</span>
                    <span style={{ fontWeight: 600 }}>{c.p}</span>
                    {c.t && <span style={{ color: '#777', fontSize: 13 }}>{c.t}</span>}
                    {c.x && <span style={{ marginLeft: 'auto' }}><Chip color={c.x === 'RC' ? '#4ade80' : '#888'}>{c.x}</Chip></span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {visibleSections.length === 0 && <p style={{ color: '#666' }}>No cards match.</p>}
        </section>
      ) : globalHits ? (
        <section>
          <button onClick={() => setGlobalHits(null)}
            style={{ background: 'none', border: 'none', color: GOLD, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← Browse sets
          </button>
          <h2 style={{ ...condensed, fontSize: 24, fontWeight: 800, textTransform: 'uppercase', margin: '0 0 14px' }}>
            {globalHits.length}{globalHits.length >= 600 ? '+' : ''} results for “{query}”
          </h2>
          <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
            {globalHits.map((c, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '9px 16px', fontSize: 14,
                background: i % 2 === 0 ? '#0f0f0f' : '#141414', alignItems: 'baseline', flexWrap: 'wrap'
              }}>
                <span style={{ color: GOLD, fontWeight: 700, minWidth: 52 }}>#{c.n}</span>
                <span style={{ fontWeight: 600 }}>{c.p}</span>
                {c.t && <span style={{ color: '#777', fontSize: 13 }}>{c.t}</span>}
                {c.x && <Chip color={c.x === 'RC' ? '#4ade80' : '#888'}>{c.x}</Chip>}
                <span style={{ color: '#555', fontSize: 12, marginLeft: 'auto' }}>{c.set} · {c.section}</span>
              </div>
            ))}
            {globalHits.length === 0 && <p style={{ padding: 20, color: '#666', fontSize: 14 }}>No player matches yet — more sets import every session.</p>}
          </div>
        </section>
      ) : (
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 12 }}>
            {filteredSets.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name)).map((s) => (
              <button key={s.slug} onClick={() => openSet(s)}
                style={{
                  textAlign: 'left', background: 'linear-gradient(150deg, #151515, #0e0e0e)', border: '1px solid #242424',
                  borderRadius: 12, padding: '16px 18px', color: '#f5f5f5', cursor: 'pointer'
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: SPORT_COLORS[s.sport] || '#777', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{s.sport} · {s.year}</span>
                  <span style={{ color: '#666', fontSize: 11 }}>{(s.sections || 0)} sec</span>
                </div>
                <p style={{ ...condensed, margin: '0 0 6px', fontSize: 19, fontWeight: 700, textTransform: 'uppercase', lineHeight: 1.12 }}>{s.name.replace(/^\d{4}(-\d{2})?\s*/, '')}</p>
                <span style={{ color: '#8a8a8a', fontSize: 12 }}>{(s.cardCount || 0).toLocaleString()} cards</span>
              </button>
            ))}
          </div>
          {filteredSets.length === 0 && <p style={{ color: '#666', fontSize: 14 }}>No sets match.</p>}
        </section>
      )}

      <footer style={{ marginTop: 60, borderTop: '1px solid #1e1e1e', paddingTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#555', fontSize: 12 }}>Checklist data sourced from The Cardboard Connection.</span>
        <span style={{ color: '#555', fontSize: 12 }}>a Coulter Companies product</span>
      </footer>
    </main>
  )
}
