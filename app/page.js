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

const BRAND_COLORS = { Panini: '#e11d48', Topps: '#ef8c1c', 'Upper Deck': '#2563eb', Leaf: '#16a34a', Other: '#888' }

// Ordered product-line matchers → [brand, product]. First match wins, so more
// specific lines (Bowman Chrome) precede general ones (Bowman).
const PRODUCT_MAP = [
  [/topps chrome/, 'Topps', 'Topps Chrome'], [/bowman chrome/, 'Topps', 'Bowman Chrome'],
  [/bowman'?s best/, 'Topps', "Bowman's Best"], [/bowman sterling/, 'Topps', 'Bowman Sterling'],
  [/bowman platinum/, 'Topps', 'Bowman Platinum'], [/bowman draft/, 'Topps', 'Bowman Draft'],
  [/bowman/, 'Topps', 'Bowman'], [/topps heritage/, 'Topps', 'Heritage'],
  [/stadium club/, 'Topps', 'Stadium Club'], [/gypsy queen/, 'Topps', 'Gypsy Queen'],
  [/allen ?(&|and) ?ginter/, 'Topps', 'Allen & Ginter'], [/topps finest|(?<![a-z])finest/, 'Topps', 'Finest'],
  [/topps fire/, 'Topps', 'Topps Fire'], [/gold label/, 'Topps', 'Gold Label'],
  [/topps archives/, 'Topps', 'Archives'], [/museum collection/, 'Topps', 'Museum Collection'],
  [/tier one/, 'Topps', 'Tier One'], [/triple threads/, 'Topps', 'Triple Threads'],
  [/topps tribute/, 'Topps', 'Tribute'], [/topps inception/, 'Topps', 'Inception'],
  [/topps dynasty/, 'Topps', 'Dynasty'], [/definitive collection/, 'Topps', 'Definitive'],
  [/big league/, 'Topps', 'Big League'], [/topps platinum/, 'Topps', 'Topps Platinum'],
  [/topps/, 'Topps', 'Topps'],
  [/panini prizm|(?<![a-z])prizm/, 'Panini', 'Prizm'], [/donruss optic|(?<![a-z])optic/, 'Panini', 'Donruss Optic'],
  [/(?<![a-z])donruss/, 'Panini', 'Donruss'], [/(?<![a-z])select/, 'Panini', 'Select'],
  [/contenders/, 'Panini', 'Contenders'], [/national treasures/, 'Panini', 'National Treasures'],
  [/immaculate/, 'Panini', 'Immaculate'], [/(?<![a-z])mosaic/, 'Panini', 'Mosaic'],
  [/flawless/, 'Panini', 'Flawless'], [/(?<![a-z])absolute/, 'Panini', 'Absolute'],
  [/(?<![a-z])certified/, 'Panini', 'Certified'], [/(?<![a-z])spectra/, 'Panini', 'Spectra'],
  [/(?<![a-z])obsidian/, 'Panini', 'Obsidian'], [/(?<![a-z])phoenix/, 'Panini', 'Phoenix'],
  [/(?<![a-z])chronicles/, 'Panini', 'Chronicles'], [/(?<![a-z])playbook/, 'Panini', 'Playbook'],
  [/(?<![a-z])prestige/, 'Panini', 'Prestige'], [/(?<![a-z])score/, 'Panini', 'Score'],
  [/diamond kings/, 'Panini', 'Diamond Kings'], [/crown royale/, 'Panini', 'Crown Royale'],
  [/rookies (&|and) stars/, 'Panini', 'Rookies & Stars'], [/(?<![a-z])elite/, 'Panini', 'Elite'],
  [/(?<![a-z])revolution/, 'Panini', 'Revolution'], [/(?<![a-z])illusions/, 'Panini', 'Illusions'],
  [/gold standard/, 'Panini', 'Gold Standard'], [/(?<![a-z])origins/, 'Panini', 'Origins'],
  [/(?<![a-z])zenith/, 'Panini', 'Zenith'], [/(?<![a-z])panini/, 'Panini', 'Panini'],
  [/o-?pee-?chee platinum/, 'Upper Deck', 'O-Pee-Chee Platinum'], [/o-?pee-?chee/, 'Upper Deck', 'O-Pee-Chee'],
  [/sp authentic/, 'Upper Deck', 'SP Authentic'], [/sp game used/, 'Upper Deck', 'SP Game Used'],
  [/(?<![a-z])spx/, 'Upper Deck', 'SPx'], [/the cup/, 'Upper Deck', 'The Cup'],
  [/black diamond/, 'Upper Deck', 'Black Diamond'], [/(?<![a-z])artifacts/, 'Upper Deck', 'Artifacts'],
  [/ultimate collection/, 'Upper Deck', 'Ultimate Collection'], [/(?<![a-z])trilogy/, 'Upper Deck', 'Trilogy'],
  [/(?<![a-z])allure/, 'Upper Deck', 'Allure'], [/(?<![a-z])engrained/, 'Upper Deck', 'Engrained'],
  [/(?<![a-z])synergy/, 'Upper Deck', 'Synergy'], [/(?<![a-z])parkhurst/, 'Upper Deck', 'Parkhurst'],
  [/(?<![a-z])stature/, 'Upper Deck', 'Stature'], [/upper deck ice|(?<![a-z])ice hockey/, 'Upper Deck', 'Ice'],
  [/(?<![a-z])compendium/, 'Upper Deck', 'Compendium'], [/(?<![a-z])fleer/, 'Upper Deck', 'Fleer'],
  [/(?<![a-z])skybox/, 'Upper Deck', 'SkyBox'], [/upper deck mvp|(?<![a-z])mvp hockey/, 'Upper Deck', 'MVP'],
  [/upper deck/, 'Upper Deck', 'Upper Deck'],
  [/(?<![a-z])leaf metal/, 'Leaf', 'Leaf Metal'], [/(?<![a-z])leaf trinity/, 'Leaf', 'Leaf Trinity'],
  [/leaf ultimate/, 'Leaf', 'Leaf Ultimate'], [/(?<![a-z])itg|in the game/, 'Leaf', 'ITG'],
  [/(?<![a-z])leaf/, 'Leaf', 'Leaf']
]

function classifySet(name) {
  const n = (name || '').toLowerCase()
  for (const [re, brand, product] of PRODUCT_MAP) {
    if (re.test(n)) return { brand, product }
  }
  return { brand: 'Other', product: 'Other' }
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
  const [brandFilter, setBrandFilter] = useState('All')
  const [productFilter, setProductFilter] = useState('All')
  const [view, setView] = useState('browse') // browse | patchswaps
  const [patchData, setPatchData] = useState(null)
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

  // Every set tagged with brand + product (derived from its name).
  const taggedSets = useMemo(() => sets.map(s => Object.assign({}, s, classifySet(s.name))), [sets])

  const brands = useMemo(() => {
    const base = sportFilter === 'All' ? taggedSets : taggedSets.filter(s => s.sport === sportFilter)
    return ['All', ...[...new Set(base.map(s => s.brand))].sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))]
  }, [taggedSets, sportFilter])

  const products = useMemo(() => {
    let base = taggedSets
    if (sportFilter !== 'All') base = base.filter(s => s.sport === sportFilter)
    if (brandFilter !== 'All') base = base.filter(s => s.brand === brandFilter)
    return ['All', ...[...new Set(base.map(s => s.product))].filter(p => p !== 'Other').sort()]
  }, [taggedSets, sportFilter, brandFilter])

  const filteredSets = useMemo(() => {
    let list = taggedSets
    if (sportFilter !== 'All') list = list.filter(s => s.sport === sportFilter)
    if (brandFilter !== 'All') list = list.filter(s => s.brand === brandFilter)
    if (productFilter !== 'All') list = list.filter(s => s.product === productFilter)
    const term = query.trim().toLowerCase()
    if (term && !activeSet) list = list.filter(s => s.name.toLowerCase().includes(term))
    return list
  }, [taggedSets, sportFilter, brandFilter, productFilter, query, activeSet])

  const rcCount = (j) => (j.sections || []).reduce((s, sec) => s + sec.cards.filter(c => c.x === 'RC').length, 0)

  const isLanding = !activeSet && !globalHits && view === 'browse'
  const goHome = () => { setActiveSet(null); setSetData(null); setGlobalHits(null); setQuery(''); setView('browse') }
  const openPatchSwaps = () => {
    setView('patchswaps'); setActiveSet(null); setSetData(null); setGlobalHits(null)
    if (!patchData) fetch('/data/patch-swaps.json').then(r => r.json()).then(setPatchData).catch(() => setPatchData({ entries: [] }))
    window.scrollTo(0, 0)
  }
  const searchFor = (name) => { setQuery(name); setTimeout(runGlobalSearch, 0) }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 90px' }}>
      <style>{'.hq-setcard:hover{transform:translateY(-4px);border-color:#3a3a3a;box-shadow:0 18px 40px -18px rgba(0,0,0,0.9)}'}</style>
      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 0', flexWrap: 'wrap', gap: 12 }}>
        <div onClick={goHome} style={{ ...condensed, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', cursor: 'pointer', lineHeight: 1 }}>
          Checklist<span style={{ color: GOLD }}>HQ</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['Sets', () => { goHome(); setSportFilter('All') }], ['Players', () => { goHome(); setTimeout(() => { const el = document.getElementById('hq-search'); if (el) el.focus() }, 0) }], ['Patch Swaps', openPatchSwaps]].map(([label, fn]) => (
            <button key={label} onClick={fn} style={{ background: 'none', border: 'none', cursor: 'pointer', color: (label === 'Patch Swaps' && view === 'patchswaps') ? GOLD : '#bbb', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</button>
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

          {/* FILTERS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, margin: '40px 0 14px' }}>
            <h2 style={{ ...condensed, fontSize: 24, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
              {productFilter !== 'All' ? productFilter + ' Sets' : sportFilter === 'All' ? 'Featured Sets' : sportFilter + ' Sets'}
              <span style={{ color: '#555', fontSize: 15, marginLeft: 10 }}>{filteredSets.length}</span>
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sports.map(sp => (
                <button key={sp} onClick={() => { setSportFilter(sp); setBrandFilter('All'); setProductFilter('All') }}
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
          {/* BRAND CHIPS + PRODUCT DROPDOWN */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: '#666', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', marginRight: 2 }}>Brand</span>
              {brands.map(b => (
                <button key={b} onClick={() => { setBrandFilter(b); setProductFilter('All') }}
                  style={{
                    padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
                    background: brandFilter === b ? (BRAND_COLORS[b] || GOLD) : '#141414',
                    color: brandFilter === b ? '#fff' : '#999',
                    border: '1px solid ' + (brandFilter === b ? 'transparent' : '#2a2a2a')
                  }}>{b}</button>
              ))}
            </div>
            {products.length > 1 && (
              <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}
                style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, color: '#ddd', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>
                <option value="All">All products ({products.length - 1})</option>
                {products.slice(1).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </>
      ) : (activeSet || globalHits) ? (
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
      ) : null}

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
      ) : view === 'patchswaps' ? (
        <section>
          <div style={{ background: 'linear-gradient(140deg, #1a1512, #0e0e0e)', border: '1px solid ' + GOLD + '33', borderRadius: 18, padding: '30px 30px', marginBottom: 24 }}>
            <h1 style={{ ...condensed, fontSize: 40, fontWeight: 800, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>Patch Swaps</h1>
            <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
              A running record of cards known to have had their game-used or manufactured patches swapped — with the original and the replacement patch side by side so collectors can spot altered cards before they buy.
            </p>
            <p style={{ color: '#888', fontSize: 13, margin: '16px 0 0' }}>
              Primary source:{' '}
              <a href={(patchData && patchData.source && patchData.source.url) || 'https://www.instagram.com/fake_hockey_patches/'} target="_blank" rel="noreferrer" style={{ color: GOLD, fontWeight: 700 }}>
                @fake_hockey_patches
              </a>{' '}on Instagram — the definitive community feed documenting swapped hockey patches.
            </p>
          </div>

          {!patchData ? (
            <p style={{ color: '#666' }}>Loading…</p>
          ) : patchData.entries.filter(e => e.player || e.card).length === 0 ? (
            <div style={{ border: '1px dashed #333', borderRadius: 14, padding: '40px 28px', textAlign: 'center' }}>
              <p style={{ ...condensed, fontSize: 22, fontWeight: 700, textTransform: 'uppercase', color: '#ccc', margin: 0 }}>Case file is being built</p>
              <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, maxWidth: 560, margin: '12px auto 0' }}>
                Documented swaps are being catalogued here with before/after photos. Follow{' '}
                <a href="https://www.instagram.com/fake_hockey_patches/" target="_blank" rel="noreferrer" style={{ color: GOLD }}>@fake_hockey_patches</a>{' '}
                for the live feed in the meantime.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {patchData.entries.filter(e => e.player || e.card).map((e) => (
                <div key={e.id} style={{ background: 'linear-gradient(155deg, #161616, #0d0d0d)', border: '1px solid #262626', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: '#000' }}>
                    {[['Original', e.originalImg], ['Swapped', e.swappedImg]].map(([lbl, img]) => (
                      <div key={lbl} style={{ position: 'relative', aspectRatio: '1', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {img ? <img src={img} alt={lbl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ color: '#444', fontSize: 12 }}>{lbl} photo</span>}
                        <span style={{ position: 'absolute', top: 8, left: 8, background: lbl === 'Swapped' ? '#e11d48' : '#333', color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 4 }}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '16px 18px' }}>
                    <p style={{ ...condensed, margin: 0, fontSize: 19, fontWeight: 800, textTransform: 'uppercase' }}>{e.player || e.card}</p>
                    <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>{[e.year, e.set, e.card].filter(Boolean).join(' · ')}</p>
                    {e.summary && <p style={{ color: '#b9b9b9', fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>{e.summary}</p>}
                    {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer" style={{ color: GOLD, fontSize: 12, fontWeight: 700, display: 'inline-block', marginTop: 10 }}>View source →</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
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
