'use client'
// The Grid — CardHQ's take on Immaculate Grid, built on our checklists.
//   ?view=grid&mode=hockey            today's Hockey grid (same for everyone, new each day)
//   ?view=grid&mode=hockey&seed=123   a random grid (shareable)
// Each square is a row category x a column category; answer with a player (or character)
// who has a card matching both. 9 guesses, each player once. Data: public/data/grid/
// (scripts/build-grid-index.mjs) — every square shown has at least 3 answers.
import { useEffect, useMemo, useRef, useState } from 'react'
import { norm } from '../lib/query'
import { ACCENT, ACCENT_TEXT, SURFACE, SURFACE_2, LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'

const GOOD = '#22c55e', BAD = '#ef4444'
const okJson = (r) => { if (!r.ok) throw new Error(r.status); return r.json() }
const cache = new Map()
const load = (path) => {
  if (!cache.has(path)) cache.set(path, fetch('/data/grid/' + path).then(okJson).catch(e => { cache.delete(path); throw e }))
  return cache.get(path)
}

const KIND_LABEL = { team: 'Team', product: 'Product', brand: 'Brand', decade: 'Decade', type: 'Card', sport: 'Sport', series: 'Era', variant: 'Variant' }
const WEIGHT = { team: 6, product: 3, brand: 1.2, decade: 1.5, type: 1.5, sport: 2, series: 3, variant: 2 }
const MAX_KIND = { type: 2, decade: 2, brand: 2, sport: 3, variant: 2 }   // per whole grid

// ---------- seeded random ----------
function rng(seed) {
  let a = seed >>> 0
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const hashStr = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) } return h >>> 0 }
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }
const key = (a, b) => Math.min(a, b) + '-' + Math.max(a, b)

// Pick 3 rows + 3 columns where all 9 squares have answers.
function makeGrid(data, seed) {
  const rand = rng(seed)
  const n = data.cats.length
  const partners = Array.from({ length: n }, () => new Set())
  for (const k of Object.keys(data.cells)) { const [a, b] = k.split('-').map(Number); partners[a].add(b); partners[b].add(a) }
  const kindOf = (c) => data.cats[c][0]
  const pick = (list) => {
    let tot = 0; for (const c of list) tot += WEIGHT[kindOf(c)] || 1
    let r = rand() * tot
    for (const c of list) { r -= WEIGHT[kindOf(c)] || 1; if (r <= 0) return c }
    return list[list.length - 1]
  }
  const kindsOk = (cs) => { const k = {}; for (const c of cs) { const x = kindOf(c); k[x] = (k[x] || 0) + 1; if (MAX_KIND[x] && k[x] > MAX_KIND[x]) return false } return true }
  const all = [...Array(n).keys()].filter(c => partners[c].size >= 3)
  for (let tries = 0; tries < 4000; tries++) {
    const c1 = pick(all)
    const rowPool = [...partners[c1]]
    if (rowPool.length < 3) continue
    const rows = []
    for (let i = 0; i < 12 && rows.length < 3; i++) { const r = pick(rowPool.filter(x => !rows.includes(x))); if (r != null) rows.push(r) }
    if (rows.length < 3) continue
    const common = [...partners[rows[0]]].filter(c => !rows.includes(c) && partners[rows[1]].has(c) && partners[rows[2]].has(c))
    if (common.length < 3) continue
    const cols = [c1]
    for (let i = 0; i < 12 && cols.length < 3; i++) { const c = pick(common.filter(x => !cols.includes(x))); if (c != null && !cols.includes(c)) cols.push(c) }
    if (cols.length < 3 || !kindsOk([...rows, ...cols])) continue
    // the same kind on both axes only for teams (career) and card types
    const rk = new Set(rows.map(kindOf)), ck = new Set(cols.map(kindOf))
    if ([...rk].some(k => ck.has(k) && k !== 'team' && k !== 'type')) continue
    if (rand() < 0.5) return { rows, cols }
    return { rows: cols, cols: rows }
  }
  return null
}

// ---------- page ----------
export function GridGame({ mode: modeProp, seed: seedProp, onChange }) {
  const [modes, setModes] = useState(null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const mode = modeProp || 'hockey'
  const daily = !seedProp
  const seed = daily ? hashStr(mode + '|' + today()) : Number(seedProp) >>> 0
  const stateKey = 'hq.grid.v1.' + mode + '.' + (daily ? today() : 's' + seed)

  useEffect(() => { load('modes.json').then(m => setModes(m.modes)).catch(() => setErr('The grid isn’t available right now. Try again in a minute.')) }, [])
  useEffect(() => {
    let live = true
    setData(null)
    load(mode + '.json').then(d => { if (live) setData(d) }).catch(() => { if (live) setErr('No grid for this mode yet.') })
    return () => { live = false }
  }, [mode])

  const grid = useMemo(() => data ? makeGrid(data, seed) : null, [data, seed])
  const group = modes?.find(m => m.id === mode)?.group || (['pokemon', 'yugioh', 'magic', 'onepiece', 'lorcana'].includes(mode) ? 'tcg' : 'sport')

  // game state: picks { "r-c": player name } (names survive data rebuilds), left, misses
  const blank = { picks: {}, left: 9, misses: [], gaveUp: false }
  const [st, setSt] = useState(blank)
  useEffect(() => {
    let s = blank
    try { const v = JSON.parse(localStorage.getItem(stateKey) || 'null'); if (v && typeof v.left === 'number') s = v } catch {}
    setSt(s)
  }, [stateKey])
  const save = (s) => { setSt(s); try { localStorage.setItem(stateKey, JSON.stringify(s)) } catch {} }

  const [open, setOpen] = useState(null)   // [r, c] being guessed
  const [flash, setFlash] = useState('')
  const filled = Object.keys(st.picks).length
  const done = st.left <= 0 || filled === 9 || st.gaveUp
  const [showAll, setShowAll] = useState(false)
  useEffect(() => { setShowAll(false); setOpen(null); setFlash('') }, [stateKey])

  const answers = (r, c) => data.cells[key(grid.rows[r], grid.cols[c])] || []
  const used = new Set(Object.values(st.picks))

  function guess(pi) {
    const [r, c] = open
    const ok = answers(r, c).includes(pi)
    const name = data.players[pi][0]
    const s = { ...st, left: st.left - 1, picks: { ...st.picks }, misses: [...st.misses] }
    if (ok) s.picks[r + '-' + c] = name
    else s.misses.push(name)
    save(s)
    setOpen(null)
    setFlash(ok ? '' : name + ' doesn’t fit that square.')
  }

  function newRandom() { onChange({ mode, seed: String(Math.floor(Math.random() * 2 ** 31)) }) }

  function share() {
    const lines = [0, 1, 2].map(r => [0, 1, 2].map(c => st.picks[r + '-' + c] != null ? '🟩' : '⬜').join('')).join('\n')
    const label = modes?.find(m => m.id === mode)?.label || mode
    const url = location.origin + '/?view=grid&mode=' + mode + (daily ? '' : '&seed=' + seed)
    const text = 'CardHQ Grid · ' + label + (daily ? ' · ' + today() : '') + '\n' + filled + '/9\n' + lines + '\n' + url
    try { navigator.clipboard.writeText(text); setFlash('Result copied — paste it anywhere.') } catch { setFlash(text) }
  }

  const pill = (on) => ({ minHeight: 40, padding: '0 16px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, ...buttonText, background: on ? ACCENT : SURFACE, color: on ? '#fff' : '#C9CCD6', border: '1px solid ' + (on ? ACCENT : LINE) })
  const groupModes = (modes || []).filter(m => m.group === group)
  const firstOf = (g) => (modes || []).find(m => m.group === g)?.id

  return (
    <section style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ ...eyebrow, color: ACCENT_TEXT }}>Daily game</div>
      <h1 style={{ ...display, fontSize: 'clamp(36px, 7vw, 56px)', margin: '6px 0 8px', color: TEXT }}>The Grid</h1>
      <p style={{ color: TEXT_2, fontSize: 15, margin: '0 0 20px', lineHeight: 1.5 }}>
        Fill each square with a {group === 'tcg' ? 'character' : 'player'} who has a card matching both its row and column.
        {group === 'tcg' ? '' : 'Team + team means cards with both teams. '}9 guesses, and each {group === 'tcg' ? 'character' : 'player'} only once.
      </p>

      {/* Sports / TCG tabs, then the modes in that group */}
      <div role="tablist" aria-label="Game type" className="hq-chiprow" style={{ display: 'flex', gap: 28, borderBottom: '1px solid ' + LINE }}>
        {[['Sports', 'sport'], ['TCG', 'tcg']].filter(([, g]) => !modes || firstOf(g)).map(([label, g]) => (
          <button key={g} role="tab" aria-selected={group === g} onClick={() => group !== g && onChange({ mode: firstOf(g) })}
            style={{ ...eyebrow, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 10px', marginBottom: -1, borderBottom: '3px solid ' + (group === g ? ACCENT : 'transparent'), color: group === g ? TEXT : LABEL }}>{label}</button>
        ))}
      </div>
      <div className="hq-chiprow" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {groupModes.map(m => <button key={m.id} onClick={() => onChange({ mode: m.id })} style={pill(m.id === mode)}>{m.label}</button>)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
        <button onClick={() => onChange({ mode })} style={pill(daily)}>Today’s grid</button>
        <button onClick={newRandom} style={pill(false)}>New random grid</button>
      </div>

      {err && !data && <p style={{ color: TEXT_2, marginTop: 24 }}>{err}</p>}
      {!err && (!data || !grid) && <p style={{ color: LABEL, marginTop: 24 }}>{data && !grid ? 'Couldn’t build a grid for this mode — try a random one.' : 'Loading the grid…'}</p>}

      {data && grid && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) repeat(3, minmax(0, 1.4fr))', gap: 6, marginTop: 24, maxWidth: 600 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ ...display, fontSize: 40, color: TEXT }}>{st.left}</div>
              <div style={{ ...eyebrow, fontSize: 11, color: LABEL }}>guesses left</div>
            </div>
            {grid.cols.map(c => <Header key={'c' + c} cat={data.cats[c]} />)}
            {[0, 1, 2].map(r => [
              <Header key={'r' + r} cat={data.cats[grid.rows[r]]} />,
              ...[0, 1, 2].map(c => {
                const pi = st.picks[r + '-' + c]   // name
                const n = answers(r, c).length
                const isOpen = open && open[0] === r && open[1] === c
                return (
                  <button key={r + '-' + c} disabled={pi != null || done} onClick={() => { setFlash(''); setOpen([r, c]) }}
                    aria-label={pi != null ? pi : 'Guess for ' + data.cats[grid.rows[r]][1] + ' and ' + data.cats[grid.cols[c]][1]}
                    style={{ aspectRatio: '1 / 1', minHeight: 84, borderRadius: 12, padding: 8, cursor: pi != null || done ? 'default' : 'pointer',
                      background: pi != null ? '#12301F' : isOpen ? SURFACE_2 : SURFACE, border: '1px solid ' + (pi != null ? GOOD : isOpen ? ACCENT : LINE),
                      color: TEXT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4, fontFamily: 'inherit' }}>
                    {pi != null ? (
                      <>
                        <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{pi}</span>
                        <span style={{ fontSize: 12, color: LABEL }}>1 of {n} answers</span>
                      </>
                    ) : done && showAll ? (
                      <span style={{ fontSize: 12, color: TEXT_2, lineHeight: 1.35 }}>{answers(r, c).slice(0, 3).map(i => data.players[i][0]).join(' · ')}{n > 3 ? ' +' + (n - 3) : ''}</span>
                    ) : (
                      <span style={{ fontSize: 26, color: '#3A4260', lineHeight: 1 }}>+</span>
                    )}
                  </button>
                )
              })
            ])}
          </div>

          {flash && <p role="status" style={{ marginTop: 14, color: flash.includes('doesn’t') ? BAD : ACCENT_TEXT, fontSize: 14 }}>{flash}</p>}

          {done ? (
            <div style={{ marginTop: 20, padding: 18, borderRadius: 14, background: SURFACE, border: '1px solid ' + LINE }}>
              <div style={{ ...title(20), color: TEXT }}>{filled === 9 ? 'Immaculate! 9 for 9.' : 'You got ' + filled + ' of 9.'}</div>
              {st.misses.length > 0 && <p style={{ color: LABEL, fontSize: 13, margin: '6px 0 0' }}>Misses: {st.misses.join(', ')}</p>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                <button onClick={share} style={pill(true)}>Share result</button>
                {filled < 9 && <button onClick={() => setShowAll(v => !v)} style={pill(false)}>{showAll ? 'Hide answers' : 'Show answers'}</button>}
                <button onClick={newRandom} style={pill(false)}>Play a random grid</button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={() => save({ ...st, gaveUp: true })} style={{ ...pill(false), color: LABEL }}>Give up</button>
            </div>
          )}

          {open && !done && (
            <GuessBox data={data} used={used} rowCat={data.cats[grid.rows[open[0]]]} colCat={data.cats[grid.cols[open[1]]]}
              tcg={group === 'tcg'} onPick={guess} onClose={() => setOpen(null)} />
          )}
        </>
      )}
    </section>
  )
}

function Header({ cat }) {
  const [kind, label] = cat
  return (
    <div style={{ minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6px 4px' }}>
      <div style={{ ...eyebrow, fontSize: 11, color: LABEL }}>{KIND_LABEL[kind] || kind}</div>
      <div style={{ fontWeight: 700, fontSize: 'clamp(12px, 3.4vw, 14px)', color: TEXT, lineHeight: 1.2, marginTop: 3, overflowWrap: 'break-word', hyphens: 'auto', maxWidth: '100%' }}>{label}</div>
    </div>
  )
}

// Search box for one square: the mode's players, most cards first.
function GuessBox({ data, used, rowCat, colCat, tcg, onPick, onClose }) {
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(0)
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const normed = useMemo(() => data.players.map(p => norm(p[0])), [data])
  const hits = useMemo(() => {
    const words = norm(q).split(' ').filter(Boolean)
    if (!words.length) return []
    const out = []
    for (let i = 0; i < normed.length && out.length < 8; i++) {
      const parts = normed[i].split(' ')
      if (words.every(w => parts.some(p => p.startsWith(w)))) out.push(i)
    }
    return out
  }, [q, normed])
  useEffect(() => setFocus(0), [q])
  return (
    <div role="dialog" aria-modal="true" aria-label="Make a guess" onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,12,0.7)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 16px 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: SURFACE, border: '1px solid ' + LINE, borderRadius: 16, padding: 16 }}>
        <div style={{ fontSize: 13, color: LABEL, marginBottom: 10 }}>
          <b style={{ color: TEXT }}>{rowCat[1]}</b> + <b style={{ color: TEXT }}>{colCat[1]}</b>
        </div>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tcg ? 'Type a character…' : 'Type a player…'} aria-label="Search"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(f => Math.min(f + 1, hits.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(f => Math.max(f - 1, 0)) }
            if (e.key === 'Enter' && hits[focus] != null && !used.has(data.players[hits[focus]][0])) onPick(hits[focus])
          }}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, padding: '0 14px', borderRadius: 10, border: '1px solid ' + ACCENT, background: '#0F1320', color: TEXT, fontSize: 16, fontFamily: 'inherit' }} />
        <div style={{ marginTop: 8, display: 'grid', gap: 2 }}>
          {hits.map((i, k) => {
            const isUsed = used.has(data.players[i][0])
            return (
              <button key={i} disabled={isUsed} onClick={() => onPick(i)} onMouseEnter={() => setFocus(k)}
                style={{ minHeight: 40, textAlign: 'left', padding: '0 12px', borderRadius: 8, border: 'none', cursor: isUsed ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 14,
                  background: k === focus && !isUsed ? SURFACE_2 : 'transparent', color: isUsed ? '#5B6377' : TEXT, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{data.players[i][0]}</span>
                <span style={{ fontSize: 12, color: LABEL }}>{isUsed ? 'used' : data.players[i][2] || ''}</span>
              </button>
            )
          })}
          {q.trim() && !hits.length && <div style={{ padding: '10px 12px', fontSize: 13, color: LABEL }}>No {tcg ? 'character' : 'player'} by that name in this grid’s list.</div>}
        </div>
        <button onClick={onClose} style={{ marginTop: 10, background: 'none', border: 'none', color: LABEL, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>Cancel</button>
      </div>
    </div>
  )
}
