'use client'
// Player vs player: two players' card catalogues side by side.
//   ?compare=Nikita+Kucherov&vs=Jack+Hughes
// Layout follows the player page: hero with chips and display names, then one stat tile
// per row (big numbers at both ends, a short bar under the label), then season counts,
// the sets both players appear in, and cards that feature both of them.
// Data: the same player directory + shards as the player page (components/player.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import { TYPE, matchPlayers, memKind } from '../lib/query'
import { PAR, parallelKinds } from '../lib/parallels'
import { loadPlayerDir, loadTopPlayers, loadShard, seasonLabel } from './player'
import { ACCENT, ACCENT_TEXT, display, eyebrow, buttonText } from '../lib/theme'

// Player 1 cobalt, player 2 silver (they differ in lightness, not only hue).
const TXT = ['#7FA2FF', '#EDEDEF']
const BAR = ['#3B6EF5', '#A3ABBD']
const DIM = '#8A93A8', DIM_BAR = '#2A3247'
const SPORT_COLORS = { Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e', UFC: '#dc2626', Boxing: '#eab308', Wrestling: '#f59e0b', Golf: '#22c55e', Tennis: '#14b8a6', Racing: '#ef4444' }

// Name from a shared link -> directory entry (top list first, then the full directory).
async function resolvePlayer(name) {
  if (!name) return null
  const is = (h) => h.name === name || h.via === name
  const top = await loadTopPlayers()
  if (top) { const h = matchPlayers(top, name, 8).find(is); if (h) return h }
  const dir = await loadPlayerDir()
  const hits = matchPlayers(dir, name, 8)
  return hits.find(is) || (hits[0] && !hits[0].partial ? hits[0] : null)
}

// Every card row for one player, with the fields the comparison needs.
function useRows(player, setMeta) {
  const [shard, setShard] = useState(null)
  useEffect(() => {
    let live = true   // switching players quickly: the earlier player's shard must not land last
    setShard(null); if (player) loadShard(player.shard).then(x => { if (live) setShard(x) })
    return () => { live = false }
  }, [player && player.id, player && player.shard])
  return useMemo(() => {
    if (!player || !shard) return null
    const out = []
    for (const r of shard.rows) {
      if (r[0] !== player.id) continue
      const slug = shard.slugs[r[1]], section = shard.sections[r[2]]
      const m = setMeta[slug] || { name: slug, year: 0, sport: '' }
      out.push({ slug, set: m.name, year: m.year, sport: m.sport, section, n: r[3], team: r[4] >= 0 ? shard.teams[r[4]] : '', serial: r[5], type: r[6], mem: r[7] || 0, par: parallelKinds(section, m.sport, m.name, m.year) })
    }
    return out
  }, [player, shard, setMeta])
}

function statsOf(rows) {
  const s = { cards: rows.length, sets: new Set(), au: 0, one: 0, rc: 0, patch: 0, pa: 0, rpa: 0, gu: 0, rare: 0, shield: 0, years: new Map(), teams: new Map() }
  for (const r of rows) {
    s.sets.add(r.slug)
    const au = r.type & TYPE.AU, pt = r.type & TYPE.PATCH, rc = r.type & TYPE.RC
    if (au) s.au++
    if (r.serial === 1) s.one++
    if (rc) s.rc++
    if (pt) s.patch++
    if (au && pt) s.pa++
    if (au && pt && rc) s.rpa++
    if (memKind(r.mem) === 'GU') s.gu++
    if (r.serial > 0 && r.serial <= 25) s.rare++
    if (r.par & PAR.SHIELD) s.shield++
    if (r.year) s.years.set(r.year, (s.years.get(r.year) || 0) + 1)
    if (r.team && /[A-Za-z]{3,}/.test(r.team) && !/^\/|#|\d\/\d/.test(r.team)) s.teams.set(r.team, (s.teams.get(r.team) || 0) + 1)
  }
  s.setCount = s.sets.size
  s.seasons = s.years.size
  s.topTeam = [...s.teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  return s
}

const METRICS = [
  ['cards', 'Cards'], ['setCount', 'Sets'], ['au', 'Autographs'], ['one', '1/1s'], ['rc', 'Rookie cards'],
  ['patch', 'Patches'], ['pa', 'Patch autos'], ['rpa', 'RPAs'], ['gu', 'Game-used'], ['rare', '/25 or rarer'], ['shield', 'Shields'], ['seasons', 'Years of sets']
]
const fmt = (v, perSeason) => perSeason ? (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) : Math.round(v).toLocaleString()
const lastName = (name) => name.split(/\s+/).slice(-1)[0]

const chip = (solid) => ({ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: solid || 'transparent', color: solid ? '#0F1320' : '#A1A1AA', border: solid ? '1px solid ' + solid : '1px solid #A1A1AA66' })
const pill = (on) => ({ padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'inherit', cursor: 'pointer', background: on ? ACCENT : '#121626', color: on ? '#fff' : '#A1A1AA', border: '1px solid ' + (on ? 'transparent' : '#232A3E'), whiteSpace: 'nowrap' })
const tile = { background: '#0F1320', border: '1px solid #232A3E', borderRadius: 12 }
const label = { ...eyebrow, fontSize: 14, color: '#A3ABBD' }
const bigNum = { ...display, fontSize: 'clamp(30px, 6.5vw, 46px)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }
const linkBtn = { background: 'none', border: 'none', padding: 0, color: '#EDEDEF', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 14 }

// One stat: big numbers at both ends, a short split bar and the edge under the label.
function StatRow({ title, a, b, names, perSeason }) {
  const max = Math.max(a, b, 1e-9)
  const lead = a > b ? 0 : b > a ? 1 : -1
  return (
    <div style={{ ...tile, padding: '12px clamp(14px, 3vw, 22px)', display: 'grid', gridTemplateColumns: 'minmax(64px, 1fr) minmax(0, 220px) minmax(64px, 1fr)', alignItems: 'center', gap: 'clamp(8px, 2vw, 16px)' }}>
      <span style={{ ...bigNum, color: lead === 1 ? DIM : TXT[0] }}>{fmt(a, perSeason)}</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ ...label, textAlign: 'center' }}>{title}</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, width: '100%', height: 4 }} aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'flex-end', background: '#1A1F31', borderRadius: 2 }}><div style={{ width: (a / max * 100) + '%', background: lead === 1 ? DIM_BAR : BAR[0], borderRadius: 2, transition: 'width .3s' }} /></div>
          <div style={{ display: 'flex', background: '#1A1F31', borderRadius: 2 }}><div style={{ width: (b / max * 100) + '%', background: lead === 0 ? DIM_BAR : BAR[1], borderRadius: 2, transition: 'width .3s' }} /></div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: lead < 0 ? DIM : TXT[lead], fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
          {lead < 0 ? 'Even' : '+' + fmt(Math.abs(a - b), perSeason) + ' ' + lastName(names[lead])}
        </span>
      </div>
      <span style={{ ...bigNum, color: lead === 0 ? DIM : TXT[1], textAlign: 'right' }}>{fmt(b, perSeason)}</span>
    </div>
  )
}

// Hero column for one player: chips + display name, or a search box to pick one.
function Slot({ side, player, stats, onPick, other }) {
  const [editing, setEditing] = useState(!player)
  const [q, setQ] = useState('')
  const [dir, setDir] = useState(null)
  const box = useRef(null)
  useEffect(() => { setEditing(!player) }, [player && player.id])
  useEffect(() => { if (editing && !dir) loadPlayerDir().then(setDir) }, [editing, dir])
  useEffect(() => {
    const h = (e) => { if (player && box.current && !box.current.contains(e.target)) setEditing(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [player])
  const hits = useMemo(() => dir && q.trim().length >= 2 ? matchPlayers(dir, q, 6, { fuzzy: q.trim().length >= 5 }).filter(h => !other || h.id !== other.id) : [], [dir, q, other])
  const right = side === 1
  const words = player ? player.name.split(/\s+/) : []
  const first = words.length > 1 ? words.slice(0, -1).join(' ') : '', last = words[words.length - 1] || ''
  const span = player ? seasonLabel(player.minYear, player.sport) + (player.maxYear !== player.minYear ? ' → ' + seasonLabel(player.maxYear, player.sport) : '') : ''
  return (
    <div ref={box} style={{ minWidth: 0, position: 'relative', textAlign: right ? 'right' : 'left' }}>
      {player && !editing ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, justifyContent: right ? 'flex-end' : 'flex-start' }}>
            <span style={chip(SPORT_COLORS[player.sport] || ACCENT)}>{player.sport}</span>
            {stats && stats.topTeam && <span className="hq-cmp-chip" style={chip()}>{stats.topTeam}</span>}
            {span && <span className="hq-cmp-chip" style={chip()}>{span}</span>}
          </div>
          <h2 style={{ ...display, fontSize: 'clamp(22px, 5.5vw, 56px)', lineHeight: 0.92, margin: 0, color: TXT[side], overflowWrap: 'normal' }}>{first}{first && <br />}{last}</h2>
          {/* on phones the team / season chips are too wide for half the hero: show them as a line instead */}
          <p className="hq-cmp-sub" style={{ display: 'none', margin: '6px 0 0', color: DIM, fontSize: 12, lineHeight: 1.4 }}>{[stats && stats.topTeam, span].filter(Boolean).join(' · ')}</p>
          <button onClick={() => { setQ(''); setEditing(true) }} style={{ ...buttonText, marginTop: 12, background: 'transparent', border: '1px solid #2E3D6B', color: '#D4D4D8', borderRadius: 10, padding: '0 14px', height: 36, fontSize: 13, cursor: 'pointer' }}>Change</button>
        </>
      ) : (
        <>
          <label htmlFor={'cmp-' + side} style={{ ...eyebrow, display: 'block', margin: '0 0 8px', color: TXT[side] }}>{right ? 'Player 2' : 'Player 1'}</label>
          <input id={'cmp-' + side} autoFocus={!!player || right} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…"
            onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { onPick(hits[0]); setQ('') } if (e.key === 'Escape' && player) setEditing(false) }}
            style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid #2E3D6B', borderRadius: 10, padding: '12px 14px', color: '#EDEDEF', fontSize: 16, fontFamily: 'inherit', outline: 'none', textAlign: 'left' }} />
          {hits.length > 0 && (
            <div role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 40, background: '#0F1320', border: '1px solid #232A3E', borderRadius: 10, overflow: 'hidden', textAlign: 'left', boxShadow: '0 20px 40px -12px #000' }}>
              {hits.map(h => (
                <button key={h.id} role="option" onClick={() => { onPick(h); setQ('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid #1A1F31', padding: '9px 12px', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</span>
                  <span style={{ display: 'block', color: DIM, fontSize: 12 }}>{h.sport} · {h.cards.toLocaleString()} card{h.cards === 1 ? '' : 's'} · {h.minYear}{h.maxYear !== h.minYear ? '–' + h.maxYear : ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ComparePage({ names, sets, onChange, onOpenSet, onOpenPlayer }) {
  const [players, setPlayers] = useState([null, null])
  const [missing, setMissing] = useState([])
  const [perSeason, setPerSeason] = useState(false)
  const [sharedLimit, setSharedLimit] = useState(8)
  const [copied, setCopied] = useState('')

  // URL names -> players (only re-resolve names that changed).
  useEffect(() => {
    let live = true
    Promise.all(names.map((n, i) => players[i] && players[i].name === n ? players[i] : resolvePlayer(n))).then(ps => {
      if (!live) return
      setPlayers(ps)
      setMissing(names.filter((n, i) => n && !ps[i]))
    })
    return () => { live = false }
  }, [names[0], names[1]])

  const setMeta = useMemo(() => { const m = {}; for (const s of sets) m[s.slug] = s; return m }, [sets])
  const rowsA = useRows(players[0], setMeta), rowsB = useRows(players[1], setMeta)
  const ready = rowsA && rowsB
  const sA = useMemo(() => rowsA ? statsOf(rowsA) : null, [rowsA])
  const sB = useMemo(() => rowsB ? statsOf(rowsB) : null, [rowsB])
  const pick = (i, p) => { const n = players.map(x => x && x.name); n[i] = p.name; onChange(n) }
  const swap = () => onChange([players[1] && players[1].name, players[0] && players[0].name])

  const metrics = useMemo(() => ready ? METRICS.filter(([k]) => k !== 'shield' || sA.shield || sB.shield) : [], [ready, sA, sB])
  const val = (s, k) => perSeason && k !== 'seasons' ? s[k] / Math.max(1, s.seasons) : s[k]
  const wins = useMemo(() => {
    const w = [0, 0]
    // the headline counts what the rows show (totals, or per season in Per-year mode)
    for (const [k] of metrics) { const a = val(sA, k), b = val(sB, k); if (a > b) w[0]++; else if (b > a) w[1]++ }
    return w
  }, [metrics, sA, sB, perSeason])

  // Sets both players appear in, biggest overlap first.
  const shared = useMemo(() => {
    if (!ready) return []
    const count = (rows) => { const m = new Map(); for (const r of rows) m.set(r.slug, (m.get(r.slug) || 0) + 1); return m }
    const ca = count(rowsA), cb = count(rowsB)
    return [...ca.keys()].filter(k => cb.has(k)).map(slug => ({ slug, name: (setMeta[slug] || {}).name || slug, year: (setMeta[slug] || {}).year || 0, a: ca.get(slug), b: cb.get(slug) }))
      .sort((x, y) => (y.a + y.b) - (x.a + x.b) || y.year - x.year)
  }, [rowsA, rowsB, ready, setMeta])
  // Cards printed with both players on them (dual autos, combo inserts).
  const together = useMemo(() => {
    if (!ready) return []
    const key = (r) => r.slug + '|' + r.section + '|' + r.n
    const b = new Set(rowsB.filter(r => r.type & TYPE.MULTI).map(key))
    const seen = new Set(), out = []
    for (const r of rowsA) { if (!(r.type & TYPE.MULTI)) continue; const k = key(r); if (b.has(k) && !seen.has(k)) { seen.add(k); out.push(r) } }
    return out.sort((x, y) => (x.serial || 1e9) - (y.serial || 1e9) || y.year - x.year)
  }, [rowsA, rowsB, ready])
  const years = useMemo(() => ready ? [...new Set([...sA.years.keys(), ...sB.years.keys()])].sort((a, b) => a - b) : [], [ready, sA, sB])
  const yearMax = useMemo(() => ready ? Math.max(1, ...sA.years.values(), ...sB.years.values()) : 1, [ready, sA, sB])

  const nm = players.map(p => p ? p.name : '')
  const sportOf = (players[0] || players[1] || {}).sport
  const crossSport = players[0] && players[1] && players[0].sport !== players[1].sport
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied('Link copied ✓') } catch { window.prompt('Copy this link:', location.href) }
    setTimeout(() => setCopied(''), 2000)
  }
  const leader = wins[0] === wins[1] ? null : wins[0] > wins[1] ? 0 : 1

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* page heading for screen readers and outlines; the hero shows the names visually */}
      <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', margin: 0 }}>{nm.filter(Boolean).join(' vs ') || 'Compare players'}</h1>
      {/* HERO */}
      <div className="hq-panel" style={{ background: 'linear-gradient(140deg, #191919, #0F1320)', border: '1px solid #232A3E', borderRadius: 18, padding: 'clamp(18px, 3vw, 26px) clamp(16px, 3vw, 28px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 'clamp(10px, 2vw, 20px)', alignItems: 'end' }}>
        <Slot side={0} player={players[0]} stats={sA} other={players[1]} onPick={(p) => pick(0, p)} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, alignSelf: 'center' }}>
          <span style={{ ...display, fontSize: 'clamp(26px, 4vw, 40px)', color: ACCENT_TEXT }}>VS</span>
          {players[0] && players[1] && <button onClick={swap} aria-label="Swap players" title="Swap sides" style={{ background: 'transparent', border: '1px solid #232A3E', color: '#A1A1AA', borderRadius: 10, width: 44, height: 44, cursor: 'pointer', fontSize: 16 }}>⇄</button>}
        </div>
        <Slot side={1} player={players[1]} stats={sB} other={players[0]} onPick={(p) => pick(1, p)} />
      </div>
      {missing.length > 0 && <p style={{ color: '#FCA5A5', fontSize: 13, margin: 0, textAlign: 'center' }}>No player called “{missing.join('”, “')}” in the database.</p>}
      {players[0] && players[1] && !ready && <p style={{ color: DIM, fontSize: 14, margin: '20px 0', textAlign: 'center' }}>Loading cards…</p>}

      {ready && (
        <>
          {/* CONTROLS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Show totals or per year of sets">
              <button onClick={() => setPerSeason(false)} style={pill(!perSeason)} aria-pressed={!perSeason}>Totals</button>
              <button onClick={() => setPerSeason(true)} style={pill(perSeason)} aria-pressed={perSeason}>Per year</button>
              <button onClick={copyLink} style={pill(false)}>{copied || 'Copy link'}</button>
            </div>
            <p style={{ ...eyebrow, fontSize: 15, margin: 0, color: DIM }}>
              {leader == null ? <>Even · <span style={{ color: '#EDEDEF' }}>{wins[0]}</span> each</>
                : <>{lastName(nm[leader])} leads <span style={{ color: '#EDEDEF' }}>{wins[leader]}</span> of {metrics.length} · {lastName(nm[1 - leader])} <span style={{ color: '#EDEDEF' }}>{wins[1 - leader]}</span></>}
            </p>
          </div>
          {perSeason && <p style={{ color: DIM, fontSize: 13, margin: 0 }}>Averages per year with sets ({sA.seasons} for {lastName(nm[0])}, {sB.seasons} for {lastName(nm[1])}). Card years include releases after a player retires, so they aren't playing seasons.</p>}
          {crossSport && <p style={{ color: DIM, fontSize: 13, margin: 0 }}>Different sports: hobby sizes differ, so read the gaps with that in mind.</p>}

          {/* STAT ROWS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {metrics.map(([k, t]) => <StatRow key={k} title={t} a={val(sA, k)} b={val(sB, k)} names={nm} perSeason={perSeason && k !== 'seasons'} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={() => onOpenPlayer(nm[0])} style={{ ...linkBtn, color: TXT[0], fontSize: 13 }}>All {nm[0]} cards →</button>
            <button onClick={() => onOpenPlayer(nm[1])} style={{ ...linkBtn, color: TXT[1], fontSize: 13 }}>All {nm[1]} cards →</button>
          </div>

          {/* SHARED SETS + CARDS WITH BOTH */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14, alignItems: 'start' }}>
            <section style={{ ...tile, padding: '18px 20px' }}>
              <p style={{ ...display, margin: 0, fontSize: 40, lineHeight: 1 }}>{shared.length.toLocaleString()}</p>
              <p style={{ ...eyebrow, margin: '6px 0 14px', color: DIM }}>Sets with both</p>
              {shared.length === 0 ? <p style={{ color: DIM, fontSize: 14, margin: 0 }}>They don’t share any sets.</p> : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 76px 76px', gap: 8, padding: '0 0 6px', ...eyebrow, fontSize: 12 }}>
                    <span style={{ color: DIM }}>Set</span>
                    <span style={{ textAlign: 'right', color: TXT[0] }}>{lastName(nm[0])}</span>
                    <span style={{ textAlign: 'right', color: TXT[1] }}>{lastName(nm[1])}</span>
                  </div>
                  {shared.slice(0, sharedLimit).map(s => (
                    <div key={s.slug} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 76px 76px', gap: 8, padding: '9px 0', borderTop: '1px solid #1A1F31', fontSize: 14, alignItems: 'center' }}>
                      <button onClick={() => onOpenSet(s.slug)} style={{ ...linkBtn, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>{s.name}</button>
                      <span style={{ textAlign: 'right', color: TXT[0], fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.a.toLocaleString()}</span>
                      <span style={{ textAlign: 'right', color: TXT[1], fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.b.toLocaleString()}</span>
                    </div>
                  ))}
                  {shared.length > sharedLimit && <button onClick={() => setSharedLimit(l => l + 25)} style={{ ...pill(false), marginTop: 10 }}>Show more · {(shared.length - sharedLimit).toLocaleString()}</button>}
                </>
              )}
            </section>
            <section style={{ ...tile, padding: '18px 20px' }}>
              <p style={{ ...display, margin: 0, fontSize: 40, lineHeight: 1 }}>{together.length.toLocaleString()}</p>
              <p style={{ ...eyebrow, margin: '6px 0 14px', color: DIM }}>Cards featuring both</p>
              {together.length === 0 ? <p style={{ color: DIM, fontSize: 14, margin: 0 }}>No cards list both players.</p> : (
                <>
                  {together.slice(0, 40).map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: '1px solid #1A1F31', fontSize: 14 }}>
                      <span style={{ minWidth: 0 }}>
                        <button onClick={() => onOpenSet(r.slug)} style={linkBtn}>{seasonLabel(r.year, r.sport)} {r.set.replace(/^\d{4}(-\d{2})?\s*/, '')}</button>
                        <span style={{ display: 'block', color: DIM, fontSize: 12 }}>{r.section}</span>
                      </span>
                      <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ color: ACCENT_TEXT, fontWeight: 700 }}>{r.n ? '#' + r.n : ''}</span>
                        {r.serial > 0 && <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: r.serial === 1 ? '#fff' : '#D4D4D8' }}>{r.serial === 1 ? '1/1' : '/' + r.serial}</span>}
                      </span>
                    </div>
                  ))}
                  {together.length > 40 && <p style={{ color: DIM, fontSize: 12, margin: '8px 0 0' }}>The 40 rarest of {together.length.toLocaleString()}.</p>}
                </>
              )}
            </section>
          </div>

          {/* CARDS BY SEASON */}
          {years.length > 0 && (
            <section style={{ ...tile, padding: '18px 20px' }}>
              <p style={{ ...eyebrow, margin: '0 0 12px', color: DIM }}>Cards by season</p>
              {years.map(y => {
                const a = sA.years.get(y) || 0, b = sB.years.get(y) || 0
                return (
                  <div key={y} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 64px 1fr 52px', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: a ? TXT[0] : DIM, fontWeight: 600 }}>{a ? a.toLocaleString() : '—'}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: (a / yearMax * 100) + '%', height: 8, borderRadius: 2, background: BAR[0] }} /></div>
                    <span style={{ ...eyebrow, fontSize: 13, color: '#A3ABBD', textAlign: 'center' }}>{crossSport ? String(y) : seasonLabel(y, sportOf)}</span>
                    <div><div style={{ width: (b / yearMax * 100) + '%', height: 8, borderRadius: 2, background: BAR[1] }} /></div>
                    <span style={{ color: b ? TXT[1] : DIM, textAlign: 'right', fontWeight: 600 }}>{b ? b.toLocaleString() : '—'}</span>
                  </div>
                )
              })}
            </section>
          )}
          <p style={{ color: DIM, fontSize: 12, margin: 0 }}>Counts come from the checklists on CardHQ; sets still being repaired can undercount a player.</p>
        </>
      )}
    </section>
  )
}
