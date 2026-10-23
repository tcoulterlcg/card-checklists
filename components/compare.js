'use client'
// Player vs player: two players' card catalogues side by side.
//   ?compare=Nikita+Kucherov&vs=Jack+Hughes
// Diverging bars per stat (totals or per season), season-by-season counts,
// the sets both players appear in, and cards that feature both of them.
// Data: the same player directory + shards as the player page (components/player.js).
import { useEffect, useMemo, useRef, useState } from 'react'
import { TYPE, norm, matchPlayers, memKind } from '../lib/query'
import { PAR, parallelKinds } from '../lib/parallels'
import { loadPlayerDir, loadTopPlayers, loadShard, seasonLabel } from './player'
import { ACCENT, ACCENT_TEXT, display, eyebrow, buttonText } from '../lib/theme'

const SIDE = ['#F97316', '#3B82F6']        // left player orange, right player blue
const SIDE_TEXT = ['#FB923C', '#7FA2FF']

// Name from a shared link -> directory entry. Same lookup as the player page:
// the 100 KB top list first, then the full directory.
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
  useEffect(() => { setShard(null); if (player) loadShard(player.shard).then(setShard) }, [player && player.id, player && player.shard])
  return useMemo(() => {
    if (!player || !shard) return null
    const out = []
    for (const r of shard.rows) {
      if (r[0] !== player.id) continue
      const slug = shard.slugs[r[1]], section = shard.sections[r[2]]
      const m = setMeta[slug] || { name: slug, year: 0, sport: '' }
      out.push({ slug, set: m.name, year: m.year, sport: m.sport, section, n: r[3], serial: r[5], type: r[6], mem: r[7] || 0, par: parallelKinds(section, m.sport, m.name, m.year) })
    }
    return out
  }, [player, shard, setMeta])
}

function statsOf(rows) {
  const s = { cards: rows.length, sets: new Set(), au: 0, one: 0, rc: 0, patch: 0, pa: 0, rpa: 0, gu: 0, rare: 0, shield: 0, years: new Map() }
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
  }
  s.setCount = s.sets.size
  s.seasons = s.years.size
  return s
}

const METRICS = [
  ['cards', 'Cards'], ['setCount', 'Sets'], ['au', 'Autographs'], ['one', '1/1s'], ['rc', 'Rookie cards'],
  ['patch', 'Patches'], ['pa', 'Patch autos'], ['rpa', 'RPAs'], ['gu', 'Game-used'], ['rare', '/25 or rarer'], ['shield', 'Shields']
]
const fmt = (v, perSeason) => perSeason ? (v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(1)) : Math.round(v).toLocaleString()
const short = (name) => name.split(/\s+/).slice(-1)[0]

// One stat row: numbers at both ends, bars growing out from the centre line.
function Diverge({ label, a, b, names, perSeason, sub }) {
  const max = Math.max(a, b, 1e-9)
  const diff = a - b, lead = diff > 0 ? 0 : diff < 0 ? 1 : -1
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, 96px) 1fr minmax(64px, 96px)', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid #1A1F31' }}>
      <span style={{ ...display, fontSize: 'clamp(22px, 4vw, 32px)', color: lead === 0 ? SIDE_TEXT[0] : '#A1A1AA', fontVariantNumeric: 'tabular-nums' }}>{fmt(a, perSeason)}</span>
      <div>
        <p style={{ ...eyebrow, margin: '0 0 6px', textAlign: 'center', color: '#D4D4D8' }}>{label}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2px 1fr', alignItems: 'center', height: 8 }} aria-hidden="true">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: (a / max * 100) + '%', height: 6, borderRadius: '3px 0 0 3px', background: SIDE[0], opacity: lead === 1 ? 0.45 : 1, transition: 'width .3s' }} /></div>
          <div style={{ height: 14, background: '#8A93A8' }} />
          <div><div style={{ width: (b / max * 100) + '%', height: 6, borderRadius: '0 3px 3px 0', background: SIDE[1], opacity: lead === 0 ? 0.45 : 1, transition: 'width .3s' }} /></div>
        </div>
        <p style={{ margin: '6px 0 0', textAlign: 'center', color: '#8A93A8', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          {lead < 0 ? 'Even' : '+' + fmt(Math.abs(diff), perSeason) + ' · ' + short(names[lead])}{sub ? ' · ' + sub : ''}
        </p>
      </div>
      <span style={{ ...display, fontSize: 'clamp(22px, 4vw, 32px)', color: lead === 1 ? SIDE_TEXT[1] : '#A1A1AA', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(b, perSeason)}</span>
    </div>
  )
}

// Player slot: shows the chosen player, or a search box to pick one.
function Slot({ side, player, onPick, other }) {
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
  const c = SIDE[side]
  return (
    <div ref={box} style={{ flex: '1 1 0', minWidth: 0, position: 'relative', textAlign: side ? 'right' : 'left' }}>
      {player && !editing ? (
        <>
          <p style={{ ...eyebrow, margin: '0 0 6px', color: '#8A93A8' }}>{player.sport} · {seasonLabel(player.minYear, player.sport)}{player.maxYear !== player.minYear ? ' → ' + seasonLabel(player.maxYear, player.sport) : ''}</p>
          <h2 style={{ ...display, fontSize: 'clamp(22px, 4.5vw, 44px)', margin: 0, color: c, overflowWrap: 'break-word', hyphens: 'none' }}>{player.name}</h2>
          <button onClick={() => { setQ(''); setEditing(true) }} style={{ ...buttonText, marginTop: 8, background: 'none', border: '1px solid #2E3D6B', color: '#D4D4D8', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>Change</button>
        </>
      ) : (
        <>
          <label style={{ ...eyebrow, display: 'block', margin: '0 0 6px', color: c }}>{side ? 'Player 2' : 'Player 1'}</label>
          <input autoFocus={!!player || side === 1} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a player…"
            onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { onPick(hits[0]); setQ('') } if (e.key === 'Escape' && player) setEditing(false) }}
            style={{ width: '100%', boxSizing: 'border-box', background: '#121626', border: '1px solid ' + c + '88', borderRadius: 10, padding: '12px 14px', color: '#EDEDEF', fontSize: 16, fontFamily: 'inherit', outline: 'none', textAlign: 'left' }} />
          {hits.length > 0 && (
            <div role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, zIndex: 40, background: '#0F1320', border: '1px solid #232A3E', borderRadius: 10, overflow: 'hidden', textAlign: 'left', boxShadow: '0 20px 40px -12px #000' }}>
              {hits.map(h => (
                <button key={h.id} role="option" onClick={() => { onPick(h); setQ('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderTop: '1px solid #1A1F31', padding: '9px 12px', color: '#EDEDEF', cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</span>
                  <span style={{ display: 'block', color: '#8A93A8', fontSize: 12 }}>{h.sport} · {h.cards.toLocaleString()} cards · {h.minYear}{h.maxYear !== h.minYear ? '–' + h.maxYear : ''}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const card = { background: '#0F1320', border: '1px solid #232A3E', borderRadius: 16, padding: '20px 22px', marginTop: 18 }
const pill = (on) => ({ ...buttonText, padding: '7px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer', background: on ? ACCENT : '#121626', color: on ? '#fff' : '#A1A1AA', border: '1px solid ' + (on ? 'transparent' : '#232A3E') })
const linkBtn = { background: 'none', border: 'none', padding: 0, color: '#EDEDEF', fontWeight: 600, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: 14 }

export function ComparePage({ names, sets, onChange, onOpenSet, onOpenPlayer }) {
  const [players, setPlayers] = useState([null, null])
  const [missing, setMissing] = useState([])
  const [perSeason, setPerSeason] = useState(false)
  const [sharedLimit, setSharedLimit] = useState(10)
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
  const st = useMemo(() => ready ? [statsOf(rowsA), statsOf(rowsB)] : null, [rowsA, rowsB, ready])
  const pick = (i, p) => { const n = players.map(x => x && x.name); n[i] = p.name; onChange(n) }
  const swap = () => onChange([players[1] && players[1].name, players[0] && players[0].name])

  // Sets both players appear in, biggest overlap first.
  const shared = useMemo(() => {
    if (!ready) return []
    const count = (rows) => { const m = new Map(); for (const r of rows) m.set(r.slug, (m.get(r.slug) || 0) + 1); return m }
    const ca = count(rowsA), cb = count(rowsB)
    return [...ca.keys()].filter(k => cb.has(k)).map(slug => ({ slug, name: (setMeta[slug] || {}).name || slug, year: (setMeta[slug] || {}).year || 0, sport: (setMeta[slug] || {}).sport, a: ca.get(slug), b: cb.get(slug) }))
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
  const years = useMemo(() => st ? [...new Set([...st[0].years.keys(), ...st[1].years.keys()])].sort((a, b) => a - b) : [], [st])
  const yearMax = useMemo(() => st ? Math.max(1, ...st[0].years.values(), ...st[1].years.values()) : 1, [st])

  const nm = players.map(p => p ? p.name : '')
  const sportOf = (players[0] || players[1] || {}).sport
  const crossSport = players[0] && players[1] && players[0].sport !== players[1].sport
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied('Link copied ✓') } catch { window.prompt('Copy this link:', location.href) }
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <section>
      <div className="hq-panel" style={{ background: 'linear-gradient(140deg, #191919, #0F1320)', border: '1px solid #232A3E', borderRadius: 18, padding: '22px 24px' }}>
        <p style={{ ...eyebrow, margin: '0 0 14px', color: '#8A93A8', textAlign: 'center' }}>Player comparison</p>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Slot side={0} player={players[0]} other={players[1]} onPick={(p) => pick(0, p)} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 26, flexShrink: 0 }}>
            <span style={{ ...display, fontSize: 24, color: '#EDEDEF' }}>VS</span>
            {players[0] && players[1] && <button onClick={swap} aria-label="Swap players" title="Swap sides" style={{ background: 'none', border: '1px solid #232A3E', color: '#A1A1AA', borderRadius: 8, width: 34, height: 34, cursor: 'pointer' }}>⇄</button>}
          </div>
          <Slot side={1} player={players[1]} other={players[0]} onPick={(p) => pick(1, p)} />
        </div>
        {missing.length > 0 && <p style={{ color: '#FCA5A5', fontSize: 13, margin: '14px 0 0', textAlign: 'center' }}>No player called “{missing.join('”, “')}” in the database.</p>}
      </div>

      {players[0] && players[1] && !ready && <p style={{ color: '#8A93A8', fontSize: 14, margin: '20px 0', textAlign: 'center' }}>Loading cards…</p>}

      {st && (
        <>
          <div style={card}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', gap: 6 }} role="group" aria-label="Show totals or per season">
                <button onClick={() => setPerSeason(false)} style={pill(!perSeason)} aria-pressed={!perSeason}>Totals</button>
                <button onClick={() => setPerSeason(true)} style={pill(perSeason)} aria-pressed={perSeason}>Per season</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={copyLink} style={{ ...pill(false), color: '#D4D4D8' }}>{copied || 'Copy link'}</button>
              </div>
            </div>
            {perSeason && <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 6px' }}>Averages per season with cards: {st[0].seasons} for {short(nm[0])}, {st[1].seasons} for {short(nm[1])}. Evens out career length.</p>}
            {crossSport && <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 6px' }}>Different sports: hobby sizes differ, so read the gap with that in mind.</p>}
            {METRICS.filter(([k]) => k !== 'shield' || st[0].shield || st[1].shield).map(([k, label]) => {
              const div = (s) => perSeason ? s[k] / Math.max(1, s.seasons) : s[k]
              return <Diverge key={k} label={label} a={div(st[0])} b={div(st[1])} names={nm} perSeason={perSeason} />
            })}
            <Diverge label="Seasons with cards" a={st[0].seasons} b={st[1].seasons} names={nm} perSeason={false} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
              <button onClick={() => onOpenPlayer(nm[0])} style={{ ...linkBtn, color: SIDE_TEXT[0], fontSize: 13 }}>All {nm[0]} cards →</button>
              <button onClick={() => onOpenPlayer(nm[1])} style={{ ...linkBtn, color: SIDE_TEXT[1], fontSize: 13 }}>All {nm[1]} cards →</button>
            </div>
          </div>

          {years.length > 0 && (
            <div style={card}>
              <h3 style={{ ...eyebrow, margin: '0 0 4px', color: '#D4D4D8' }}>Cards by season</h3>
              <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 10px' }}>Bars scale to the busiest season either player had.</p>
              {years.map(y => {
                const a = st[0].years.get(y) || 0, b = st[1].years.get(y) || 0
                return (
                  <div key={y} style={{ display: 'grid', gridTemplateColumns: '56px 1fr 72px 1fr 56px', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ color: a ? SIDE_TEXT[0] : '#3F4659' }}>{a ? a.toLocaleString() : '—'}</span>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><div style={{ width: (a / yearMax * 100) + '%', height: 10, borderRadius: '3px 0 0 3px', background: SIDE[0] }} /></div>
                    <span style={{ color: '#A1A1AA', textAlign: 'center' }}>{seasonLabel(y, sportOf)}</span>
                    <div><div style={{ width: (b / yearMax * 100) + '%', height: 10, borderRadius: '0 3px 3px 0', background: SIDE[1] }} /></div>
                    <span style={{ color: b ? SIDE_TEXT[1] : '#3F4659', textAlign: 'right' }}>{b ? b.toLocaleString() : '—'}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={card}>
            <h3 style={{ ...eyebrow, margin: '0 0 4px', color: '#D4D4D8' }}>Sets with both players · {shared.length.toLocaleString()}</h3>
            <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 10px' }}>Products where one box gives you a shot at either.</p>
            {shared.length === 0 ? <p style={{ color: '#8A93A8', fontSize: 14, margin: 0 }}>They don’t share any sets.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead><tr style={{ color: '#8A8A93', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Set</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: SIDE_TEXT[0] }}>{short(nm[0])}</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: SIDE_TEXT[1] }}>{short(nm[1])}</th>
                  </tr></thead>
                  <tbody>{shared.slice(0, sharedLimit).map(s => (
                    <tr key={s.slug} style={{ borderTop: '1px solid #1A1F31' }}>
                      <td style={{ padding: '8px' }}><button onClick={() => onOpenSet(s.slug)} style={linkBtn}>{s.name}</button></td>
                      <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.a.toLocaleString()}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.b.toLocaleString()}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {shared.length > sharedLimit && <button onClick={() => setSharedLimit(l => l + 25)} style={{ ...pill(false), marginTop: 10 }}>Show more ({(shared.length - sharedLimit).toLocaleString()} left)</button>}
              </div>
            )}
          </div>

          <div style={card}>
            <h3 style={{ ...eyebrow, margin: '0 0 4px', color: '#D4D4D8' }}>Cards featuring both · {together.length.toLocaleString()}</h3>
            <p style={{ color: '#8A93A8', fontSize: 12, margin: '0 0 10px' }}>Dual autos, dual patches and combo cards, rarest first.</p>
            {together.length === 0 ? <p style={{ color: '#8A93A8', fontSize: 14, margin: 0 }}>No cards list both players.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>{together.slice(0, 60).map((r, i) => (
                    <tr key={i} style={{ borderTop: i ? '1px solid #1A1F31' : 'none' }}>
                      <td style={{ padding: '8px', color: '#A1A1AA', whiteSpace: 'nowrap' }}>{seasonLabel(r.year, r.sport)}</td>
                      <td style={{ padding: '8px' }}><button onClick={() => onOpenSet(r.slug)} style={linkBtn}>{r.set.replace(/^\d{4}(-\d{2})?\s*/, '')}</button><span style={{ display: 'block', color: '#8A93A8', fontSize: 12 }}>{r.section}</span></td>
                      <td style={{ padding: '8px', color: ACCENT_TEXT, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.n ? '#' + r.n : '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>{r.serial === 1 ? '1/1' : r.serial > 0 ? '/' + r.serial : ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {together.length > 60 && <p style={{ color: '#8A93A8', fontSize: 12, margin: '8px 0 0' }}>Showing the 60 rarest of {together.length.toLocaleString()}.</p>}
              </div>
            )}
          </div>
          <p style={{ color: '#8A93A8', fontSize: 12, margin: '14px 0 0' }}>Counts come from the checklists on CardHQ; sets still being repaired can undercount a player.</p>
        </>
      )}
    </section>
  )
}
