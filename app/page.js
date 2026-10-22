'use client'

// Checklist HQ v2 — sectioned checklist database (Base / Inserts / Autos …)
// imported from cardboardconnection.com. Static JSON under /public/data:
// index.json lists sets; each set file carries sections -> cards.
import { useEffect, useMemo, useState } from 'react'
import { useAccount, AccountChip, AuthModal, CollectionView, CommunityView } from '../components/community'
import { addWant } from '../lib/supa'
import { Omnibox, PlayerPage, MyPlayersPanel, useMyPlayers, loadPlayerDir, seasonLabel, MemBadge, MemChip, memCodeOf } from '../components/player'
import { norm, parseQuery, parseQueryFor, matchPlayers, TYPE, typeLabel, TYPE_COLORS, serialLabel } from '../lib/query'
import { ACCENT, ACCENT_TEXT, BG, SURFACE, SURFACE_2, LINE, CHIP_LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'


// Wordmark from the logo lockup: heavy Inter, mixed case, tight tracking.
const wordmark = (size) => ({ fontFamily: "'Inter', system-ui, sans-serif", fontSize: size, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: '#fff' })

// Card HQ mark (logo option 7f, "Scan C"): viewfinder corner brackets framing a blue C.
function ScanCMark({ size = 30, bracket = '#EDEDEF', accent = ACCENT }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <path d="M14 32V14h18M64 14h18v18M82 64v18H64M32 82H14V64" fill="none" stroke={bracket} strokeWidth="7" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M61.4 34.6A19 19 0 1 0 61.4 61.4" fill="none" stroke={accent} strokeWidth="12" />
    </svg>
  )
}

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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(326px, 100%), 1fr))', gap: 16 }}>
      {urls.map((u) => (
        <blockquote key={u} className="instagram-media" data-instgrm-permalink={u} data-instgrm-version="14"
          style={{ background: '#0F1320', border: '1px solid #232A3E', borderRadius: 14, margin: 0, padding: 0, minHeight: 430, maxWidth: '100%' }}>
          <a href={u} target="_blank" rel="noreferrer" style={{ color: '#6B7080', fontSize: 12, display: 'block', padding: 16 }}>View this post on Instagram</a>
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
const TCG_EXAMPLE = { 'Pokémon': 'Charizard', 'Yu-Gi-Oh!': 'Dark Magician', Magic: 'Lightning Bolt', Lorcana: 'Stitch', 'One Piece': 'Monkey.D.Luffy' }
// "Stitch — Rock Star" / "Sanji (SP)" / "A-Ancestral Katana" -> base card name.
const tcgBaseName = (p) => String(p || '').replace(/\s+[—–-]\s+.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^A-(?=\S)/, '').trim()

const BRAND_COLORS = { Panini: '#e11d48', Topps: '#ef8c1c', 'Upper Deck': '#2563eb', Leaf: '#16a34a', Other: '#8A8A93' }

const RPA_TYPES = [['RPA', 'Rookie Patch Auto'], ['PA', 'Patch Auto'], ['RA', 'Rookie Auto'], ['AU', 'Autograph'], ['PATCH', 'Patch'], ['RELIC', 'Relic'], ['All', 'All Hits']]
const RPA_TYPE_COLOR = { RPA: '#d4a843', PA: '#e11d48', RA: '#8b5cf6', AU: '#2563eb', PATCH: '#16a34a', RELIC: '#f97316', All: '#8A8A93' }

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

// "2024-25 Upper Deck The Cup" -> "2024-25"; otherwise the stored year.
function yearLabel(s) {
  const m = (s && s.name || '').match(/^(\d{4}-\d{2})\b/)
  return m ? m[1] : (s && s.year) || ''
}

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
                  flex: grow ? '1 1 auto' : '0 0 auto',
                  textAlign: align || 'left',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  color: active ? ACCENT_TEXT : '#8A8A93',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                  minWidth: grow ? 0 : undefined,
                  fontSize: 13,
                  fontWeight: 600
                }}>
      {label}<span style={{ opacity: active ? 1 : 0.35, fontSize: 9 }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )
}

function NewsTicker({ label, color, items, speed }) {
  if (!items || items.length === 0) return null
  const row = items.concat(items) // duplicate for seamless loop
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #222', borderRadius: 10, overflow: 'hidden', background: '#0F1320' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', background: color, color: '#0B0E17', flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#0B0E17', opacity: 0.55 }} />
        <span style={{ ...eyebrow }}>{label}</span>
      </div>
      <div style={{ overflow: 'hidden', flex: 1, position: 'relative' }}>
        <div className="hq-track" style={{ animationDuration: (speed || 80) + 's' }}>
          {row.map((it, i) => (
            <a key={i} href={it.link || '#'} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px', textDecoration: 'none', borderRight: '1px solid #1A1F31' }}>
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
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: solid ? (color || ACCENT) : 'transparent',
                  color: solid ? '#fff' : (color || ACCENT_TEXT),
                  border: '1px solid ' + (color || ACCENT) + (solid ? '' : '55'),
                  fontSize: 13,
                  fontWeight: 600
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
  // Team browse (within a selected sport): filter to one team's cards across all
  // sets, sortable. Uses the same compact card index as player search.
  const [teamFilter, setTeamFilter] = useState('All')
  const [teamInput, setTeamInput] = useState('')
  const [teamBrowse, setTeamBrowse] = useState(false)
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamSort, setTeamSort] = useState('year-desc')
  // TCG browse: teams don't exist in TCGs, so TCG tabs filter by card name,
  // rarity and card type across every set instead (same card index).
  const [tcgRarity, setTcgRarity] = useState('All')
  const [tcgType, setTcgType] = useState('All')
  // Player pages + My Players
  const myPlayers = useMyPlayers(account)
  const [activePlayer, setActivePlayer] = useState(null)
  const [playerParsed, setPlayerParsed] = useState(null)
  const [playerCandidates, setPlayerCandidates] = useState([])
  const [onlyMine, setOnlyMine] = useState(false)
  const [setTypeFilter, setSetTypeFilter] = useState('All')
  const [setRunFilter, setSetRunFilter] = useState('any')
  const [setRcOnly, setSetRcOnly] = useState(false)
  const [setMemFilter, setSetMemFilter] = useState('any')
  // Big sets have 500+ sections; render them in pages so phones don't freeze.
  const [secLimit, setSecLimit] = useState(20)
  const [notice, setNotice] = useState('')
  const [setLimit, setSetLimit] = useState(60) // home grid pages in 60s; all 5k cards at once is slow on phones

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir(field === 'n' ? 'asc' : 'asc') }
  }

  // Browse filters load small slices built by build-search-index.mjs instead of
  // the full 94 MB card index (which crashes phones):
  //   TCG game  -> /data/teams/<game>.json (all of that game's cards)
  //   team sport -> /data/teams/<sport>.json (team list), then one file per team
  // searchIndex holds whichever slice is current, in the same shape as before.
  const sportFile = (sp) => sp.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const EMPTY_IDX = { slugs: [], sections: [], teams: [], rows: [] }
  const [teamList, setTeamList] = useState(null) // { sport, teams: [[name, cards]] }
  const [sliceLoading, setSliceLoading] = useState(false)
  const getJson = async (url) => { try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json() } catch { return null } }
  const ensureSearchIndex = async () => {
    const sp = sportFilter
    if (TCG_SET.has(sp)) {
      if (searchIndex && searchIndex.__key === sp) return searchIndex
      const j = (await getJson('/data/teams/' + sportFile(sp) + '.json')) || { ...EMPTY_IDX }
      j.__key = sp; setSearchIndex(j); return j
    }
    if (!teamList || teamList.sport !== sp) {
      const j = await getJson('/data/teams/' + sportFile(sp) + '.json')
      setTeamList({ sport: sp, teams: (j && j.teams) || [] })
    }
    return searchIndex
  }
  const openTeamBrowse = async () => { setTeamBrowse(true); setTeamLoading(true); await ensureSearchIndex(); setTeamLoading(false) }
  // Load one team's slice when a team is picked (team sports only).
  useEffect(() => {
    if (TCG_SET.has(sportFilter) || teamFilter === 'All' || !teamList || teamList.sport !== sportFilter) return
    const i = teamList.teams.findIndex(([t]) => t === teamFilter)
    if (i < 0) return
    const key = sportFilter + '|' + teamFilter
    if (searchIndex && searchIndex.__key === key) return
    setSliceLoading(true)
    getJson('/data/teams/' + sportFile(sportFilter) + '/' + i + '.json').then(j => { const x = j || { ...EMPTY_IDX }; x.__key = key; setSearchIndex(x); setSliceLoading(false) })
  }, [sportFilter, teamFilter, teamList])

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

  // push=false when the change comes from Back/Forward (the URL is already right).
  const nav = (url, push) => { if (push === false) return; try { history.pushState(null, '', url) } catch {} }
  const openSet = async (s, push) => {
    setNotice('')
    setActiveSet(s); setGlobalHits(null); setActiveSection('All'); setQuery(''); setActivePlayer(null); setView('browse'); setSetTypeFilter('All'); setSetRunFilter('any'); setSetRcOnly(false); setSetMemFilter('any'); setSecLimit(20)
    nav('?set=' + encodeURIComponent(s.slug), push)
    try {
      const r = await fetch('/data/' + s.slug + '.json')
      setSetData(await r.json())
    } catch (e) { setSetData(null) }
    window.scrollTo(0, 0)
  }

  // One compact index (loaded once, then cached) powers instant cross-set
  // player search over every card, rather than fetching 300 set files.
  // Open a player landing page (optionally with the parsed query's filters).
  const openPlayer = (p, parsed, candidates, push) => {
    setNotice('')
    setActivePlayer(p); setPlayerParsed(parsed || null); setPlayerCandidates(candidates || [])
    setActiveSet(null); setSetData(null); setGlobalHits(null); setView('player')
    nav('?player=' + encodeURIComponent(p.name) + (parsed && parsed.raw && norm(parsed.raw) !== parsed.player ? '&q=' + encodeURIComponent(parsed.raw) : ''), push)
    window.scrollTo(0, 0)
  }
  const openPlayerByName = async (name, rawQuery, push) => {
    const dir = await loadPlayerDir()
    const parsed = parseQueryFor(dir, rawQuery || name)
    const hits = matchPlayers(dir, parsed.player || name, 8)
    const exact = hits.find(h => h.name === name) || hits[0]
    if (exact) openPlayer(exact, parsed, hits, push)
    else setNotice('No player called “' + name + '” in the database.')
  }
  // The omnibox: understands "player + 1/1 / auto / rc / season / product".
  const runSearch = async (raw) => {
    const q = (raw == null ? query : raw).trim()
    if (q.length < 2) return
    setSearching(true)
    const dir = await loadPlayerDir()
    const parsed = parseQueryFor(dir, q)
    if (parsed.player.length >= 2) {
      const hits = matchPlayers(dir, parsed.player, 8)
      if (hits.length) { setSearching(false); openPlayer(hits[0], parsed, hits); return }
    }
    setSearching(false)
    await runGlobalSearch(q)
  }
  // Fallback when the omnibox finds no player by name prefix: substring match
  // over the player directory and set names. (Scanning every card meant
  // downloading the 94 MB card index, which crashes phones.)
  const runGlobalSearch = async (raw, push) => {
    const term = (raw == null ? query : raw).trim().toLowerCase()
    if (term.length < 3) return
    setSearching(true); setActiveSet(null); setSetData(null); setActivePlayer(null); setView('browse')
    const dir = await loadPlayerDir()
    const players = []
    for (let i = 0; i < dir.players.length && players.length < 60; i++) {
      const p = dir.players[i]
      if (p[0].toLowerCase().includes(term)) players.push({ id: i, name: p[0], cards: p[2], sport: dir.sports[p[3]], minYear: p[4], maxYear: p[5], shard: p[1] })
    }
    players.sort((a, b) => b.cards - a.cards)
    const toks = term.split(/\s+/).filter(Boolean)
    const setHits = sets.filter(x => { const n = x.name.toLowerCase(); return toks.every(t => n.includes(t)) }).sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 60)
    setGlobalHits({ players, sets: setHits }); setSearching(false); setQuery(raw == null ? query : raw)
    nav('?search=' + encodeURIComponent(term), push)
  }

  const cardSerial = (c, sec) => {
    const t = (c.x || '') + ' ' + (sec.title || '')
    if (/\b1\s*(\/|of)\s*1\b|printing plate/i.test(t)) return 1
    const m = (c.x || '').match(/\/\s*(\d{1,5})/) || (sec.title || '').match(/#?\s*\/\s*(\d{1,5})\b/) || (sec.odds || '').match(/#\/\s*([\d,]+)/)
    return m ? parseInt(String(m[1]).replace(/,/g, '')) : 0
  }
  const secKind = (title) => {
    const t = (title || '').toLowerCase()
    if (/printing plate/.test(t)) return 'PLATE'
    const au = /\bauto|autograph|signature|signing|\bink\b|chirography|scripted|endorsement/.test(t)
    const pa = /\bpatch|laundry tag|nameplate|logo ?man|logos\b|shield|emblem/.test(t)
    const rel = /relic|memorabilia|material|jersey|swatch|game.?used|game.?worn|threads|fabric|foundations/.test(t)
    if (au && pa) return 'PA'; if (au) return 'AU'; if (pa) return 'PATCH'; if (rel) return 'RELIC'
    if (/^(base( set| cards?)?|veterans?|common|regular)$/.test(t.trim())) return 'BASE'
    return 'OTHER'
  }
  const mineSet = useMemo(() => new Set(myPlayers.list.map(n => n.toLowerCase())), [myPlayers.list])
  const isMine = (p) => { const n = (p || '').toLowerCase(); if (mineSet.has(n)) return true; for (const m of mineSet) if (n.includes(m)) return true; return false }
  const visibleSections = useMemo(() => {
    if (!setData) return []
    let secs = setData.sections || []
    if (activeSection !== 'All') secs = secs.filter(s => s.title === activeSection)
    const term = query.trim().toLowerCase()
    const anyFilter = term || onlyMine || setTypeFilter !== 'All' || setRunFilter !== 'any' || setRcOnly || setMemFilter !== 'any'
    if (!anyFilter) return secs
    return secs.map(s => {
      const kind = secKind(s.title)
      if (setMemFilter !== 'any') {
        const mk = s.mem ? s.mem.k : null
        if (setMemFilter === 'MEMO' ? !mk : setMemFilter === 'STATED' ? !(mk && s.mem.src !== 'typical' && mk !== 'UNK') : mk !== setMemFilter) {
          // a card-level stated override can still match
          const cards = s.cards.filter(c => c.m && c.m.k === setMemFilter)
          if (!cards.length) return { ...s, cards: [] }
          return { ...s, cards }
        }
      }
      if (setTypeFilter !== 'All' && !(setTypeFilter === 'AU' ? (kind === 'AU' || kind === 'PA') : setTypeFilter === 'PATCH' ? (kind === 'PATCH' || kind === 'PA') : kind === setTypeFilter)) return { ...s, cards: [] }
      return {
        ...s,
        cards: s.cards.filter(c => {
          if (term && !((c.p || '').toLowerCase().includes(term) || (c.t || '').toLowerCase().includes(term) || String(c.n || '').toLowerCase() === term || (s.title || '').toLowerCase().includes(term))) return false
          if (onlyMine && !isMine(c.p)) return false
          if (setRcOnly && !(/\bRC\b/.test(c.x || '') || /rookie|young guns|future watch|rated rookie|\brc\b/i.test(s.title || ''))) return false
          if (setRunFilter !== 'any') {
            const sn = cardSerial(c, s)
            if (setRunFilter === '1' && sn !== 1) return false
            if (setRunFilter === 'numbered' && !(sn > 0)) return false
            if (setRunFilter === 'unnumbered' && sn > 0) return false
            if (/^\d+$/.test(setRunFilter) && setRunFilter !== '1' && !(sn > 0 && sn <= parseInt(setRunFilter))) return false
          }
          return true
        })
      }
    }).filter(s => s.cards.length > 0)
  }, [setData, activeSection, query, onlyMine, setTypeFilter, setRunFilter, setRcOnly, setMemFilter, mineSet])
  useEffect(() => { setSecLimit(20) }, [activeSection, query, onlyMine, setTypeFilter, setRunFilter, setRcOnly, setMemFilter])
  // Group the filtered cards by player (for the "My players" view of a set).
  const byPlayer = useMemo(() => {
    if (!onlyMine || !setData) return []
    const m = new Map()
    for (const sec of visibleSections) for (const c of sec.cards) {
      const owner = myPlayers.list.find(n => (c.p || '').toLowerCase().includes(n.toLowerCase())) || c.p
      let g = m.get(owner); if (!g) { g = { name: owner, team: c.t || '', rows: [], au: 0, one: 0 }; m.set(owner, g) }
      g.rows.push({ ...c, section: sec.title, serial: cardSerial(c, sec), kind: secKind(sec.title), memc: c.m ? memCodeOf(c.m) : memCodeOf(sec.mem) })
      if (g.kind === 'AU' || g.kind === 'PA') g.au++
    }
    for (const g of m.values()) { g.au = g.rows.filter(r => r.kind === 'AU' || r.kind === 'PA').length; g.one = g.rows.filter(r => r.serial === 1).length }
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length)
  }, [onlyMine, visibleSections, setData, myPlayers.list])

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

  useEffect(() => { setSetLimit(60) }, [sportFilter, brandFilter, productFilter, sortBy, query])
  const oneSport = sportFilter !== 'All' && sportFilter !== 'Sports' && sportFilter !== 'TCG'

  const isTcg = TCG_SET.has(sportFilter)
  const setIsTcg = !!(activeSet && TCG_SET.has(activeSet.sport))
  const tcgActive = isTcg && (teamFilter !== 'All' || tcgRarity !== 'All' || tcgType !== 'All')
  const browseActive = oneSport && (isTcg ? tcgActive : teamFilter !== 'All')

  // slug -> sport, so teams can be scoped to the selected sport.
  const slugSport = useMemo(() => {
    const m = {}; for (const s of sets) m[s.slug] = s.sport; return m
  }, [sets])

  // Distinct teams in the selected sport (from the card index). The index's team
  // field sometimes holds print-run/parallel junk ("#/6", "/199"), so keep only
  // strings that read like a real team name and appear on at least a few cards.
  const teamsForSport = useMemo(() => {
    if (!teamList || teamList.sport !== sportFilter || !oneSport || isTcg) return []
    return teamList.teams.map(([t]) => t)
  }, [teamList, oneSport, sportFilter, isTcg])

  // TCG filter options for the selected game: card names (base name, version
  // suffixes dropped), rarities and card types, most common first.
  const tcgOptions = useMemo(() => {
    const empty = { names: [], rarities: [], types: [] }
    if (!searchIndex || !isTcg || searchIndex.__key !== sportFilter) return empty
    const { slugs, teams, rows } = searchIndex
    const names = new Map(), rar = new Map(), typ = new Map()
    const bump = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1) }
    for (const row of rows) {
      if (slugSport[slugs[row[1]]] !== sportFilter) continue
      bump(names, tcgBaseName(row[0])); bump(rar, row[5]); bump(typ, row[4] >= 0 ? teams[row[4]] : '')
    }
    const top = (m, min) => [...m].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([k]) => k)
    return { names: top(names, 2).slice(0, 4000).sort((a, b) => a.localeCompare(b)), rarities: top(rar, 1), types: top(typ, 3) }
  }, [searchIndex, isTcg, sportFilter, slugSport])

  // Every card of the selected team within the selected sport, sorted.
  const teamHits = useMemo(() => {
    if (!searchIndex || !browseActive || searchIndex.__key !== (isTcg ? sportFilter : sportFilter + '|' + teamFilter)) return []
    const { slugs, sections, teams, rows } = searchIndex
    const setMeta = {}; for (const s of sets) setMeta[s.slug] = s
    const out = []
    const needle = teamFilter === 'All' ? '' : teamFilter.toLowerCase()
    for (const row of rows) {
      if (isTcg) {
        if (needle && !String(row[0]).toLowerCase().includes(needle)) continue
        if (tcgRarity !== 'All' && row[5] !== tcgRarity) continue
        if (tcgType !== 'All' && (row[4] < 0 || teams[row[4]] !== tcgType)) continue
      } else if (row[4] < 0 || teams[row[4]] !== teamFilter) continue
      const slug = slugs[row[1]]
      if (slugSport[slug] !== sportFilter) continue
      const m = setMeta[slug] || {}
      out.push({ p: row[0], slug, n: row[2], section: sections[row[3]] || '', x: row[5], t: row[4] >= 0 ? teams[row[4]] : '', set: m.name, year: m.year, sport: m.sport })
    }
    const bySet = (a, b) => (a.set || '').localeCompare(b.set || '')
    out.sort((a, b) => {
      if (teamSort === 'year-asc') return (a.year - b.year) || bySet(a, b)
      if (teamSort === 'player') return (a.p || '').localeCompare(b.p || '') || bySet(a, b)
      if (teamSort === 'set') return bySet(a, b) || (cardNumKey(a.n) - cardNumKey(b.n))
      return (b.year - a.year) || bySet(a, b) // year-desc
    })
    return out.slice(0, 2500)
  }, [searchIndex, teamFilter, oneSport, sportFilter, slugSport, sets, teamSort, isTcg, browseActive, tcgRarity, tcgType])

  const rcCount = (j) => (j.sections || []).reduce((s, sec) => s + sec.cards.filter(c => c.x === 'RC').length, 0)

  const isLanding = !activeSet && !globalHits && view === 'browse'
  const goHome = (push) => { setNotice(''); setActiveSet(null); setSetData(null); setGlobalHits(null); setQuery(''); setView('browse'); setTeamFilter('All'); setTeamInput(''); setTeamBrowse(false); setTcgRarity('All'); setTcgType('All'); setActivePlayer(null); nav(location.pathname, push) }
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
  const openView = (v, push) => { setNotice(''); nav('?view=' + v, push); setView(v); setActiveSet(null); setSetData(null); setGlobalHits(null); setActivePlayer(null); window.scrollTo(0, 0) }
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
  // Open a set by slug, following redirects for sets merged into another copy.
  const openSetBySlug = async (slug) => {
    let s = sets.find(x => x.slug === slug)
    if (!s) { try { const rd = await (await fetch('/data/redirects.json')).json(); s = rd[slug] && sets.find(x => x.slug === rd[slug]) } catch {} }
    if (s) { setView('browse'); openSet(s) }
  }
  const searchFor = (name) => { setQuery(name); runSearch(name) }
  // Deep links and Back/Forward: ?player=Name[&q=raw] · ?set=slug · ?view=community · ?search=term
  const applyUrl = () => {
    const sp = new URLSearchParams(location.search)
    const pl = sp.get('player'), st = sp.get('set'), v = sp.get('view'), sr = sp.get('search')
    if (pl) { const q = sp.get('q'); setQuery(q || pl); openPlayerByName(pl, q, false) }
    else if (st) {
      const s = sets.find(x => x.slug === st)
      if (s) openSet(s, false)
      else fetch('/data/redirects.json').then(r => r.json()).then(rd => {
        const t = rd[st] && sets.find(x => x.slug === rd[st])
        if (t) openSet(t, false); else { goHome(false); setNotice('That set isn’t in the database (the link may be old). Browse or search below.') }
      }).catch(() => { goHome(false); setNotice('That set isn’t in the database (the link may be old). Browse or search below.') })
    }
    else if (sr) runGlobalSearch(sr, false)
    else if (v && ['myplayers', 'community', 'collection'].includes(v)) openView(v, false)
    else goHome(false)
  }
  useEffect(() => {
    if (sets.length === 0) return
    applyUrl()
    const onPop = () => applyUrl()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [sets.length])

  return (
    <main className="hq-main" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 90px' }}>
      <style>{'.hq-setcard:hover{transform:translateY(-4px);border-color:#2E3D6B;box-shadow:0 18px 40px -18px rgba(0,0,0,0.9)}@keyframes hqticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hq-track{display:inline-flex;white-space:nowrap;animation:hqticker linear infinite}.hq-track:hover{animation-play-state:paused}'}</style>
      {/* NAV */}
      <nav className="hq-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 72, padding: '12px 0', boxSizing: 'border-box', flexWrap: 'wrap', columnGap: 40, rowGap: 12 }}>
        {/* Nav logo — Scan C mark + wordmark */}
        <div onClick={goHome} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <ScanCMark size={30} />
          <span style={wordmark(24)}>CardHQ</span>
        </div>
        <div className="hq-navright" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 40, rowGap: 12 }}>
          <div className="hq-navlinks" style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['Sets', () => { goHome(); setSportFilter('All') }, 'browse'], ['Players', () => openView('myplayers'), 'myplayers'], /* RPA Tracker + Patch Swaps hidden until ready */ ['Community', () => openView('community'), 'community'], ['My Collection', () => openView('collection'), 'collection']].map(([label, fn, v]) => (
              <button key={label} onClick={fn} style={{ background: 'none', border: 'none', borderTop: '2px solid transparent', borderBottom: '2px solid ' + (view === v ? ACCENT : 'transparent'), cursor: 'pointer', color: view === v ? '#fff' : '#A1A1AA', fontSize: 14, fontWeight: 600, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center' }}>{label}</button>
            ))}
          </div>
          <AccountChip account={account} onOpenAuth={() => setAuthOpen(true)} />
        </div>
      </nav>

      {notice && <div role="status" style={{ background: SURFACE, border: '1px solid ' + LINE, borderRadius: 12, padding: '12px 16px', margin: '0 0 16px', color: TEXT_2, fontSize: 14 }}>{notice}</div>}
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} account={account} />
      {wantFlash && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 95, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 20px', borderRadius: 12, boxShadow: '0 8px 30px #000a' }}>{wantFlash}</div>
      )}

      {isLanding ? (
        <>
          {/* HERO */}
          <section className="hq-hero" style={{ padding: '72px 0 48px', marginBottom: 8, borderBottom: '1px solid ' + LINE }}>
            <p style={{ ...eyebrow, color: ACCENT_TEXT, margin: '0 0 18px' }}>
              The definitive card set database{yearRange ? ' · ' + yearRange : ''}
            </p>
            <h1 style={{ ...display, fontSize: 'clamp(48px, 7.5vw, 96px)', margin: 0, color: TEXT }}>
              Every Card.<br />Every Checklist.
            </h1>
            <p style={{ color: TEXT_2, fontSize: 18, lineHeight: 1.6, maxWidth: 560, margin: '22px 0 0' }}>
              Searchable checklists for every sports and TCG set, broken down by base, inserts, parallels and autos.
            </p>

            {/* HERO SEARCH */}
            <div style={{ maxWidth: 640, margin: '32px 0 0', textAlign: 'left' }}>
              <Omnibox value={query} onChange={setQuery} onSubmit={runSearch} sets={sets}
                onPickPlayer={(p, parsed) => openPlayer(p, parsed, [])} onPickSet={(s) => openSet(s)} />
            </div>
            <p style={{ color: LABEL, fontSize: 14, margin: '14px 0 0' }}>
              Try {['Tom Brady Auto', 'Connor McDavid Game-Used 1/1'].map((n, i) => (
                <span key={n}>
                  {i > 0 ? ' · ' : ' '}
                  <button onClick={() => searchFor(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT_TEXT, fontSize: 14, padding: 0, fontFamily: 'inherit' }}>{n}</button>
                </span>
              ))}
            </p>

            {/* STATS */}
            <div className="hq-stats" style={{ display: 'flex', flexWrap: 'wrap', gap: '20px 48px', margin: '40px 0 0' }}>
              {[[statN.sets ? statN.sets.toLocaleString() : null, 'Sets indexed'], [statN.cards ? (statN.cards >= 1000000 ? (statN.cards / 1000000).toFixed(1) + 'M' : statN.cards >= 1000 ? Math.round(statN.cards / 1000) + 'K' : String(statN.cards)) : null, 'Cards + parallels'], [sports.length > 1 ? String(sports.length - 1) : null, 'Categories']].map(([n, label]) => (
                <div key={label}>
                  {n ? <p style={{ ...display, margin: 0, fontSize: 40, color: ACCENT_TEXT, lineHeight: 1 }}>{n}</p>
                    : <span style={{ display: 'block', width: 88, height: 36, borderRadius: 6, background: SURFACE_2 }} />}
                  <p style={{ ...eyebrow, margin: '8px 0 0', color: LABEL }}>{label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* HOBBY WIRE — Sports + TCG news tickers */}
          {(news.sports.length > 0 || news.tcg.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '30px 0 8px' }}>
              <p style={{ ...eyebrow, margin: 0, color: '#8A8A93' }}>Hobby Wire</p>
              <NewsTicker label="Sports" color="#60a5fa" items={news.sports} speed={90} />
              <NewsTicker label="TCG" color="#e879f9" items={news.tcg} speed={80} />
            </div>
          )}

          {/* FILTERS */}
          {(() => {
            const sportCats = sports.filter(s => s !== 'All' && !TCG_SET.has(s))
            const tcgCats = sports.filter(s => TCG_SET.has(s))
            const pick = (v) => { setSportFilter(v); setBrandFilter('All'); setProductFilter('All'); setTeamFilter('All'); setTeamInput(''); setTeamBrowse(false); setTcgRarity('All'); setTcgType('All') }
            const chip = (label, value, color) => (
              <button key={label} onClick={() => pick(value)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  background: sportFilter === value ? (color || ACCENT) : '#121626',
                  color: sportFilter === value ? '#0F1320' : '#A1A1AA',
                  border: '1px solid ' + (sportFilter === value ? 'transparent' : '#232A3E'),
                  fontSize: 13,
                  fontWeight: 600
                }}>{label}</button>
            )
            return (
              <div style={{ margin: '38px 0 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ ...title(19), margin: 0 }}>
                    {productFilter !== 'All' ? productFilter + ' Sets' : sportFilter === 'All' ? 'Featured Sets' : sportFilter === 'TCG' ? 'Trading Card Games' : sportFilter === 'Sports' ? 'Sports Cards' : sportFilter + ' Sets'}
                    {sets.length > 0 && <span style={{ color: LABEL, fontSize: 15, fontWeight: 500, marginLeft: 10 }}>{filteredSets.length.toLocaleString()}</span>}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ ...eyebrow, color: '#6B7080' }}>Sort</span>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                      style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>
                      <option value="year-desc">Newest first</option>
                      <option value="year-asc">Oldest first</option>
                      <option value="name-asc">Name (A–Z)</option>
                      <option value="name-desc">Name (Z–A)</option>
                      <option value="cards-desc">Most cards</option>
                      <option value="cards-asc">Fewest cards</option>
                      <option value="brand">Brand</option>
                    </select>
                    {chip('All', 'All', ACCENT)}
                  </div>
                </div>
                <div className="hq-chiprow" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={{ ...eyebrow, color: '#6B7080', width: 42 }}>Sports</span>
                  {chip('All Sports', 'Sports', '#cbd5e1')}
                  {sportCats.map(sp => chip(sp, sp, SPORT_COLORS[sp]))}
                </div>
                {tcgCats.length > 0 && (
                  <div className="hq-chiprow" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid #1A1F31' }}>
                    <span style={{ ...eyebrow, color: '#6B7080', width: 42 }}>TCG</span>
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
            <div className="hq-chiprow" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', maxWidth: '100%' }}>
              <span style={{ ...eyebrow, color: '#6B7080', marginRight: 2 }}>Brand</span>
              {brands.map(b => (
                <button key={b} onClick={() => { setBrandFilter(b); setProductFilter('All') }}
                  style={{
                    padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
                    background: brandFilter === b ? (BRAND_COLORS[b] || ACCENT) : '#121626',
                    color: brandFilter === b ? '#fff' : '#A1A1AA',
                    border: '1px solid ' + (brandFilter === b ? 'transparent' : '#232A3E')
                  }}>{b}</button>
              ))}
            </div>
            {products.length > 1 && (
              <select value={productFilter} onChange={(e) => setProductFilter(e.target.value)}
                style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>
                <option value="All">All products ({products.length - 1})</option>
                {products.slice(1).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
          )}
          {/* TCG FILTERS: card name / rarity / type across every set of the game */}
          {oneSport && isTcg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <span style={{ ...eyebrow, color: '#6B7080' }}>Find</span>
              {!teamBrowse ? (
                <button onClick={openTeamBrowse}
                  style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}>
                  Search cards, rarities &amp; types ▾
                </button>
              ) : teamLoading ? (
                <span style={{ color: '#8A8A93', fontSize: 13 }}>Loading cards…</span>
              ) : (
                <>
                  <input list="tcg-card-options" value={teamInput}
                    placeholder={'Card name… e.g. ' + (TCG_EXAMPLE[sportFilter] || 'any card')}
                    onChange={(e) => { const v = e.target.value; setTeamInput(v); const t = v.trim(); setTeamFilter(t.length >= 2 ? t : 'All') }}
                    style={{ background: '#121626', border: '1px solid ' + (teamFilter !== 'All' ? ACCENT : '#232A3E'), borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', minWidth: 0, width: 230, maxWidth: '100%', outline: 'none' }} />
                  <datalist id="tcg-card-options">{tcgOptions.names.map(t => <option key={t} value={t} />)}</datalist>
                  <select value={tcgRarity} onChange={(e) => setTcgRarity(e.target.value)} aria-label="Rarity"
                    style={{ background: '#121626', border: '1px solid ' + (tcgRarity !== 'All' ? ACCENT : '#232A3E'), borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', cursor: 'pointer', maxWidth: '100%' }}>
                    <option value="All">All rarities</option>
                    {tcgOptions.rarities.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select value={tcgType} onChange={(e) => setTcgType(e.target.value)} aria-label="Card type"
                    style={{ background: '#121626', border: '1px solid ' + (tcgType !== 'All' ? ACCENT : '#232A3E'), borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', cursor: 'pointer', maxWidth: '100%' }}>
                    <option value="All">All types</option>
                    {tcgOptions.types.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {tcgActive && (
                    <>
                      <span style={{ ...eyebrow, color: '#6B7080', marginLeft: 4 }}>Sort</span>
                      <select value={teamSort} onChange={(e) => setTeamSort(e.target.value)}
                        style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>
                        <option value="year-desc">Newest first</option>
                        <option value="year-asc">Oldest first</option>
                        <option value="player">Card name (A–Z)</option>
                        <option value="set">Set name</option>
                      </select>
                      <button onClick={() => { setTeamFilter('All'); setTeamInput(''); setTcgRarity('All'); setTcgType('All') }}
                        style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {/* TEAM FILTER + SORT (after a specific sport is selected) */}
          {oneSport && !isTcg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <span style={{ ...eyebrow, color: '#6B7080' }}>Team</span>
              {!teamBrowse ? (
                <button onClick={openTeamBrowse}
                  style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, fontWeight: 600, padding: '8px 14px', cursor: 'pointer' }}>
                  Filter by team ▾
                </button>
              ) : teamLoading ? (
                <span style={{ color: '#8A8A93', fontSize: 13 }}>Loading teams…</span>
              ) : (
                <>
                  <input list="team-options" value={teamInput}
                    placeholder={'Type a team… (' + teamsForSport.length.toLocaleString() + ')'}
                    onChange={(e) => {
                      const v = e.target.value
                      setTeamInput(v)
                      const t = v.trim()
                      if (!t) setTeamFilter('All')
                      else if (teamsForSport.includes(t)) setTeamFilter(t)
                    }}
                    style={{ background: '#121626', border: '1px solid ' + (teamFilter !== 'All' ? ACCENT : '#232A3E'), borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', minWidth: 0, width: 230, maxWidth: '100%', outline: 'none' }} />
                  <datalist id="team-options">{teamsForSport.map(t => <option key={t} value={t} />)}</datalist>
                  {teamFilter !== 'All' && (
                    <>
                      <span style={{ ...eyebrow, color: '#6B7080', marginLeft: 4 }}>Sort</span>
                      <select value={teamSort} onChange={(e) => setTeamSort(e.target.value)}
                        style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '8px 12px', cursor: 'pointer' }}>
                        <option value="year-desc">Newest first</option>
                        <option value="year-asc">Oldest first</option>
                        <option value="player">Player (A–Z)</option>
                        <option value="set">Set name</option>
                      </select>
                      <button onClick={() => { setTeamFilter('All'); setTeamInput('') }}
                        style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : (activeSet || globalHits || view === 'player' || view === 'myplayers') ? (
        <div style={{ marginBottom: 16 }}>
          {activeSet ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={TCG_SET.has(activeSet.sport) ? 'Filter this set (card, type, rarity, card #, section)…' : 'Filter this set (player, team, card #, section)…'}
              style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid #232A3E', borderRadius: 10, padding: '13px 16px', color: '#EDEDEF', fontSize: 15, outline: 'none' }}
            />
          ) : (
            <Omnibox value={query} onChange={setQuery} onSubmit={runSearch} sets={sets} compact
              onPickPlayer={(p, parsed) => openPlayer(p, parsed, [])} onPickSet={(s) => openSet(s)} />
          )}
        </div>
      ) : null}

      {activeSet && setData ? (
        <section>
          <button onClick={() => goHome()}
            style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← All sets
          </button>
          <div className="hq-panel" style={{ background: 'linear-gradient(140deg, #191919, #0F1320)', border: '1px solid #232A3E', borderRadius: 16, padding: '26px 28px', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Chip color={SPORT_COLORS[activeSet.sport]} solid>{activeSet.sport}</Chip>
              <Chip>{yearLabel(activeSet)}</Chip>
              <Chip>{(setData.sections || []).length} sections</Chip>
              {(setData.sections || []).some(s => s.odds) && <Chip>Pack odds</Chip>}
            </div>
            <h1 style={{ ...display, fontSize: 34, margin: 0, lineHeight: 1.05 }}>{setData.name}</h1>
            <p style={{ color: '#8a8a8a', fontSize: 13, margin: '10px 0 0' }}>
              {(setData.sections || []).reduce((s, x) => s + x.cards.length, 0).toLocaleString()} cards
              {rcCount(setData) > 0 ? ' · ' + rcCount(setData) + ' rookies flagged' : ''} · source: {setData.source}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => wantIt({ set_slug: setData.slug, set_name: setData.name })}
                style={{ ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }}>
                + Wantlist this set
              </button>
              <button onClick={() => { openView('collection') }}
                style={{ ...buttonText, background: 'transparent', color: '#A1A1AA', border: '1px solid #232A3E', borderRadius: 9, padding: '8px 15px', cursor: 'pointer', fontSize: 12.5 }}>
                Track in My Collection
              </button>
            </div>
          </div>

          {setData.boxBreak && setData.boxBreak.length > 0 && (
            <div style={{ background: 'linear-gradient(140deg, #17140c, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
              <p style={{ ...eyebrow, color: ACCENT_TEXT, margin: '0 0 12px' }}>
                📦 Box Break — what a hobby box yields
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '6px 20px' }}>
                {setData.boxBreak.map((b, i) => {
                  const m = String(b).match(/^(\d+(?:\.\d+)?)\s+(.*)$/)
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
                      <span style={{ ...display, color: ACCENT_TEXT, fontSize: 16, minWidth: 28 }}>{m ? m[1] + '×' : ''}</span>
                      <span style={{ color: '#cfcfcf' }}>{m ? m[2] : b}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* FILTER BAR */}
          <div style={{ background: '#0F1320', border: '1px solid #232323', borderRadius: 14, padding: '10px 12px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <button aria-pressed={onlyMine} onClick={() => setOnlyMine(v => !v)} title={myPlayers.list.length ? 'Only show cards of players you collect' : 'Add players from any player page first'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: onlyMine ? '#0e1630' : '#121626', border: '1px solid ' + (onlyMine ? ACCENT : '#232A3E'), color: onlyMine ? '#8fb0ff' : '#D4D4D8', borderRadius: 10, padding: '0 14px', height: 38, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
              My players <span style={{ background: onlyMine ? ACCENT : '#232A3E', color: onlyMine ? '#fff' : '#A1A1AA', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{myPlayers.list.length}</span>
            </button>
            <select aria-label="Section" value={activeSection} onChange={(e) => setActiveSection(e.target.value)} style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 10, color: '#D4D4D8', fontSize: 13, padding: '0 12px', height: 38, maxWidth: '100%', cursor: 'pointer' }}>
              <option value="All">All sections ({(setData.sections || []).length})</option>
              {(setData.sections || []).map(s => <option key={s.title} value={s.title}>{s.title} ({s.cards.length})</option>)}
            </select>
            <select aria-label="Card type" value={setTypeFilter} onChange={(e) => setSetTypeFilter(e.target.value)} style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 10, color: '#D4D4D8', fontSize: 13, padding: '0 12px', height: 38, cursor: 'pointer' }}>
              <option value="All">Any type</option><option value="BASE">Base</option><option value="AU">Autographs</option><option value="PA">Patch autos</option><option value="PATCH">Patches</option><option value="RELIC">Relics</option><option value="PLATE">Printing plates</option><option value="OTHER">Inserts &amp; parallels</option>
            </select>
            <select aria-label="Print run" value={setRunFilter} onChange={(e) => setSetRunFilter(e.target.value)} style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 10, color: '#D4D4D8', fontSize: 13, padding: '0 12px', height: 38, cursor: 'pointer' }}>
              <option value="any">Any run</option><option value="1">1/1 only</option><option value="10">≤ /10</option><option value="25">≤ /25</option><option value="99">≤ /99</option><option value="numbered">Numbered</option><option value="unnumbered">Unnumbered</option>
            </select>
            {(setData.sections || []).some(x => x.mem) && (
              <select aria-label="Memorabilia" value={setMemFilter} onChange={(e) => setSetMemFilter(e.target.value)} style={{ background: setMemFilter !== 'any' ? '#0f1a12' : '#121626', border: '1px solid ' + (setMemFilter !== 'any' ? '#22c55e' : '#232A3E'), borderRadius: 10, color: '#D4D4D8', fontSize: 13, padding: '0 12px', height: 38, cursor: 'pointer' }}>
                <option value="any">Any material</option><option value="MEMO">Memorabilia only</option><option value="GU">Game-used</option><option value="PW">Player-worn</option><option value="EW">Event-worn</option><option value="MX">Varies by card</option><option value="MFG">Manufactured</option><option value="UNK">Unknown</option><option value="STATED">Stated by maker/source only</option>
              </select>
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#A1A1AA', minHeight: 38, cursor: 'pointer' }}><input type="checkbox" checked={setRcOnly} onChange={(e) => setSetRcOnly(e.target.checked)} style={{ accentColor: ACCENT, width: 16, height: 16 }} />Rookies only</label>
            {(onlyMine || setTypeFilter !== 'All' || setRunFilter !== 'any' || setRcOnly || setMemFilter !== 'any' || activeSection !== 'All' || query) && (
              <button onClick={() => { setSetMemFilter('any'); setOnlyMine(false); setSetTypeFilter('All'); setSetRunFilter('any'); setSetRcOnly(false); setActiveSection('All'); setQuery('') }} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Clear filters</button>
            )}
          </div>
          {onlyMine && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 14px' }}>
              <span style={{ ...eyebrow, color: '#6B7080' }}>Showing cards of</span>
              {myPlayers.list.length === 0 && <span style={{ color: '#8A8A93', fontSize: 13 }}>nobody yet — open a player page and hit “Collect this player”.</span>}
              {byPlayer.map(g => <button key={g.name} onClick={() => openPlayerByName(g.name)} style={{ background: '#0e1630', border: '1px solid ' + ACCENT + '55', color: '#c9d8ff', fontSize: 12.5, fontWeight: 600, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' }}>{g.name} <span style={{ color: '#5b82e8' }}>· {g.rows.length}</span></button>)}
              {myPlayers.list.filter(n => !byPlayer.some(g => g.name === n)).map(n => <span key={n} style={{ border: '1px solid #232A3E', color: '#6B7080', fontSize: 12.5, padding: '5px 10px', borderRadius: 999 }}>{n} · 0</span>)}
              <button onClick={() => openView('myplayers')} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Manage my players</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', maxHeight: 92, overflow: 'auto' }}>
            {['All', ...(setData.sections || []).map(s => s.title)].map(t => (
              <button key={t} onClick={() => setActiveSection(t)}
                style={{
                  padding: '6px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeSection === t ? ACCENT : '#121626',
                  color: activeSection === t ? '#fff' : '#A1A1AA',
                  border: '1px solid ' + (activeSection === t ? 'transparent' : '#232A3E')
                }}>{t}</button>
            ))}
          </div>

          <p style={{ color: '#6B7080', fontSize: 12, margin: '0 0 12px' }}>
            {(() => { const n = visibleSections.reduce((a, x) => a + x.cards.length, 0), t = (setData.sections || []).reduce((a, x) => a + x.cards.length, 0); return n < t ? n.toLocaleString() + ' of ' + t.toLocaleString() + ' cards match' : 'Click a column header to sort.' })()}
          </p>
          {onlyMine ? byPlayer.map(g => (
            <div key={g.name} style={{ border: '1px solid #232A3E', borderRadius: 14, overflow: 'hidden', background: '#0F1320', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: '#121626', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <button onClick={() => openPlayerByName(g.name)} style={{ ...title(16), background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>{g.name}</button>
                  <p style={{ margin: '2px 0 0', color: '#8A8A93', fontSize: 12 }}>{g.team ? g.team + ' · ' : ''}{g.rows.length} card{g.rows.length === 1 ? '' : 's'} in this set{g.au ? ' · ' + g.au + ' autos' : ''}{g.one ? ' · ' + g.one + ' × 1/1' : ''}</p>
                </div>
                <button onClick={() => openPlayerByName(g.name)} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Player page →</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 560 }}>
                  <thead><tr>{['Card #', 'Section', 'Type', 'Material', 'Run', 'Want'].map((h, i) => <th key={h} style={{ ...eyebrow, padding: '9px 14px', textAlign: i >= 4 ? 'right' : 'left', color: '#8A8A93' }}>{h}</th>)}</tr></thead>
                  <tbody>{g.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #1a1a1a', background: i % 2 ? '#131313' : 'transparent' }}>
                      <td style={{ padding: '9px 14px', color: ACCENT_TEXT, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.n ? '#' + r.n : '—'}</td>
                      <td style={{ padding: '9px 14px' }}>{r.section}</td>
                      <td style={{ padding: '9px 14px' }}><Chip color={r.kind === 'PA' ? '#e11d48' : r.kind === 'AU' ? '#60a5fa' : r.kind === 'PATCH' ? '#16a34a' : r.kind === 'RELIC' ? '#f97316' : '#9ca3af'}>{r.kind === 'PA' ? 'PATCH AUTO' : r.kind === 'AU' ? 'AUTO' : r.kind === 'OTHER' ? (r.x === 'RC' ? 'RC' : 'INSERT') : r.kind}</Chip></td>
                      <td style={{ padding: '9px 14px' }}>{r.memc ? <MemChip code={r.memc} /> : <span style={{ color: '#444' }}>—</span>}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.serial === 1 ? <span style={{ background: ACCENT, color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800 }}>1/1</span> : r.serial > 0 ? '/' + r.serial : <span style={{ color: '#6B7080' }}>—</span>}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}><button aria-label="Add to wantlist" onClick={() => wantIt({ set_slug: setData.slug, set_name: setData.name, card_n: r.n, section: r.section, player: r.p })} style={{ background: 'none', border: '1px solid #232A3E', color: '#A1A1AA', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontFamily: 'inherit' }}>+</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )) : visibleSections.slice(0, secLimit).map(sec => {
            const sorted = sec.cards.slice().sort(makeComparator(sortField, sortDir))
            return (
              <div key={sec.title} style={{ marginBottom: 26 }}>
                <h2 style={{ ...title(17), margin: '0 0 6px' }}>
                  {sec.title} <span style={{ color: '#6B7080', fontSize: 15 }}>· {sec.cards.length}</span>
                </h2>
                {sec.mem && <div style={{ margin: '0 0 10px' }}><MemBadge mem={sec.mem} /></div>}
                {sec.odds && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 10px', padding: '8px 12px', background: '#141109', border: '1px solid ' + ACCENT + '2e', borderRadius: 9 }}>
                    <span style={{ ...eyebrow, color: ACCENT_TEXT, whiteSpace: 'nowrap', paddingTop: 1 }}>Pack Odds</span>
                    <span style={{ color: '#A1A1AA', fontSize: 12.5, lineHeight: 1.5 }}>{sec.odds}</span>
                  </div>
                )}
                <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                  <div className="hq-setrow" style={{ display: 'flex', gap: 14, padding: '9px 16px', background: '#121626', borderBottom: '1px solid #232A3E', alignItems: 'center' }}>
                    <div className="hq-col-num" style={{ flex: '0 0 68px' }}><SortHeader label="Card #" field="n" sortField={sortField} sortDir={sortDir} onClick={toggleSort} /></div>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}><SortHeader label={setIsTcg ? 'Card' : 'Player'} field="p" sortField={sortField} sortDir={sortDir} onClick={toggleSort} grow /></div>
                    <div className="hq-col-team" style={{ flex: '1 1 auto', minWidth: 0 }}><SortHeader label={setIsTcg ? 'Type' : 'Team'} field="t" sortField={sortField} sortDir={sortDir} onClick={toggleSort} grow /></div>
                    <div className="hq-col-flag" style={{ flex: setIsTcg ? '0 0 110px' : '0 0 70px' }}><SortHeader label={setIsTcg ? 'Rarity' : 'Flag'} field="x" sortField={sortField} sortDir={sortDir} onClick={toggleSort} align="right" /></div>
                    <span aria-hidden="true" style={{ flex: '0 0 32px' }} />
                  </div>
                  {sorted.slice(0, 1000).map((c, i) => (
                    <div key={i} className="hq-setrow" style={{
                      display: 'flex', gap: 14, padding: '8px 16px', fontSize: 14,
                      background: i % 2 === 0 ? '#0F1320' : '#121626', alignItems: 'center'
                    }}>
                      <span className="hq-col-num" style={{ flex: '0 0 68px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{c.n ? '#' + c.n : '—'}</span>
                      <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <button onClick={() => openPlayerByName(c.p)} title={'Open ' + c.p + "'s player page"} style={{ fontWeight: 600, background: 'none', border: 'none', color: isMine(c.p) ? ACCENT_TEXT : '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 14 }}>{c.p}</button>
                        {c.t && <span className="hq-mobile-only" style={{ color: '#8A8A93', fontSize: 12, marginTop: 2 }}>{c.t}</span>}
                      </span>
                      <span className="hq-col-team" style={{ flex: '1 1 auto', minWidth: 0, color: '#8A8A93', fontSize: 13 }}>{c.t || ''}</span>
                      <span className="hq-col-flag" style={{ flex: setIsTcg ? '0 0 110px' : '0 0 70px', textAlign: 'right' }}>{c.x ? <Chip color={c.x === 'RC' ? '#4ade80' : '#8A8A93'}>{c.x}</Chip> : null}</span>
                      <button title="Add this card (and its parallel section) to your wantlist"
                        onClick={() => wantIt({ set_slug: setData.slug, set_name: setData.name, card_n: c.n, section: sec.title, player: c.p })}
                        aria-label="Add to wantlist" style={{ flex: '0 0 32px', height: 32, background: 'none', border: '1px solid #232A3E', color: '#7a7a7a', borderRadius: 6, fontSize: 14, cursor: 'pointer', padding: 0 }}>+</button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {!onlyMine && visibleSections.length > secLimit && (
            <div style={{ textAlign: 'center', margin: '4px 0 20px' }}>
              <button onClick={() => setSecLimit(n => n + 20)}
                style={{ ...buttonText, background: 'transparent', color: '#D4D4D8', border: '1px solid #2E3D6B', borderRadius: 10, padding: '0 18px', height: 42, cursor: 'pointer', fontSize: 14 }}>
                Show {Math.min(20, visibleSections.length - secLimit)} more sections ({(visibleSections.length - secLimit).toLocaleString()} left)
              </button>
            </div>
          )}
          {visibleSections.length === 0 && <p style={{ color: '#6B7080' }}>No cards match{onlyMine ? ' for your players in this set' : ''}.</p>}
        </section>
      ) : globalHits ? (
        <section>
          <button onClick={() => goHome()}
            style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← Browse sets
          </button>
          <h2 style={{ ...title(19), margin: '0 0 14px' }}>
            {globalHits.players.length + globalHits.sets.length} results for “{query}”
          </h2>
          {globalHits.players.length > 0 && (
            <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
              {globalHits.players.map((p, i) => (
                <button key={p.id} onClick={() => openPlayer(p, null, [])}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '11px 16px', fontSize: 14, alignItems: 'baseline', flexWrap: 'wrap', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: '#8A8A93', fontSize: 12.5 }}>{p.sport} · {p.cards.toLocaleString()} cards</span>
                </button>
              ))}
            </div>
          )}
          {globalHits.sets.length > 0 && (
            <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
              {globalHits.sets.map((x, i) => (
                <button key={x.slug} onClick={() => openSet(x)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '11px 16px', fontSize: 14, alignItems: 'baseline', flexWrap: 'wrap', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontWeight: 600 }}>{x.name}</span>
                  <span style={{ color: '#8A8A93', fontSize: 12.5 }}>Set · {(x.cardCount || 0).toLocaleString()} cards</span>
                </button>
              ))}
            </div>
          )}
          {globalHits.players.length + globalHits.sets.length === 0 && <p style={{ padding: 20, color: '#6B7080', fontSize: 14 }}>No players or sets match.</p>}
        </section>
      ) : view === 'player' && activePlayer ? (
        <PlayerPage key={activePlayer.id + '|' + ((playerParsed && playerParsed.raw) || '')} player={activePlayer} parsed={playerParsed} sets={sets} myPlayers={myPlayers}
          onOpenSet={openSetBySlug}
          onWant={wantIt} onSearch={runSearch} candidates={playerCandidates} onPickCandidate={(c) => openPlayer(c, playerParsed, playerCandidates)} />
      ) : view === 'myplayers' ? (
        <MyPlayersPanel myPlayers={myPlayers} onOpenPlayer={(name) => openPlayerByName(name)} />
      ) : view === 'community' ? (
        <CommunityView account={account} indexSets={sets} onOpenAuth={() => setAuthOpen(true)} />
      ) : view === 'collection' ? (
        <CollectionView account={account} indexSets={sets} onOpenAuth={() => setAuthOpen(true)}
          onOpenSet={openSetBySlug} />
      ) : view === 'rpa' ? (
        <section>
          <div style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: '30px 30px', marginBottom: 22 }}>
            <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>RPA Tracker</h1>
            <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
              Every Rookie Patch Auto, on-card autograph, patch and relic card across {statN.sets.toLocaleString()} sets — with its serial print run — so you can track the hobby's premium hits in one place.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {RPA_TYPES.map(([code, label]) => (
              <button key={code} onClick={() => setRpaType(code)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
                  background: rpaType === code ? (RPA_TYPE_COLOR[code] || ACCENT) : '#121626',
                  color: rpaType === code ? '#0F1320' : '#A1A1AA',
                  border: '1px solid ' + (rpaType === code ? 'transparent' : '#232A3E')
                }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            {sports.map(sp => (
              <button key={sp} onClick={() => setSportFilter(sp)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  cursor: 'pointer',
                  background: sportFilter === sp ? (SPORT_COLORS[sp] || ACCENT) : '#121626',
                  color: sportFilter === sp ? '#0F1320' : '#A1A1AA',
                  border: '1px solid ' + (sportFilter === sp ? 'transparent' : '#232A3E'),
                  fontSize: 13,
                  fontWeight: 600
                }}>{sp}</button>
            ))}
          </div>
          <input value={rpaQuery} onChange={(e) => setRpaQuery(e.target.value)} placeholder="Filter by player…"
            style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid #232A3E', borderRadius: 10, padding: '12px 16px', color: '#EDEDEF', fontSize: 15, outline: 'none', marginBottom: 16 }} />

          {!rpaData ? <p style={{ color: '#6B7080' }}>Loading RPA database…</p> : (
            <>
              <p style={{ color: '#6B7080', fontSize: 12, margin: '0 0 10px' }}>{rpaResults.length >= 1200 ? '1,200+' : rpaResults.length.toLocaleString()} cards{rpaQuery ? ' for “' + rpaQuery + '”' : ''}</p>
              <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ ...eyebrow, display: 'flex', gap: 12, padding: '9px 16px', background: '#121626', borderBottom: '1px solid #232A3E', color: '#8A8A93' }}>
                  <span style={{ flex: '0 0 56px' }}>Card</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>Player</span>
                  <span style={{ flex: '0 0 88px' }}>Type</span>
                  <span style={{ flex: '0 0 64px', textAlign: 'right' }}>Serial</span>
                  <span style={{ flex: '2 1 0', minWidth: 0 }}>Set</span>
                </div>
                {rpaResults.map((c, i) => (
                  <button key={i} onClick={() => { const s = sets.find(x => x.slug === c.slug); if (s) openSet(Object.assign({}, s, classifySet(s.name))) }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '8px 16px', fontSize: 14, alignItems: 'baseline', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer' }}>
                    <span style={{ flex: '0 0 56px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.n ? '#' + c.n : '—'}</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 600 }}>{c.p}</span>
                    <span style={{ flex: '0 0 88px' }}><Chip color={RPA_TYPE_COLOR[c.type]}>{c.type}</Chip></span>
                    <span style={{ flex: '0 0 64px', textAlign: 'right', color: c.serial ? '#EDEDEF' : '#6B7080', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.serial || '—'}</span>
                    <span style={{ flex: '2 1 0', minWidth: 0, color: '#8A8A93', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.year} {c.set}</span>
                  </button>
                ))}
                {rpaResults.length === 0 && <p style={{ padding: 20, color: '#6B7080', fontSize: 14 }}>No hits match.</p>}
              </div>
            </>
          )}
        </section>
      ) : view === 'patchswaps' ? (
        <section>
          <div style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: '30px 30px', marginBottom: 24 }}>
            <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>Patch Swaps</h1>
            <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
              A running record of cards known to have had their game-used or manufactured patches swapped — with the original and the replacement patch side by side so collectors can spot altered cards before they buy.
            </p>
            <p style={{ color: '#8A8A93', fontSize: 13, margin: '16px 0 0' }}>
              Primary source:{' '}
              <a href={(patchData && patchData.source && patchData.source.url) || 'https://www.instagram.com/fake_hockey_patches/'} target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT, fontWeight: 700 }}>
                @fake_hockey_patches
              </a>{' '}on Instagram — the definitive community feed documenting swapped hockey patches.
            </p>
          </div>

          {!patchData ? <p style={{ color: '#6B7080' }}>Loading…</p> : (
            <>
              {patchData.intro && (
                <p style={{ color: '#c9c9c9', fontSize: 15, lineHeight: 1.7, maxWidth: 820, margin: '0 0 26px' }}>{patchData.intro}</p>
              )}

              {/* LIVE COMMUNITY FEED CTA */}
              <a href={patchData.source.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', textDecoration: 'none',
                  background: 'linear-gradient(120deg, #2a1a2e, #14101a)', border: '1px solid #4a2f52', borderRadius: 16, padding: '20px 24px', marginBottom: 30 }}>
                <div>
                  <p style={{ ...eyebrow, margin: 0, color: '#e879f9' }}>● Live community feed</p>
                  <p style={{ ...display, margin: '6px 0 0', fontSize: 26, color: '#fff' }}>{patchData.source.name}</p>
                  <p style={{ color: '#b9a9c0', fontSize: 13, margin: '4px 0 0', maxWidth: 560 }}>{patchData.source.note}</p>
                </div>
                <span style={{ ...eyebrow, background: '#e879f9', color: '#1a0f1e', padding: '12px 22px', borderRadius: 10, whiteSpace: 'nowrap', fontSize: 12 }}>Open on Instagram →</span>
              </a>

              {/* DOCUMENTED SWAPS — actual posts from the feed */}
              {(patchData.posts || []).length > 0 && (
                <>
                  <h2 style={{ ...title(21), margin: '0 0 6px' }}>Documented swaps</h2>
                  <p style={{ color: '#A1A1AA', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 760 }}>
                    Individual cases from @fake_hockey_patches — each post shows the actual card before and after its patch was swapped. Tap any post to see every photo and the community discussion.
                  </p>
                  <div style={{ marginBottom: 34 }}>
                    <InstagramEmbeds urls={patchData.posts} />
                  </div>
                </>
              )}

              {/* HOW TO SPOT A SWAP */}
              <h2 style={{ ...title(21), margin: '0 0 16px' }}>How to spot a swap</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14, marginBottom: 34 }}>
                {(patchData.redFlags || []).map((f, i) => (
                  <div key={i} style={{ background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid #232A3E', borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <span style={{ ...display, color: '#e11d48', fontSize: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                      <p style={{ ...title(15), margin: 0, lineHeight: 1.15 }}>{f.title}</p>
                    </div>
                    <p style={{ color: '#a9a9a9', fontSize: 13.5, lineHeight: 1.55, margin: 0 }}>{f.detail}</p>
                  </div>
                ))}
              </div>

              {/* HIGHEST-RISK PRODUCTS → link into RPA tracker patch view */}
              {(patchData.watchSets || []).length > 0 && (
                <div style={{ background: 'linear-gradient(140deg, #17140c, #0F1320)', border: '1px solid ' + ACCENT + '2e', borderRadius: 16, padding: '22px 24px', marginBottom: 24 }}>
                  <h2 style={{ ...title(16), color: ACCENT_TEXT, margin: '0 0 6px' }}>Products most targeted</h2>
                  <p style={{ color: '#A1A1AA', fontSize: 13.5, lineHeight: 1.6, margin: '0 0 14px', maxWidth: 720 }}>High-end patch and RPA products carry the most swap risk. Cross-reference any patch card against its checklist print run — browse the patch and RPA cards in the tracker.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {patchData.watchSets.map(w => (
                      <span key={w} style={{ background: '#0e1630', border: '1px solid ' + ACCENT + '33', color: '#c9d8ff', fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999 }}>{w}</span>
                    ))}
                  </div>
                  <button onClick={() => { setRpaType('PA'); openRpa() }}
                    style={{ ...buttonText, marginTop: 14, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 14 }}>
                    Open the Patch-Auto tracker →
                  </button>
                </div>
              )}

              {/* Documented case gallery (populated as sourced-with-rights images are added) */}
              {patchData.entries && patchData.entries.filter(e => e.player || e.card).length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 16, marginTop: 24 }}>
                  {patchData.entries.filter(e => e.player || e.card).map((e) => (
                    <div key={e.id} style={{ background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid #232A3E', borderRadius: 14, overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: '#000' }}>
                        {[['Original', e.originalImg], ['Swapped', e.swappedImg]].map(([lbl, img]) => (
                          <div key={lbl} style={{ position: 'relative', aspectRatio: '1', background: '#0B0E17', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {img ? <img src={img} alt={lbl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#444', fontSize: 12 }}>{lbl} photo</span>}
                            <span style={{ ...eyebrow, position: 'absolute', top: 8, left: 8, background: lbl === 'Swapped' ? '#e11d48' : '#232A3E', color: '#fff', padding: '3px 8px', borderRadius: 4 }}>{lbl}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '16px 18px' }}>
                        <p style={{ ...title(15), margin: 0 }}>{e.player || e.card}</p>
                        <p style={{ color: '#8A8A93', fontSize: 12, margin: '4px 0 0' }}>{[e.year, e.set, e.card].filter(Boolean).join(' · ')}</p>
                        {e.summary && <p style={{ color: '#A1A1AA', fontSize: 13, lineHeight: 1.5, margin: '10px 0 0' }}>{e.summary}</p>}
                        {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT, fontSize: 12, fontWeight: 700, display: 'inline-block', marginTop: 10 }}>View source →</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      ) : browseActive ? (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <h2 style={{ ...title(19), margin: 0 }}>
              {isTcg ? ([teamFilter !== 'All' ? '“' + teamFilter + '”' : null, tcgRarity !== 'All' ? tcgRarity : null, tcgType !== 'All' ? tcgType : null].filter(Boolean).join(' · ')) : teamFilter} <span style={{ color: SPORT_COLORS[sportFilter] || ACCENT_TEXT, fontSize: 15 }}>· {sportFilter}</span>
              <span style={{ color: '#6B7080', fontSize: 15, marginLeft: 10 }}>{teamHits.length.toLocaleString()}{teamHits.length >= 2500 ? '+' : ''} cards</span>
            </h2>
          </div>
          <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ ...eyebrow, display: 'flex', gap: 12, padding: '9px 16px', background: '#121626', borderBottom: '1px solid #232A3E', color: '#8A8A93' }}>
              <span style={{ flex: '0 0 60px' }}>Card</span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>{isTcg ? 'Card' : 'Player'}</span>
              <span style={{ flex: isTcg ? '0 0 120px' : '0 0 54px' }}>{isTcg ? 'Rarity' : 'Flag'}</span>
              <span style={{ flex: '2 1 0', minWidth: 0 }}>Set · Section</span>
            </div>
            {teamHits.map((c, i) => (
              <button key={i} onClick={() => { const s = sets.find(x => x.slug === c.slug); if (s) openSet(Object.assign({}, s, classifySet(s.name))) }}
                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '8px 16px', fontSize: 14, alignItems: 'baseline', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer' }}>
                <span style={{ flex: '0 0 60px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.n ? '#' + c.n : '—'}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 600 }}>{c.p}{isTcg && c.t ? <span style={{ color: '#8A8A93', fontWeight: 400, fontSize: 12.5 }}> · {c.t}</span> : null}</span>
                <span style={{ flex: isTcg ? '0 0 120px' : '0 0 54px' }}>{c.x ? <Chip color={c.x === 'RC' ? '#4ade80' : '#8A8A93'}>{c.x}</Chip> : null}</span>
                <span style={{ flex: '2 1 0', minWidth: 0, color: '#8A8A93', fontSize: 12.5 }}>{c.set}{c.section ? ' · ' + c.section : ''}</span>
              </button>
            ))}
            {sliceLoading && <p style={{ padding: 20, color: '#6B7080', fontSize: 14 }}>Loading {teamFilter} cards…</p>}
            {!sliceLoading && teamHits.length === 0 && <p style={{ padding: 20, color: '#6B7080', fontSize: 14 }}>No {isTcg ? 'matching cards' : 'cards found for ' + teamFilter} in {sportFilter}.</p>}
          </div>
        </section>
      ) : (
        <section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 14 }}>
            {filteredSets.slice().sort((a, b) => {
              // A–Z by the product name shown on the card (the season prefix is dropped there);
              // sets with no year go last in both year orders.
              const nm = () => a.name.replace(/^\d{4}(-\d{2})?\s*/, '').localeCompare(b.name.replace(/^\d{4}(-\d{2})?\s*/, '')) || (b.year || 0) - (a.year || 0)
              if (sortBy === 'year-asc') return ((a.year || 9999) - (b.year || 9999)) || nm()
              if (sortBy === 'name-asc') return nm()
              if (sortBy === 'name-desc') return -nm()
              if (sortBy === 'cards-desc') return (b.cardCount - a.cardCount) || nm()
              if (sortBy === 'cards-asc') return (a.cardCount - b.cardCount) || nm()
              if (sortBy === 'brand') return (a.brand || 'zzz').localeCompare(b.brand || 'zzz') || (b.year - a.year) || nm()
              return (b.year - a.year) || nm() // year-desc default
            }).slice(0, setLimit).map((s) => {
              const c = SPORT_COLORS[s.sport] || ACCENT
              return (
                <button key={s.slug} onClick={() => openSet(s)} className="hq-setcard"
                  style={{
                    position: 'relative', textAlign: 'left', background: 'linear-gradient(155deg, #121626, #0F1320)',
                    border: '1px solid #1A1F31', borderRadius: 14, padding: '18px 18px 16px', color: '#EDEDEF',
                    cursor: 'pointer', overflow: 'hidden', transition: 'transform .16s ease, border-color .16s ease, box-shadow .16s ease'
                  }}>
                  {/* foil edge in the sport color */}
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: 'linear-gradient(180deg, ' + c + ', ' + c + '44)' }} />
                  {/* holographic sheen */}
                  <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg, transparent 40%, ' + c + '10 50%, transparent 60%)', pointerEvents: 'none' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ ...eyebrow, color: c }}>{s.sport}{yearLabel(s) ? ' · ' + yearLabel(s) : ''}</span>
                    <span style={{ color: '#6B7080', fontSize: 11 }}>{(s.sections || 0)} section{s.sections === 1 ? '' : 's'}</span>
                  </div>
                  <p style={{ ...title(16), margin: '0 0 12px', lineHeight: 1.1, minHeight: 44 }}>{s.name.replace(/^\d{4}(-\d{2})?\s*/, '')}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #222', paddingTop: 10 }}>
                    <span style={{ ...display, fontSize: 22, color: ACCENT_TEXT }}>{(s.cardCount || 0).toLocaleString()}</span>
                    <span style={{ ...eyebrow, color: '#8A8A93' }}>Cards</span>
                  </div>
                </button>
              )
            })}
          </div>
          {sets.length === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 150, borderRadius: 14, background: SURFACE, border: '1px solid ' + LINE }} />)}
            </div>
          )}
          {filteredSets.length > setLimit && (
            <div style={{ textAlign: 'center', margin: '22px 0 0' }}>
              <button onClick={() => setSetLimit(n => n + 120)}
                style={{ background: SURFACE, color: TEXT, border: '1px solid ' + LINE, borderRadius: 10, padding: '0 20px', height: 44, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Show more sets ({(filteredSets.length - setLimit).toLocaleString()} more)
              </button>
            </div>
          )}
          {sets.length > 0 && filteredSets.length === 0 && <p style={{ color: LABEL, fontSize: 14 }}>No sets match these filters.</p>}
        </section>
      )}

      <footer style={{ marginTop: 60, borderTop: '1px solid #1A1F31', paddingTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#6B7080', fontSize: 12 }}>Checklist data sourced from The Cardboard Connection.</span>
        <span style={{ color: '#6B7080', fontSize: 12 }}>a Coulter Companies product</span>
      </footer>
    </main>
  )
}
