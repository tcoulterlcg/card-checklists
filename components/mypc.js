'use client'
// My PC (personal collection): everything a collector chases, not just players.
//   Players — cardhq_followed_players (useMyPlayers in ./player)
//   Teams   — every card of a team ("Tampa Bay Lightning")
//   Sets    — sets they're building
//   Chases  — narrow targets: a team or player + a card kind and/or words
//             ("Rays SuperFractors", "Bucs shields", "Lightning Gold Outburst")
// Teams, sets and chases live in cardhq_pc_items (scripts/sql/2026-10-30-my-pc.sql), with a
// localStorage copy so signed-out visitors can build a PC too. Team chases read the team index
// in public/data/pc-teams/ (scripts/build-team-index.mjs); player chases read the player shards.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supa } from '../lib/supa'
import { Select } from './dropdown'
import { norm, nameHasTok, matchPlayers, TYPE } from '../lib/query'
import { PAR, PAR_LABEL, parallelKinds } from '../lib/parallels'
import { ACCENT, ACCENT_TEXT, display, eyebrow, title, buttonText } from '../lib/theme'
import { loadPlayerDir, loadTopPlayers, loadShard } from './player'

const SPORT_COLORS = { Baseball: '#60a5fa', Football: '#4ade80', Basketball: '#f97316', Hockey: '#a78bfa', Soccer: '#f43f5e', Racing: '#ef4444', Golf: '#22c55e', Wrestling: '#f59e0b', UFC: '#dc2626', 'Multi-Sport': '#94a3b8' }
const okJson = (r) => { if (!r.ok) throw new Error(r.status); return r.json() }

// ---------- what a chase can target ----------
// Card kinds a chase can narrow to. Named parallels come from lib/parallels.js (verified tags only).
export const CHASE_KINDS = [
  ['', 'Any card'],
  ['AU', 'Autographs'],
  ['PATCH', 'Patches (any)'],
  ['SHIELD', PAR_LABEL.SHIELD + 's'],
  ['SUPERFRACTOR', PAR_LABEL.SUPERFRACTOR + 's'],
  ['LOGOMAN', PAR_LABEL.LOGOMAN + 's'],
  ['LAUNDRY', PAR_LABEL.LAUNDRY + 's'],
  ['NAMEPLATE', PAR_LABEL.NAMEPLATE + 's'],
  ['BUTTON', PAR_LABEL.BUTTON + 's'],
  ['BRAND', PAR_LABEL.BRAND + 's'],
  ['BLACK', PAR_LABEL.BLACK + 's'],
  ['ONE', '1/1s'],
  ['NUMBERED', 'Numbered cards'],
  ['RC', 'Rookies'],
]
const KIND_LABEL = Object.fromEntries(CHASE_KINDS)

// A chase is stored as JSON: { team, sport, player, kind, text } (any of them; team or player required).
export const chaseKey = (c) => JSON.stringify({ team: c.team || '', sport: c.sport || '', player: c.player || '', kind: c.kind || '', text: (c.text || '').trim() })
export const chaseLabel = (c) => [c.player, c.team, c.text ? '“' + c.text.trim() + '”' : '', c.kind ? KIND_LABEL[c.kind] : ''].filter(Boolean).join(' · ')
export const parseChase = (key) => { try { return JSON.parse(key) } catch { return null } }

const AU_TITLE = /\bauto|autograph|signature|signing|\bink\b|scripted/i
const PATCH_TITLE = /\bpatch|laundry|nameplate|logo ?man|shield|emblem|button|\btag\b/i
const ONE_TITLE = /(^|[^\d])1\/1\b|one of one|\bsuper ?fractor|printing plate/i
const NUM_TITLE = /(^|\s)\/\s?\d+\b|#'?d\b|numbered/i
const teamHit = (cardTeam, team) => { if (!cardTeam) return false; const t = norm(team); return String(cardTeam).split(/\s+\/\s+|\s*;\s*/).some(x => norm(x) === t) }

// card: { p, t, section, setName, year, sport, au, rc, one, numbered }
export function cardMatchesChase(c, card) {
  if (c.team && !teamHit(card.t, c.team)) return false
  if (c.player && !norm(card.p).includes(norm(c.player))) return false
  if (c.text) {
    const hay = norm(card.section + ' ' + card.setName)
    if (!norm(c.text).split(' ').every(t => nameHasTok(hay, t))) return false
  }
  if (c.kind) {
    const k = c.kind, sec = card.section || ''
    if (k === 'AU') { if (!(card.au || AU_TITLE.test(sec))) return false }
    else if (k === 'PATCH') { if (!PATCH_TITLE.test(sec)) return false }
    else if (k === 'ONE') { if (!(card.one || ONE_TITLE.test(sec))) return false }
    else if (k === 'NUMBERED') { if (!(card.numbered || card.one || NUM_TITLE.test(sec) || ONE_TITLE.test(sec))) return false }
    else if (k === 'RC') { if (!card.rc) return false }
    else if (PAR[k]) { if (!(parallelKinds(sec, card.sport, card.setName, card.year) & PAR[k])) return false }
  }
  return true
}

// ---------- storage ----------
const LS_KEY = 'hq.myPC'
export function useMyPC(account) {
  const [items, setItems] = useState([])   // [{ kind, key, label }]
  const userId = account && account.session ? account.session.user.id : null
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); if (Array.isArray(v)) setItems(v) } catch {} }, [])
  useEffect(() => {
    if (!userId) return
    supa.from('cardhq_pc_items').select('kind,item_key,label').eq('user_id', userId).order('created_at').then(({ data }) => {
      if (!data) return
      // same rule as My Players: this browser's signed-out picks go up once, then the account wins
      const syncedKey = LS_KEY + '.synced.' + userId
      let synced = false
      try { synced = !!localStorage.getItem(syncedKey) } catch {}
      setItems(prev => {
        const remote = data.map(d => ({ kind: d.kind, key: d.item_key, label: d.label || d.item_key }))
        const has = new Set(remote.map(r => r.kind + '|' + r.key))
        const missing = synced ? [] : prev.filter(p => !has.has(p.kind + '|' + p.key))
        const next = [...remote, ...missing]
        try { localStorage.setItem(LS_KEY, JSON.stringify(next)); localStorage.setItem(syncedKey, '1') } catch {}
        if (missing.length) supa.from('cardhq_pc_items').upsert(missing.map(m => ({ user_id: userId, kind: m.kind, item_key: m.key, label: m.label })), { onConflict: 'user_id,kind,item_key' }).then(() => {})
        return next
      })
    })
  }, [userId])
  const has = (kind, key) => items.some(i => i.kind === kind && i.key === key)
  const save = (next) => { setItems(next); try { localStorage.setItem(LS_KEY, JSON.stringify(next)) } catch {} }
  const add = async (kind, key, label) => {
    if (!key || has(kind, key)) return
    save([...items, { kind, key, label: label || key }])
    if (userId) await supa.from('cardhq_pc_items').upsert({ user_id: userId, kind, item_key: key, label: label || key }, { onConflict: 'user_id,kind,item_key' })
  }
  const remove = async (kind, key) => {
    save(items.filter(i => !(i.kind === kind && i.key === key)))
    if (userId) await supa.from('cardhq_pc_items').delete().match({ user_id: userId, kind, item_key: key })
  }
  const toggle = (kind, key, label) => has(kind, key) ? remove(kind, key) : add(kind, key, label)
  const of = (kind) => items.filter(i => i.kind === kind)
  const teams = useMemo(() => items.filter(i => i.kind === 'team').map(i => i.key), [items])
  const chases = useMemo(() => items.filter(i => i.kind === 'chase').map(i => parseChase(i.key)).filter(Boolean), [items])
  return { items, has, add, remove, toggle, of, teams, chases }
}

// ---------- team directory ----------
let teamDirPromise = null
export function loadTeamDir() {
  if (!teamDirPromise) teamDirPromise = fetch('/data/pc-teams/dir.json').then(okJson).catch(() => { teamDirPromise = null; return { teams: [] } })
  return teamDirPromise
}
const teamFileCache = new Map()
function loadTeamFile(n) {
  if (!teamFileCache.has(n)) teamFileCache.set(n, fetch('/data/pc-teams/' + n + '.json').then(okJson).catch(() => { teamFileCache.delete(n); return null }))
  return teamFileCache.get(n)
}

// All cards matching a chase: [{ slug, setName, year, sport, section, p, n, t }]
async function chaseCards(c, sets) {
  const out = []
  if (c.team) {
    const dir = await loadTeamDir()
    const k = norm(c.team)
    const hits = dir.teams.filter(t => norm(t[0]) === k && (!c.sport || t[1] === c.sport))
    for (const h of hits) {
      const f = await loadTeamFile(h[3]); if (!f) continue
      for (const g of f.groups) {
        const [slug, setName, year] = f.sets[g[0]], section = f.sections[g[1]]
        for (let i = 2; i < g.length; i += 3) {
          const x = g[i + 2] || ''
          const card = { slug, setName, year, sport: f.sport, section, p: f.players[g[i]], n: g[i + 1], t: c.team, au: x.includes('A'), rc: x.includes('R'), one: x.includes('1'), numbered: x.includes('N') }
          if (cardMatchesChase(c, card)) out.push(card)
        }
      }
    }
    return out
  }
  if (c.player) {
    const dir = await loadPlayerDir()
    const k = norm(c.player)
    const i = dir.players.findIndex(p => norm(p[0]) === k); if (i < 0) return out
    const p = dir.players[i], pid = p[6] ?? i
    const sh = await loadShard(p[1])
    const meta = new Map((sets || []).map(s => [s.slug, s]))
    for (const r of sh.rows) {
      if (r[0] !== pid) continue
      const slug = sh.slugs[r[1]], m = meta.get(slug) || { name: slug, year: 0, sport: '' }
      const card = { slug, setName: m.name, year: m.year, sport: m.sport, section: sh.sections[r[2]], p: p[0], n: r[3], t: r[4] >= 0 ? sh.teams[r[4]] : '', au: !!(r[6] & TYPE.AU), rc: !!(r[6] & TYPE.RC), one: r[5] === 1, numbered: r[5] > 0 }
      if (cardMatchesChase(c, card)) out.push(card)
    }
  }
  return out
}

// ---------- UI ----------
const box = { background: '#0F1320', border: '1px solid #232A3E', borderRadius: 14, padding: '14px 16px' }
const xBtn = { background: 'none', border: '1px solid #232A3E', color: '#8A93A8', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }
const input = { background: '#121626', border: '1px solid #232A3E', borderRadius: 10, color: '#EDEDEF', height: 40, padding: '0 12px', fontSize: 14, fontFamily: 'inherit', minWidth: 0, flex: '1 1 220px' }
const primary = { ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', height: 40, cursor: 'pointer', fontSize: 14 }
const tabBtn = (on) => ({ ...buttonText, background: on ? '#0e1630' : 'transparent', border: '1px solid ' + (on ? ACCENT : '#232A3E'), color: on ? '#c9d8ff' : '#A1A1AA', borderRadius: 999, padding: '7px 14px', cursor: 'pointer', fontSize: 14, display: 'inline-flex', gap: 8, alignItems: 'center' })
const countPill = (on) => ({ background: on ? ACCENT : '#232A3E', color: on ? '#fff' : '#A1A1AA', borderRadius: 999, padding: '1px 7px', fontSize: 12, fontWeight: 700 })
const sugBtn = { display: 'flex', width: '100%', gap: 10, alignItems: 'baseline', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #1A1F31', color: '#D4D4D8', padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }

function Initials({ name, color }) {
  const i = name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return <span style={{ width: 34, height: 34, borderRadius: 999, background: color + '22', border: '1px solid ' + color + '55', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color, fontSize: 13, flexShrink: 0 }}>{i}</span>
}

// Text box with a short suggestion list underneath.
function Picker({ placeholder, value, onChange, suggestions, onPick, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative', flex: '1 1 240px', minWidth: 0, display: 'flex' }}>
      <input aria-label={ariaLabel} value={value} placeholder={placeholder} onFocus={() => setOpen(true)} onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onKeyDown={(e) => { if (e.key === 'Enter' && suggestions.length) { onPick(suggestions[0]); setOpen(false) } if (e.key === 'Escape') setOpen(false) }} style={{ ...input, width: '100%' }} />
      {open && suggestions.length > 0 && (
        <div role="listbox" style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 30, background: '#121626', border: '1px solid #2E3D6B', borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
          {suggestions.map(s => (
            <button key={s.id} role="option" onClick={() => { onPick(s); setOpen(false) }} style={sugBtn}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{s.label}</span>
              <span style={{ color: '#8A93A8', fontSize: 12, whiteSpace: 'nowrap' }}>{s.meta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function usePlayerSuggest(q) {
  const [dir, setDir] = useState(null)
  useEffect(() => { if (q.length >= 2 && !dir) { loadTopPlayers().then(t => t && !dir && setDir(t)); loadPlayerDir().then(d => d && d.players && d.players.length && setDir(d)) } }, [q, dir])
  return useMemo(() => (dir && q.trim().length >= 2) ? matchPlayers(dir, q, 6).map(h => ({ id: h.name + '|' + (h.sport || ''), label: h.name, meta: [h.sport, h.cards ? h.cards.toLocaleString() + ' cards' : ''].filter(Boolean).join(' · '), name: h.name })) : [], [dir, q])
}
function useTeamSuggest(q) {
  const [dir, setDir] = useState(null)
  useEffect(() => { loadTeamDir().then(setDir) }, [])
  return useMemo(() => {
    const t = norm(q); if (!dir || t.length < 2) return []
    const toks = t.split(' ')
    return dir.teams.filter(x => { const n = norm(x[0]); return toks.every(k => n.includes(k)) }).slice(0, 8)
      .map(x => ({ id: x[0] + '|' + x[1], label: x[0], meta: x[1] + ' · ' + x[2].toLocaleString() + ' cards', team: x[0], sport: x[1], cards: x[2] }))
  }, [dir, q])
}

export function MyPCPanel({ myPlayers, pc, sets, onOpenPlayer, onOpenSet, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'players')
  const [teamDir, setTeamDir] = useState(null)
  useEffect(() => { loadTeamDir().then(setTeamDir) }, [])
  const teamInfo = (name) => teamDir && teamDir.teams.find(t => t[0] === name)
  const setMeta = useMemo(() => new Map((sets || []).map(s => [s.slug, s])), [sets])
  const TABS = [['players', 'Players', myPlayers.list.length], ['teams', 'Teams', pc.of('team').length], ['sets', 'Sets', pc.of('set').length], ['chases', 'Chases', pc.of('chase').length]]
  return (
    <div className="hq-panel" style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: '26px 28px' }}>
      <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>My PC</h1>
      <p style={{ color: '#A3ABBD', fontSize: 14, lineHeight: 1.6, maxWidth: 720, margin: '12px 0 0' }}>Your personal collection — whatever you chase. Players, teams, sets, or something as specific as Lightning shields or Rays SuperFractors. Turn on <strong style={{ color: ACCENT_TEXT }}>My PC</strong> on any set page to see only your cards.</p>
      <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0 18px' }}>
        {TABS.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l} <span style={countPill(tab === k)}>{n}</span></button>)}
      </div>
      {tab === 'players' && <PlayersTab myPlayers={myPlayers} onOpenPlayer={onOpenPlayer} />}
      {tab === 'teams' && <TeamsTab pc={pc} teamInfo={teamInfo} onChase={() => setTab('chases')} />}
      {tab === 'sets' && <SetsTab pc={pc} sets={sets} setMeta={setMeta} onOpenSet={onOpenSet} />}
      {tab === 'chases' && <ChasesTab pc={pc} myPlayers={myPlayers} sets={sets} onOpenSet={onOpenSet} />}
    </div>
  )
}

function PlayersTab({ myPlayers, onOpenPlayer }) {
  const [q, setQ] = useState('')
  const sug = usePlayerSuggest(q).filter(s => !myPlayers.has(s.name))
  const [dir, setDir] = useState(null)
  useEffect(() => { if (myPlayers.list.length) loadPlayerDir().then(setDir) }, [myPlayers.list.length])
  const info = (name) => { if (!dir) return null; const k = norm(name); return dir.players.find(p => p[0] === name) || dir.players.find(p => norm(p[0]) === k) }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Picker ariaLabel="Add a player" placeholder="Add a player — e.g. Nikita Kucherov" value={q} onChange={setQ} suggestions={sug} onPick={(s) => { myPlayers.toggle(s.name); setQ('') }} />
      </div>
      {myPlayers.list.length === 0 ? <p style={{ color: '#8A93A8', fontSize: 14 }}>No players yet — add one above, or hit <strong style={{ color: ACCENT_TEXT }}>Add to My PC</strong> on any player page.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
          {myPlayers.list.map(name => {
            const p = info(name), sport = p ? dir.sports[p[3]] : ''
            return (
              <div key={name} style={{ ...box, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Initials name={name} color={SPORT_COLORS[sport] || ACCENT} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button onClick={() => onOpenPlayer(name)} style={{ ...title(16), background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left', lineHeight: 1.05 }}>{name}</button>
                  <p style={{ margin: '3px 0 0', color: '#8A93A8', fontSize: 12 }}>{p ? sport + ' · ' + p[2].toLocaleString() + (p[2] === 1 ? ' card' : ' cards') : dir ? 'Not found in the database' : '…'}</p>
                </div>
                <button aria-label={'Remove ' + name} onClick={() => myPlayers.toggle(name)} style={xBtn}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TeamsTab({ pc, teamInfo, onChase }) {
  const [q, setQ] = useState('')
  const sug = useTeamSuggest(q).filter(s => !pc.has('team', s.team))
  const list = pc.of('team')
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Picker ariaLabel="Add a team" placeholder="Add a team — e.g. Tampa Bay Lightning" value={q} onChange={setQ} suggestions={sug} onPick={(s) => { pc.add('team', s.team, s.team); setQ('') }} />
      </div>
      {list.length === 0 ? <p style={{ color: '#8A93A8', fontSize: 14 }}>No teams yet. Team collectors: add your teams and every set page can narrow to just their cards. Only chasing certain cards of a team (shields, SuperFractors)? Use <button onClick={onChase} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 14 }}>Chases</button>.</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))', gap: 12 }}>
          {list.map(({ key }) => {
            const t = teamInfo(key)
            return (
              <div key={key} style={{ ...box, display: 'flex', gap: 12, alignItems: 'center' }}>
                <Initials name={key} color={SPORT_COLORS[t && t[1]] || ACCENT} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ ...title(16), margin: 0, color: '#EDEDEF', lineHeight: 1.05 }}>{key}</p>
                  <p style={{ margin: '3px 0 0', color: '#8A93A8', fontSize: 12 }}>{t ? t[1] + ' · ' + t[2].toLocaleString() + ' cards' : '…'}</p>
                </div>
                <button aria-label={'Remove ' + key} onClick={() => pc.remove('team', key)} style={xBtn}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SetsTab({ pc, sets, setMeta, onOpenSet }) {
  const [q, setQ] = useState('')
  const sug = useMemo(() => {
    const t = norm(q); if (t.length < 3 || !sets) return []
    const toks = t.split(' ')
    const out = []
    for (const s of sets) { const n = norm(s.name); if (toks.every(k => nameHasTok(n, k)) && !pc.has('set', s.slug)) { out.push(s); if (out.length >= 60) break } }
    return out.sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 8).map(s => ({ id: s.slug, label: s.name, meta: [s.sport, s.cardCount ? s.cardCount.toLocaleString() + ' cards' : ''].filter(Boolean).join(' · '), slug: s.slug }))
  }, [q, sets, pc.items])
  const list = pc.of('set')
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Picker ariaLabel="Add a set" placeholder="Add a set — e.g. 2023-24 Upper Deck Series 1" value={q} onChange={setQ} suggestions={sug} onPick={(s) => { pc.add('set', s.slug, s.label); setQ('') }} />
      </div>
      {list.length === 0 ? <p style={{ color: '#8A93A8', fontSize: 14 }}>No sets yet — add one above, or hit <strong style={{ color: ACCENT_TEXT }}>Add to My PC</strong> on any set page.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {list.map(({ key, label }) => {
            const m = setMeta.get(key)
            return (
              <div key={key} style={{ ...box, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ width: 4, height: 28, background: SPORT_COLORS[m && m.sport] || ACCENT, borderRadius: 2, flexShrink: 0 }} />
                <button onClick={() => onOpenSet(key)} style={{ ...title(15), flex: 1, minWidth: 0, background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>{m ? m.name : label}</button>
                <span style={{ color: '#8A93A8', fontSize: 12, whiteSpace: 'nowrap' }}>{m && m.cardCount ? m.cardCount.toLocaleString() + ' cards' : ''}</span>
                <button aria-label={'Remove ' + (m ? m.name : label)} onClick={() => pc.remove('set', key)} style={xBtn}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ChasesTab({ pc, myPlayers, sets, onOpenSet }) {
  const [whoKind, setWhoKind] = useState('team')
  const [q, setQ] = useState('')
  const [who, setWho] = useState(null)        // { team, sport } | { player }
  const [kind, setKind] = useState('')
  const [text, setText] = useState('')
  const [open, setOpen] = useState(null)      // chase key being viewed
  const teamSug = useTeamSuggest(whoKind === 'team' ? q : '')
  const playerSug = usePlayerSuggest(whoKind === 'player' ? q : '')
  // your own teams / players first when the box is empty
  const quick = whoKind === 'team' ? pc.of('team').map(t => ({ id: t.key, label: t.key, meta: 'In your PC', team: t.key })) : myPlayers.list.map(n => ({ id: n, label: n, meta: 'In your PC', name: n }))
  const sug = q.trim().length >= 2 ? (whoKind === 'team' ? teamSug : playerSug) : quick.slice(0, 8)
  const draft = who ? { team: who.team || '', sport: who.sport || '', player: who.player || '', kind, text } : null
  const canAdd = draft && (kind || text.trim())
  const add = () => { if (!canAdd) return; pc.add('chase', chaseKey(draft), chaseLabel(draft)); setKind(''); setText(''); setWho(null); setQ('') }
  const list = pc.of('chase')
  return (
    <div>
      <div style={{ ...box, marginBottom: 18 }}>
        <p style={{ ...eyebrow, color: ACCENT_TEXT, margin: '0 0 10px' }}>New chase</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select ariaLabel="Chase a team or a player" value={whoKind} onChange={(v) => { setWhoKind(v); setWho(null); setQ('') }} defaultValue="team" width={200} options={[['team', 'Team'], ['player', 'Player']]} />
          {who ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#0e1630', border: '1px solid ' + ACCENT + '55', color: '#c9d8ff', borderRadius: 10, height: 40, padding: '0 6px 0 12px', fontSize: 14, fontWeight: 600 }}>
              {who.team || who.player}
              <button aria-label="Change" onClick={() => setWho(null)} style={{ ...xBtn, width: 28, height: 28, border: 'none' }}>×</button>
            </span>
          ) : (
            <Picker ariaLabel={whoKind === 'team' ? 'Team' : 'Player'} placeholder={whoKind === 'team' ? 'Which team? e.g. Tampa Bay Rays' : 'Which player?'} value={q} onChange={setQ} suggestions={sug}
              onPick={(s) => { setWho(whoKind === 'team' ? { team: s.team, sport: s.sport || '' } : { player: s.name }); setQ('') }} />
          )}
          <Select ariaLabel="Card kind" value={kind} onChange={setKind} defaultValue="" width={240} options={CHASE_KINDS} />
          <input aria-label="Words in the card or parallel name" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="Parallel or words — e.g. Gold Outburst" style={input} />
          <button onClick={add} disabled={!canAdd} style={{ ...primary, opacity: canAdd ? 1 : 0.45, cursor: canAdd ? 'pointer' : 'default' }}>Add chase</button>
        </div>
        <p style={{ color: '#8A93A8', fontSize: 13, margin: '10px 0 0' }}>Pick a team or player, then a card kind, words from the parallel name, or both. Examples: Tampa Bay Rays + SuperFractors · Tampa Bay Buccaneers + Shields · Tampa Bay Lightning + “Gold Outburst”.</p>
      </div>
      {list.length === 0 ? <p style={{ color: '#8A93A8', fontSize: 14 }}>No chases yet.</p> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {list.map(({ key, label }) => (
            <div key={key} style={box}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <p style={{ ...title(16), margin: 0, color: '#EDEDEF', flex: 1, minWidth: 0 }}>{label}</p>
                <button onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key} style={{ ...buttonText, background: 'transparent', color: ACCENT_TEXT, border: '1px solid #2E3D6B', borderRadius: 9, padding: '0 14px', height: 34, cursor: 'pointer', fontSize: 13 }}>{open === key ? 'Hide cards' : 'See cards'}</button>
                <button aria-label={'Remove ' + label} onClick={() => { pc.remove('chase', key); if (open === key) setOpen(null) }} style={xBtn}>×</button>
              </div>
              {open === key && <ChaseResults chase={parseChase(key)} sets={sets} onOpenSet={onOpenSet} />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChaseResults({ chase, sets, onOpenSet }) {
  const [cards, setCards] = useState(null)
  const [limit, setLimit] = useState(10)
  useEffect(() => { let live = true; setCards(null); chaseCards(chase, sets).then(c => live && setCards(c)); return () => { live = false } }, [JSON.stringify(chase), sets && sets.length])
  const bySet = useMemo(() => {
    if (!cards) return []
    const m = new Map()
    for (const c of cards) { let g = m.get(c.slug); if (!g) m.set(c.slug, g = { slug: c.slug, name: c.setName, year: c.year, cards: [] }); g.cards.push(c) }
    return [...m.values()].sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name))
  }, [cards])
  if (!cards) return <p style={{ color: '#8A93A8', fontSize: 13, margin: '12px 0 0' }}>Finding cards…</p>
  if (!cards.length) return <p style={{ color: '#8A93A8', fontSize: 13, margin: '12px 0 0' }}>No cards match yet. As sets get added, they’ll show up here.</p>
  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ color: '#8A93A8', fontSize: 13, margin: '0 0 10px' }}>{cards.length.toLocaleString()} card{cards.length === 1 ? '' : 's'} in {bySet.length.toLocaleString()} set{bySet.length === 1 ? '' : 's'}</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {bySet.slice(0, limit).map(g => (
          <div key={g.slug} style={{ background: '#0B0E17', border: '1px solid #1A1F31', borderRadius: 10, padding: '10px 14px' }}>
            <button onClick={() => onOpenSet(g.slug)} style={{ ...title(14), background: 'none', border: 'none', color: '#EDEDEF', cursor: 'pointer', padding: 0, textAlign: 'left' }}>{g.name}</button>
            <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 3 }}>
              {g.cards.slice(0, 12).map((c, i) => (
                <li key={i} style={{ color: '#D4D4D8', fontSize: 13, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>{c.n ? '#' + c.n + ' ' : ''}{c.p}</span>
                  <span style={{ color: '#8A93A8' }}>{c.section}</span>
                </li>
              ))}
              {g.cards.length > 12 && <li style={{ color: '#8A93A8', fontSize: 12 }}>+ {(g.cards.length - 12).toLocaleString()} more in this set</li>}
            </ul>
          </div>
        ))}
      </div>
      {bySet.length > limit && <button onClick={() => setLimit(l => l + 20)} style={{ ...buttonText, background: 'none', border: 'none', color: ACCENT_TEXT, cursor: 'pointer', fontSize: 13, marginTop: 10, padding: 0 }}>Show more sets ({(bySet.length - limit).toLocaleString()} left)</button>}
    </div>
  )
}
