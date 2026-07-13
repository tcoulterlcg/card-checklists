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

// Natural sort for card numbers: compare the embedded numeric part first
// (so #2 < #10 < #100), then fall back to the full string for prefixes.
function cardNumKey(n) {
  const m = String(n || '').match(/\d+/)
  return m ? parseInt(m[0]) : Number.MAX_SAFE_INTEGER
}
function makeComparator(field, dir) {
  const s = dir === 'asc' ? 1 : -1
  return function (a, b) {
    if (field === 'n') {
      const ka = cardNumKey(a.n), kb = cardNumKey(b.n)
      if (ka !== kb) return (ka - kb) * s
      return String(a.n).localeCompare(String(b.n)) * s
    }
    const va = String(a[field] || '').toLowerCase()
    const vb = String(b[field] || '').toLowerCase()
    if (va === vb) return 0
    if (!va) return 1
    if (!vb) return -1
    return va.localeCompare(vb) * s
  }
}

function SortHeader({ label, field, sortField, sortDir, onClick, align, grow }) {
  const active = sortField === field
  return (
    <button onClick={() => onClick(field)}
      style={{
        flex: grow ? '1 1 auto' : '0 0 auto', textAlign: align || 'left', background: 'none', border: 'none',
        cursor: 'pointer', padding: 0, color: active ? '#d4a843' : '#888', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center',
        gap: 4, justifyContent: align === 'right' ? 'flex-end' : 'flex-start', minWidth: grow ? 0 : undefined
      }}>
      {label}<span style={{ opacity: active ? 1 : 0.35, fontSize: 9 }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )
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
  const [sortField, setSortField] = useState('n')
  const [sortDir, setSortDir] = useState('asc')

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir(field === 'n' ? 'asc' : 'asc') }
  }

  // Count-up animation for the hero stat cards.
  const [statN, setStatN] = useState({ sets: 0, cards: 0 })

  useEffect(() => {
    fetch('/data/index.json').then(r => r.json()).then(j => setSets(j.sets || [])).catch(() => {})
  }, [])

  const totalCards = useMemo(() => sets.reduce((s, x) => s + (x.cardCount || 0), 0), [sets])
  const sports = useMemo(() => ['All', ...[...new Set(sets.map(s => s.sport))].sort()], [sets])

  useEffect(() => {
    if (sets.length === 0) return
    const targetSets = sets.length, targetCards = totalCards
    const dur = 950, start = performance.now()
    let raf
    const tick = (t) => {
      const p = Math.min((t - start) / dur, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setStatN({ sets: Math.round(targetSets * e), cards: Math.round(targetCards * e) })
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sets.length, totalCards])

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

  const isLanding = !activeSet && !globalHits
  const goHome = () => { setActiveSet(null); setSetData(null); setGlobalHits(null); setQuery('') }
  const searchFor = (name) => { setQuery(name); setTimeout(runGlobalSearch, 0) }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 90px' }}>
      <style>{'.hq-setcard:hover{transform:translateY(-4px);border-color:#3a3a3a;box-shadow:0 18px 40px -18px rgba(0,0,0,0.9)}'}</style>
      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 0', flexWrap: 'wrap', gap: 12 }}>
        <div onClick={goHome} style={{ ...condensed, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', cursor: 'pointer', lineHeight: 1 }}>
          Checklist<span style={{ color: GOLD }}>HQ</span>
        </div>
        <div style={{ display: 'flex', gap: 26, alignItems: 'center' }}>
          {[['Sets', () => { goHome(); setSportFilter('All') }], ['Players', () => { goHome(); setTimeout(() => { const el = document.getElementById('hq-search'); if (el) el.focus() }, 0) }]].map(([label, fn]) => (
            <button key={label} onClick={fn} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</button>
          ))}
          <span style={{ ...condensed, fontSize: 14, fontWeight: 700, color: GOLD, border: '1px solid ' + GOLD + '66', borderRadius: 8, padding: '6px 12px', letterSpacing: '0.06em' }}>
            {statN.sets} SETS
          </span>
        </div>
      </nav>

      {isLanding ? (
        <>
          {/* HERO */}
          <section style={{
            position: 'relative', textAlign: 'center', padding: '54px 0 40px', marginBottom: 10,
            borderRadius: 20, overflow: 'hidden',
            background: 'radial-gradient(120% 100% at 50% 0%, rgba(212,168,67,0.08), rgba(10,10,10,0) 60%)'
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999,
              border: '1px solid rgba(212,168,67,0.35)', color: GOLD, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 26
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: GOLD, display: 'inline-block' }} />
              The Definitive Card Set Database · 2012–2017
            </span>
            <h1 style={{ ...condensed, fontSize: 'clamp(48px, 8vw, 104px)', fontWeight: 800, textTransform: 'uppercase', lineHeight: 0.92, letterSpacing: '-0.01em', margin: 0 }}>
              Every Card.<br /><span style={{ color: GOLD }}>Every Checklist.</span>
            </h1>
            <p style={{ color: '#9a9a9a', fontSize: 17, lineHeight: 1.6, maxWidth: 620, margin: '24px auto 0' }}>
              Complete set checklists for the modern era of Baseball, Football, Basketball, and Hockey — indexed, sectioned, and searchable.
            </p>

            {/* HERO SEARCH */}
            <div style={{ maxWidth: 680, margin: '34px auto 0', display: 'flex', gap: 0, background: '#141414', border: '1px solid #2e2e2e', borderRadius: 14, padding: 6, boxShadow: '0 20px 50px -20px rgba(0,0,0,0.8)' }}>
              <input
                id="hq-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runGlobalSearch() }}
                placeholder="Search any player across every set"
                style={{ flex: 1, background: 'transparent', border: 'none', padding: '14px 16px', color: '#f5f5f5', fontSize: 16, outline: 'none' }}
              />
              <button onClick={runGlobalSearch} disabled={searching || query.trim().length < 3}
                style={{ ...condensed, background: GOLD, color: '#111', border: 'none', borderRadius: 10, padding: '0 26px', fontWeight: 800, fontSize: 16, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', opacity: searching || query.trim().length < 3 ? 0.5 : 1 }}>
                {searching ? '…' : 'Search'}
              </button>
            </div>
            <p style={{ color: '#666', fontSize: 13, margin: '14px 0 0' }}>
              Try {['Kris Bryant', 'Connor McDavid', 'Todd Gurley', 'Karl-Anthony Towns'].map((n, i) => (
                <span key={n}>
                  {i > 0 ? ' · ' : ' '}
                  <button onClick={() => searchFor(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GOLD, fontSize: 13, padding: 0 }}>{n}</button>
                </span>
              ))}
            </p>

            {/* STAT CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 680, margin: '38px auto 0' }}>
              {[[statN.sets.toLocaleString(), 'Sets Indexed'], [(statN.cards >= 1000 ? Math.round(statN.cards / 1000) + 'K+' : statN.cards), 'Cards Cataloged'], ['4', 'Sports Covered']].map(([n, label]) => (
                <div key={label} style={{ background: 'linear-gradient(160deg, #171717, #0e0e0e)', border: '1px solid #262626', borderRadius: 14, padding: '22px 14px' }}>
                  <p style={{ ...condensed, margin: 0, fontSize: 40, fontWeight: 800, color: GOLD, lineHeight: 1 }}>{n}</p>
                  <p style={{ margin: '8px 0 0', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* SPORT CHIPS + FEATURED HEADING */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, margin: '40px 0 18px' }}>
            <h2 style={{ ...condensed, fontSize: 24, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
              {sportFilter === 'All' ? 'Featured Sets' : sportFilter + ' Sets'}
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !activeSet) runGlobalSearch() }}
            placeholder={activeSet ? 'Filter this set (player, team, card #)…' : 'Search players across every set…'}
            style={{ flex: 1, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: '13px 16px', color: '#f5f5f5', fontSize: 15, outline: 'none' }}
          />
          {!activeSet && (
            <button onClick={runGlobalSearch} disabled={searching || query.trim().length < 3}
              style={{ background: GOLD, color: '#111', border: 'none', borderRadius: 10, padding: '0 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: searching || query.trim().length < 3 ? 0.5 : 1 }}>
              {searching ? 'Searching…' : 'Player Search'}
            </button>
          )}
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
              {(setData.sections || []).some(s => s.odds) && <Chip>Pack odds</Chip>}
            </div>
            <h1 style={{ ...condensed, fontSize: 34, fontWeight: 800, textTransform: 'uppercase', margin: 0, lineHeight: 1.05 }}>{setData.name}</h1>
            <p style={{ color: '#8a8a8a', fontSize: 13, margin: '10px 0 0' }}>
              {(setData.sections || []).reduce((s, x) => s + x.cards.length, 0).toLocaleString()} cards
              {rcCount(setData) > 0 ? ' · ' + rcCount(setData) + ' rookies flagged' : ''} · source: {setData.source}
            </p>
          </div>

          {setData.boxBreak && setData.boxBreak.length > 0 && (
            <div style={{ background: 'linear-gradient(140deg, #17140c, #0e0e0e)', border: '1px solid ' + GOLD + '33', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
              <p style={{ ...condensed, fontSize: 15, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: GOLD, margin: '0 0 12px' }}>
                📦 Box Break — what a hobby box yields
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px 20px' }}>
                {setData.boxBreak.map((b, i) => {
                  const m = String(b).match(/^(\d+(?:\.\d+)?)\s+(.*)$/)
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
                      <span style={{ ...condensed, color: GOLD, fontWeight: 800, fontSize: 16, minWidth: 28 }}>{m ? m[1] + '×' : ''}</span>
                      <span style={{ color: '#cfcfcf' }}>{m ? m[2] : b}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

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

          <p style={{ color: '#666', fontSize: 12, margin: '0 0 12px' }}>Click a column header to sort.</p>
          {visibleSections.map(sec => {
            const sorted = sec.cards.slice().sort(makeComparator(sortField, sortDir))
            return (
              <div key={sec.title} style={{ marginBottom: 26 }}>
                <h2 style={{ ...condensed, fontSize: 21, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>
                  {sec.title} <span style={{ color: '#666', fontSize: 15 }}>· {sec.cards.length}</span>
                </h2>
                {sec.odds && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 10px', padding: '8px 12px', background: '#141109', border: '1px solid ' + GOLD + '2e', borderRadius: 9 }}>
                    <span style={{ ...condensed, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: GOLD, textTransform: 'uppercase', whiteSpace: 'nowrap', paddingTop: 1 }}>Pack Odds</span>
                    <span style={{ color: '#b9b9b9', fontSize: 12.5, lineHeight: 1.5 }}>{sec.odds}</span>
                  </div>
                )}
                <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', gap: 14, padding: '9px 16px', background: '#181818', borderBottom: '1px solid #262626', alignItems: 'center' }}>
                    <div style={{ flex: '0 0 68px' }}><SortHeader label="Card #" field="n" sortField={sortField} sortDir={sortDir} onClick={toggleSort} /></div>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}><SortHeader label="Player" field="p" sortField={sortField} sortDir={sortDir} onClick={toggleSort} grow /></div>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}><SortHeader label="Team" field="t" sortField={sortField} sortDir={sortDir} onClick={toggleSort} grow /></div>
                    <div style={{ flex: '0 0 70px' }}><SortHeader label="Flag" field="x" sortField={sortField} sortDir={sortDir} onClick={toggleSort} align="right" /></div>
                  </div>
                  {sorted.slice(0, 1000).map((c, i) => (
                    <div key={i} style={{
                      display: 'flex', gap: 14, padding: '8px 16px', fontSize: 14,
                      background: i % 2 === 0 ? '#0f0f0f' : '#141414', alignItems: 'baseline'
                    }}>
                      <span style={{ flex: '0 0 68px', color: GOLD, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>#{c.n}</span>
                      <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 600 }}>{c.p}</span>
                      <span style={{ flex: '1 1 auto', minWidth: 0, color: '#888', fontSize: 13 }}>{c.t || ''}</span>
                      <span style={{ flex: '0 0 70px', textAlign: 'right' }}>{c.x ? <Chip color={c.x === 'RC' ? '#4ade80' : '#888'}>{c.x}</Chip> : null}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filteredSets.sort((a, b) => (b.year - a.year) || a.name.localeCompare(b.name)).map((s) => {
              const c = SPORT_COLORS[s.sport] || GOLD
              return (
                <button key={s.slug} onClick={() => openSet(s)} className="hq-setcard"
                  style={{
                    position: 'relative', textAlign: 'left', background: 'linear-gradient(155deg, #161616, #0d0d0d)',
                    border: '1px solid #242424', borderRadius: 14, padding: '18px 18px 16px', color: '#f5f5f5',
                    cursor: 'pointer', overflow: 'hidden', transition: 'transform .16s ease, border-color .16s ease, box-shadow .16s ease'
                  }}>
                  {/* foil edge in the sport color */}
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg, ' + c + ', ' + c + '44)' }} />
                  {/* holographic sheen */}
                  <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, transparent 40%, ' + c + '10 50%, transparent 60%)', pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ color: c, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{s.sport} · {s.year}</span>
                    <span style={{ color: '#666', fontSize: 11 }}>{(s.sections || 0)} sec</span>
                  </div>
                  <p style={{ ...condensed, margin: '0 0 12px', fontSize: 20, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.1, minHeight: 44 }}>{s.name.replace(/^\d{4}(-\d{2})?\s*/, '')}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #222', paddingTop: 10 }}>
                    <span style={{ ...condensed, fontSize: 22, fontWeight: 800, color: GOLD }}>{(s.cardCount || 0).toLocaleString()}</span>
                    <span style={{ color: '#777', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Cards</span>
                  </div>
                </button>
              )
            })}
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
