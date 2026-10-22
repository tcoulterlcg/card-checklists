'use client'
// Player search: omnibox with suggestions, player landing pages with faceted
// filters, and "My Players" (players the collector follows). Data comes from
// public/data/players/ (built by scripts/build-player-index.mjs).
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { supa } from '../lib/supa'
import { TYPE, norm, parseQuery, parseQueryFor, matchPlayers, rowMatches, typeLabel, TYPE_COLORS, serialLabel, MEM_LABEL, MEM_COLORS, memKind, memTypical } from '../lib/query'
import { ACCENT, ACCENT_TEXT, BG, SURFACE, SURFACE_2, LINE, CHIP_LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'

const SPORT_COLORS = { Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e', UFC: '#dc2626', Boxing: '#eab308', Wrestling: '#f59e0b', Golf: '#22c55e', Tennis: '#14b8a6', Racing: '#ef4444', 'Pokémon': '#facc15', 'Yu-Gi-Oh!': '#a855f7', Magic: '#f59e0b', Lorcana: '#8b5cf6', 'One Piece': '#ef4444', Entertainment: '#ec4899', 'Non-Sport': '#fb923c', 'Multi-Sport': '#94a3b8' }
const BRAND_OF = (name) => { const n = (name || '').toLowerCase(); return /upper deck|\bud\b|o-pee-chee|sp authentic|sp game|spx|the cup|ultimate collection|artifacts|black diamond|trilogy|synergy|allure|parkhurst|fleer|skybox|\bmvp\b|credentials|stature|engrained|premier hockey|ice hockey/.test(n) ? 'Upper Deck' : /topps|bowman|finest|stadium club|allen|gypsy|heritage|archives|museum|tribute|dynasty|inception|tier one|triple threads|sterling|five star|definitive|transcendent|chrome/.test(n) ? 'Topps' : /panini|prizm|select|mosaic|donruss|optic|contenders|national treasures|immaculate|flawless|obsidian|spectra|certified|absolute|phoenix|origins|noir|court kings|hoops|revolution|score|playbook|luminance|illusions|zenith|gold standard|crown royale|limited|elite|prestige|rookies|legacy|classics|chronicles|encased|eminence|impeccable|silhouette|one and one/.test(n) ? 'Panini' : /leaf|\bitg\b|in the game/.test(n) ? 'Leaf' : /pro set/.test(n) ? 'Pro Set' : 'Other' }

// ---------- data hooks ----------
let dirPromise = null
export function loadPlayerDir() {
  if (!dirPromise) dirPromise = fetch('/data/players/dir.json').then(r => r.json()).catch(() => ({ v: 1, shards: 0, sports: [], players: [] }))
  return dirPromise
}
// The 5,000 most-carded players (~100 KB) for instant first suggestions.
let topPromise = null
export function loadTopPlayers() {
  if (!topPromise) topPromise = fetch('/data/players/top.json').then(r => r.json()).catch(() => null)
  return topPromise
}
const shardCache = new Map()
export function loadShard(n) {
  if (!shardCache.has(n)) shardCache.set(n, fetch('/data/players/' + n + '.json').then(r => r.json()).catch(() => ({ slugs: [], sections: [], teams: [], rows: [] })))
  return shardCache.get(n)
}

// ---------- My Players (followed) ----------
const LS_KEY = 'hq.myPlayers'
export function useMyPlayers(account) {
  const [list, setList] = useState([])
  const userId = account && account.session ? account.session.user.id : null
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); if (Array.isArray(v)) setList(v) } catch {}
  }, [])
  useEffect(() => {
    if (!userId) return
    supa.from('cardhq_followed_players').select('player_name').eq('user_id', userId).then(({ data }) => {
      if (!data) return
      setList(prev => {
        const merged = [...new Set([...prev, ...data.map(d => d.player_name)])]
        try { localStorage.setItem(LS_KEY, JSON.stringify(merged)) } catch {}
        // push any local-only follows up to the account
        const remote = new Set(data.map(d => d.player_name))
        const missing = prev.filter(p => !remote.has(p))
        if (missing.length) supa.from('cardhq_followed_players').upsert(missing.map(player_name => ({ user_id: userId, player_name })), { onConflict: 'user_id,player_name' }).then(() => {})
        return merged
      })
    })
  }, [userId])
  const has = (name) => list.includes(name)
  const toggle = async (name) => {
    const next = has(name) ? list.filter(p => p !== name) : [...list, name]
    setList(next)
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {}
    if (userId) {
      if (has(name)) await supa.from('cardhq_followed_players').delete().match({ user_id: userId, player_name: name })
      else await supa.from('cardhq_followed_players').upsert({ user_id: userId, player_name: name }, { onConflict: 'user_id,player_name' })
    }
  }
  return { list, has, toggle }
}

// ---------- small UI bits ----------
function Chip({ children, color, solid, onClick, active }) {
  const c = color || ACCENT
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
    letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    background: solid || active ? c : 'transparent', color: solid || active ? '#0F1320' : c, border: '1px solid ' + c + (solid || active ? '' : '66'),
    cursor: onClick ? 'pointer' : 'default', fontFamily: 'inherit'
  }
  return onClick ? <button onClick={onClick} style={style}>{children}</button> : <span style={style}>{children}</span>
}
const MEM_TIP = {
  GU: 'Game-used: material worn or used in an official game.',
  PW: 'Player-worn: worn by the player, but not in a specific game.',
  EW: 'Event-worn: worn at an event such as the NHLPA Rookie Showcase photo shoot.',
  MX: 'Varies by card: the card back says whether it is game-worn or player-worn.',
  MFG: 'Manufactured: a patch made for the card, never worn.',
  UNK: 'Memorabilia source not stated by the maker or any source we checked.'
}
export function MemChip({ code }) {
  const k = memKind(code); if (!k) return null
  const typical = memTypical(code)
  const label = { GU: 'Game-used', PW: 'Player-worn', EW: 'Event-worn', MX: 'Varies', MFG: 'Manufactured', UNK: 'Unknown' }[k]
  const c = MEM_COLORS[k]
  return <span title={MEM_TIP[k] + (typical ? ' Based on the maker\'s standard practice for this line, not stated on this specific card.' : '')}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', color: c, border: '1px ' + (typical ? 'dashed ' : 'solid ') + c + (k === 'UNK' ? '55' : '99'), background: k === 'GU' ? c + '14' : 'transparent' }}>
    {k === 'GU' && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>}
    {label}{typical ? '*' : ''}
  </span>
}
const MEM_CODE = { GU: 1, PW: 2, EW: 3, MX: 4, MFG: 5, UNK: 6 }
export const memCodeOf = (m) => m ? (MEM_CODE[m.k] || 6) + (m.src === 'typical' ? 8 : 0) : 0
// Section-level badge with its evidence (note + link) for set pages.
export function MemBadge({ mem }) {
  if (!mem) return null
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <MemChip code={memCodeOf(mem)} />
    {mem.note && <span style={{ color: '#8A8A93', fontSize: 12 }}>{mem.note}{mem.url ? <> <a href={mem.url} target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT }}>source</a></> : null}</span>}
  </span>
}
function TypeChip({ t }) { const l = typeLabel(t); return <Chip color={TYPE_COLORS[l] || '#9ca3af'}>{l}</Chip> }
function Serial({ s }) {
  if (s === 1) return <span style={{ background: ACCENT, color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 700 }}>1/1</span>
  if (s > 0) return <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>/{s}</span>
  return <span style={{ color: '#6B7080' }}>—</span>
}
function Initials({ name, color }) {
  const i = name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return <span style={{ width: 34, height: 34, borderRadius: 999, background: color + '22', border: '1px solid ' + color + '55', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color, fontSize: 13, flexShrink: 0 }}>{i}</span>
}
const btn = (primary) => ({ ...buttonText, background: primary ? ACCENT : 'transparent', color: primary ? '#fff' : '#D4D4D8', border: primary ? 'none' : '1px solid #2E3D6B', borderRadius: 10, padding: '0 16px', height: 42, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 })
const pill = (active, color) => ({ padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'inherit', background: active ? (color || ACCENT) : '#121626', color: active ? '#fff' : '#A1A1AA', border: '1px solid ' + (active ? 'transparent' : '#232A3E'), whiteSpace: 'nowrap' })
const selectStyle = { background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', fontSize: 13, padding: '0 12px', height: 36, fontFamily: 'inherit', cursor: 'pointer' }

// ---------- Omnibox ----------
export function Omnibox({ value, onChange, onSubmit, onPickPlayer, onPickSet, sets, autoFocus, compact, busy }) {
  const [open, setOpen] = useState(false)
  const [dir, setDir] = useState(null)
  const [sel, setSel] = useState(0)
  const box = useRef(null)
  // The player directory is ~6 MB; fetch it once the visitor starts searching, not on page load.
  const wantDir = open || (value || '').trim().length >= 2
  const [topDir, setTopDir] = useState(null)
  useEffect(() => { if (wantDir && !dir) { loadTopPlayers().then(t => t && setTopDir(t)); loadPlayerDir().then(setDir) } }, [wantDir, dir])
  const sdir = dir || topDir   // suggest from the top-players list until the full directory arrives
  useEffect(() => {
    const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); document.addEventListener('touchstart', h); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h) }
  }, [])
  // Suggestions follow the input a beat behind (the directory scan is ~160k names).
  const dValue = useDeferredValue(value)
  const parsed = useMemo(() => parseQueryFor(sdir, dValue), [dValue, sdir])
  const playerHits = useMemo(() => (sdir && parsed.player.length >= 2) ? matchPlayers(sdir, parsed.player, 6, { fuzzy: !!dir && parsed.player.length >= 5 }) : [], [sdir, dir, parsed.player])
  const setHits = useMemo(() => {
    const t = norm(dValue); if (t.length < 3 || !sets) return []
    const toks = t.split(' ')
    return sets.filter(s => { const n = norm(s.name); return toks.every(k => n.includes(k)) }).slice(0, 3)
  }, [dValue, sets])
  const refine = useMemo(() => {
    const p = playerHits[0]; if (!p) return []
    const base = p.name.toLowerCase()
    return [[base + ' 1/1', '1/1'], [base + ' rc', 'rookies'], [base + ' auto', 'autos'], [base + ' patch auto', 'patch autos'], [base + ' auto /25', 'autos ≤ /25']]
  }, [playerHits])
  const items = [...playerHits.map(p => ({ kind: 'player', p })), ...setHits.map(s => ({ kind: 'set', s }))]
  const go = (i) => {
    const it = items[i]
    if (!it) { onSubmit(value); setOpen(false); return }
    if (it.kind === 'player') onPickPlayer(it.p, parsed)
    else onPickSet(it.s)
    setOpen(false)
  }
  const hl = (name) => {
    const terms = norm(parsed.player).split(' ').filter(Boolean)
    const key = norm(name)
    let out = [], last = 0
    for (const t of terms) { const i = key.indexOf(t, last); if (i < 0) continue; out.push(name.slice(last, i)); out.push(<mark key={i} style={{ background: 'none', color: ACCENT_TEXT }}>{name.slice(i, i + t.length)}</mark>); last = i + t.length }
    out.push(name.slice(last)); return out
  }
  const understood = []
  if (parsed.serial === 1) understood.push(['print run', '1 of 1'])
  else if (parsed.serial) understood.push(['print run', '/' + parsed.serial])
  if (parsed.serialMax) understood.push(['print run', '≤ /' + parsed.serialMax])
  for (const t of parsed.types) understood.push(['type', t.toLowerCase()])
  if (parsed.sport) understood.push(['sport', parsed.sport])
  if (parsed.season) understood.push(['season', String(parsed.season)])
  for (const p of parsed.products) understood.push(['product', p])
  if (parsed.mem) understood.push(['material', { GU: 'game-used', PW: 'player-worn', EW: 'event-worn', MFG: 'manufactured' }[parsed.mem]])
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <form role="search" onSubmit={(e) => { e.preventDefault(); go(open && items.length ? sel : -1) }}
        style={{ display: 'flex', alignItems: 'center', background: '#121212', border: '1px solid ' + (open ? ACCENT + '66' : '#232A3E'), borderRadius: open && items.length ? '14px 14px 0 0' : 14, padding: 6, boxShadow: open ? '0 0 0 4px ' + ACCENT + '14' : '0 20px 50px -20px rgba(0,0,0,0.8)' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={open ? ACCENT : '#8A8A93'} strokeWidth="2" aria-hidden="true" style={{ marginLeft: 10, flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input value={value} autoFocus={autoFocus} aria-label="Search players, sets, serials"
          onChange={(e) => { onChange(e.target.value); setOpen(true); setSel(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, items.length - 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) } else if (e.key === 'Escape') setOpen(false) }}
          placeholder='Search any player, e.g. "Tom Brady Auto" or "Connor McDavid Game-Used 1/1"'
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: compact ? '10px 12px' : '13px 14px', color: '#EDEDEF', fontSize: compact ? 15 : 16, outline: 'none', fontFamily: 'inherit' }} />
        <button type="submit" style={{ ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0 22px', height: compact ? 38 : 44, cursor: 'pointer', fontSize: 14, opacity: busy ? 0.75 : 1 }} aria-busy={busy ? 'true' : undefined}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {open && (items.length > 0 || understood.length > 0) && (
        <div role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 60, background: '#0F1320', border: '1px solid #232A3E', borderTop: 'none', borderRadius: '0 0 14px 14px', overflow: 'hidden', boxShadow: '0 30px 60px -20px #000' }}>
          {understood.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '10px 16px 6px', borderBottom: '1px solid #1A1F31' }}>
              <span style={{ ...eyebrow, color: '#6B7080' }}>Understood</span>
              {parsed.player && <span style={{ background: '#121626', border: '1px solid #232A3E', borderRadius: 999, padding: '4px 10px', fontSize: 12 }}><span style={{ ...eyebrow, color: '#8A8A93', marginRight: 6 }}>player</span>{parsed.player}</span>}
              {understood.map(([k, v], i) => <span key={i} style={{ background: '#0e1630', border: '1px solid ' + ACCENT + '66', borderRadius: 999, padding: '4px 10px', fontSize: 12, color: '#8fb0ff' }}><span style={{ ...eyebrow, color: '#5b82e8', marginRight: 6 }}>{k}</span>{v}</span>)}
            </div>
          )}
          {playerHits.length > 0 && <p style={{ ...eyebrow, margin: 0, padding: '10px 16px 4px', color: '#6B7080' }}>Players</p>}
          {items.map((it, i) => it.kind === 'player' ? (
            <button key={'p' + it.p.id} role="option" aria-selected={sel === i} onMouseEnter={() => setSel(i)} onClick={() => go(i)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: sel === i ? '#111a30' : 'transparent', border: 'none', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit', minHeight: 48 }}>
              <Initials name={it.p.name} color={SPORT_COLORS[it.p.sport] || ACCENT} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{hl(it.p.name)}</span>
                <span style={{ display: 'block', color: '#8A8A93', fontSize: 12 }}>{it.p.sport} · {it.p.cards.toLocaleString()} cards · {it.p.minYear}{it.p.maxYear !== it.p.minYear ? '–' + it.p.maxYear : ''}</span>
              </span>
              {sel === i && <span style={{ color: '#6B7080', fontSize: 12 }}>↵</span>}
            </button>
          ) : (
            <button key={'s' + it.s.slug} role="option" aria-selected={sel === i} onMouseEnter={() => setSel(i)} onClick={() => go(i)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', background: sel === i ? '#111a30' : 'transparent', border: 'none', borderTop: i === playerHits.length ? '1px solid #1A1F31' : 'none', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
              <span style={{ width: 4, height: 28, background: SPORT_COLORS[it.s.sport] || ACCENT, borderRadius: 2 }} />
              <span style={{ flex: 1 }}><span style={{ fontWeight: 600, fontSize: 14 }}>{it.s.name}</span><span style={{ display: 'block', color: '#8A8A93', fontSize: 12 }}>Set · {(it.s.cardCount || 0).toLocaleString()} cards · {it.s.sections} sections</span></span>
            </button>
          ))}
          {refine.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 16px 12px', borderTop: '1px solid #1A1F31' }}>
              <span style={{ ...eyebrow, color: '#6B7080', alignSelf: 'center', marginRight: 4 }}>Refine</span>
              {refine.map(([q, label]) => <button key={q} onClick={() => { onChange(q); onSubmit(q); setOpen(false) }} style={{ background: '#121626', color: '#D4D4D8', border: '1px solid #232A3E', padding: '6px 11px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{playerHits[0].name.split(' ').pop().toLowerCase()} <span style={{ color: ACCENT_TEXT }}>{label}</span></button>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Player page ----------
// Games and non-sport categories: no autos/rookies/game-used to speak of.
const NON_SPORTS = new Set(['Pokémon', 'Yu-Gi-Oh!', 'Magic', 'Lorcana', 'One Piece', 'Disney', 'Entertainment', 'Non-Sport', 'Other'])
const VIEWS = [['all', 'All cards'], ['oneofone', '1/1s'], ['rc', 'Rookies'], ['auto', 'Autos'], ['pa', 'Patch autos'], ['gu', 'Game-used'], ['base', 'Base only'], ['rare', '/25 or rarer']]
const quickFilter = { all: () => true, oneofone: r => r[5] === 1, rc: r => r[6] & TYPE.RC, auto: r => r[6] & TYPE.AU, pa: r => (r[6] & TYPE.AU) && (r[6] & TYPE.PATCH), gu: r => (r[7] & 7) === 1, base: r => r[6] & TYPE.BASE, rare: r => r[5] > 0 && r[5] <= 25 }

export const PlayerPage = memo(PlayerPageInner, (a, b) => a.player === b.player && a.parsed === b.parsed && a.sets === b.sets && a.candidates === b.candidates && a.myPlayers.list === b.myPlayers.list && a.onWant === b.onWant)
function PlayerPageInner({ player, parsed, sets, onOpenSet, myPlayers, onWant, onSearch, candidates, onPickCandidate }) {
  const [shard, setShard] = useState(null)
  // View choices round-trip through the URL (?qv=rookies&group=season&sort=rarest&run=25),
  // so Back from a set returns to the same view.
  const urlp = () => { try { return new URLSearchParams(location.search) } catch { return new URLSearchParams() } }
  const [quick, setQuick] = useState(() => urlp().get('qv') || 'all')
  const [group, setGroup] = useState(() => urlp().get('group') || 'set')
  const [sort, setSort] = useState(() => urlp().get('sort') || 'newest')
  const [types, setTypes] = useState(new Set()) // empty = any; checked boxes narrow
  const [run, setRun] = useState(() => urlp().get('run') || 'any') // any|1|10|25|99|numbered|unnumbered
  const [brands, setBrands] = useState(null) // null = all
  const [products, setProducts] = useState([])
  const [prodInput, setProdInput] = useState('')
  const [teams, setTeams] = useState(null)
  const [yearFrom, setYearFrom] = useState(0)
  const [yearTo, setYearTo] = useState(9999)
  const [expanded, setExpanded] = useState(new Set())
  const [showAll, setShowAll] = useState(new Set())
  const [limit, setLimit] = useState(40)
  const [hidePlates, setHidePlates] = useState(false)
  const [mems, setMems] = useState(null) // null/empty = any; checked boxes narrow
  const [statedOnly, setStatedOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false) // mobile only; desktop always shows filters

  useEffect(() => { setShard(null); loadShard(player.shard).then(setShard); setExpanded(new Set()); setLimit(40) }, [player.id, player.shard])
  useEffect(() => {
    const sp = urlp(); if (!sp.get('player')) return
    const set = (k, v, dflt) => { if (v && v !== dflt) sp.set(k, v); else sp.delete(k) }
    set('qv', quick, 'all'); set('group', group, 'set'); set('sort', sort, 'newest'); set('run', run, 'any')
    const url = location.pathname + '?' + sp.toString()
    if (url !== location.pathname + location.search) { try { history.replaceState(null, '', url) } catch {} }
  }, [quick, group, sort, run])
  // When the query itself carries filters (1/1, auto…), start from them.
  useEffect(() => {
    if (!parsed) return
    if (parsed.serial === 1) setRun('1'); else if (parsed.serialMax) setRun(String(parsed.serialMax)); else if (parsed.types.has('NUMBERED')) setRun('numbered')
    setYearFrom(parsed.season || 0); setYearTo(parsed.season || 9999)
    setProducts(parsed.products.slice())
    setMems(parsed.mem ? new Set([parsed.mem]) : null)
  }, [parsed])

  const setMeta = useMemo(() => { const m = {}; for (const s of sets) m[s.slug] = s; return m }, [sets])

  // All of this player's rows, enriched.
  const rows = useMemo(() => {
    if (!shard) return []
    const out = []
    for (const r of shard.rows) {
      if (r[0] !== player.id) continue
      const slug = shard.slugs[r[1]]
      const m = setMeta[slug] || { name: slug, year: 0, sport: '' }
      out.push({ slug, set: m.name, year: m.year, sport: m.sport, brand: BRAND_OF(m.name), section: shard.sections[r[2]], n: r[3], team: r[4] >= 0 ? shard.teams[r[4]] : '', serial: r[5], type: r[6], mem: r[7] || 0, raw: r })
    }
    return out
  }, [shard, player.id, setMeta])

  // Facet universe (counts over the player's full catalogue).
  const facets = useMemo(() => {
    const f = { mem: {}, sets: new Set(), au: 0, one: 0, rc: 0, patch: 0, base: 0, parallel: 0, insert: 0, relic: 0, plate: 0, brands: new Map(), teams: new Map(), years: new Map(), minY: 9999, maxY: 0, seasons: 0 }
    for (const r of rows) {
      f.sets.add(r.slug)
      if (r.type & TYPE.AU) f.au++; if (r.serial === 1) f.one++; if (r.type & TYPE.RC) f.rc++; if (r.type & TYPE.PATCH) f.patch++
      if (r.type & TYPE.BASE) f.base++; if (r.type & TYPE.PARALLEL) f.parallel++; if (r.type & TYPE.INSERT) f.insert++; if (r.type & TYPE.RELIC) f.relic++; if (r.type & TYPE.PLATE) f.plate++
      f.brands.set(r.brand, (f.brands.get(r.brand) || 0) + 1)
      if (r.mem) { const k = memKind(r.mem); f.mem[k] = (f.mem[k] || 0) + 1 }
      if (r.team) f.teams.set(r.team, (f.teams.get(r.team) || 0) + 1)
      if (r.year) { f.years.set(r.year, (f.years.get(r.year) || 0) + 1); if (r.year < f.minY) f.minY = r.year; if (r.year > f.maxY) f.maxY = r.year }
    }
    f.seasons = f.years.size
    return f
  }, [rows])
  const topTeam = useMemo(() => [...facets.teams.entries()].filter(([t]) => /[A-Za-z]{3,}/.test(t) && !/^\/|#/.test(t)).sort((a, b) => b[1] - a[1])[0], [facets])
  // Earliest season's card; within that season prefer a rookie-flagged base card.
  const firstCard = useMemo(() => {
    const real = rows.filter(r => /^\d{4}/.test(r.set || '') && r.year)
    if (!real.length) return null
    const y = Math.min(...real.map(r => r.year))
    const first = real.filter(r => r.year === y)
    return first.find(r => (r.type & TYPE.RC) && (r.type & TYPE.BASE)) || first.find(r => r.type & TYPE.RC) || first.find(r => r.type & TYPE.BASE) || first[0]
  }, [rows])

  // Apply filters.
  const filtered = useMemo(() => {
    const qf = quickFilter[quick] || quickFilter.all
    return rows.filter(r => {
      if (!qf(r.raw)) return false
      if (hidePlates && (r.type & TYPE.PLATE)) return false
      if (types.size && ![...types].some(k => r.type & TYPE[k])) return false
      if (run === '1' && r.serial !== 1) return false
      if (run === 'numbered' && !(r.serial > 0)) return false
      if (run === 'unnumbered' && r.serial > 0) return false
      if (/^\d+$/.test(run) && run !== '1' && !(r.serial > 0 && r.serial <= parseInt(run))) return false
      if (brands && brands.size && !brands.has(r.brand)) return false
      if (teams && teams.size && !teams.has(r.team)) return false
      if (r.year && (r.year < yearFrom || r.year > yearTo)) return false
      if (products.length) { const n = r.set.toLowerCase(); if (!products.every(p => n.includes(p.toLowerCase()))) return false }
      if (parsed && parsed.types.size) { for (const t of parsed.types) { if (t === 'RPA' && !((r.type & TYPE.AU) && (r.type & TYPE.PATCH) && (r.type & TYPE.RC))) return false; if (TYPE[t] && !(r.type & TYPE[t])) return false } }
      if (parsed && parsed.sport && r.sport !== parsed.sport) return false
      if (mems && mems.size && !(r.mem && mems.has(memKind(r.mem)))) return false
      if (statedOnly && r.mem && memTypical(r.mem)) return false
      return true
    })
  }, [rows, quick, types, run, brands, teams, yearFrom, yearTo, products, hidePlates, parsed, mems, statedOnly])

  const sorted = useMemo(() => {
    const out = filtered.slice()
    const bySet = (a, b) => a.set.localeCompare(b.set)
    if (sort === 'oldest') out.sort((a, b) => a.year - b.year || bySet(a, b))
    else if (sort === 'rarest') out.sort((a, b) => (a.serial || 1e9) - (b.serial || 1e9) || b.year - a.year)
    else if (sort === 'set') out.sort(bySet)
    else out.sort((a, b) => b.year - a.year || bySet(a, b))
    return out
  }, [filtered, sort])

  const groups = useMemo(() => {
    if (group === 'flat') return null
    const m = new Map()
    for (const r of sorted) {
      const k = group === 'season' ? String(r.year || 'Unknown') : r.slug
      let g = m.get(k)
      if (!g) { g = { key: k, title: group === 'season' ? seasonLabel(r.year, r.sport) : r.set, slug: r.slug, sport: r.sport, year: r.year, brand: r.brand, rows: [], au: 0, one: 0, patch: 0, rc: 0, gu: 0, sections: new Set() }; m.set(k, g) }
      g.rows.push(r); g.sections.add(r.section)
      if (r.type & TYPE.AU) g.au++; if (r.serial === 1) g.one++; if (r.type & TYPE.PATCH) g.patch++; if (r.type & TYPE.RC) g.rc++; if ((r.mem & 7) === 1) g.gu++
    }
    return [...m.values()]
  }, [sorted, group])

  const toggleType = (t) => setTypes(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n })
  // Facet checkboxes: nothing checked = any; checking narrows to the checked values.
  const toggleIn = (setter, cur, v) => setter(() => { const n = new Set(cur || []); if (n.has(v)) n.delete(v); else n.add(v); return n.size ? n : null })
  const resetAll = () => { setMems(null); setStatedOnly(false); setQuick('all'); setTypes(new Set()); setRun('any'); setBrands(null); setTeams(null); setProducts([]); setYearFrom(0); setYearTo(9999); setHidePlates(false) }
  const color = SPORT_COLORS[player.sport] || ACCENT
  const following = myPlayers.has(player.name)
  const nonSports = NON_SPORTS.has(player.sport)
  const years = [...facets.years.keys()].sort()
  const maxYearCount = Math.max(1, ...facets.years.values())
  const brandList = [...facets.brands.entries()].sort((a, b) => b[1] - a[1])
  const teamList = [...facets.teams.entries()].filter(([t]) => /[A-Za-z]{3,}/.test(t) && !/^\/|#|\d\/\d/.test(t)).sort((a, b) => b[1] - a[1]).slice(0, 12)
  const productOptions = useMemo(() => [...new Set(rows.map(r => r.set.replace(/^\d{4}(-\d{2})?\s*/, '').replace(/\s+(hockey|baseball|basketball|football|soccer).*$/i, '')))].sort(), [rows])
  const titleSuffix = quick !== 'all' ? ' · ' + VIEWS.find(v => v[0] === quick)[1] : parsed && parsed.serial === 1 ? ' · 1/1s' : ''

  const [copied, setCopied] = useState('')
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied('Link copied ✓') }
    catch { window.prompt('Copy this link:', location.href); setCopied('') }   // clipboard blocked (some phones / unfocused tab)
    setTimeout(() => setCopied(''), 2000)
  }
  const exportCsv = () => {
    const lines = ['Player,Season,Set,Card #,Section,Type,Material,Print run,Team', ...sorted.map(r => [player.name, seasonLabel(r.year, r.sport), r.set, r.n, r.section, typeLabel(r.type), r.mem ? MEM_LABEL[r.mem & 7] + (memTypical(r.mem) ? ' (typical)' : '') : '', serialLabel(r.serial), r.team].map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(','))]
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = player.name.replace(/\s+/g, '-') + '-checklist.csv'; a.click()
  }

  const Row = ({ r, withSet }) => (
    <tr style={{ borderTop: '1px solid #1a1a1a' }}>
      {withSet && <td style={{ padding: '9px 12px', color: '#A1A1AA', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{seasonLabel(r.year, r.sport)}</td>}
      {withSet && <td style={{ padding: '9px 12px' }}><button onClick={() => onOpenSet(r.slug)} style={{ background: 'none', border: 'none', color: '#EDEDEF', fontWeight: 600, cursor: 'pointer', padding: 0, textAlign: 'left', fontFamily: 'inherit', fontSize: 14 }}>{r.set.replace(/^\d{4}(-\d{2})?\s*/, '')}</button></td>}
      <td style={{ padding: '9px 12px', color: ACCENT_TEXT, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r.n ? '#' + r.n : '—'}</td>
      <td style={{ padding: '9px 12px' }}>{r.section}</td>
      <td style={{ padding: '9px 12px' }}><TypeChip t={r.type} /></td>
      <td style={{ padding: '9px 12px' }}>{r.mem ? <MemChip code={r.mem} /> : <span style={{ color: '#444' }}>—</span>}</td>
      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}><Serial s={r.serial} /></td>
      <td style={{ padding: '9px 12px', textAlign: 'right' }}><button aria-label={'Add #' + r.n + ' ' + r.section + ' to wantlist'} onClick={() => onWant({ set_slug: r.slug, set_name: r.set, card_n: r.n, section: r.section, player: player.name })} style={{ background: 'none', border: '1px solid #232A3E', color: '#A1A1AA', borderRadius: 6, width: 32, height: 32, cursor: 'pointer', fontFamily: 'inherit' }}>+</button></td>
    </tr>
  )
  const th = { padding: '9px 12px', fontWeight: 700, textAlign: 'left', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8A8A93', whiteSpace: 'nowrap' }

  return (
    <section>
      {/* candidates when the query was ambiguous */}
      {candidates && candidates.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 14px' }}>
          <span style={{ ...eyebrow, color: '#6B7080' }}>Also matches</span>
          {candidates.filter(c => c.id !== player.id).slice(0, 6).map(c => <button key={c.id} onClick={() => onPickCandidate(c)} style={{ background: '#121626', color: '#D4D4D8', border: '1px solid #232A3E', padding: '6px 11px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{c.name} <span style={{ color: '#8A8A93' }}>· {c.cards.toLocaleString()}</span></button>)}
        </div>
      )}

      {/* HERO */}
      {/* TCG / non-sport cards have no autos, rookies or game-used: hide those empty tiles and views */}
      <div className="hq-panel" style={{ background: 'linear-gradient(140deg, #191919, #0F1320)', border: '1px solid #232A3E', borderRadius: 18, padding: '26px 28px', display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Chip color={color} solid>{player.sport}</Chip>
            {topTeam && <Chip color="#A1A1AA">{topTeam[0]}</Chip>}
            {facets.maxY > 0 && <Chip color="#A1A1AA">{seasonLabel(facets.minY, player.sport)} → {seasonLabel(facets.maxY, player.sport)}</Chip>}
          </div>
          <h1 style={{ ...display, fontSize: 'clamp(36px, 5vw, 56px)', lineHeight: 0.95, margin: 0 }}>{player.name}{titleSuffix && <span style={{ color: ACCENT_TEXT }}>{titleSuffix}</span>}</h1>
          <p style={{ color: '#8f8f8f', fontSize: 14, margin: '12px 0 0', lineHeight: 1.6 }}>
            {!shard ? 'Loading cards…' : firstCard ? <>First card: {firstCard.year ? seasonLabel(firstCard.year, firstCard.sport) + ' ' : ''}{firstCard.set.replace(/^\d{4}(-\d{2})?\s*/, '')}{firstCard.n ? ' #' + firstCard.n : ''} · </> : null}
            {shard && <>Appears in {facets.sets.size.toLocaleString()} sets across {facets.seasons} season{facets.seasons === 1 ? '' : 's'}</>}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button onClick={() => myPlayers.toggle(player.name)} style={btn(!following)} aria-pressed={following}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">{following ? <path d="m5 12 5 5L20 7" /> : <path d="M12 5v14M5 12h14" />}</svg>
              {following ? 'In my players' : 'Collect this player'}
            </button>
            <button onClick={exportCsv} style={btn(false)}>Export CSV</button>
            <button onClick={copyLink} style={btn(false)}>{copied || 'Copy link'}</button>
          </div>
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
          {[[rows.length, 'Cards', ACCENT], [facets.sets.size, 'Sets'], [facets.au, 'Autographs'], [facets.one, '1/1s'], [facets.rc, 'Rookies'], [facets.patch, 'Patches'], [facets.mem.GU || 0, 'Game-used'], [facets.seasons, 'Seasons']].filter(([n, l]) => !(nonSports && shard && !n && l !== 'Cards' && l !== 'Sets')).map(([n, l, c]) => (
            <div key={l} style={{ background: '#0F1320', border: '1px solid #232A3E', borderRadius: 12, padding: '14px 12px' }}>
              <p style={{ ...display, margin: 0, fontSize: 32, color: c || '#EDEDEF', lineHeight: 1 }}>{shard ? n.toLocaleString() : '…'}</p>
              <p style={{ ...eyebrow, margin: '6px 0 0', color: '#8A8A93' }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* QUICK VIEWS */}
      <div className="hq-chiprow" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 0' }}>
        <span style={{ ...eyebrow, color: '#6B7080', marginRight: 4 }}>Quick views</span>
        {VIEWS.map(([k, l]) => { const n = rows.filter(r => quickFilter[k](r.raw)).length; if (nonSports && shard && k !== 'all' && !n && quick !== k) return null; return <button key={k} onClick={() => setQuick(k)} style={pill(quick === k)}>{l}{k !== 'all' ? ' · ' + n.toLocaleString() : ''}</button> })}
      </div>

      {/* BODY */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 18 }}>
        <aside aria-label="Filters" className={'hq-aside' + (filtersOpen ? '' : ' hq-collapsed')} style={{ flex: '0 0 280px', maxWidth: 290, boxSizing: 'border-box', background: '#0F1320', border: '1px solid #232323', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ ...eyebrow }}>Filters</span>
            <span style={{ display: 'inline-flex', gap: 14, alignItems: 'center' }}>
              <button onClick={resetAll} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0' }}>Reset</button>
              <button className="hq-filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}
                style={{ background: '#1a1a1a', border: '1px solid #232A3E', color: '#D4D4D8', borderRadius: 8, height: 34, padding: '0 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', alignItems: 'center' }}>{filtersOpen ? 'Hide ▴' : 'Show ▾'}</button>
            </span>
          </div>
          <div>
            <p style={legend}>Season</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select aria-label="From season" value={yearFrom} onChange={(e) => setYearFrom(parseInt(e.target.value))} style={{ ...selectStyle, flex: 1 }}><option value={0}>Any</option>{years.map(y => <option key={y} value={y}>{seasonLabel(y, player.sport)}</option>)}</select>
              <span style={{ color: '#6B7080' }}>–</span>
              <select aria-label="To season" value={yearTo} onChange={(e) => setYearTo(parseInt(e.target.value))} style={{ ...selectStyle, flex: 1 }}><option value={9999}>Any</option>{years.map(y => <option key={y} value={y}>{seasonLabel(y, player.sport)}</option>)}</select>
            </div>
          </div>
          <div>
            <p style={legend}>Card type <span style={{ color: '#6B7080', fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>· tick to narrow</span></p>
            {[['BASE', 'Base', facets.base], ['PARALLEL', 'Parallels', facets.parallel], ['INSERT', 'Inserts', facets.insert], ['AU', 'Autographs', facets.au], ['PATCH', 'Patches', facets.patch], ['RELIC', 'Relics', facets.relic], ['PLATE', 'Printing plates', facets.plate]].map(([k, l, n]) => (
              <label key={k} style={lbl}><input type="checkbox" checked={types.has(k)} onChange={() => toggleType(k)} style={cb} />{l}<span style={cnt}>{n.toLocaleString()}</span></label>
            ))}
            <label style={lbl}><input type="checkbox" checked={hidePlates} onChange={(e) => setHidePlates(e.target.checked)} style={cb} />Hide printing plates</label>
          </div>
          {Object.keys(facets.mem).length > 0 && (
            <div>
              <p style={legend}>Memorabilia</p>
              {[['GU', 'Game-used'], ['PW', 'Player-worn'], ['EW', 'Event-worn'], ['MX', 'Varies by card'], ['MFG', 'Manufactured'], ['UNK', 'Unknown']].filter(([k]) => facets.mem[k]).map(([k, l]) => (
                <label key={k} style={lbl}><input type="checkbox" checked={!!mems && mems.has(k)} onChange={() => toggleIn(setMems, mems, k)} style={cb} /><span style={{ width: 8, height: 8, borderRadius: 999, background: MEM_COLORS[k], flexShrink: 0 }} />{l}<span style={cnt}>{facets.mem[k].toLocaleString()}</span></label>
              ))}
              <label style={lbl} title="Hide tags based on the maker's usual practice; keep only ones stated for that card or insert"><input type="checkbox" checked={statedOnly} onChange={(e) => setStatedOnly(e.target.checked)} style={cb} />Stated only (hide *)</label>
            </div>
          )}
          <div>
            <p style={legend}>Print run</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[['any', 'Any'], ['1', '1/1'], ['10', '≤ /10'], ['25', '≤ /25'], ['99', '≤ /99'], ['numbered', 'Numbered'], ['unnumbered', 'Unnumbered']].map(([k, l]) => <button key={k} onClick={() => setRun(k)} style={{ ...pill(run === k), textTransform: 'none', padding: '6px 10px' }}>{l}</button>)}
            </div>
          </div>
          <div>
            <p style={legend}>Brand</p>
            {brandList.map(([b, n]) => <label key={b} style={lbl}><input type="checkbox" checked={!!brands && brands.has(b)} onChange={() => toggleIn(setBrands, brands, b)} style={cb} />{b}<span style={cnt}>{n.toLocaleString()}</span></label>)}
          </div>
          <div>
            <p style={legend}>Product</p>
            <input list="hq-products" value={prodInput} onChange={(e) => setProdInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && prodInput.trim()) { setProducts(p => [...p, prodInput.trim()]); setProdInput('') } }} placeholder="The Cup, SP Authentic, Series 1…" aria-label="Product line" style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid #232A3E', borderRadius: 8, color: '#D4D4D8', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit' }} />
            <datalist id="hq-products">{productOptions.slice(0, 400).map(p => <option key={p} value={p} />)}</datalist>
            {products.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{products.map(p => <span key={p} style={{ background: '#0e1630', border: '1px solid ' + ACCENT + '55', color: '#c9d8ff', fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, display: 'inline-flex', gap: 6, alignItems: 'center' }}>{p}<button aria-label={'Remove ' + p} onClick={() => setProducts(ps => ps.filter(x => x !== p))} style={{ background: 'none', border: 'none', color: '#c9d8ff', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>×</button></span>)}</div>}
          </div>
          {teamList.length > 0 && (
            <div>
              <p style={legend}>Team on card</p>
              {teamList.map(([t, n]) => <label key={t} style={lbl}><input type="checkbox" checked={!!teams && teams.has(t)} onChange={() => toggleIn(setTeams, teams, t)} style={cb} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span><span style={cnt}>{n.toLocaleString()}</span></label>)}
            </div>
          )}
        </aside>

        <div style={{ flex: '999 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...title(18) }}>{shard ? filtered.length.toLocaleString() : '…'} cards <span style={{ color: '#6B7080', fontSize: 16 }}>in {new Set(filtered.map(r => r.slug)).size.toLocaleString()} sets</span></span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div role="group" aria-label="Group results" style={{ display: 'inline-flex', border: '1px solid #232A3E', borderRadius: 8, overflow: 'hidden' }}>
                {[['set', 'By set'], ['season', 'By season'], ['flat', 'Flat list']].map(([k, l]) => <button key={k} onClick={() => setGroup(k)} style={{ background: group === k ? ACCENT : '#121626', color: group === k ? '#fff' : '#A1A1AA', border: 'none', padding: '0 12px', height: 36, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>)}
              </div>
              <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="rarest">Rarest first</option><option value="set">Set A–Z</option></select>
            </div>
          </div>

          {years.length > 1 && (
            <div aria-label="Cards per season" style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 58, padding: '0 2px' }}>
              {years.map(y => { const n = facets.years.get(y); const active = y >= yearFrom && y <= yearTo; return (
                <button key={y} onClick={() => { setYearFrom(y); setYearTo(y) }} title={n + ' cards'} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <span style={{ width: '100%', height: 6 + Math.round(38 * n / maxYearCount), background: active ? (yearFrom === yearTo && yearFrom === y ? ACCENT : '#2E3D6B') : '#1A1F31', borderRadius: '3px 3px 0 0' }} />
                  <span style={{ fontSize: 12, color: active ? '#A1A1AA' : '#6B7080' }}>{String(y).slice(2)}</span>
                </button>) })}
            </div>
          )}

          {Object.keys(facets.mem).length > 0 && <p style={{ color: '#6B7080', fontSize: 12, margin: 0 }}>* Material based on the maker's standard practice for that product line (hover for the source); no asterisk = stated for that card or insert.</p>}
          {!shard ? <p style={{ color: '#6B7080' }}>Loading {player.name}…</p> : groups ? (
            <>
              {groups.slice(0, limit).map((g, gi) => {
                const open = expanded.has(g.key) || (gi === 0 && expanded.size === 0)
                const all = showAll.has(g.key)
                const c = SPORT_COLORS[g.sport] || ACCENT
                return (
                  <article key={g.key} style={{ border: '1px solid #232A3E', borderRadius: 14, overflow: 'hidden', background: '#0F1320' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: open ? '#121626' : '#0F1320', flexWrap: 'wrap' }}>
                      <span style={{ width: 4, height: 36, background: c, borderRadius: 2 }} />
                      <div style={{ flex: 1, minWidth: 200 }}>
                        {group === 'set' ? <button onClick={() => onOpenSet(g.slug)} style={{ ...title(16), background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>{g.title}</button>
                          : <span style={{ ...title(16) }}>{g.title}</span>}
                        <p style={{ margin: '2px 0 0', color: '#8A8A93', fontSize: 12 }}>{group === 'set' ? g.brand + ' · ' : ''}{g.rows.length} card{g.rows.length === 1 ? '' : 's'} in {g.sections.size} section{g.sections.size === 1 ? '' : 's'}</p>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {g.rc > 0 && <Chip color="#4ade80">{g.rc} RC</Chip>}
                        {g.au > 0 && <Chip color="#A1A1AA">{g.au} auto{g.au === 1 ? '' : 's'}</Chip>}
                        {g.patch > 0 && <Chip color="#A1A1AA">{g.patch} patch{g.patch === 1 ? '' : 'es'}</Chip>}
                        {g.gu > 0 && <Chip color={MEM_COLORS.GU}>{g.gu} game-used</Chip>}
                        {g.one > 0 && <Chip>{g.one} × 1/1</Chip>}
                      </div>
                      <button aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} onClick={() => setExpanded(s => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); if (gi === 0 && s.size === 0) { /* first opens by default */ n.add('__init'); if (open) n.delete(g.key) } return n })}
                        style={{ background: 'none', border: '1px solid #232A3E', color: '#A1A1AA', borderRadius: 8, width: 36, height: 36, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>{open ? '▾' : '▸'}</button>
                    </div>
                    {open && (
                      <>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: group === 'season' ? 760 : 560 }}>
                            <thead><tr>{group === 'season' && <><th style={th}>Season</th><th style={th}>Set</th></>}<th style={th}>Card #</th><th style={th}>Section</th><th style={th}>Type</th><th style={th}>Material</th><th style={{ ...th, textAlign: 'right' }}>Run</th><th style={{ ...th, textAlign: 'right' }}>Want</th></tr></thead>
                            <tbody>{(all ? g.rows : g.rows.slice(0, 12)).map((r, i) => <Row key={i} r={r} withSet={group === 'season'} />)}</tbody>
                          </table>
                        </div>
                        {g.rows.length > 12 && !all && <div style={{ padding: '10px 16px', borderTop: '1px solid #1f1f1f' }}><button onClick={() => setShowAll(s => new Set([...s, g.key]))} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Show all {g.rows.length} cards →</button></div>}
                      </>
                    )}
                  </article>
                )
              })}
              {groups.length > limit && <div style={{ textAlign: 'center', padding: 8 }}><button onClick={() => setLimit(l => l + 40)} style={btn(false)}>Load {Math.min(40, groups.length - limit)} more {group === 'season' ? 'seasons' : 'sets'} ({groups.length - limit} left)</button></div>}
              {groups.length === 0 && <div style={{ border: '1px dashed #232A3E', borderRadius: 14, padding: '22px 20px', color: '#8A8A93' }}>No cards match these filters. <button onClick={resetAll} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>Clear all filters</button></div>}
            </>
          ) : (
            <div style={{ border: '1px solid #232A3E', borderRadius: 14, overflow: 'hidden', background: '#0F1320' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 820 }}>
                  <thead><tr style={{ background: '#121626' }}><th style={th}>Season</th><th style={th}>Set</th><th style={th}>Card #</th><th style={th}>Section / parallel</th><th style={th}>Type</th><th style={th}>Material</th><th style={{ ...th, textAlign: 'right' }}>Run</th><th style={{ ...th, textAlign: 'right' }}>Want</th></tr></thead>
                  <tbody>{sorted.slice(0, limit * 5).map((r, i) => <Row key={i} r={r} withSet />)}</tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #1f1f1f', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ color: '#8A8A93', fontSize: 13 }}>Showing {Math.min(limit * 5, sorted.length).toLocaleString()} of {sorted.length.toLocaleString()}</span>
                {sorted.length > limit * 5 && <button onClick={() => setLimit(l => l + 40)} style={btn(false)}>Load more</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function seasonLabel(y, sport) {
  if (!y) return ''
  return /Hockey|Basketball/.test(sport || '') ? (y - 1) + '-' + String(y).slice(2) : String(y)
}
const legend = { color: '#8A8A93', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', margin: '0 0 8px' }
const lbl = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#D4D4D8', minHeight: 30, cursor: 'pointer' }
const cb = { accentColor: ACCENT, width: 16, height: 16, flexShrink: 0 }
const cnt = { marginLeft: 'auto', color: '#6B7080', fontSize: 12 }

// ---------- My Players panel (used from the set page + a standalone view) ----------
export function MyPlayersPanel({ myPlayers, onOpenPlayer, dirPlayers }) {
  const [dir, setDir] = useState(null)
  useEffect(() => { loadPlayerDir().then(setDir) }, [])
  // exact name, else the same name spelled differently (saved before a data clean-up: "Shaquille ONeal")
  const resolve = (name) => { if (!dir) return -1; const i = dir.players.findIndex(p => p[0] === name); if (i >= 0) return i; const k = norm(name); return dir.players.findIndex(p => norm(p[0]) === k) }
  return (
    <div className="hq-panel" style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: '26px 28px' }}>
      <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>My Players</h1>
      <p style={{ color: '#aaa', fontSize: 14, lineHeight: 1.6, maxWidth: 680, margin: '12px 0 0' }}>The players you collect. They become a one-click filter on every set page, and each one has a full player page with every card, parallel and print run.</p>
      {myPlayers.list.length === 0 ? <p style={{ color: '#8A8A93', fontSize: 14, marginTop: 18 }}>No players yet — search for a player and hit <strong style={{ color: ACCENT_TEXT }}>Collect this player</strong>.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 12, marginTop: 20 }}>
          {myPlayers.list.map(name => {
            const i = resolve(name); const p = i >= 0 ? dir.players[i] : null
            const sport = p ? dir.sports[p[3]] : ''
            return (
              <div key={name} style={{ background: '#0F1320', border: '1px solid #232A3E', borderRadius: 14, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <Initials name={name} color={SPORT_COLORS[sport] || ACCENT} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button onClick={() => onOpenPlayer(name)} style={{ ...title(16), background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left', lineHeight: 1.05 }}>{name}</button>
                  <p style={{ margin: '3px 0 0', color: '#8A8A93', fontSize: 12 }}>{p ? sport + ' · ' + p[2].toLocaleString() + ' cards' : dir ? 'Not found in the database' : '…'}</p>
                </div>
                <button aria-label={'Remove ' + name} onClick={() => myPlayers.toggle(name)} style={{ background: 'none', border: '1px solid #232A3E', color: '#8A8A93', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontFamily: 'inherit' }}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
