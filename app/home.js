'use client'

// Checklist HQ v2 — sectioned checklist database (Base / Inserts / Autos …)
// imported from cardboardconnection.com. Static JSON under /public/data:
// index.json lists sets; each set file carries sections -> cards.
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Select, Popover, Trigger, Chevron, Check, menuItem, menuHeading, triggerStyle, useIsMobile } from '../components/dropdown'
import { useAccount, AccountChip, AuthModal, CollectionView, CommunityView } from '../components/community'
import { supa, addWant, removeWant, myWantlist, grailfindrFindUrl } from '../lib/supa'
import { FeedbackModal, FeedbackView, useFeedbackAdmin } from '../components/feedback'
import { FixEditor } from '../components/fix-editor'
import { Omnibox, PlayerPage, MyPlayersPanel, useMyPlayers, loadPlayerDir, loadTopPlayers, seasonLabel, MemBadge, MemChip, memCodeOf } from '../components/player'
import { ComparePage } from '../components/compare'
import { norm, parseQuery, parseQueryFor, matchPlayers, TYPE, typeLabel, TYPE_COLORS, serialLabel } from '../lib/query'
import { loadSet, loadIndex, loadRedirects } from '../lib/catalog'
import { classifySet, brandSort, BRAND_COLORS } from '../lib/brands'
import { ACCENT, ACCENT_TEXT, BG, SURFACE, SURFACE_2, LINE, CHIP_LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'



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
          <a href={u} target="_blank" rel="noreferrer" style={{ color: '#8A93A8', fontSize: 12, display: 'block', padding: 16 }}>View this post on Instagram</a>
        </blockquote>
      ))}
    </div>
  )
}

const SPORT_COLORS = {
  Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e',
  UFC: '#dc2626', Boxing: '#eab308',
  'Pokémon': '#facc15', 'Yu-Gi-Oh!': '#a855f7', Magic: '#f59e0b', Lorcana: '#8b5cf6', 'One Piece': '#ef4444', Disney: '#ec4899',
  Entertainment: '#ec4899', 'Non-Sport': '#fb923c'
}
// Which categories are trading card games (vs traditional sports cards).
const TCG_SET = new Set(['Pokémon', 'Yu-Gi-Oh!', 'Magic', 'Lorcana', 'One Piece', 'Disney'])
// Non-sports, non-TCG cards (movies, TV, comics, toys, music, history…).
const OTHER_SET = new Set(['Entertainment', 'Non-Sport'])
const TCG_EXAMPLE = { 'Pokémon': 'Charizard', 'Yu-Gi-Oh!': 'Dark Magician', Magic: 'Lightning Bolt', Lorcana: 'Stitch', 'One Piece': 'Monkey.D.Luffy' }
// "Stitch — Rock Star" / "Sanji (SP)" / "A-Ancestral Katana" -> base card name.
const tcgBaseName = (p) => String(p || '').replace(/\s+[—–-]\s+.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^A-(?=\S)/, '').trim()


const RPA_TYPES = [['RPA', 'Rookie Patch Auto'], ['PA', 'Patch Auto'], ['RA', 'Rookie Auto'], ['AU', 'Autograph'], ['PATCH', 'Patch'], ['RELIC', 'Relic'], ['All', 'All Hits']]
const RPA_TYPE_COLOR = { RPA: '#d4a843', PA: '#e11d48', RA: '#8b5cf6', AU: '#2563eb', PATCH: '#16a34a', RELIC: '#f97316', All: '#8A93A8' }

// "2024-25 Upper Deck The Cup" -> "2024-25"; otherwise the stored year.
function yearLabel(s) {
  const m = (s && s.name || '').match(/^(\d{4}-\d{2})\b/)
  return m ? m[1] : (s && s.year) || ''
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
                  color: active ? ACCENT_TEXT : '#8A93A8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                  minWidth: grow ? 0 : undefined,
                  fontSize: 13,
                  fontWeight: 600
                }}>
      {label}<span style={{ opacity: active ? 1 : 0.35, fontSize: 12 }}>{active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </button>
  )
}

// ESPN-style bottom line: the league label holds on the left while that
// league's headlines crawl right-to-left at a constant speed. When the last
// headline clears the screen, the label flips to the next league and its
// headlines start crawling. Hover pauses; clicking the label skips ahead.
const CRAWL_PX_PER_SEC = 90
function BottomLine({ segments }) {
  const [seg, setSeg] = useState(0)
  const [run, setRun] = useState(null) // { from, to, dur } for the current crawl
  const viewport = useRef(null)
  const track = useRef(null)
  const cur = segments.length ? segments[seg % segments.length] : null
  useLayoutEffect(() => {
    if (!cur || !viewport.current || !track.current) return
    const from = viewport.current.offsetWidth
    const to = -track.current.scrollWidth
    setRun({ from, to, dur: (from - to) / CRAWL_PX_PER_SEC })
  }, [seg, segments.length])
  if (!cur) return null
  const next = () => { setRun(null); setSeg(n => (n + 1) % segments.length) }
  const jump = (i) => { setRun(null); setSeg(i) }
  const anim = run ? 'hqcrawl ' + run.dur + 's linear forwards' : 'none'
  return (
    <div className="hq-bottomline" role="region" aria-label="Sports and card news">
      <button key={'l' + cur.key} className="hq-bl-label" onClick={next} title="Next"
        style={{ ...eyebrow, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', minWidth: 124, background: cur.color, color: '#0B0E17', border: 0, cursor: 'pointer', fontSize: 14 }}>
        {cur.label}
      </button>
      <div ref={viewport} className="hq-bl-viewport" style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div ref={track} key={'t' + cur.key + seg} className="hq-bl-track" onAnimationEnd={next}
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', willChange: 'transform',
            transform: 'translateX(' + (run ? run.from : 10000) + 'px)', '--from': (run ? run.from : 0) + 'px', '--to': (run ? run.to : 0) + 'px', animation: anim }}>
          {cur.items.map((it, i) => (
            <a key={i} href={it.link} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 22px', textDecoration: 'none', color: TEXT, fontSize: 14, fontWeight: 500 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: cur.color, flexShrink: 0 }} />
              {it.title}
              <span style={{ ...eyebrow, fontSize: 12, color: LABEL }}>{it.source}</span>
            </a>
          ))}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 2, padding: '0 10px', borderLeft: '1px solid #1C2233', background: '#0B0E17' }}>
        {segments.map((sg, i) => {
          const on = i === seg % segments.length
          return (
            <button key={sg.key} onClick={() => jump(i)} title={sg.label} aria-label={sg.label}
              style={{ width: 18, height: 18, padding: 0, background: 'none', border: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: on ? 8 : 5, height: on ? 8 : 5, borderRadius: 999, background: on ? sg.color : '#3A4562' }} />
            </button>
          )
        })}
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

// Does set `s` belong to the current category filter? sportFilter is either a
// group ('All' | 'Sports' | 'TCG' | 'Other') or one category ('Baseball').
function matchSport(s, f) {
  if (f === 'All') return true
  if (f === 'TCG') return TCG_SET.has(s.sport)
  if (f === 'Other') return OTHER_SET.has(s.sport)
  if (f === 'Sports') return !TCG_SET.has(s.sport) && !OTHER_SET.has(s.sport)
  return s.sport === f
}
const groupOf = (f) => f === 'All' ? 'All' : (f === 'TCG' || TCG_SET.has(f)) ? 'TCG' : (f === 'Other' || OTHER_SET.has(f)) ? 'Other' : 'Sports'

// Sports shown as chips; every other sport goes in the "More sports" menu.
const MAIN_SPORTS = ['Baseball', 'Football', 'Basketball', 'Hockey', 'Soccer']
const POPULAR_BRANDS = ['Topps', 'Panini', 'Upper Deck', 'Bowman', 'Donruss', 'Fleer']
const SECONDARY = '#8A93A8'

const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

const pill = (on) => ({
  minHeight: 40, padding: '0 16px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, ...buttonText,
  background: on ? ACCENT : SURFACE, color: on ? '#fff' : '#C9CCD6',
  border: '1px solid ' + (on ? ACCENT : LINE)
})

// Category tabs (All / Sports / TCG / Other), one row of chips for the active
// tab, a "More sports" menu, a searchable Brand menu, the Product menu and a
// strip of active filters with one-click removal. All menus use the shared
// dropdown in components/dropdown.js.
function SetFilters({ sports, sportFilter, onPick, showBrand, brands, brandFilter, onBrand, products, productFilter, onProduct }) {
  const [menu, setMenu] = useState(null)          // 'more' | 'brand' | null
  const [brandQ, setBrandQ] = useState('')
  const moreBtn = useRef(null)
  const brandBtn = useRef(null)
  const mobile = useIsMobile()
  const closeMenu = useCallback(() => setMenu(null), [])

  useEffect(() => { if (menu !== 'brand') setBrandQ('') }, [menu])

  const group = groupOf(sportFilter)
  const sportCats = sports.filter(s => s !== 'All' && !TCG_SET.has(s) && !OTHER_SET.has(s))
  const tcgCats = sports.filter(s => TCG_SET.has(s))
  const otherCats = sports.filter(s => OTHER_SET.has(s))
  const mainSports = MAIN_SPORTS.filter(s => sportCats.includes(s))
  const moreSports = sportCats.filter(s => !MAIN_SPORTS.includes(s))
  const tabs = [['All', 'All'], ['Sports', 'Sports'], ...(tcgCats.length ? [['TCG', 'TCG']] : []), ...(otherCats.length ? [['Other', 'Other']] : [])]
  const chips = group === 'Sports' ? [['All sports', 'Sports'], ...mainSports.map(s => [s, s])]
    : group === 'TCG' ? [['All TCG', 'TCG'], ...tcgCats.map(s => [s, s])]
    : group === 'Other' ? [['All other', 'Other'], ...otherCats.map(s => [s, s])] : []
  const moreSel = moreSports.includes(sportFilter)

  const brandList = brands.slice(1)
  const q = brandQ.trim().toLowerCase()
  const shown = q ? brandList.filter(b => b.toLowerCase().includes(q)) : brandList
  const popular = q ? [] : POPULAR_BRANDS.filter(b => brandList.includes(b))
  const rest = (q ? shown : shown.filter(b => !popular.includes(b))).slice().sort((a, b) => a.localeCompare(b))
  const pickBrand = (b) => { onBrand(b); setMenu(null) }

  const active = []
  if (sportFilter !== 'All' && !['Sports', 'TCG', 'Other'].includes(sportFilter)) active.push([sportFilter, () => onPick(group)])
  if (brandFilter !== 'All') active.push([brandFilter, () => onBrand('All')])
  if (productFilter !== 'All') active.push([productFilter, () => onProduct('All')])

  const brandItems = (list) => list.map(b => (
    <button key={b} type="button" onClick={() => pickBrand(b)} style={menuItem(brandFilter === b)}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>{brandFilter === b && <Check />}
    </button>
  ))
  const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }

  return (
    <div>
      <div role="tablist" aria-label="Category" className="hq-chiprow" style={{ display: 'flex', gap: 32, borderBottom: '1px solid ' + LINE }}>
        {tabs.map(([label, value]) => {
          const on = group === value
          return (
            <button key={value} role="tab" aria-selected={on} onClick={() => { setMenu(null); onPick(value) }}
              style={{ ...eyebrow, fontSize: 17, background: 'none', border: 'none', cursor: 'pointer', padding: '12px 0', marginBottom: -1,
                borderBottom: '3px solid ' + (on ? ACCENT : 'transparent'), color: on ? TEXT : SECONDARY, whiteSpace: 'nowrap' }}>{label}</button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
        <div className="hq-chiprow" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
          {chips.map(([label, value]) => (
            <button key={value} onClick={() => { setMenu(null); onPick(value) }} style={pill(sportFilter === value)}>{label}</button>
          ))}
          {group === 'Sports' && moreSports.length > 0 && (
            <button ref={moreBtn} type="button" aria-haspopup="listbox" aria-expanded={menu === 'more'} onClick={() => setMenu(menu === 'more' ? null : 'more')}
              style={{ ...pill(moreSel), paddingRight: 12, ...(moreSel ? {} : { border: '1px dashed #3A4260' }) }}>
              {moreSel ? sportFilter : 'More sports'}<Chevron />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
          {showBrand && brandList.length > 0 && (
            <Trigger triggerRef={brandBtn} label="Brand" value={brandFilter === 'All' ? 'Any' : brandFilter}
              active={brandFilter !== 'All'} open={menu === 'brand'} onClick={() => setMenu(menu === 'brand' ? null : 'brand')} />
          )}
          {showBrand && products.length > 1 && (
            <Select label="Product" ariaLabel="Product line" value={productFilter} onChange={onProduct} defaultValue="All" width={300}
              options={[['All', 'All (' + (products.length - 1) + ')'], ...products.slice(1).map(p => [p, p])]} />
          )}
        </div>
      </div>

      <Popover open={menu === 'more'} onClose={closeMenu} anchorRef={moreBtn} width={320} title="More sports">
        <div style={grid2}>
          {moreSports.map(s => (
            <button key={s} type="button" onClick={() => { onPick(s); setMenu(null) }} style={menuItem(sportFilter === s)}>{s}{sportFilter === s && <Check />}</button>
          ))}
        </div>
      </Popover>

      <Popover open={menu === 'brand'} onClose={closeMenu} anchorRef={brandBtn} width={360} title="Brand" padding={12}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="search" autoFocus={!mobile} value={brandQ} onChange={(e) => setBrandQ(e.target.value)} placeholder="Find a brand, e.g. SkyBox" aria-label="Find a brand"
            style={{ height: 40, padding: '0 12px', background: BG, color: TEXT, border: '1px solid ' + LINE, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
          {!q && <button type="button" onClick={() => pickBrand('All')} style={menuItem(brandFilter === 'All')}>Any brand{brandFilter === 'All' && <Check />}</button>}
          {popular.length > 0 && <>
            <span style={menuHeading}>Popular</span>
            <div style={grid2}>{brandItems(popular)}</div>
          </>}
          {rest.length > 0 && <>
            {!q && <span style={menuHeading}>All brands A–Z</span>}
            <div style={grid2}>{brandItems(rest)}</div>
          </>}
          {q && shown.length === 0 && <span style={{ fontSize: 13, color: SECONDARY, padding: 4 }}>No brand matches “{brandQ}”.</span>}
        </div>
      </Popover>

      {active.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <span style={{ fontSize: 13, color: SECONDARY }}>Filtered by</span>
          {active.map(([label, remove]) => (
            <button key={label} onClick={remove} aria-label={'Remove filter ' + label}
              style={{ height: 32, padding: '0 10px 0 12px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 600, background: SURFACE_2, color: TEXT, border: '1px solid ' + CHIP_LINE }}>{label}<XIcon /></button>
          ))}
          <button onClick={() => { setMenu(null); onPick('All') }}
            style={{ height: 32, padding: '0 6px', background: 'none', border: 'none', cursor: 'pointer', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, textDecoration: 'underline' }}>Clear all</button>
        </div>
      )}
    </div>
  )
}

export default function Home() {   // rendered by app/page.js (server wrapper that adds per-page metadata)
  const [sets, setSets] = useState([])
  const [activeSet, setActiveSet] = useState(null)
  const [setData, setSetData] = useState(null)
  const [activeSection, setActiveSection] = useState('All')
  const [showAllSecs, setShowAllSecs] = useState(false)
  const [query, setQuery] = useState('')
  // Heavy filtering follows the query a beat behind so typing stays instant.
  const dQuery = useDeferredValue(query)
  const [sportFilter, setSportFilter] = useState('All')
  const [brandFilter, setBrandFilter] = useState('All')
  const [productFilter, setProductFilter] = useState('All')
  const [sortBy, setSortBy] = useState('year-desc')
  const [view, setView] = useState('browse') // browse | patchswaps | rpa | community | collection
  const account = useAccount()
  const [authOpen, setAuthOpen] = useState(false)
  const [feedback, setFeedback] = useState(null)   // context of the open report form, or null
  const fbAdmin = useFeedbackAdmin(account)
  const [fixing, setFixing] = useState(null)   // { slug, feedback? } while the admin fix editor is open
  const [fixVersion, setFixVersion] = useState(0)
  // "Help verify" notes for sets the data audit thinks have gaps (scripts/build-verify-hints.mjs)
  const [verifyHints, setVerifyHints] = useState(null)
  useEffect(() => { if (activeSet && !verifyHints) fetch('/verify-hints.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(setVerifyHints) }, [activeSet])
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
  const [compareNames, setCompareNames] = useState(['', ''])   // ?compare=A&vs=B
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
  const [catalogDone, setCatalogDone] = useState(false) // bulk catalog merged into `sets` (or failed)
  const [setLoadErr, setSetLoadErr] = useState(false) // the open set's checklist failed to load (404 / network)
  const [openSecs, setOpenSecs] = useState(() => new Set()) // set-page sections expanded past 200 rows
  const [setLimit, setSetLimit] = useState(60) // home grid pages in 60s; all 5k cards at once is slow on phones

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortField(field); setSortDir('asc') }
  }

  // Browse filters load small slices built by build-search-index.mjs instead of
  // the full 94 MB card index (which crashes phones):
  //   TCG game  -> /data/teams/<game>.json (all of that game's cards)
  //   team sport -> /data/teams/<sport>.json (team list), then one file per team
  // searchIndex holds whichever slice is current, in the same shape as before.
  const sportFile = (sp) => sp.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const EMPTY_IDX = { slugs: [], sections: [], teams: [], rows: [] }
  const [teamList, setTeamList] = useState(null) // { sport, teams: [[name, cards]] }
  const teamOpenOnLoad = useRef(false)   // the "Team" button was clicked: open the list once it has loaded
  const [sliceLoading, setSliceLoading] = useState(false)
  const getJson = async (url) => { try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json() } catch { return null } }
  const ensureSearchIndex = async (forSport) => {
    const sp = forSport || sportFilter
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
  const openTeamBrowse = async (forSport) => { setTeamBrowse(true); setTeamLoading(true); await ensureSearchIndex(typeof forSport === 'string' ? forSport : undefined); setTeamLoading(false); setTimeout(() => { teamOpenOnLoad.current = false }, 0) }
  // Load one team's slice when a team is picked (team sports only).
  useEffect(() => {
    if (TCG_SET.has(sportFilter) || teamFilter === 'All' || !teamList || teamList.sport !== sportFilter) return
    const i = teamList.teams.findIndex(([t]) => t === teamFilter)
    if (i < 0) return
    const key = sportFilter + '|' + teamFilter
    if (searchIndex && searchIndex.__key === key) return
    setSliceLoading(true)
    let live = true   // a quick team change must not let the earlier team's slice land last
    getJson('/data/teams/' + sportFile(sportFilter) + '/' + i + '.json').then(j => { if (!live) return; const x = j || { ...EMPTY_IDX }; x.__key = key; setSearchIndex(x); setSliceLoading(false) })
    return () => { live = false }
  }, [sportFilter, teamFilter, teamList])

  // Count-up animation for the hero stat cards.
  const [statN, setStatN] = useState({ sets: 0, cards: 0 })
  const [news, setNews] = useState({ segments: [] })
  useEffect(() => {
    fetch('/api/hobby-news').then(r => r.json()).then(j => setNews({ segments: j.segments || [] })).catch(() => {})
  }, [])

  useEffect(() => {
    // show the static sets right away; the catalog (GitHub) merges in when it arrives
    loadIndex(base => setSets(base)).then(all => { if (all.length) setSets(all) }).catch(() => {}).finally(() => setCatalogDone(true))
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
    const ys = sets.map(s => s.year).filter(y => y >= 1850)   // ignore malformed years (e.g. a stray "24")
    // 2026-27 season sets are filed under 2027; don't advertise a year that hasn't started
    return ys.length ? Math.min(...ys) + '–' + Math.min(Math.max(...ys), new Date().getFullYear()) : ''
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
  // Every navigation bumps navSeq; slow loads from an earlier navigation check it and drop their result
  // (otherwise a late set/player load could replace the page you've since moved to).
  const navSeq = useRef(0)
  const nav = (url, push) => { navSeq.current++; if (push === false) return; try { history.pushState(null, '', url) } catch {} }
  const openSet = async (s, push) => {
    setNotice('')
    setActiveSet(s); setGlobalHits(null); setActiveSection('All'); setShowAllSecs(false); setQuery(''); setActivePlayer(null); setView('browse'); setSetTypeFilter('All'); setSetRunFilter('any'); setSetRcOnly(false); setSetMemFilter('any'); setSecLimit(20); setOpenSecs(new Set())
    nav('?set=' + encodeURIComponent(s.slug), push)
    const my = navSeq.current
    setSetData(null); setSetLoadErr(false)
    let data = null
    try { data = await loadSet(s.slug) } catch (e) {}
    if (my !== navSeq.current) return
    if (!data) { setSetLoadErr(true); return }
    setSetData(data)
    window.scrollTo(0, 0)
  }

  // One compact index (loaded once, then cached) powers instant cross-set
  // player search over every card, rather than fetching 300 set files.
  // Open a player landing page (optionally with the parsed query's filters).
  const openPlayer = (p, parsed, candidates, push) => {
    setNotice('')
    setActivePlayer(p); setPlayerParsed(parsed || null); setPlayerCandidates(candidates || [])
    setActiveSet(null); setSetData(null); setGlobalHits(null); setView('player')
    // two different people can share a name (Larry Johnson, basketball / football): the sport tells them apart
    const twin = (candidates || []).some(c => c !== p && c.name === p.name && c.sport !== p.sport)
    nav('?player=' + encodeURIComponent(p.name) + (twin && p.sport ? '&sport=' + encodeURIComponent(p.sport) : '') + (parsed && parsed.raw && norm(parsed.raw) !== parsed.player ? '&q=' + encodeURIComponent(parsed.raw) : ''), push)
    window.scrollTo(0, 0)
  }
  const openPlayerByName = async (name, rawQuery, push, sport) => {
    // exact name, or a name rolled into another page ("Shoeless Joe Jackson" -> Joe Jackson)
    const is = (h) => h.name === name || h.via === name
    const pick = (hs) => hs.find(h => is(h) && (!sport || h.sport === sport)) || hs.find(is)
    const my = ++navSeq.current
    // Most shared links are for well-known players: try the 100 KB top list before the full directory.
    const top = await loadTopPlayers()
    if (my !== navSeq.current) return
    if (top) {
      const tp = parseQueryFor(top, rawQuery || name)
      const th = matchPlayers(top, tp.player || name, 8)
      const hit = pick(th)
      if (hit && (!sport || hit.sport === sport)) { openPlayer(hit, tp, th, push); return }
    }
    const dir = await loadPlayerDir()
    if (my !== navSeq.current) return
    const parsed = parseQueryFor(dir, rawQuery || name)
    const hits = matchPlayers(dir, parsed.player || name, 8)
    const exact = pick(hits) || (hits[0] && !hits[0].partial ? hits[0] : null)   // a partial (dropped-words) guess is not this link's player
    if (exact) openPlayer(exact, parsed, hits, push)
    else { goHome(false); setNotice('No player called “' + name + '” in the database. Try the search below.') }
  }
  // The omnibox: understands "player + 1/1 / auto / rc / season / product".
  const runSearch = async (raw) => {
    const q = (raw == null ? query : raw).trim()
    if (q.length < 2) return
    setSearching(true)
    const my = ++navSeq.current
    const dir = await loadPlayerDir()
    if (my !== navSeq.current) { setSearching(false); return }   // moved on while the directory loaded
    const parsed = parseQueryFor(dir, q)
    if (parsed.player.length >= 2) {
      const hits = matchPlayers(dir, parsed.player, 8)
      // A product word ("prizm", "gold", "topps chrome 2024") shouldn't jump to a
      // 2-card "player": if set names match and the best player is minor or a
      // typo guess, show the results page (players + sets) instead.
      const toks = norm(q).split(' ').filter(Boolean)
      const setMatch = toks.length && sets.some(x => { const n = norm(x.name); return toks.every(t => n.includes(t)) })
      const weak = !hits.length || hits[0].fuzzy || hits[0].cards < 50
      if (hits.length && !(setMatch && weak)) { setSearching(false); openPlayer(hits[0], parsed, hits); return }
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
    const my = ++navSeq.current
    const dir = await loadPlayerDir()
    if (my !== navSeq.current) { setSearching(false); return }
    const players = []
    for (let i = 0; i < dir.players.length && players.length < 60; i++) {
      const p = dir.players[i]
      if (p[0].toLowerCase().includes(term)) players.push({ id: p[6] ?? i, name: p[0], cards: p[2], sport: dir.sports[p[3]], minYear: p[4], maxYear: p[5], shard: p[1] })
    }
    players.sort((a, b) => b.cards - a.cards)
    const toks = norm(term).split(' ').filter(Boolean)
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
    const term = dQuery.trim().toLowerCase()
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
  }, [setData, activeSection, dQuery, onlyMine, setTypeFilter, setRunFilter, setRcOnly, setMemFilter, mineSet])
  useEffect(() => { setSecLimit(20) }, [activeSection, dQuery, onlyMine, setTypeFilter, setRunFilter, setRcOnly, setMemFilter])
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
  const taggedSets = useMemo(() => sets.map(s => Object.assign({}, s, classifySet(s.name, s.year))), [sets])

  const brands = useMemo(() => {
    const base = taggedSets.filter(s => matchSport(s, sportFilter))
    return ['All', ...[...new Set(base.map(s => s.brand))].sort(brandSort)]
  }, [taggedSets, sportFilter])

  const products = useMemo(() => {
    let base = taggedSets.filter(s => matchSport(s, sportFilter))
    if (brandFilter !== 'All') base = base.filter(s => s.brand === brandFilter)
    return ['All', ...[...new Set(base.map(s => s.product))].filter(p => p !== 'Other').sort()]
  }, [taggedSets, sportFilter, brandFilter])

  const filteredSets = useMemo(() => {
    let list = taggedSets.filter(s => matchSport(s, sportFilter))
    if (brandFilter !== 'All') list = list.filter(s => s.brand === brandFilter)
    if (productFilter !== 'All') list = list.filter(s => s.product === productFilter)
    const term = dQuery.trim().toLowerCase()
    if (term && !activeSet) {
      // word-by-word ("chrome 2024 topps"); a player name typed into the search
      // matches no set name, so it leaves the grid alone instead of emptying it
      const toks = term.split(/\s+/).filter(Boolean)
      const hit = list.filter(s => { const n = s.name.toLowerCase(); return toks.every(t => n.includes(t)) })
      if (hit.length) list = hit
    }
    return list
  }, [taggedSets, sportFilter, brandFilter, productFilter, dQuery, activeSet])

  useEffect(() => { setSetLimit(60) }, [sportFilter, brandFilter, productFilter, sortBy, dQuery])
  const oneSport = sportFilter !== 'All' && sportFilter !== 'Sports' && sportFilter !== 'TCG' && sportFilter !== 'Other'

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
      }   // team sports: the slice file already holds just this team's rows (spellings, nicknames and combo cards merged at build)
      const slug = slugs[row[1]]
      if (slugSport[slug] !== sportFilter) continue
      const m = setMeta[slug] || {}
      out.push({ p: row[0], slug, n: row[2], section: sections[row[3]] || '', x: row[5], t: row[4] >= 0 ? teams[row[4]] : '', set: m.name, year: m.year, sport: m.sport })
    }
    const bySet = (a, b) => (a.set || '').localeCompare(b.set || '')
    out.sort((a, b) => {
      if (teamSort === 'year-asc') return ((a.year || 0) - (b.year || 0)) || bySet(a, b)
      if (teamSort === 'player') return (a.p || '').localeCompare(b.p || '') || bySet(a, b)
      if (teamSort === 'set') return bySet(a, b) || (cardNumKey(a.n) - cardNumKey(b.n))
      return ((b.year || 0) - (a.year || 0)) || bySet(a, b) // year-desc
    })
    return out.slice(0, 2500)
  }, [searchIndex, teamFilter, oneSport, sportFilter, slugSport, sets, teamSort, isTcg, browseActive, tcgRarity, tcgType])

  const rcCount = (j) => (j.sections || []).reduce((s, sec) => s + sec.cards.filter(c => c.x === 'RC').length, 0)

  const isLanding = !activeSet && !globalHits && view === 'browse'
  // A shared link (?set= / ?player= / ?search=) shows a loading screen, not the
  // home page, while the index and player list download on a slow connection.
  const [deepLoading, setDeepLoading] = useState(false)
  useEffect(() => {
    const unhide = () => document.documentElement.classList.remove('hq-deep')   // set by the inline script in layout.js
    if (!/[?&](set|player|search|compare)=/.test(window.location.search)) { unhide(); return }
    setDeepLoading(true); unhide()
    const t = setTimeout(() => setDeepLoading(false), 25000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => { if (deepLoading && (activeSet || globalHits || notice || view !== 'browse')) setDeepLoading(false) }, [deepLoading, activeSet, globalHits, notice, view])
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
  // Player vs player. Either name may be empty (the page shows a picker for it).
  const openCompare = (names, push) => {
    const [a, b] = [names[0] || '', names[1] || '']
    setNotice(''); setCompareNames([a, b]); setView('compare'); setActiveSet(null); setSetData(null); setGlobalHits(null); setActivePlayer(null)
    const url = '?compare=' + encodeURIComponent(a) + (b ? '&vs=' + encodeURIComponent(b) : '')
    // picking or swapping a player on the page replaces the history entry instead of stacking one per pick
    if (push === 'replace') { navSeq.current++; try { history.replaceState(null, '', url) } catch {} } else nav(url, push)
    if (push !== 'replace') window.scrollTo(0, 0)
  }
  const openView = (v, push, extra = '') => { setNotice(''); nav('?view=' + v + extra, push); setView(v); setActiveSet(null); setSetData(null); setGlobalHits(null); setActivePlayer(null); window.scrollTo(0, 0) }
  // Wantlist add — whole set or a single card/parallel from the set page.
  // What's already on the signed-in user's wantlist, so card rows can show ✓ (and toggle off).
  const [wanted, setWanted] = useState(() => new Map())   // key -> row id
  const wantKey = (it) => [it.set_slug, it.card_n == null ? '' : String(it.card_n), it.section || ''].join('|')
  const loadWanted = async (uid) => { const rows = await myWantlist(uid); setWanted(new Map(rows.map(r => [wantKey(r), r.id]))) }
  useEffect(() => { if (account.session?.user?.id) loadWanted(account.session.user.id); else setWanted(new Map()) }, [account.session?.user?.id])
  const normWant = (item) => (item.section && (item.card_n == null || item.card_n === '')) ? { ...item, card_n: '—' + (item.player || '') } : item
  const isWanted = (item) => wanted.has(wantKey(normWant(item)))
  const flashTimer = useRef(0)
  const wantIt = async (item) => {
    if (!account.session) { setAuthOpen(true); return }
    // a single card with no number is still a single card, not the whole set
    item = normWant(item)
    const label = item.card_n ? (String(item.card_n).startsWith('—') ? item.player : '#' + item.card_n) : 'Set'
    const id = wanted.get(wantKey(item))
    if (id != null && item.card_n) {
      const r = await removeWant(id)
      if (r.error) setWantFlash('Couldn’t remove — ' + r.error.message)
      else { setWanted(m => { const n = new Map(m); n.delete(wantKey(item)); return n }); setWantFlash(label + ' removed from your wantlist') }
    } else {
      const r = await addWant(account.session.user.id, item)
      if (r.error) setWantFlash('Couldn’t add to your wantlist — ' + r.error.message)
      else { setWantFlash(r.duplicate ? 'Already on your wantlist' : label + ' added to your wantlist'); loadWanted(account.session.user.id) }
    }
    clearTimeout(flashTimer.current)   // a newer message must not be cleared by an older click's timer
    flashTimer.current = setTimeout(() => setWantFlash(''), 2500)
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
    if (!s) { const rd = await loadRedirects(); s = rd[slug] && sets.find(x => x.slug === rd[slug]) }
    if (s) { setView('browse'); openSet(s) }
    else setNotice('That set isn’t in the database right now.')
  }
  const searchFor = (name) => { setQuery(name); runSearch(name) }
  // Stable callbacks for the (memoized) player page, so typing in the search box
  // doesn't re-render a 1,000-row player page on every keystroke.
  const cbRef = useRef({})
  cbRef.current = { openSetBySlug, wantIt, runSearch, pickCandidate: (c) => openPlayer(c, playerParsed, playerCandidates), compare: (name) => openCompare([name, '']) }
  const stableCb = useMemo(() => ({
    openSetBySlug: (...a) => cbRef.current.openSetBySlug(...a), wantIt: (...a) => cbRef.current.wantIt(...a),
    runSearch: (...a) => cbRef.current.runSearch(...a), pickCandidate: (...a) => cbRef.current.pickCandidate(...a),
    compare: (...a) => cbRef.current.compare(...a)
  }), [])
  const urlApplied = useRef(false)   // don't overwrite a shared ?sport=… link before applyUrl has read it
  useEffect(() => {
    if (!isLanding || sets.length === 0 || !urlApplied.current) return
    const sp = new URLSearchParams(location.search)
    if (sp.get('set') || sp.get('player') || sp.get('view') || sp.get('search') || sp.has('compare')) return
    const q = new URLSearchParams()
    if (sportFilter !== 'All') q.set('sport', sportFilter)
    if (brandFilter !== 'All') q.set('brand', brandFilter)
    if (productFilter !== 'All') q.set('product', productFilter)
    if (sortBy !== 'year-desc') q.set('sort', sortBy)
    if (teamFilter !== 'All') q.set('team', teamFilter)
    if (tcgRarity !== 'All') q.set('rarity', tcgRarity)
    if (tcgType !== 'All') q.set('type', tcgType)
    const url = location.pathname + (q.toString() ? '?' + q : '')
    if (url !== location.pathname + location.search) { try { history.replaceState(null, '', url) } catch {} }
  }, [isLanding, sets.length, sportFilter, brandFilter, productFilter, sortBy, teamFilter, tcgRarity, tcgType])
  // Tab / history title per view (shared links and browser history read better).
  useEffect(() => {
    const t = activeSet ? (setData ? setData.name : activeSet.name) + ' Checklist'
      : view === 'player' && activePlayer ? activePlayer.name + ' Cards'
      : view === 'compare' ? (compareNames.filter(Boolean).join(' vs ') || 'Compare players')
      : globalHits ? 'Search: ' + query
      : view === 'community' ? 'Community' : view === 'collection' ? 'My Collection' : view === 'myplayers' ? 'My Players' : view === 'feedback' ? 'Feedback' : ''
    document.title = t ? t + ' — CardHQ' : 'CardHQ — Sports Card & TCG Checklists'
  }, [activeSet, setData, view, activePlayer, globalHits, compareNames])
  // Deep links and Back/Forward: ?player=Name[&q=raw] · ?set=slug · ?view=community · ?search=term
  const applyUrl = () => {
    urlApplied.current = true
    const sp = new URLSearchParams(location.search)
    const pl = sp.get('player'), v = sp.get('view'), sr = sp.get('search')
    const st = sp.get('set') && sp.get('set').trim().replace(/\/+$/, '')   // tolerate pasted links: case, trailing slash
    if (sp.has('compare')) openCompare([sp.get('compare'), sp.get('vs')], false)
    else if (pl) { const q = sp.get('q'); setQuery(q || pl); openPlayerByName(pl, q, false, sp.get('sport') || undefined) }
    else if (st) {
      const s = sets.find(x => x.slug === st) || sets.find(x => x.slug.toLowerCase() === st.toLowerCase())
      if (s) openSet(s, false)
      else loadRedirects().then(rd => {
        const to = rd[st] || rd[st.toLowerCase()]
        const t = to && sets.find(x => x.slug === to)
        if (t) openSet(t, false); else { goHome(false); setNotice('That set isn’t in the database (the link may be old). Browse or search below.') }
      })
    }
    else if (sr) runGlobalSearch(sr, false)
    else if (v && ['myplayers', 'community', 'collection', 'feedback'].includes(v)) openView(v, false, v === 'collection' && sp.get('cset') ? '&cset=' + encodeURIComponent(sp.get('cset')) : '')
    else {
      goHome(false)
      // browse filters live in the URL too (?sport=Hockey&team=...), so Back and shared links restore them
      const g = (k) => sp.get(k) || 'All'
      setSportFilter(g('sport')); setBrandFilter(g('brand')); setProductFilter(g('product')); setSortBy(sp.get('sort') || 'year-desc')
      setTcgRarity(g('rarity')); setTcgType(g('type'))
      const tm = sp.get('team')
      if (tm || sp.get('rarity') || sp.get('type')) { setTeamInput(tm || ''); setTeamFilter(tm || 'All'); openTeamBrowse(g('sport')) }
    }
  }
  // Apply the URL once the index is in. A ?set= link that isn't a static set waits for the
  // bulk catalog, so catalog links don't flash "not in the database" first.
  const applyRef = useRef(applyUrl)
  applyRef.current = applyUrl
  const firstApplied = useRef(false)
  useEffect(() => {
    if (sets.length === 0 || firstApplied.current) return
    const st = (new URLSearchParams(location.search).get('set') || '').trim().replace(/\/+$/, '').toLowerCase()
    if (st && !catalogDone && !sets.some(x => x.slug.toLowerCase() === st)) return
    firstApplied.current = true
    applyRef.current()
  }, [sets.length, catalogDone])
  useEffect(() => {
    const onPop = () => applyRef.current()   // latest applyUrl, not the first render's
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const NAV_ITEMS = [['Sets', () => { goHome(); setSportFilter('All'); setBrandFilter('All'); setProductFilter('All') }, 'browse'], ['Players', () => openView('myplayers'), 'myplayers'], ['Community', () => openView('community'), 'community'], ['My Collection', () => openView('collection'), 'collection']]
  const [scrolled, setScrolled] = useState(false)
  const [pastHero, setPastHero] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // uncontrolled: typing here must not re-render the whole page (a set page can hold thousands of rows)
  const headerInput = useRef(null)
  useEffect(() => {
    const onScroll = () => { setScrolled(window.scrollY > 8); setPastHero(window.scrollY > 460) }
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault()
        if (window.innerWidth < 640) return
        if (isLandingRef.current && window.scrollY <= 460) document.querySelector('.hq-hero input')?.focus()
        else headerInput.current?.focus()
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKey) }
  }, [])
  const isLandingRef = useRef(isLanding)
  isLandingRef.current = isLanding
  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [menuOpen])

  return (
    <>
      {/* HEADER — spec from Claude Design "CardHQ Header" */}
      <header className={'hq-header' + (scrolled ? ' hq-scrolled' : '')}>
        <div className="hq-header-inner">
          <a className="hq-lockup" href="/" onClick={(e) => { e.preventDefault(); setMenuOpen(false); goHome(); window.scrollTo(0, 0) }} aria-label="CardHQ home">
            <ScanCMark size={36} bracket="#ECEEF3" accent={ACCENT} />
            <span className="hq-wordmark">CardHQ</span>
          </a>
          <nav className="hq-navlinks" aria-label="Main">
            {NAV_ITEMS.map(([label, fn, v]) => (
              <button key={label} className="hq-navlink" onClick={fn} aria-current={view === v ? 'page' : undefined}>{label}</button>
            ))}
          </nav>
          <div className="hq-header-right">
            <form className={'hq-hsearch' + (isLanding && !pastHero ? ' hq-hidden' : '')} role="search"
              onSubmit={(e) => { e.preventDefault(); const el = headerInput.current; const v = (el?.value || '').trim(); if (v) { searchFor(v); el.value = ''; el.blur(); window.scrollTo(0, 0) } }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6F788C" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input ref={headerInput} enterKeyHint="search" placeholder="Search sets, players..." aria-label="Search sets and players" />
              <kbd>/</kbd>
            </form>
            {fbAdmin.admin && fbAdmin.count > 0 && (
              <button className="hq-navlink" onClick={() => openView('feedback')} title="New community feedback" aria-label={fbAdmin.count + ' new feedback reports'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Inbox<span style={{ background: ACCENT, color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 12, fontWeight: 700 }}>{fbAdmin.count}</span></button>
            )}
            <AccountChip account={account} onOpenAuth={() => setAuthOpen(true)} />
            <button className="hq-iconbtn" aria-label="Search" onClick={() => { setMenuOpen(false); goHome(); window.scrollTo(0, 0); setTimeout(() => document.querySelector('.hq-hero input')?.focus(), 50) }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </button>
            <button className="hq-iconbtn" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
              {menuOpen
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>}
            </button>
          </div>
        </div>
      </header>
      {menuOpen && (
        <div className="hq-sheet" role="dialog" aria-label="Menu">
          {NAV_ITEMS.map(([label, fn, v]) => (
            <button key={label} className="hq-sheet-row" aria-current={view === v ? 'page' : undefined} onClick={() => { setMenuOpen(false); fn() }}>{label}</button>
          ))}
          <button className="hq-sheet-row" aria-current={view === 'feedback' ? 'page' : undefined} onClick={() => { setMenuOpen(false); openView('feedback') }}>{fbAdmin.admin ? 'Feedback inbox' + (fbAdmin.count ? ' (' + fbAdmin.count + ')' : '') : 'Feedback'}</button>
          {!account.session ? (
            <div className="hq-sheet-foot">
              <button className="hq-signin" onClick={() => { setMenuOpen(false); setAuthOpen(true) }}>Sign in</button>
            </div>
          ) : (
            <div className="hq-sheet-foot" style={{ display: 'grid', gap: 8 }}>
              <button className="hq-signin" onClick={() => { setMenuOpen(false); setAuthOpen(true) }}>Your profile{account.profile?.username ? ' · ' + account.profile.username : ''}</button>
              <button className="hq-signin" style={{ background: 'none' }} onClick={() => { setMenuOpen(false); supa.auth.signOut() }}>Sign out</button>
            </div>
          )}
        </div>
      )}
    <main className="hq-main" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 24px 90px' }}>
      <style>{'.hq-setcard:hover{transform:translateY(-4px);border-color:#2E3D6B;box-shadow:0 18px 40px -18px rgba(0,0,0,0.9)}@keyframes hqticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.hq-track{display:inline-flex;white-space:nowrap;animation:hqticker linear infinite}.hq-track:hover{animation-play-state:paused}'}</style>

      {notice && <div role="status" style={{ background: SURFACE, border: '1px solid ' + LINE, borderRadius: 12, padding: '12px 16px', margin: '0 0 16px', color: TEXT_2, fontSize: 14 }}>{notice}</div>}
      <FeedbackModal open={!!feedback} context={feedback || {}} onClose={() => setFeedback(null)} account={account} onOpenAuth={() => setAuthOpen(true)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} account={account} />
      {fbAdmin.admin && (
        <FixEditor open={!!fixing} slug={fixing?.slug} feedback={fixing?.feedback} onClose={() => setFixing(null)}
          onSaved={() => { fbAdmin.refresh(); setFixVersion(v => v + 1); if (setData && fixing?.slug === setData.slug) loadSet(setData.slug).then(d => d && setSetData(d)) }} />
      )}
      {wantFlash && (
        <div style={{ position: 'fixed', bottom: 56, right: 24, zIndex: 95, background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 12, boxShadow: '0 8px 30px #000a' }}>{wantFlash}</div>
      )}

      {isLanding && deepLoading ? (
        <div role="status" aria-live="polite" style={{ padding: '96px 0', textAlign: 'center', color: TEXT_2, fontSize: 15 }}>Loading…</div>
      ) : isLanding ? (
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
              <Omnibox value={query} onChange={setQuery} onSubmit={runSearch} sets={sets} busy={searching}
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

          {/* FILTERS: category tabs, sport chips + "More sports", Brand menu, Product, active filters */}
          {(() => {
            const pick = (v) => { setSportFilter(v); setBrandFilter('All'); setProductFilter('All'); setTeamFilter('All'); setTeamInput(''); setTeamBrowse(false); setTcgRarity('All'); setTcgType('All') }
            return (
              <div style={{ margin: '38px 0 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                  <h2 style={{ ...title(20), margin: 0 }}>
                    {productFilter !== 'All' ? productFilter + ' Sets' : sportFilter === 'All' ? 'Featured Sets' : sportFilter === 'TCG' ? 'Trading Card Games' : sportFilter === 'Other' ? 'Other Cards' : sportFilter === 'Sports' ? 'Sports Cards' : sportFilter + ' Sets'}
                    {sets.length > 0 && <span style={{ color: LABEL, fontSize: 16, fontWeight: 500, marginLeft: 10 }}>{filteredSets.length.toLocaleString()}</span>}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Select label="Sort" ariaLabel="Sort sets" value={sortBy} onChange={setSortBy} width={220}
                      options={[['year-desc', 'Newest first'], ['year-asc', 'Oldest first'], ['name-asc', 'Name (A–Z)'], ['name-desc', 'Name (Z–A)'], ['cards-desc', 'Most cards'], ['cards-asc', 'Fewest cards'], ['category', 'Category'], ['brand', 'Brand']]} />
                  </div>
                </div>
                <SetFilters sports={sports} sportFilter={sportFilter} onPick={pick}
                  showBrand={groupOf(sportFilter) !== 'TCG'}
                  brands={brands} brandFilter={brandFilter} onBrand={(b) => { setBrandFilter(b); setProductFilter('All') }}
                  products={products} productFilter={productFilter} onProduct={setProductFilter} />
              </div>
            )
          })()}
          {/* TCG FILTERS: card name / rarity / type across every set of the game */}
          {oneSport && isTcg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              <span style={{ ...eyebrow, color: '#8A93A8' }}>Find</span>
              {!teamBrowse ? (
                <button type="button" onClick={openTeamBrowse} style={triggerStyle(false)}>Search cards, rarities &amp; types<Chevron /></button>
              ) : teamLoading ? (
                <span style={{ color: '#8A93A8', fontSize: 13 }}>Loading cards…</span>
              ) : (
                <>
                  <input type="search" value={teamInput}
                    aria-label="Filter by card name" placeholder={'Card name… e.g. ' + (TCG_EXAMPLE[sportFilter] || 'any card')}
                    onChange={(e) => { const v = e.target.value; setTeamInput(v); const t = v.trim(); setTeamFilter(t.length >= 2 ? t : 'All') }}
                    style={{ background: '#121626', border: '1px solid ' + (teamFilter !== 'All' ? ACCENT : '#232A3E'), borderRadius: 10, color: TEXT, fontSize: 16, height: 40, boxSizing: 'border-box', padding: '0 12px', minWidth: 0, width: 230, maxWidth: '100%', outline: 'none' }} />
                  <Select ariaLabel="Rarity" value={tcgRarity} onChange={setTcgRarity} defaultValue="All"
                    options={[['All', 'All rarities'], ...tcgOptions.rarities.map(r => [r, r])]} />
                  <Select ariaLabel="Card type" value={tcgType} onChange={setTcgType} defaultValue="All"
                    options={[['All', 'All types'], ...tcgOptions.types.map(t => [t, t])]} />
                  {tcgActive && (
                    <>
                      <Select label="Sort" ariaLabel="Sort cards" value={teamSort} onChange={setTeamSort} width={220}
                        options={[['year-desc', 'Newest first'], ['year-asc', 'Oldest first'], ['player', 'Card name (A–Z)'], ['set', 'Set name']]} />
                      <button onClick={() => { setTeamFilter('All'); setTeamInput(''); setTcgRarity('All'); setTcgType('All') }}
                        style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          {/* TEAM FILTER + SORT (after a specific sport is selected) */}
          {oneSport && !isTcg && !OTHER_SET.has(sportFilter) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
              {!teamBrowse ? (
                <Trigger label="Team" value="Any team" onClick={() => { teamOpenOnLoad.current = true; openTeamBrowse() }} ariaLabel="Filter by team" />
              ) : teamLoading ? (
                <span style={{ color: '#8A93A8', fontSize: 13 }}>Loading teams…</span>
              ) : (
                <>
                  <Select label="Team" ariaLabel="Filter by team" value={teamFilter} width={280} searchAbove={8} initialOpen={teamOpenOnLoad.current}
                    onChange={(v) => { setTeamFilter(v); setTeamInput(v === 'All' ? '' : v) }}
                    options={[['All', 'Any team'], ...teamsForSport.map(t => [t, t])]} />
                  {teamFilter !== 'All' && (
                    <>
                      <Select label="Sort" ariaLabel="Sort cards" value={teamSort} onChange={setTeamSort} width={220}
                        options={[['year-desc', 'Newest first'], ['year-asc', 'Oldest first'], ['player', 'Player (A–Z)'], ['set', 'Set name']]} />
                      <button onClick={() => { setTeamFilter('All'); setTeamInput('') }}
                        style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : (activeSet || globalHits || view === 'player' || view === 'myplayers' || view === 'compare') ? (
        <div style={{ marginBottom: 16 }}>
          {activeSet ? (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Filter this set" placeholder={TCG_SET.has(activeSet.sport) ? 'Filter this set (card, type, rarity, card #, section)…' : 'Filter this set (player, team, card #, section)…'}
              style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid #232A3E', borderRadius: 10, padding: '13px 16px', color: '#EDEDEF', fontSize: 16, outline: 'none' }}
            />
          ) : (
            <Omnibox value={query} onChange={setQuery} onSubmit={runSearch} sets={sets} busy={searching} compact
              onPickPlayer={(p, parsed) => openPlayer(p, parsed, [])} onPickSet={(s) => openSet(s)} />
          )}
        </div>
      ) : null}

      {activeSet && !setData && setLoadErr ? (
        <div style={{ padding: '24px 0' }}>
          <p style={{ color: '#EDEDEF', fontSize: 15, margin: '0 0 12px' }}>Couldn’t load the {activeSet.name} checklist.</p>
          <button onClick={() => openSet(activeSet, false)} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer', marginRight: 10 }}>Try again</button>
          <button onClick={() => goHome()} style={{ background: 'none', border: '1px solid #232A3E', color: '#EDEDEF', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>← All sets</button>
        </div>
      ) : activeSet && !setData ? (
        <p style={{ color: '#8A93A8', fontSize: 14, padding: '24px 0' }}>Loading {activeSet.name}…</p>
      ) : activeSet && setData ? (
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
            <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1.05 }}>{setData.name}</h1>
            <p style={{ color: '#8A93A8', fontSize: 13, margin: '10px 0 0' }}>
              {(setData.sections || []).reduce((s, x) => s + x.cards.length, 0).toLocaleString()} cards
              {rcCount(setData) > 0 ? ' · ' + rcCount(setData) + ' rookies flagged' : ''} · source: {setData.source}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button onClick={() => wantIt({ set_slug: setData.slug, set_name: setData.name })}
                style={{ ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }}>
                + Wantlist this set
              </button>
              <button onClick={() => { openView('collection') }}
                style={{ ...buttonText, background: 'transparent', color: '#A1A1AA', border: '1px solid #232A3E', borderRadius: 9, padding: '8px 15px', cursor: 'pointer', fontSize: 13 }}>
                Track in My Collection
              </button>
              <button onClick={() => setFeedback({ set_slug: setData.slug, set_name: setData.name, sections: (setData.sections || []).map(x => x.title), section: activeSection !== 'All' ? activeSection : '' })}
                title="Missing card, wrong info, missing parallel (shield, SuperFractor, game-used…)? Tell us."
                style={{ ...buttonText, background: 'transparent', color: '#A1A1AA', border: '1px solid #232A3E', borderRadius: 9, padding: '8px 15px', cursor: 'pointer', fontSize: 13 }}>
                Report a problem
              </button>
              {fbAdmin.admin && (
                <button onClick={() => setFixing({ slug: setData.slug })}
                  style={{ ...buttonText, background: 'transparent', color: ACCENT_TEXT, border: '1px solid #2E3D6B', borderRadius: 9, padding: '8px 15px', cursor: 'pointer', fontSize: 13 }}>
                  Fix data
                </button>
              )}
            </div>
          </div>

          {verifyHints && verifyHints[setData.slug] && (
            <div role="note" style={{ background: 'linear-gradient(140deg, #101a33, #0F1320)', border: '1px solid #2E3D6B', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <p style={{ ...eyebrow, color: ACCENT_TEXT, margin: '0 0 6px' }}>Help verify this set</p>
                <p style={{ color: '#D4D4D8', fontSize: 14, lineHeight: 1.55, margin: 0 }}>This checklist may not be complete yet. Know this product? Tell us what’s missing.</p>
                <ul style={{ color: '#8A93A8', fontSize: 13, lineHeight: 1.5, margin: '8px 0 0', paddingLeft: 18 }}>
                  {verifyHints[setData.slug].map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
              <button onClick={() => setFeedback({ set_slug: setData.slug, set_name: setData.name, sections: (setData.sections || []).map(x => x.title), kind: 'missing_card' })}
                style={{ ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>
                Report what’s missing
              </button>
            </div>
          )}

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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: onlyMine ? '#0e1630' : '#121626', border: '1px solid ' + (onlyMine ? ACCENT : '#232A3E'), color: onlyMine ? '#8fb0ff' : '#D4D4D8', borderRadius: 10, padding: '0 14px', height: 40, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
              My players <span style={{ background: onlyMine ? ACCENT : '#232A3E', color: onlyMine ? '#fff' : '#A1A1AA', borderRadius: 999, padding: '1px 7px', fontSize: 12, fontWeight: 700 }}>{myPlayers.list.length}</span>
            </button>
            <Select ariaLabel="Section" value={activeSection} onChange={setActiveSection} defaultValue="All" width={340}
              options={[['All', 'All sections (' + (setData.sections || []).length + ')'], ...(setData.sections || []).map(s => [s.title, s.title + ' (' + s.cards.length + ')'])]} />
            <Select ariaLabel="Card type" value={setTypeFilter} onChange={setSetTypeFilter} defaultValue="All" width={240}
              options={[['All', 'Any type'], ['BASE', 'Base'], ['AU', 'Autographs'], ['PA', 'Patch autos'], ['PATCH', 'Patches'], ['RELIC', 'Relics'], ['PLATE', 'Printing plates'], ['OTHER', 'Inserts & parallels']]} />
            <Select ariaLabel="Print run" value={setRunFilter} onChange={setSetRunFilter} defaultValue="any" width={220}
              options={[['any', 'Any run'], ['1', '1/1 only'], ['10', '≤ /10'], ['25', '≤ /25'], ['99', '≤ /99'], ['numbered', 'Numbered'], ['unnumbered', 'Unnumbered']]} />
            {(setData.sections || []).some(x => x.mem) && (
              <Select ariaLabel="Memorabilia" value={setMemFilter} onChange={setSetMemFilter} defaultValue="any" width={280}
                options={[['any', 'Any material'], ['MEMO', 'Memorabilia only'], ['GU', 'Game-used'], ['PW', 'Player-worn'], ['EW', 'Event-worn'], ['MX', 'Varies by card'], ['MFG', 'Manufactured'], ['UNK', 'Unknown'], ['STATED', 'Stated by maker/source only']]} />
            )}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#A1A1AA', minHeight: 40, cursor: 'pointer' }}><input type="checkbox" checked={setRcOnly} onChange={(e) => setSetRcOnly(e.target.checked)} style={{ accentColor: ACCENT, width: 16, height: 16 }} />Rookies only</label>
            {(onlyMine || setTypeFilter !== 'All' || setRunFilter !== 'any' || setRcOnly || setMemFilter !== 'any' || activeSection !== 'All' || query) && (
              <button onClick={() => { setSetMemFilter('any'); setOnlyMine(false); setSetTypeFilter('All'); setSetRunFilter('any'); setSetRcOnly(false); setActiveSection('All'); setQuery('') }} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>Clear filters</button>
            )}
          </div>
          {onlyMine && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 14px' }}>
              <span style={{ ...eyebrow, color: '#8A93A8' }}>Showing cards of</span>
              {myPlayers.list.length === 0 && <span style={{ color: '#8A93A8', fontSize: 13 }}>nobody yet — open a player page and hit “Collect this player”.</span>}
              {byPlayer.map(g => <button key={g.name} onClick={() => openPlayerByName(g.name, null, true, setData?.sport)} style={{ background: '#0e1630', border: '1px solid ' + ACCENT + '55', color: '#c9d8ff', fontSize: 13, fontWeight: 600, padding: '5px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' }}>{g.name} <span style={{ color: '#5b82e8' }}>· {g.rows.length}</span></button>)}
              {myPlayers.list.filter(n => !byPlayer.some(g => g.name === n)).map(n => <span key={n} style={{ border: '1px solid #232A3E', color: '#8A93A8', fontSize: 13, padding: '5px 10px', borderRadius: 999 }}>{n} · 0</span>)}
              <button onClick={() => openView('myplayers')} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Manage my players</button>
            </div>
          )}

          {/* big sets have hundreds of sections: show the first few as chips (the Section menu above lists all) */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {(() => { const all = ['All', ...(setData.sections || []).map(s => s.title)]; const LIMIT = 12; const shown = showAllSecs || all.length <= LIMIT + 2 ? all : [...all.slice(0, LIMIT), ...(all.indexOf(activeSection) >= LIMIT ? [activeSection] : [])]; return shown })().map(t => (
              <button key={t} onClick={() => setActiveSection(t)}
                style={{
                  padding: '6px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: activeSection === t ? ACCENT : '#121626',
                  color: activeSection === t ? '#fff' : '#A1A1AA',
                  border: '1px solid ' + (activeSection === t ? 'transparent' : '#232A3E')
                }}>{t}</button>
            ))}
            {(setData.sections || []).length + 1 > 14 && (
              <button onClick={() => setShowAllSecs(v => !v)} aria-expanded={showAllSecs}
                style={{ padding: '6px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'none', color: ACCENT_TEXT, border: '1px dashed #2E3852' }}>
                {showAllSecs ? 'Fewer sections' : 'All ' + (setData.sections || []).length + ' sections ▾'}
              </button>
            )}
          </div>

          <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 12px' }}>
            {(() => { const n = visibleSections.reduce((a, x) => a + x.cards.length, 0), t = (setData.sections || []).reduce((a, x) => a + x.cards.length, 0); return n < t ? n.toLocaleString() + ' of ' + t.toLocaleString() + ' cards match' : 'Click a column header to sort.' })()}
          </p>
          {onlyMine ? byPlayer.map(g => (
            <div key={g.name} style={{ border: '1px solid #232A3E', borderRadius: 14, overflow: 'hidden', background: '#0F1320', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: '#121626', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <button onClick={() => openPlayerByName(g.name, null, true, setData?.sport)} style={{ ...title(16), background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>{g.name}</button>
                  <p style={{ margin: '2px 0 0', color: '#8A93A8', fontSize: 12 }}>{g.team ? g.team + ' · ' : ''}{g.rows.length} card{g.rows.length === 1 ? '' : 's'} in this set{g.au ? ' · ' + g.au + ' autos' : ''}{g.one ? ' · ' + g.one + ' × 1/1' : ''}</p>
                </div>
                <button onClick={() => openPlayerByName(g.name, null, true, setData?.sport)} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Player page →</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 560 }}>
                  <thead><tr>{['Card #', 'Section', 'Type', 'Material', 'Run', 'Want'].map((h, i) => <th key={h} style={{ ...eyebrow, padding: '9px 14px', textAlign: i >= 4 ? 'right' : 'left', color: '#8A93A8' }}>{h}</th>)}</tr></thead>
                  <tbody>{g.rows.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #1a1a1a', background: i % 2 ? '#131313' : 'transparent' }}>
                      <td style={{ padding: '9px 14px', color: ACCENT_TEXT, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.n ? '#' + r.n : '—'}</td>
                      <td style={{ padding: '9px 14px' }}>{r.section}</td>
                      <td style={{ padding: '9px 14px' }}><Chip color={r.kind === 'PA' ? '#e11d48' : r.kind === 'AU' ? '#60a5fa' : r.kind === 'PATCH' ? '#16a34a' : r.kind === 'RELIC' ? '#f97316' : '#9ca3af'}>{r.kind === 'PA' ? 'PATCH AUTO' : r.kind === 'AU' ? 'AUTO' : r.kind === 'OTHER' ? (r.x === 'RC' ? 'RC' : 'INSERT') : r.kind}</Chip></td>
                      <td style={{ padding: '9px 14px' }}>{r.memc ? <MemChip code={r.memc} /> : <span style={{ color: '#5C6478' }}>—</span>}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.serial === 1 ? <span style={{ background: ACCENT, color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>1/1</span> : r.serial > 0 ? '/' + r.serial : <span style={{ color: '#8A93A8' }}>—</span>}</td>
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>{(() => { const it = { set_slug: setData.slug, set_name: setData.name, card_n: r.n, section: r.section, player: r.p }, on = isWanted(it); return <button aria-label={on ? 'On your wantlist — remove' : 'Add to wantlist'} aria-pressed={on} onClick={() => wantIt(it)} style={{ background: on ? ACCENT : 'none', border: '1px solid ' + (on ? ACCENT : '#232A3E'), color: on ? '#fff' : '#A1A1AA', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontFamily: 'inherit' }}>{on ? '✓' : '+'}</button> })()}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )) : visibleSections.slice(0, secLimit).map(sec => {
            const sorted = sec.cards.slice().sort(makeComparator(sortField, sortDir))
            return (
              <div key={sec.title} style={{ marginBottom: 26 }}>
                <h2 style={{ ...title(18), margin: '0 0 6px' }}>
                  {sec.title} <span style={{ color: '#8A93A8', fontSize: 16 }}>· {sec.cards.length}</span>
                </h2>
                {sec.mem && <div style={{ margin: '0 0 10px' }}><MemBadge mem={sec.mem} /></div>}
                {sec.odds && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 10px', padding: '8px 12px', background: '#141109', border: '1px solid ' + ACCENT + '2e', borderRadius: 9 }}>
                    <span style={{ ...eyebrow, color: ACCENT_TEXT, whiteSpace: 'nowrap', paddingTop: 1 }}>Pack Odds</span>
                    <span style={{ color: '#A1A1AA', fontSize: 13, lineHeight: 1.5 }}>{sec.odds}</span>
                  </div>
                )}
                <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                  <div className="hq-setrow" style={{ display: 'flex', gap: 14, padding: '9px 16px', background: '#121626', borderBottom: '1px solid #232A3E', alignItems: 'center' }}>
                    <div className="hq-col-num" style={{ flex: '0 0 68px' }}><SortHeader label="Card #" field="n" sortField={sortField} sortDir={sortDir} onClick={toggleSort} /></div>
                    <div style={{ flex: '1 1 0', minWidth: 0 }}><SortHeader label={setIsTcg ? 'Card' : 'Player'} field="p" sortField={sortField} sortDir={sortDir} onClick={toggleSort} grow /></div>
                    <div className="hq-col-team" style={{ flex: '1 1 0', minWidth: 0 }}><SortHeader label={setIsTcg ? 'Type' : 'Team'} field="t" sortField={sortField} sortDir={sortDir} onClick={toggleSort} grow /></div>
                    <div className="hq-col-flag" style={{ flex: setIsTcg ? '0 0 110px' : '0 0 70px' }}><SortHeader label={setIsTcg ? 'Rarity' : 'Flag'} field="x" sortField={sortField} sortDir={sortDir} onClick={toggleSort} align="right" /></div>
                    <span aria-hidden="true" style={{ flex: '0 0 78px' }} />
                  </div>
                  {sorted.slice(0, openSecs.has(sec.title) ? 5000 : 200).map((c, i) => (
                    <div key={i} className="hq-setrow" style={{
                      display: 'flex', gap: 14, padding: '8px 16px', fontSize: 14,
                      background: i % 2 === 0 ? '#0F1320' : '#121626', alignItems: 'center'
                    }}>
                      <span className="hq-col-num" style={{ flex: '0 0 68px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{c.n ? '#' + c.n : '—'}</span>
                      <span style={{ flex: '1 1 0', minWidth: 0 }}>
                        <button onClick={() => openPlayerByName(c.p, null, true, setData?.sport)} title={'Open ' + c.p + "'s player page"} style={{ fontWeight: 600, background: 'none', border: 'none', color: isMine(c.p) ? ACCENT_TEXT : '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 14 }}>{c.p}</button>
                        {c.t && <span className="hq-mobile-only" style={{ color: '#8A93A8', fontSize: 12, marginTop: 2 }}>{c.t}</span>}
                      </span>
                      <span className="hq-col-team" style={{ flex: '1 1 0', minWidth: 0, color: '#8A93A8', fontSize: 13 }}>{c.t || ''}</span>
                      <span className="hq-col-flag" style={{ flex: setIsTcg ? '0 0 110px' : '0 0 70px', textAlign: 'right' }}>{c.x ? <Chip color={c.x === 'RC' ? '#4ade80' : '#8A93A8'}>{c.x}</Chip> : null}</span>
                      <a href={grailfindrFindUrl({ setName: setData.name, player: c.p, n: c.n, section: sec.title })} target="_blank" rel="noreferrer"
                        title="Find this card for sale on GrailFindr (every marketplace)" aria-label={'Find ' + (c.p || 'this card') + ' on GrailFindr'}
                        style={{ flex: '0 0 32px', height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #232A3E', borderRadius: 6, color: '#8A93A8', textDecoration: 'none' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                      </a>
                      {(() => { const it = { set_slug: setData.slug, set_name: setData.name, card_n: c.n, section: sec.title, player: c.p }, on = isWanted(it); return (
                      <button title={on ? 'On your wantlist — click to remove' : 'Add this card (and its parallel section) to your wantlist'}
                        onClick={() => wantIt(it)} aria-pressed={on}
                        aria-label={on ? 'On your wantlist — remove' : 'Add to wantlist'} style={{ flex: '0 0 32px', height: 32, background: on ? ACCENT : 'none', border: '1px solid ' + (on ? ACCENT : '#232A3E'), color: on ? '#fff' : '#8A93A8', borderRadius: 6, fontSize: 14, cursor: 'pointer', padding: 0 }}>{on ? '✓' : '+'}</button>) })()}
                    </div>
                  ))}
                  {sorted.length > 200 && !openSecs.has(sec.title) && (
                    <button onClick={() => setOpenSecs(o => new Set([...o, sec.title]))} style={{ display: 'block', width: '100%', padding: '10px 16px', background: '#0F1320', border: 'none', borderTop: '1px solid #1A1F31', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>Show all {sorted.length.toLocaleString()} cards in this section →</button>
                  )}
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
          {visibleSections.length === 0 && <p style={{ color: '#8A93A8' }}>No cards match{onlyMine ? ' for your players in this set' : ''}.</p>}
        </section>
      ) : globalHits ? (
        <section>
          <button onClick={() => goHome()}
            style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 14 }}>
            ← Browse sets
          </button>
          <h2 style={{ ...title(20), margin: '0 0 14px' }}>
            {globalHits.players.length + globalHits.sets.length} results for “{query}”
          </h2>
          {globalHits.players.length > 0 && (
            <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
              {globalHits.players.map((p, i) => (
                <button key={p.id} onClick={() => openPlayer(p, null, [])}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '11px 16px', fontSize: 14, alignItems: 'baseline', flexWrap: 'wrap', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: '#8A93A8', fontSize: 13 }}>{p.sport} · {p.cards.toLocaleString()} cards</span>
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
                  <span style={{ color: '#8A93A8', fontSize: 13 }}>Set · {(x.cardCount || 0).toLocaleString()} cards</span>
                </button>
              ))}
            </div>
          )}
          {globalHits.players.length + globalHits.sets.length === 0 && <p style={{ padding: 20, color: '#8A93A8', fontSize: 14 }}>No players or sets match.</p>}
        </section>
      ) : view === 'player' && activePlayer ? (
        <>
        <PlayerPage key={activePlayer.id + '|' + ((playerParsed && playerParsed.raw) || '')} player={activePlayer} parsed={playerParsed} sets={sets} myPlayers={myPlayers}
          onOpenSet={stableCb.openSetBySlug}
          onWant={stableCb.wantIt} onSearch={stableCb.runSearch} candidates={playerCandidates} onPickCandidate={stableCb.pickCandidate} onCompare={stableCb.compare} />
        <p style={{ color: '#8A93A8', fontSize: 13, margin: '18px 0 0' }}>
          Missing a card or parallel for {activePlayer.name}?{' '}
          <button onClick={() => setFeedback({ player: activePlayer.name })} style={{ background: 'none', border: 'none', padding: 0, color: ACCENT_TEXT, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Report it</button>
        </p>
        </>
      ) : view === 'compare' ? (
        <ComparePage names={compareNames} sets={sets} onChange={(n) => openCompare(n, 'replace')}
          onOpenSet={openSetBySlug} onOpenPlayer={(name) => openPlayerByName(name, null, true)} />
      ) : view === 'myplayers' ? (
        <MyPlayersPanel myPlayers={myPlayers} onOpenPlayer={(name) => openPlayerByName(name)} onOpenSet={(slug) => openSetBySlug(slug)} />
      ) : view === 'feedback' ? (
        <FeedbackView account={account} admin={fbAdmin.admin} onOpenAuth={() => setAuthOpen(true)} onOpenSet={openSetBySlug}
          onNew={(ctx) => setFeedback(ctx)} onChanged={fbAdmin.refresh} onFix={(r) => setFixing({ slug: r.set_slug, feedback: r })} version={fixVersion} />
      ) : view === 'community' ? (
        <CommunityView account={account} indexSets={sets} onOpenAuth={() => setAuthOpen(true)} />
      ) : view === 'collection' ? (
        <CollectionView account={account} indexSets={sets} onOpenAuth={() => setAuthOpen(true)}
          onOpenSet={openSetBySlug} />
      ) : view === 'rpa' ? (
        <section>
          <div style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: '30px 30px', marginBottom: 22 }}>
            <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>RPA Tracker</h1>
            <p style={{ color: '#A3ABBD', fontSize: 16, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
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
          <input value={rpaQuery} onChange={(e) => setRpaQuery(e.target.value)} aria-label="Filter by player" placeholder="Filter by player…"
            style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid #232A3E', borderRadius: 10, padding: '12px 16px', color: '#EDEDEF', fontSize: 16, outline: 'none', marginBottom: 16 }} />

          {!rpaData ? <p style={{ color: '#8A93A8' }}>Loading RPA database…</p> : (
            <>
              <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 10px' }}>{rpaResults.length >= 1200 ? '1,200+' : rpaResults.length.toLocaleString()} cards{rpaQuery ? ' for “' + rpaQuery + '”' : ''}</p>
              <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ ...eyebrow, display: 'flex', gap: 12, padding: '9px 16px', background: '#121626', borderBottom: '1px solid #232A3E', color: '#8A93A8' }}>
                  <span style={{ flex: '0 0 56px' }}>Card</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0 }}>Player</span>
                  <span style={{ flex: '0 0 88px' }}>Type</span>
                  <span style={{ flex: '0 0 64px', textAlign: 'right' }}>Serial</span>
                  <span style={{ flex: '2 1 0', minWidth: 0 }}>Set</span>
                </div>
                {rpaResults.map((c, i) => (
                  <button key={i} onClick={() => { const s = sets.find(x => x.slug === c.slug); if (s) openSet(Object.assign({}, s, classifySet(s.name, s.year))) }}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '8px 16px', fontSize: 14, alignItems: 'baseline', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer' }}>
                    <span style={{ flex: '0 0 56px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.n ? '#' + c.n : '—'}</span>
                    <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 600 }}>{c.p}</span>
                    <span style={{ flex: '0 0 88px' }}><Chip color={RPA_TYPE_COLOR[c.type]}>{c.type}</Chip></span>
                    <span style={{ flex: '0 0 64px', textAlign: 'right', color: c.serial ? '#EDEDEF' : '#8A93A8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.serial || '—'}</span>
                    <span style={{ flex: '2 1 0', minWidth: 0, color: '#8A93A8', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.year} {c.set}</span>
                  </button>
                ))}
                {rpaResults.length === 0 && <p style={{ padding: 20, color: '#8A93A8', fontSize: 14 }}>No hits match.</p>}
              </div>
            </>
          )}
        </section>
      ) : view === 'patchswaps' ? (
        <section>
          <div style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: '30px 30px', marginBottom: 24 }}>
            <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>Patch Swaps</h1>
            <p style={{ color: '#A3ABBD', fontSize: 16, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
              A running record of cards known to have had their game-used or manufactured patches swapped — with the original and the replacement patch side by side so collectors can spot altered cards before they buy.
            </p>
            <p style={{ color: '#8A93A8', fontSize: 13, margin: '16px 0 0' }}>
              Primary source:{' '}
              <a href={(patchData && patchData.source && patchData.source.url) || 'https://www.instagram.com/fake_hockey_patches/'} target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT, fontWeight: 700 }}>
                @fake_hockey_patches
              </a>{' '}on Instagram — the definitive community feed documenting swapped hockey patches.
            </p>
          </div>

          {!patchData ? <p style={{ color: '#8A93A8' }}>Loading…</p> : (
            <>
              {patchData.intro && (
                <p style={{ color: '#c9c9c9', fontSize: 16, lineHeight: 1.7, maxWidth: 820, margin: '0 0 26px' }}>{patchData.intro}</p>
              )}

              {/* LIVE COMMUNITY FEED CTA */}
              <a href={patchData.source.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', textDecoration: 'none',
                  background: 'linear-gradient(120deg, #2a1a2e, #14101a)', border: '1px solid #4a2f52', borderRadius: 16, padding: '20px 24px', marginBottom: 30 }}>
                <div>
                  <p style={{ ...eyebrow, margin: 0, color: '#e879f9' }}>● Live community feed</p>
                  <p style={{ ...display, margin: '6px 0 0', fontSize: 24, color: '#fff' }}>{patchData.source.name}</p>
                  <p style={{ color: '#b9a9c0', fontSize: 13, margin: '4px 0 0', maxWidth: 560 }}>{patchData.source.note}</p>
                </div>
                <span style={{ ...eyebrow, background: '#e879f9', color: '#1a0f1e', padding: '12px 22px', borderRadius: 10, whiteSpace: 'nowrap', fontSize: 12 }}>Open on Instagram →</span>
              </a>

              {/* DOCUMENTED SWAPS — actual posts from the feed */}
              {(patchData.posts || []).length > 0 && (
                <>
                  <h2 style={{ ...title(24), margin: '0 0 6px' }}>Documented swaps</h2>
                  <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px', maxWidth: 760 }}>
                    Individual cases from @fake_hockey_patches — each post shows the actual card before and after its patch was swapped. Tap any post to see every photo and the community discussion.
                  </p>
                  <div style={{ marginBottom: 34 }}>
                    <InstagramEmbeds urls={patchData.posts} />
                  </div>
                </>
              )}

              {/* HOW TO SPOT A SWAP */}
              <h2 style={{ ...title(24), margin: '0 0 16px' }}>How to spot a swap</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14, marginBottom: 34 }}>
                {(patchData.redFlags || []).map((f, i) => (
                  <div key={i} style={{ background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid #232A3E', borderRadius: 14, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <span style={{ ...display, color: '#e11d48', fontSize: 20 }}>{String(i + 1).padStart(2, '0')}</span>
                      <p style={{ ...title(16), margin: 0, lineHeight: 1.15 }}>{f.title}</p>
                    </div>
                    <p style={{ color: '#A3ABBD', fontSize: 14, lineHeight: 1.55, margin: 0 }}>{f.detail}</p>
                  </div>
                ))}
              </div>

              {/* HIGHEST-RISK PRODUCTS → link into RPA tracker patch view */}
              {(patchData.watchSets || []).length > 0 && (
                <div style={{ background: 'linear-gradient(140deg, #17140c, #0F1320)', border: '1px solid ' + ACCENT + '2e', borderRadius: 16, padding: '22px 24px', marginBottom: 24 }}>
                  <h2 style={{ ...title(16), color: ACCENT_TEXT, margin: '0 0 6px' }}>Products most targeted</h2>
                  <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '0 0 14px', maxWidth: 720 }}>High-end patch and RPA products carry the most swap risk. Cross-reference any patch card against its checklist print run — browse the patch and RPA cards in the tracker.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    {patchData.watchSets.map(w => (
                      <span key={w} style={{ background: '#0e1630', border: '1px solid ' + ACCENT + '33', color: '#c9d8ff', fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 999 }}>{w}</span>
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
                            {img ? <img src={img} alt={lbl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#5C6478', fontSize: 12 }}>{lbl} photo</span>}
                            <span style={{ ...eyebrow, position: 'absolute', top: 8, left: 8, background: lbl === 'Swapped' ? '#e11d48' : '#232A3E', color: '#fff', padding: '3px 8px', borderRadius: 4 }}>{lbl}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ padding: '16px 18px' }}>
                        <p style={{ ...title(16), margin: 0 }}>{e.player || e.card}</p>
                        <p style={{ color: '#8A93A8', fontSize: 12, margin: '4px 0 0' }}>{[e.year, e.set, e.card].filter(Boolean).join(' · ')}</p>
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
            <h2 style={{ ...title(20), margin: 0 }}>
              {isTcg ? ([teamFilter !== 'All' ? '“' + teamFilter + '”' : null, tcgRarity !== 'All' ? tcgRarity : null, tcgType !== 'All' ? tcgType : null].filter(Boolean).join(' · ')) : teamFilter} <span style={{ color: SPORT_COLORS[sportFilter] || ACCENT_TEXT, fontSize: 16 }}>· {sportFilter}</span>
              <span style={{ color: '#8A93A8', fontSize: 16, marginLeft: 10 }}>{teamHits.length.toLocaleString()}{teamHits.length >= 2500 ? '+' : ''} cards</span>
            </h2>
          </div>
          <div style={{ border: '1px solid #222', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ ...eyebrow, display: 'flex', gap: 12, padding: '9px 16px', background: '#121626', borderBottom: '1px solid #232A3E', color: '#8A93A8' }}>
              <span style={{ flex: '0 0 60px' }}>Card</span>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>{isTcg ? 'Card' : 'Player'}</span>
              <span style={{ flex: isTcg ? '0 0 120px' : '0 0 54px' }}>{isTcg ? 'Rarity' : 'Flag'}</span>
              <span style={{ flex: '2 1 0', minWidth: 0 }}>Set · Section</span>
            </div>
            {teamHits.map((c, i) => (
              <button key={i} onClick={() => { const s = sets.find(x => x.slug === c.slug); if (s) openSet(Object.assign({}, s, classifySet(s.name, s.year))) }}
                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, padding: '8px 16px', fontSize: 14, alignItems: 'baseline', background: i % 2 === 0 ? '#0F1320' : '#121626', border: 'none', color: '#EDEDEF', cursor: 'pointer' }}>
                <span style={{ flex: '0 0 60px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.n ? '#' + c.n : '—'}</span>
                <span style={{ flex: '1 1 auto', minWidth: 0, fontWeight: 600 }}>{c.p}{isTcg && c.t ? <span style={{ color: '#8A93A8', fontWeight: 400, fontSize: 13 }}> · {c.t}</span> : null}</span>
                <span style={{ flex: isTcg ? '0 0 120px' : '0 0 54px' }}>{c.x ? <Chip color={c.x === 'RC' ? '#4ade80' : '#8A93A8'}>{c.x}</Chip> : null}</span>
                <span style={{ flex: '2 1 0', minWidth: 0, color: '#8A93A8', fontSize: 13 }}>{c.set}{c.section ? ' · ' + c.section : ''}</span>
              </button>
            ))}
            {sliceLoading && <p style={{ padding: 20, color: '#8A93A8', fontSize: 14 }}>Loading {teamFilter} cards…</p>}
            {!sliceLoading && teamHits.length === 0 && <p style={{ padding: 20, color: '#8A93A8', fontSize: 14 }}>No {isTcg ? 'matching cards' : 'cards found for ' + teamFilter} in {sportFilter}.</p>}
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
              if (sortBy === 'category') {
                // Sports → TCGs → Other, then by sport/game name, newest first within each.
                const grp = (x) => (TCG_SET.has(x.sport) ? 1 : OTHER_SET.has(x.sport) ? 2 : 0)
                return (grp(a) - grp(b)) || (a.sport || '').localeCompare(b.sport || '') || ((b.year || 0) - (a.year || 0)) || nm()
              }
              if (sortBy === 'brand') return (a.brand || 'zzz').localeCompare(b.brand || 'zzz') || ((b.year || 0) - (a.year || 0)) || nm()
              return ((b.year || 0) - (a.year || 0)) || nm() // year-desc default
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
                    <span style={{ color: '#8A93A8', fontSize: 12 }}>{(s.sections || 0)} section{s.sections === 1 ? '' : 's'}</span>
                  </div>
                  <p style={{ ...title(16), margin: '0 0 12px', lineHeight: 1.1, minHeight: 44 }}>{s.name.replace(/^\d{4}(-\d{2})?\s*/, '')}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid #222', paddingTop: 10 }}>
                    <span style={{ ...display, fontSize: 24, color: ACCENT_TEXT }}>{(s.cardCount || 0).toLocaleString()}</span>
                    <span style={{ ...eyebrow, color: '#8A93A8' }}>Cards</span>
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
        <span style={{ color: '#8A93A8', fontSize: 12 }}>Checklist data compiled from TCDB, Cardboard Connection, Break Ninja, Checklist Center, Scryfall, YGOPRODeck and the Pokémon TCG API, plus collector corrections.</span>
        <span style={{ display: 'inline-flex', gap: 14, flexWrap: 'wrap' }}>
          {[['Report a problem', () => setFeedback(activeSet && setData ? { set_slug: setData.slug, set_name: setData.name, sections: (setData.sections || []).map(x => x.title) } : { kind: 'other_data' })],
            ['Suggest a feature', () => setFeedback({ kind: 'feature' })],
            [fbAdmin.admin ? 'Feedback inbox' + (fbAdmin.count ? ' (' + fbAdmin.count + ')' : '') : 'My reports', () => openView('feedback')]].map(([l, fn]) => (
            <button key={l} onClick={fn} style={{ background: 'none', border: 'none', padding: 0, color: '#8A93A8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>{l}</button>
          ))}
        </span>
        <span style={{ color: '#8A93A8', fontSize: 12 }}>a Coulter Companies product</span>
      </footer>
    </main>
    <BottomLine segments={news.segments} />
    </>
  )
}
