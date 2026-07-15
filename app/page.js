'use client'

// Checklist HQ v2 — sectioned checklist database (Base / Inserts / Autos …)
// imported from cardboardconnection.com. Static JSON under /public/data:
// index.json lists sets; each set file carries sections -> cards.
import { useEffect, useMemo, useState } from 'react'
import { useAccount, AccountChip, AuthModal, CollectionView, CommunityView } from '../components/community'
import { addWant } from '../lib/supa'

const GOLD = '#d4a843'
const condensed = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }

// Instagram post embeds (Patch Swaps gallery). Renders official IG blockquote
// embeds and loads embed.js once; process() upgrades them into full post cards
// with the actual swapped-card photos.
function InstagramEmbeds({ urls }) {
  useEffect(() => {
    const process = () => { if (window.instgrm && window.instgrm.Embeds) window.instgrm.Embeds.process() }
    if (window.instgrm) { process(); return }
    const s = document.createElement('script')
    s.src = 'https://www.instagram.com/embed.js'
    s.async = true
    s.onload = process
    document.body.appendChild(s)
  }, [urls])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(326px, 1fr))', gap: 16 }}>
      {urls.map((u) => (
        <blockquote key={u} className="instagram-media" data-instgrm-permalink={u} data-instgrm-version="14"
          style={{ background: '#0d0d0d', border: '1px solid #262626', borderRadius: 14, margin: 0, padding: 0, minHeight: 430, maxWidth: '100%' }}>
          <a href={u} target="_blank" rel="noreferrer" style={{ color: '#666', fontSize: 12, display: 'block', padding: 16 }}>View this post on Instagram</a>
        </blockquote>
      ))}
    </div>
  )
}

const SPORT_COLORS = {
  Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e',
  UFC: '#dc2626', Boxing: '#eab308',
  'Pokémon': '#facc15', 'Yu-Gi-Oh!': '#a855f7', Magic: '#f59e0b', Lorcana: '#8b5cf6', 'One Piece': '#ef4444', Disney: '#ec4899'
}
// Which categories are trading card games (vs traditional sports cards).
const TCG_SET = new Set(['Pokémon', 'Yu-Gi-Oh!', 'Magic', 'Lorcana', 'One Piece', 'Disney'])

const BRAND_COLORS = { Panini: '#e11d48', Topps: '#ef8c1c', 'Upper Deck': '#2563eb', Leaf: '#16a34a', Other: '#888' }

const RPA_TYPES = [['RPA', 'Rookie Patch Auto'], ['PA', 'Patch Auto'], ['RA', 'Rookie Auto'], ['AU', 'Autograph'], ['PATCH', 'Patch'], ['RELIC', 'Relic'], ['All', 'All Hits']]
const RPA_TYPE_COLOR = { RPA: '#d4a843', PA: '#e11d48', RA: '#8b5cf6', AU: '#2563eb', PATCH: '#16a34a', RELIC: '#f97316', All: '#888' }

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

function NewsTicker({ label, color, items, speed }) {
  if (!items || items.length === 0) return null
  const row = items.concat(items) // duplicate for seamless loop
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #222', borderRadius: 10, overflow: 'hidden', background: '#0e0e0e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', background: color, color: '#0a0a0a', flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#0a0a0a', opacity: 0.55 }} />
        <span style={{ ...condensed, fontSize: 13, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ overflow: 'hidden', flex: 1, position: 'relative' }}>
        <div className="hq-track" style={{ animationDuration: (speed || 80) + 's' }}>
          {row.map((it, i) => (
            <a key={i} href={it.link || '#'} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', textDecoration: 'none', borderRight: '1px solid #1c1c1c' }}>
              <span style={{ width: 4, height: 4, borderRadius: 999, background: color, flexShrink: 0 }} />
              <span style={{ color: '#c4c4c4', fontSize: 13 }}>{it.title}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
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
  const [sortBy, setSortBy] = useState('year-desc')
  const [view, setView] = useState('browse') // browse | patchswaps | rpa | community | collection
  const account = useAccount()
  const [authOpen, setAuthOpen] = useState(false)
  const [wantFlash, setWantFlash] = useState('')
  const [patchData, setPatchData] = useState(null)
  const [rpaData, setRpaData] = useState(null)
  const [rpaType, setRpaType] = useState('RPA')
  const [rpaQuery, setRpaQuery] = useState('')
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
  const [news, setNews] = useState({ sports: [], tcg: [] })
  useEffect(() => {
    fetch('/api/hobby-news').then(r => r.json()).then(setNews).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/data/index.json').then(r => r.json()).then(j => setSets(j.sets || [])).catch(() => {})
  }, [])

  const totalCards = useMemo(() => sets.reduce((s, x) => s + (x.cardCount || 0), 0), [sets])
  const sports = useMemo(() => {
    const order = ['Baseball', 'Football', 'Basketball', 'Hockey', 'Soccer', 'UFC', 'Boxing', 'Pokémon', 'Yu-Gi-Oh!', 'Magic', 'Lorcana', 'One Piece', 'Disney']
    const present = [...new Set(sets.map(s => s.sport))]
    present.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
    })
    return ['All', ...present]
  }, [sets])
  const yearRange = useMemo(() => {
    const ys = sets.map(s => s.year).filter(Boolean)
    return ys.length ? Math.min(...ys) + '–' + Math.max(...ys) : ''
  }, [sets])

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
        idx = await r.json() // { slugs, sections, teams, rows }
        setSearchIndex(idx)
      } catch (e) { idx = { slugs: [], sections: [], teams: [], rows: [] } }
    }
    const setMeta = {}
    for (const s of sets) setMeta[s.slug] = s
    const { slugs, sections, teams, rows } = idx
    const hits = []
    for (let i = 0; i < rows.length && hits.length < 800; i++) {
      const row = rows[i] // [player, slugId, number, sectionId, teamId, flag]
      if (row[0].toLowerCase().includes(term)) {
        const slug = slugs[row[1]]
        const m = setMeta[slug] || {}
        hits.push({ p: row[0], slug, n: row[2], section: sections[row[3]] || '', t: row[4] >= 0 ? teams[row[4]] : '', x: row[5], set: m.name, year: m.year, sport: m.sport })
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
    if (sportFilter === 'TCG') list = list.filter(s => TCG_SET.has(s.sport))
    else if (sportFilter === 'Sports') list = list.filter(s => !TCG_SET.has(s.sport))
    else if (sportFilter !== 'All') list = list.filter(s => s.sport === sportFilter)
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
  const openRpa = () => {
    setView('rpa'); setActiveSet(null); setSetData(null); setGlobalHits(null)
    if (!rpaData) fetch('/data/rpa-index.json').then(r => r.json()).then(setRpaData).catch(() => setRpaData({ slugs: [], rows: [] }))
    window.scrollTo(0, 0)
  }
  const openView = (v) => { setView(v); setActiveSet(null); setSetData(null); setGlobalHits(null); window.scrollTo(0, 0) }
  // Wantlist add — whole set or a single card/parallel from the set page.
  const wantIt = async (item) => {
    if (!account.session) { setAuthOpen(true); return }
    await addWant(account.session.user.id, item)
    setWantFlash(item.card_n ? `#${item.card_n} added to your wantlist` : 'Set added to your wantlist')
    setTimeout(() => setWantFlash(''), 2500)
  }

  const rpaResults = useMemo(() => {
    if (!rpaData) return []
    const meta = {}
    for (const s of sets) meta[s.slug] = s
    const term = rpaQuery.trim().toLowerCase()
    const out = []
    for (const r of rpaData.rows) { // [player, number, slugId, type, serial]
      if (rpaType !== 'All' && r[3] !== rpaType) continue
      if (term && !r[0].toLowerCase().includes(term)) continue
      const m = meta[rpaData.slugs[r[2]]] || {}
      if (sportFilter !== 'All' && m.sport !== sportFilter) continue
      out.push({ p: r[0], n: r[1], type: r[3], serial: r[4], slug: rpaData.slugs[r[2]], set: m.name, year: m.year, sport: m.sport })
      if (out.length >= 1200) break
    }
    out.sort((a, b) => (b.year || 0) - (a.year || 0))
    return out
  }, [rpaData, rpaType, rpaQuery, sportFilter, sets])
  const searchFor = (name) => { setQuery(name); setTimeout(runGlobalSearch, 0) }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 90px' }}>
      <style>{'.hq-setcard:hover{transform:translateY(-4px);border-color:#3a3a3a;box-shadow:0 18px 40px -18px rgba(0,0,0,0.9)}@keyframes hqticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hq-track{display:inline-flex;white-space:nowrap;animation:hqticker linear infinite}.hq-track:hover{animation-play-state:paused}'}</style>
      {/* NAV */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 0', flexWrap: 'wrap', gap: 12 }}>
        <div onClick={goHome} style={{ ...condensed, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', cursor: 'pointer', lineHeight: 1 }}>
          Checklist<span style={{ color: GOLD }}>HQ</span>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['Sets', () => { goHome(); setSportFilter('All') }, 'browse'], ['RPA Tracker', openRpa, 'rpa'], ['Patch Swaps', openPatchSwaps, 'patchswaps'], ['Community', () => openView('community'), 'community'], ['My Collection', () => openView('collection'), 'collection']].map(([label, fn, v]) => (
            <button key={label} onClick={fn} style={{ background: 'none', border: 'none', cursor: 'pointer', color: view === v ? GOLD : '#bbb', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</button>
          ))}
          <AccountChip account={account} onOpenAuth={() => setAuthOpen(true)} />
          <span style={{ ...condensed, fontSize: 14, fontWeight: 700, color: GOLD, border: '1px solid ' + GOLD + '66', borderRadius: 8, padding: '6px 12px', letterSpacing: '0.06em' }}>
            {statN.sets} SETS
          </span>
        </div>
      </nav>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} account={account} />
      {wantFlash && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 95, background: GOLD, color: '#111', fontWeight: 800, fontSize: 14, padding: '12px 20px', borderRadius: 12, boxShadow: '0 8px 30px #000a' }}>{wantFlash}</div>
      )}

      {isLanding ? (
        <>
          {/* HERO */}
          <section style={{
            position: 'relative', textAlign: 'center', padding: '54px 0 40px', marginBottom: 10,
            borderRadius: 20, overflow: 'hidden',
            background: 'radial-gradient(120% 100% at 50% 0%, rgba(212,168,67,0.08), rgba(10,10,10,0) 60%)'
          }}>
            {/* CARD HQ logo — three fanned cards */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <svg width="46" height="46" viewBox="0 0 96 96" aria-hidden="true">
                <g transform="rotate(-14 48 84)"><rect x="29" y="16" width="38" height="56" rx="5" fill="#0a0a0a" stroke={GOLD} strokeWidth="3.5" opacity="0.4" /></g>
                <g transform="rotate(0 48 84)"><rect x="29" y="14" width="38" height="56" rx="5" fill="#0a0a0a" stroke={GOLD} strokeWidth="3.5" opacity="0.68" /></g>
                <g transform="rotate(14 48 84)"><rect x="29" y="12" width="38" height="56" rx="5" fill="#0f0e0c" stroke={GOLD} strokeWidth="4" /><line x1="36" y1="54" x2="60" y2="54" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.55" /></g>
              </svg>
              <div style={{ textAlign: 'left', lineHeight: 1 }}>
                <div style={{ ...condensed, fontSize: 36, fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase' }}><span style={{ color: '#f2f0ec' }}>Card</span><span style={{ color: GOLD, marginLeft: 8 }}>HQ</span></div>
                <div style={{ ...condensed, fontSize: 11, fontWeight: 600, letterSpacing: '5px', color: '#6f6c63', textTransform: 'uppercase', marginTop: 5 }}>Checklist Database</div>
              </div>
            </div>
            <br />
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999,
              border: '1px solid rgba(212,168,67,0.35)', color: GOLD, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 26
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: GOLD, display: 'inline-block' }} />
              The Definitive Card Set Database{yearRange ? ' · ' + yearRange : ''}
            </span>
            <h1 style={{ ...condensed, fontSize: 'clamp(48px, 8vw, 104px)', fontWeight: 800, textTransform: 'uppercase', lineHeight: 0.92, letterSpacing: '-0.01em', margin: 0 }}>
              Every Card.<br /><span style={{ color: GOLD }}>Every Checklist.</span>
            </h1>
            <p style={{ color: '#9a9a9a', fontSize: 17, lineHeight: 1.6, maxWidth: 620, margin: '24px auto 0' }}>
              Complete set checklists for sports cards and trading card games — Baseball, Football, Basketball, Hockey, Pokémon, Lorcana and more, indexed, sectioned, and searchable.
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
              Try {['Michael Jordan', 'Tom Brady', 'Mickey Mantle', 'Nikita Kucherov', 'Charizard'].map((n, i) => (
                <span key={n}>
                  {i > 0 ? ' · ' : ' '}
                  <button onClick={() => searchFor(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: GOLD, fontSize: 13, padding: 0 }}>{n}</button>
                </span>
              ))}
            </p>

            {/* STAT CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, maxWidth: 680, margin: '38px auto 0' }}>
              {[[statN.sets.toLocaleString(), 'Sets Indexed'], [(statN.cards >= 1000000 ? (statN.cards / 1000000).toFixed(1) + 'M+' : statN.cards >= 1000 ? Math.round(statN.cards / 1000) + 'K+' : String(statN.cards)), 'Cards Cataloged'], [String(Math.max(sports.length - 1, 0)), 'Categories']].map(([n, label]) => (
                <div key={label} style={{ background: 'linear-gradient(160deg, #171717, #0e0e0e)', border: '1px solid #262626', borderRadius: 14, padding: '22px 14px' }}>
                  <p style={{ ...condensed, margin: 0, fontSize: 40, fontWeight: 800, color: GOLD, lineHeight: 1 }}>{n}</p>
                  <p style={{ margin: '8px 0 0', color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* HOBBY WIRE — Sports + TCG news tickers */}
          {(news.sports.length > 0 || news.tcg.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '30px 0 8px' }}>
              <p style={{ ...condensed, margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#777' }}>Hobby Wire</p>
              <NewsTicker label="Sports" color="#60a5fa" items={news.sports} speed={90} />
              <NewsTicker label="TCG" color="#e879f9" items={news.tcg} speed={80} />
            </div>
          )}

          {/* FILTERS */}
          {(() => {
            const sportCats = sports.filter(s => s !== 'All' && !TCG_SET.has(s))
            const tcgCats = sports.filter(s => TCG_SET.has(s))
            const pick = (v) => { setSportFilter(v); setBrandFilter('All'); setProductFilter('All') }
            const chip = (label, value, color) => (
              <button key={label} onClick={() => pick(value)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: sportFilter === value ? (color || GOLD) : '#141414',
                  color: sportFilter === value ? '#111' : '#999',
                  border: '1px solid ' + (sportFilter === value ? 'transparent' : '#2a2a2a')
                }}>{label}</button>
            )
            return (
              <div style={{ margin: '38px 0 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ ...condensed, fontSize: 24, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                    {productFilter !== 'All' ? productFilter + ' Sets' : sportFilter === 'All' ? 'Featured Sets' : sportFilter === 'TCG' ? 'Trading Card Games' : sportFilter === 'Sports' ? 'Sports Cards' : sportFilter + ' Sets'}
                    <span style={{ color: '#555', fontSize: 15, marginLeft: 10 }}>{filteredSets.length.toLocaleString()}</span>
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#666', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Sort</span>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                      style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, color: '#ddd', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>
                      <option value="year-desc">Newest first</option>
                      <option value="year-asc">Oldest first</option>
                      <option value="name-asc">Name (A–Z)</option>
                      <option value="name-desc">Name (Z–A)</option>
                      <option value="cards-desc">Most cards</option>
                      <option value="cards-asc">Fewest cards</option>
                      <option value="brand">Brand</option>
                    </select>
                    {chip('All', 'All', GOLD)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ color: '#666', fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', width: 42 }}>Sports</span>
                  {chip('All Sports', 'Sports', '#cbd5e1')}
                  {sportCats.map(sp => chip(sp, sp, SPORT_COLORS[sp]))}
                </div>
                {tcgCats.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #1c1c1c' }}>
                    <span style={{ color: '#666', fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', width: 42 }}>TCG</span>
                    {chip('All TCG', 'TCG', '#e879f9')}
                    {tcgCats.map(sp => chip(sp, sp, SPORT_COLORS[sp]))}
                  </div>
                )}
              </div>
            )
          })()}
          {/* BRAND CHIPS + PRODUCT DROPDOWN (sports only) */}
          {sportFilter !== 'TCG' && !TCG_SET.has(sportFilter) && (
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
          )}
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
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => wantIt({ set_slug: setData.slug, set_name: setData.name })}
                style={{ ...condensed, background: GOLD, color: '#111', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 800, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}>
                + Wantlist this set
              </button>
              <button onClick={() => { openView('collection') }}
                style={{ ...condensed, background: 'transparent', color: '#bbb', border: '1px solid #333', borderRadius: 9, padding: '8px 15px', fontWeight: 700, fontSize: 12.5, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }}>
                Track in My Collection
              </button>
            </div>
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
                      <button title="Add this card (and its parallel section) to your wantlist"
                        onClick={() => wantIt({ set_slug: setData.slug, set_name: setData.name, card_n: c.n, section: sec.title, player: c.p })}
                        style={{ flex: '0 0 26px', background: 'none', border: '1px solid #2c2c2c', color: '#7a7a7a', borderRadius: 6, fontSize: 13, lineHeight: '18px', cursor: 'pointer', padding: 0 }}>+</button>
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
      ) : view === 'community' ? (
        <CommunityView account={account} indexSets={sets} onOpenAuth={() => setAuthOpen(true)} />
      ) : view === 'collection' ? (
        <CollectionView account={account} indexSets={sets} onOpenAuth={() => setAuthOpen(true)}
          onOpenSet={(slug) => { const s = sets.find(x => x.slug === slug); if (s) { setView('browse'); openSet(s) } }} />
      ) : view === 'rpa' ? (
        <section>
          <div style={{ background: 'linear-gradient(140deg, #1a1512, #0e0e0e)', border: '1px solid ' + GOLD + '33', borderRadius: 18, padding: '30px 30px', marginBottom: 22 }}>
            <h1 style={{ ...condensed, fontSize: 40, fontWeight: 800, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>RPA Tracker</h1>
            <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
              Every Rookie Patch Auto, on-card autograph, patch and relic card across {statN.sets.toLocaleString()} sets — with its serial print run — so you can track the hobby's premium hits in one place.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {RPA_TYPES.map(([code, label]) => (
              <button key={code} onClick={() => setRpaType(code)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
                  background: rpaType === code ? (RPA_TYPE_COLOR[code] || GOLD) : '#141414',
                  color: rpaType === code ? '#111' : '#999',
                  border: '1px solid ' + (rpaType === code ? 'transparent' : '#2a2a2a')
                }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            {sports.map(sp => (
              <button key={sp} onClick={() => setSportFilter(sp)}
                style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em', textTransform: 'uppercase',
                  background: sportFilter === sp ? (SPORT_COLORS[sp] || GOLD) : '#141414',
                  color: sportFilter === sp ? '#111' : '#999', border: '1px solid ' + (sportFilter === sp ? 'transparent' : '#2a2a2a')
                }}>{sp}</button>
            ))}
          </div>
          <input value={rpaQuery} onChange={(e) => setRpaQuery(e.target.value)} placeholder="Filter by player…"
            style={{ width: '100%', boxSizing: 'border-box', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 16px', color: '#f5f5f5', fontSize: 15, outline: 'none', marginBottom: 16 }} />

          {!rpaData ? <p style={{ color: '#666' }}>Loading RPA database…</p> : (
            <>
              <p style={{ color: '#666', fontSize: 12, margin: '0 0 10px' }}>{rpaResults.length >= 1200 ? '1,200+' : rpaResults.length.toLocaleString()} cards{rpaQuery ? ' for “' + rpaQuery + '”' : ''}</p>
              <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 12, padding: '9px 16px', background: '#181818', borderBottom: '1px solid #262626', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888' }}>
                  <span style={{ flex: '0 0 56px' }}>Card</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>Player</span>
                  <span style={{ flex: '0 0 88px' }}>Type</span>
                  <span style={{ flex: '0 0 64px', textAlign: 'right' }}>Serial</span>
                  <span style={{ flex: '2 1 0', minWidth: 0 }}>Set</span>
                </div>
                {rpaResults.map((c, i) => (
                  <button key={i} onClick={() => { const s = sets.find(x => x.slug === c.slug); if (s) openSet(Object.assign({}, s, classifySet(s.name))) }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '8px 16px', fontSize: 14, alignItems: 'baseline', background: i % 2 === 0 ? '#0f0f0f' : '#141414', border: 'none', color: '#f5f5f5', cursor: 'pointer' }}>
                    <span style={{ flex: '0 0 56px', color: GOLD, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>#{c.n}</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 600 }}>{c.p}</span>
                    <span style={{ flex: '0 0 88px' }}><Chip color={RPA_TYPE_COLOR[c.type]}>{c.type}</Chip></span>
                    <span style={{ flex: '0 0 64px', textAlign: 'right', color: c.serial ? '#f5f5f5' : '#555', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.serial || '—'}</span>
                    <span style={{ flex: '2 1 0', minWidth: 0, color: '#888', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.year} {c.set}</span>
                  </button>
                ))}
                {rpaResults.length === 0 && <p style={{ padding: 20, color: '#666', fontSize: 14 }}>No hits match.</p>}
              </div>
            </>
          )}
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

          {!patchData ? <p style={{ color: '#666' }}>Loading…</p> : (
            <>
              {patchData.intro && (
                <p style={{ color: '#c9c9c9', fontSize: 15, lineHeight: 1.7, maxWidth: 820, margin: '0 0 26px' }}>{patchData.intro}</p>
              )}

              {/* LIVE COMMUNITY FEED CTA */}
              <a href={patchData.source.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', textDecoration: 'none',
                  background: 'linear-gradient(120deg, #2a1a2e, #14101a)', border: '1px solid #4a2f52', borderRadius: 16, padding: '20px 24px', marginBottom: 30 }}>
                <div>
                  <p style={{ ...condensed, margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#e879f9' }}>● Live community feed</p>
                  <p style={{ ...condensed, margin: '6px 0 0', fontSize: 26, fontWeight: 800, color: '#fff' }}>{patchData.source.name}</p>
                  <p style={{ color: '#b9a9c0', fontSize: 13, margin: '4px 0 0', maxWidth: 560 }}>{patchData.source.note}</p>
                </div>
                <span style={{ ...condensed, background: '#e879f9', color: '#1a0f1e', fontWeight: 800, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '12px 22px', borderRadius: 10, whiteSpace: 'nowrap' }}>Open on Instagram →</span>
              </a>

              {/* DOCUMENTED SWAPS — actual posts from the feed */}
              {(patchData.posts || []).length > 0 && (
                <>
                  <h2 style={{ ...condensed, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Documented swaps</h2>
                  <p style={{ color: '#999', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 760 }}>
                    Individual cases from @fake_hockey_patches — each post shows the actual card before and after its patch was swapped. Tap any post to see every photo and the community discussion.
                  </p>
                  <div style={{ marginBottom: 34 }}>
                    <InstagramEmbeds urls={patchData.posts} />
                  </div>
                </>
              )}

              {/* HOW TO SPOT A SWAP */}
              <h2 style={{ ...condensed, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 16px' }}>How to spot a swap</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 34 }}>
                {(patchData.redFlags || []).map((f, i) => (
                  <div key={i} style={{ background: 'linear-gradient(155deg, #161616, #0d0d0d)', border: '1px solid #262626', borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <span style={{ ...condensed, color: '#e11d48', fontWeight: 800, fontSize: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                      <p style={{ ...condensed, margin: 0, fontSize: 17, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.15 }}>{f.title}</p>
                    </div>
                    <p style={{ color: '#a9a9a9', fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{f.detail}</p>
                  </div>
                ))}
              </div>

              {/* HIGHEST-RISK PRODUCTS → link into RPA tracker patch view */}
              {(patchData.watchSets || []).length > 0 && (
                <div style={{ background: 'linear-gradient(140deg, #17140c, #0e0e0e)', border: '1px solid ' + GOLD + '2e', borderRadius: 16, padding: '22px 24px', marginBottom: 24 }}>
                  <h2 style={{ ...condensed, fontSize: 20, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: GOLD, margin: '0 0 6px' }}>Products most targeted</h2>
                  <p style={{ color: '#999', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 14px', maxWidth: 720 }}>High-end patch and RPA products carry the most swap risk. Cross-reference any patch card against its checklist print run — browse the patch and RPA cards in the tracker.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {patchData.watchSets.map(w => (
                      <span key={w} style={{ background: '#1c1810', border: '1px solid ' + GOLD + '33', color: '#e8d5a8', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999 }}>{w}</span>
                    ))}
                  </div>
                  <button onClick={() => { setRpaType('PA'); openRpa() }}
                    style={{ ...condensed, marginTop: 14, background: GOLD, color: '#111', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
                    Open the Patch-Auto tracker →
                  </button>
                </div>
              )}

              {/* Documented case gallery (populated as sourced-with-rights images are added) */}
              {patchData.entries && patchData.entries.filter(e => e.player || e.card).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginTop: 24 }}>
                  {patchData.entries.filter(e => e.player || e.card).map((e) => (
                    <div key={e.id} style={{ background: 'linear-gradient(155deg, #161616, #0d0d0d)', border: '1px solid #262626', borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: '#000' }}>
                        {[['Original', e.originalImg], ['Swapped', e.swappedImg]].map(([lbl, img]) => (
                          <div key={lbl} style={{ position: 'relative', aspectRatio: '1', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {img ? <img src={img} alt={lbl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#444', fontSize: 12 }}>{lbl} photo</span>}
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
            </>
          )}
        </section>
      ) : (
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filteredSets.slice().sort((a, b) => {
              const nm = () => a.name.localeCompare(b.name)
              if (sortBy === 'year-asc') return (a.year - b.year) || nm()
              if (sortBy === 'name-asc') return nm()
              if (sortBy === 'name-desc') return -nm()
              if (sortBy === 'cards-desc') return (b.cardCount - a.cardCount) || nm()
              if (sortBy === 'cards-asc') return (a.cardCount - b.cardCount) || nm()
              if (sortBy === 'brand') return (a.brand || 'zzz').localeCompare(b.brand || 'zzz') || (b.year - a.year) || nm()
              return (b.year - a.year) || nm() // year-desc default
            }).map((s) => {
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
