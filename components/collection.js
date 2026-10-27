'use client'
// My Collection v2: per-copy details, named collections, statuses, stats, set completion,
// wantlist + rules, trading, and imports (TCDB, CSV) / export. Data: lib/collection.js.
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSet, loadRedirects, sectionKey } from '../lib/catalog'
import { brandOf } from '../lib/brands'
import { collectionCardN, grailfindrFindUrl, uploadCardImage, updateProfile, removeWant, noCardNumber, isAdmin } from '../lib/supa'
import {
  STATUSES, STATUS_LABEL, STATUS_COLOR, CONDITIONS, GRADERS, GRADES, UNMATCHED, cardKey, itemKey, cardKeyOf,
  listItems, insertItems, updateItem, updateItems, updateWholeItems, deleteItems,
  listCollections, createCollection, renameCollection, setCollectionPublic, deleteCollection, ensureCollections,
  listWants, insertWants, listRules, addRule, removeRule,
  collectorByName, publicItems, collectionStats, unmatchedSummary, fetchMarketValue,
} from '../lib/collection'
import { buildSetIndex, matchRows, parseTcdbTitle } from '../lib/match'
import { parseCsv, toCsv, IMPORT_FIELDS, guessMapping, money, yesNo, isoDate } from '../lib/csv'
import { Select } from './dropdown'
import { useDialogFocus } from './dialog-focus'
import { ACCENT, ACCENT_TEXT, display, title, buttonText, eyebrow } from '../lib/theme'

const card = { background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid #232A3E', borderRadius: 14 }
const btnAccent = { ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 14 }
const btnGhost = { ...buttonText, background: 'transparent', color: '#A1A1AA', border: '1px solid #232A3E', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }
const btnSmall = { ...btnGhost, padding: '5px 10px', fontSize: 12, borderRadius: 8 }
const input = { background: '#0F1320', border: '1px solid #232A3E', borderRadius: 10, color: '#EDEDEF', padding: '10px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const label = { display: 'block', color: '#A1A1AA', fontSize: 12, fontWeight: 600, margin: '0 0 5px' }
const muted = { color: '#8A93A8', fontSize: 13 }
const th = { padding: '9px 10px', fontWeight: 700, textAlign: 'left', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A93A8', whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', verticalAlign: 'middle' }
const fmtMoney = (n) => n == null || isNaN(n) ? '—' : '$' + (+n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
const IRREGULAR = { entry: 'entries', copy: 'copies', match: 'matches' }
const plural = (n, w) => n.toLocaleString() + ' ' + (n === 1 ? w : IRREGULAR[w] || w + 's')
const TCDB_ORIGINS = ['https://www.tcdb.com', 'https://tcdb.com']
// "owned" = in hand (not wanted, not on its way in, not shipped out)
const OWNED_STATUSES = new Set(['have', 'trade', 'sale', 'in_transaction'])
// a copy with anything beyond "I have it" (removing it would lose information)
export const hasDetails = (it) => it.qty > 1 || it.status !== 'have' || !!(it.grader || it.condition || it.serial_no || it.cert_no || it.notes || it.image_url || it.collection_id || it.acquired_on || it.source || (it.tags || []).length) || it.price_paid != null || it.value != null

// ---------------- data hook (shared by My Collection, set pages and player pages) ----------------
export function useMyCollection(account) {
  const uid = account.session?.user?.id
  const [items, setItems] = useState(null)
  const [collections, setCollections] = useState([])
  const [wants, setWants] = useState(null)
  const [rules, setRules] = useState([])
  // every load is tied to the account it started for: a late reply after sign-out or an account
  // switch is dropped (account), and only the newest items load lands (seq)
  const seq = useRef(0), account_ = useRef(uid)
  account_.current = uid
  const forMe = (fn) => async () => { const who = uid; const r = await fn(who); return who === account_.current ? r : Object.assign([], { failed: true }) }
  const reloadItems = async () => { const my = ++seq.current; const r = await forMe(listItems)(); if (my === seq.current && !r.failed) setItems(r); return r }
  const reloadCollections = async () => { const r = await forMe(listCollections)(); if (!r.failed) setCollections(r) }
  const reloadWants = async () => { const r = await forMe(listWants)(); if (!r.failed) setWants(r) }
  const reloadRules = async () => { const r = await forMe(listRules)(); if (!r.failed) setRules(r) }
  useEffect(() => {
    seq.current++
    setItems(null); setCollections([]); setWants(null); setRules([])
    if (!uid) return
    reloadItems(); reloadCollections(); reloadWants(); reloadRules()
  }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps
  // sets renamed or merged since a card was saved still count under today's slug
  const [redirects, setRedirects] = useState(null)
  useEffect(() => { if (uid && !redirects) loadRedirects().then(setRedirects) }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps
  // card key -> copies owned (set pages, player pages, checklists)
  const owned = useMemo(() => {
    const m = new Map()
    const now = (slug) => { let s = slug; for (let i = 0; i < 5 && redirects && redirects[s]; i++) s = redirects[s]; return s }
    for (const it of items || []) if (it.set_slug !== UNMATCHED && OWNED_STATUSES.has(it.status)) { const k = cardKey(now(it.set_slug), it.section, it.card_n); m.set(k, (m.get(k) || 0) + (it.qty || 1)) }
    return m
  }, [items, redirects])
  return { uid, items, setItems, collections, wants, rules, owned, reloadItems, reloadCollections, reloadWants, reloadRules }
}

// ---------------- small pieces ----------------
function StatusChip({ status }) {
  const c = STATUS_COLOR[status] || '#8A93A8'
  return <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: c, border: '1px solid ' + c + '55', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>{STATUS_LABEL[status] || status}</span>
}
function Tile({ label: l, value, sub }) {
  return (
    <div style={{ ...card, padding: '14px 16px', minWidth: 0 }}>
      <p style={{ ...eyebrow, color: '#8A93A8', margin: 0 }}>{l}</p>
      <p style={{ ...title(24), margin: '6px 0 0', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      {sub && <p style={{ ...muted, fontSize: 12, margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}
function Bars({ heading, rows, fmt = (k) => k, onPick }) {
  if (!rows.length) return null
  const max = Math.max(...rows.map(r => r[1]))
  return (
    <div style={{ ...card, padding: '16px 18px', minWidth: 0 }}>
      <p style={{ ...eyebrow, color: '#8A93A8', margin: '0 0 10px' }}>{heading}</p>
      <div style={{ display: 'grid', gap: 7 }}>
        {rows.map(([k, n]) => (
          <button key={k} onClick={onPick ? () => onPick(k) : undefined} disabled={!onPick} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 56px', gap: 10, alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: onPick ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'inherit' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', color: '#D4D4D8', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmt(k)}</span>
              <span style={{ display: 'block', height: 5, borderRadius: 3, background: '#1A1F31', marginTop: 3 }}><span style={{ display: 'block', height: '100%', borderRadius: 3, width: Math.max(3, 100 * n / max) + '%', background: ACCENT }} /></span>
            </span>
            <span style={{ color: '#A1A1AA', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n.toLocaleString()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
function Progress({ have, total }) {
  const pct = total ? Math.min(100, (100 * have) / total) : 0
  return <div style={{ height: 6, background: '#1A1F31', borderRadius: 4, overflow: 'hidden' }}><div style={{ height: '100%', width: pct + '%', background: pct >= 100 ? '#4ade80' : ACCENT }} /></div>
}
function Notice({ children, onClose, tone }) {
  if (!children) return null
  return (
    <div role="status" style={{ ...card, borderColor: tone === 'error' ? '#7f1d1d' : ACCENT, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ flex: 1, color: tone === 'error' ? '#fca5a5' : ACCENT_TEXT, fontWeight: 600, fontSize: 14 }}>{children}</span>
      {onClose && <button aria-label="Dismiss" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8A93A8', cursor: 'pointer', fontSize: 16 }}>×</button>}
    </div>
  )
}
function Toggle({ checked, onChange, children, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: ACCENT, width: 18, height: 18, marginTop: 1, flexShrink: 0 }} />
      <span><span style={{ color: '#EDEDEF', fontSize: 14, fontWeight: 600 }}>{children}</span>{hint && <span style={{ display: 'block', ...muted, fontSize: 12, marginTop: 2 }}>{hint}</span>}</span>
    </label>
  )
}
function Modal({ open, onClose, labelText, children, width = 560 }) {
  const ref = useRef(null)
  useDialogFocus(ref, open)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus() }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '5vh 12px' }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={labelText} onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(' + width + 'px, 100%)', padding: 22, position: 'relative', boxSizing: 'border-box' }}>
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, background: 'none', border: 'none', color: '#8A93A8', fontSize: 20, cursor: 'pointer', borderRadius: 8 }}>×</button>
        {children}
      </div>
    </div>
  )
}
const download = (name, text, type = 'text/csv;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
const urlParam = (k) => { try { return new URLSearchParams(window.location.search).get(k) } catch { return null } }
const setUrlParam = (k, v) => { try { const u = new URL(window.location.href); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); window.history.replaceState(window.history.state, '', u) } catch {} }

// ---------------- item editor ----------------
function ItemEditor({ item, collections, uid, onClose, onSaved, onDeleted, onDuplicate }) {
  const [f, setF] = useState(() => ({ ...item, tags: (item.tags || []).join(', ') }))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [mv, setMv] = useState(null)   // market value lookup: null | 'loading' | result
  const fileRef = useRef(null)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const save = async () => {
    setErr(''); setBusy(true)
    const fields = {
      collection_id: f.collection_id ? +f.collection_id : null, status: f.status, qty: Math.max(1, Math.min(9999, parseInt(f.qty, 10) || 1)),
      price_paid: money(f.price_paid), value: money(f.value), value_at: money(f.value) != null && money(f.value) !== (item.value == null ? null : +item.value) ? new Date().toISOString() : item.value_at,
      condition: f.condition || null, grader: f.grader || null, grade: f.grader ? (f.grade || null) : null, cert_no: f.grader ? (f.cert_no || '').trim().slice(0, 40) || null : null,
      serial_no: (f.serial_no || '').trim().slice(0, 20) || null, autographed: !!f.autographed, notes: (f.notes || '').trim().slice(0, 2000) || null,
      tags: String(f.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 20).map(t => t.slice(0, 40)), acquired_on: isoDate(f.acquired_on), image_url: f.image_url || null,
    }
    const { data, error } = await updateItem(item.id, fields)
    setBusy(false)
    if (error) { setErr('Couldn’t save — ' + error.message); return }
    onSaved(data)
  }
  const unmatched = item.set_slug === UNMATCHED
  return (
    <Modal open onClose={onClose} labelText="Edit card">
      <p style={{ ...muted, margin: '0 40px 2px 0' }}>{item.set_name || item.set_slug}{item.section && !/^base( set)?$/i.test(item.section) ? ' · ' + item.section : ''}</p>
      <h3 style={{ ...title(22), margin: '0 40px 14px 0', color: '#fff' }}>{noCardNumber(item.card_n) || String(item.card_n).startsWith('—') ? '' : '#' + item.card_n + ' '}{item.player}</h3>
      {unmatched && <Notice tone="error">Not matched to a Card HQ checklist yet — it’s saved as imported and will be matched when the set is added (My Collection → Import → Re-match).</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div><span style={label}>Status</span><Select ariaLabel="Status" value={f.status} onChange={set('status')} width={240} style={{ width: '100%' }} options={STATUSES} /></div>
        <div><span style={label}>Collection</span><Select ariaLabel="Collection" value={f.collection_id || ''} onChange={set('collection_id')} width={240} style={{ width: '100%' }} options={[['', 'Unfiled'], ...collections.map(c => [String(c.id), c.name])]} /></div>
        <div><label style={label} htmlFor="ie-qty">Quantity</label><input id="ie-qty" style={input} type="number" min="1" max="9999" value={f.qty} onChange={set('qty')} /></div>
        <div><label style={label} htmlFor="ie-paid">Price paid ($)</label><input id="ie-paid" style={input} inputMode="decimal" value={f.price_paid ?? ''} onChange={set('price_paid')} /></div>
        <div><label style={label} htmlFor="ie-val">Value ($)</label><input id="ie-val" style={input} inputMode="decimal" value={f.value ?? ''} onChange={set('value')} /></div>
        <div><label style={label} htmlFor="ie-acq">Date acquired</label><input id="ie-acq" style={input} type="date" value={f.acquired_on || ''} onChange={set('acquired_on')} /></div>
        <div><span style={label}>Condition (raw)</span><Select ariaLabel="Condition" value={f.condition || ''} onChange={set('condition')} width={240} style={{ width: '100%' }} options={[['', '—'], ...CONDITIONS.map(c => [c, c])]} /></div>
        <div><span style={label}>Grader</span><Select ariaLabel="Grader" value={f.grader || ''} onChange={set('grader')} width={240} style={{ width: '100%' }} options={[['', 'Raw (not graded)'], ...GRADERS.map(c => [c, c])]} /></div>
        {f.grader && <div><span style={label}>Grade</span><Select ariaLabel="Grade" value={f.grade || ''} onChange={set('grade')} width={240} style={{ width: '100%' }} options={[['', '—'], ...GRADES.map(c => [c, c])]} /></div>}
        {f.grader && <div><label style={label} htmlFor="ie-cert">Cert #</label><input id="ie-cert" style={input} maxLength={40} value={f.cert_no || ''} onChange={set('cert_no')} /></div>}
        <div><label style={label} htmlFor="ie-sn">Serial # (e.g. 12/99)</label><input id="ie-sn" style={input} maxLength={20} value={f.serial_no || ''} onChange={set('serial_no')} /></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}><Toggle checked={f.autographed} onChange={set('autographed')}>Autographed</Toggle></div>
      </div>
      {!unmatched && (
        <div style={{ marginTop: 12, padding: '10px 12px', border: '1px solid #232A3E', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={btnSmall} disabled={mv === 'loading'} onClick={async () => { setMv('loading'); setMv(await fetchMarketValue({ ...item, grader: f.grader, grade: f.grade })) }}>{mv === 'loading' ? 'Checking sales…' : 'Get market value'}</button>
          {mv && mv !== 'loading' && (mv.error ? <span style={{ ...muted, color: '#fca5a5' }}>{mv.error}</span>
            : mv.count ? <>
                <span style={{ color: '#EDEDEF', fontSize: 14 }}><b>{fmtMoney(mv.median)}</b> <span style={muted}>median of {plural(mv.count, 'sale')} in the last year ({fmtMoney(mv.low)}–{fmtMoney(mv.high)})</span></span>
                <button style={btnSmall} onClick={() => setF(x => ({ ...x, value: mv.median }))}>Use {fmtMoney(mv.median)}</button>
                <a href={mv.searchUrl} target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT, fontSize: 12 }}>See sales ↗</a>
              </>
            : <span style={muted}>No recent sales found{f.grader ? ' at this grade' : ''}. <a href={mv.searchUrl} target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT }}>Search GrailFindr ↗</a></span>)}
        </div>
      )}
      <label style={{ ...label, marginTop: 12 }} htmlFor="ie-tags">Tags (comma separated)</label>
      <input id="ie-tags" style={input} value={f.tags} onChange={set('tags')} placeholder="PC, signed in person, binder 3" />
      <label style={{ ...label, marginTop: 12 }} htmlFor="ie-notes">Notes</label>
      <textarea id="ie-notes" style={{ ...input, minHeight: 70, resize: 'vertical' }} maxLength={2000} value={f.notes || ''} onChange={set('notes')} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        {f.image_url ? <a href={f.image_url} target="_blank" rel="noreferrer"><img src={f.image_url} alt="Your photo of this card" style={{ height: 72, borderRadius: 6, border: '1px solid #232A3E' }} /></a> : null}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
          const file = e.target.files?.[0]; e.target.value = ''
          if (!file) return
          setBusy(true); const { url, error } = await uploadCardImage(uid, file); setBusy(false)
          if (error) setErr('Couldn’t upload — ' + error.message); else setF(x => ({ ...x, image_url: url }))
        }} />
        <button style={btnSmall} onClick={() => fileRef.current?.click()}>{f.image_url ? 'Replace photo' : '+ Photo'}</button>
        {f.image_url && <button style={btnSmall} onClick={() => setF(x => ({ ...x, image_url: null }))}>Remove photo</button>}
        {!unmatched && <a href={grailfindrFindUrl({ setName: item.set_name, player: item.player, n: item.card_n, section: item.section })} target="_blank" rel="noreferrer" style={{ ...btnSmall, textDecoration: 'none', color: ACCENT_TEXT }}>Prices on GrailFindr ↗</a>}
      </div>
      {err && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button style={btnAccent} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button style={btnGhost} onClick={onClose}>Cancel</button>
        <span style={{ flex: 1 }} />
        <button style={btnGhost} onClick={() => onDuplicate(item)} title="Add another copy of this card (e.g. a graded one)">Add another copy</button>
        <button style={{ ...btnGhost, color: '#f87171' }} onClick={async () => { const { error } = await deleteItems([item.id]); if (error) setErr('Couldn’t delete — ' + error.message); else onDeleted(item) }}>Delete</button>
      </div>
    </Modal>
  )
}

// ---------------- main view ----------------
const TABS = [['overview', 'Overview'], ['cards', 'Cards'], ['sets', 'Sets'], ['wantlist', 'Wantlist'], ['import', 'Import / Export']]

export function CollectionView({ account, store, indexSets, onOpenAuth, onOpenSet, onWantsChanged }) {
  const { session, profile, setProfile } = account
  const [tab, setTabState] = useState(() => { const t = urlParam('ctab'); return TABS.some(x => x[0] === t) ? t : 'overview' })
  const setTab = (t) => { setTabState(t); setUrlParam('ctab', t === 'overview' ? null : t); setUrlParam('cset', null); setActiveSlug(null) }
  const [activeSlug, setActiveSlugState] = useState(() => urlParam('cset'))
  const setActiveSlug = (s) => { setActiveSlugState(s); setUrlParam('cset', s) }
  const [notice, setNotice] = useState(null)   // { text, tone }
  const [editing, setEditing] = useState(null)
  const [cardFilter, setCardFilter] = useState(null)   // preset from Overview clicks: { player?, status?, collection?, unmatched? }
  const say = (text, tone) => setNotice(text ? { text, tone } : null)

  const indexBySlug = useMemo(() => new Map((indexSets || []).map(s => [s.slug, s])), [indexSets])
  const items = store.items
  const uid = session?.user?.id
  const stats = useMemo(() => collectionStats(items || [], indexBySlug, brandOf), [items, indexBySlug])

  // a TCDB hand-off can arrive before sign-in finishes: TcdbReceiver keeps it until then
  if (!session) return (
    <>
      <TcdbReceiver onPayload={() => {}} />
      <div className="hq-panel" style={{ ...card, padding: 40, textAlign: 'center' }}>
        <h2 style={{ ...title(32), margin: 0, color: '#fff' }}>Track your collection</h2>
        <p style={{ color: '#A1A1AA', maxWidth: 520, margin: '12px auto 20px', fontSize: 14, lineHeight: 1.6 }}>Every copy you own with quantity, price, condition and grading; named collections for your PCs; set completion and a wantlist. Already on TCDB? Bring your whole collection over in a minute.</p>
        <button style={btnAccent} onClick={onOpenAuth}>Sign in to start</button>
        {urlParam('from') === 'tcdb' && <p style={{ ...muted, marginTop: 14 }}>Your TCDB cards are waiting — sign in and they’ll be ready to import.</p>}
      </div>
    </>
  )

  const replaceItem = (it) => store.setItems(cur => (cur || []).map(x => x.id === it.id ? it : x))
  const dropItems = (ids) => { const s = new Set(ids); store.setItems(cur => (cur || []).filter(x => !s.has(x.id))) }
  const duplicate = async (it) => {
    const { id, created_at, collected_at, updated_at, ...rest } = it
    const { data, error } = await insertItems(uid, [{ ...rest, qty: 1, grader: null, grade: null, cert_no: null, source: null, source_item_id: null, image_url: null }])
    if (error) { say('Couldn’t add a copy — ' + error.message, 'error'); return }
    store.setItems(cur => [...(cur || []), ...data]); setEditing(data[0])
  }
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h1 style={{ ...display, fontSize: 40, margin: 0 }}>My Collection</h1>
        <span style={muted}>{items ? plural(stats.cards, 'card') + ' · ' + plural(stats.sets.size, 'set') : 'Loading…'}{stats.value ? ' · ' + fmtMoney(stats.value) : ''}</span>
      </div>
      <div role="tablist" aria-label="My Collection" style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid #232A3E', marginBottom: 18 }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ ...buttonText, background: 'none', border: 'none', borderBottom: '2px solid ' + (tab === k ? ACCENT : 'transparent'), color: tab === k ? '#fff' : '#A1A1AA', padding: '10px 12px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>{l}</button>
        ))}
      </div>
      <Notice tone={notice?.tone} onClose={() => setNotice(null)}>{notice?.text}</Notice>
      <TcdbReceiver onPayload={() => { if (tab !== 'import') setTab('import') }} />

      {activeSlug ? (
        <Checklist slug={activeSlug} store={store} uid={uid} say={say} onBack={() => setActiveSlug(null)} onEdit={setEditing} onOpenSet={onOpenSet} />
      ) : items === null ? (
        <p role="status" style={muted}>Loading your collection…</p>
      ) : tab === 'overview' ? (
        <Overview stats={stats} items={items} store={store} indexBySlug={indexBySlug} account={account} setProfile={setProfile} profile={profile} uid={uid} say={say}
          goTab={setTab} onFilter={(f) => { setCardFilter(f); setTab('cards') }} onOpenChecklist={setActiveSlug} />
      ) : tab === 'cards' ? (
        <CardsTab items={items} store={store} preset={cardFilter} indexBySlug={indexBySlug} onEdit={setEditing} say={say} dropItems={dropItems} />
      ) : tab === 'sets' ? (
        <SetsTab items={items} indexBySlug={indexBySlug} onOpenChecklist={setActiveSlug} onOpenSet={onOpenSet} />
      ) : tab === 'wantlist' ? (
        <WantlistTab store={store} uid={uid} say={say} indexBySlug={indexBySlug} onOpenChecklist={setActiveSlug} onOpenSet={onOpenSet} onWantsChanged={onWantsChanged} />
      ) : (
        <ImportTab store={store} uid={uid} indexSets={indexSets} say={say} onWantsChanged={onWantsChanged} goTab={setTab} />
      )}
      {editing && <ItemEditor key={editing.id} item={editing} collections={store.collections} uid={uid} onClose={() => setEditing(null)}
        onSaved={(it) => { replaceItem(it); setEditing(null) }} onDeleted={(it) => { dropItems([it.id]); setEditing(null) }} onDuplicate={duplicate} />}
    </section>
  )
}

// ---------------- Overview ----------------
function Overview({ stats, items, store, indexBySlug, profile, setProfile, uid, say, goTab, onFilter, onOpenChecklist }) {
  const empty = items.length === 0
  const completion = useMemo(() => setCompletion(items, indexBySlug).filter(s => s.total).sort((a, b) => b.pct - a.pct || b.have - a.have).slice(0, 6), [items, indexBySlug])
  if (empty) return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
      {[
        ['Already on TCDB?', 'Bring your whole collection over — every card, quantity, price, wantlist and trade list. Takes about a minute.', 'Import from TCDB', () => goTab('import')],
        ['Have a spreadsheet?', 'Upload a CSV from Excel, Google Sheets, COMC, CollX, Ludex or anywhere else. We match each row to our checklists.', 'Import a CSV', () => goTab('import')],
        ['Starting fresh?', 'Open any set, hit “Track in My Collection” and check cards off. Add grading, prices and photos as you go.', 'Browse sets', () => goTab('sets')],
      ].map(([h, p, b, go]) => (
        <div key={h} style={{ ...card, padding: 22 }}>
          <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>{h}</h3>
          <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '8px 0 16px' }}>{p}</p>
          <button style={btnAccent} onClick={go}>{b}</button>
        </div>
      ))}
    </div>
  )
  const statusRows = [...stats.statuses.entries()].sort((a, b) => b[1] - a[1])
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {stats.unmatched > 0 && <Notice>{plural(stats.unmatched, 'imported card')} {stats.unmatched === 1 ? 'isn’t' : 'aren’t'} matched to a checklist yet (Card HQ doesn’t have those sets or parallels yet). They’re saved and will match as sets are added. <button style={{ ...btnSmall, marginLeft: 6 }} onClick={() => onFilter({ unmatched: true })}>See them</button></Notice>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Tile label="Cards" value={stats.cards.toLocaleString()} sub={plural(stats.entries, 'entry')} />
        <Tile label="Sets" value={stats.sets.size.toLocaleString()} sub={plural(stats.players.size, 'player')} />
        <Tile label="Value" value={stats.valued ? fmtMoney(stats.value) : '—'} sub={stats.valued ? plural(stats.valued, 'card') + ' valued' : 'add values to cards'} />
        <Tile label="Paid" value={stats.paid ? fmtMoney(stats.paid) : '—'} sub={stats.valued && stats.paid ? (stats.value >= stats.paid ? '+' : '−') + fmtMoney(Math.abs(stats.value - stats.paid)) + ' vs paid' : ''} />
        <Tile label="Graded" value={stats.graded.toLocaleString()} sub={stats.graders.size ? stats.top(stats.graders, 3).map(([g, n]) => g + ' ' + n).join(' · ') : ''} />
        <Tile label="For trade / sale" value={((stats.statuses.get('trade') || 0) + (stats.statuses.get('sale') || 0)).toLocaleString()} sub="your own labels" />
      </div>
      <ValueUpdater items={items} store={store} say={say} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
        <Bars heading="Top players" rows={stats.top(stats.players, 8)} onPick={(p) => onFilter({ player: p })} />
        <Bars heading="Top sets" rows={stats.top(stats.sets, 8)} fmt={(s) => indexBySlug.get(s)?.name || items.find(i => i.set_slug === s)?.set_name || s} onPick={onOpenChecklist} />
        <Bars heading="By sport" rows={stats.top(stats.sports, 8)} />
        <Bars heading="By brand" rows={stats.top(stats.brands, 8)} />
        <Bars heading="By season" rows={[...stats.years.entries()].sort((a, b) => b[0] - a[0]).slice(0, 10)} />
        <Bars heading="Status" rows={statusRows} fmt={(s) => STATUS_LABEL[s] || s} onPick={(s) => onFilter({ status: s })} />
      </div>
      {completion.length > 0 && (
        <div style={{ ...card, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <p style={{ ...eyebrow, color: '#8A93A8', margin: 0 }}>Closest to complete</p>
            <button style={btnSmall} onClick={() => goTab('sets')}>All sets</button>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
            {completion.map(s => (
              <button key={s.slug} onClick={() => onOpenChecklist(s.slug)} style={{ background: 'none', border: '1px solid #232A3E', borderRadius: 10, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ display: 'block', color: '#EDEDEF', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                <span style={{ display: 'block', ...muted, fontSize: 12, margin: '2px 0 6px' }}>{s.baseTotal ? `base ${s.baseHave}/${s.baseTotal} · ` : ''}{s.have}/{s.total} · {Math.floor(s.pct)}%</span>
                <Progress have={s.baseTotal ? s.baseHave : s.have} total={s.baseTotal || s.total} />
              </button>
            ))}
          </div>
        </div>
      )}
      <Collections store={store} uid={uid} say={say} items={items} onFilter={onFilter} profile={profile} setProfile={setProfile} />
    </div>
  )
}

// Values from recent sales, a batch at a time (cards with no value, or one older than 30 days).
function ValueUpdater({ items, store, say }) {
  const [run, setRun] = useState(null)   // { done, total, found } while running
  const stop = useRef(false)
  const stale = items.filter(it => it.set_slug !== UNMATCHED && OWNED_STATUSES.has(it.status) && (it.value == null || !it.value_at || Date.now() - Date.parse(it.value_at) > 30 * 86400000))
  if (!stale.length && !run) return null
  const BATCH = 100
  const go = async () => {
    stop.current = false
    const todo = stale.slice(0, BATCH)
    let found = 0
    setRun({ done: 0, total: todo.length, found })
    for (let i = 0; i < todo.length && !stop.current; i++) {
      const it = todo[i]
      const r = await fetchMarketValue(it)
      if (r.error) { say(r.error, 'error'); break }
      // no sales: stamp the date anyway so the next batch moves on to other cards
      const fields = r.count ? { value: r.median, value_at: new Date().toISOString() } : { value_at: new Date().toISOString() }
      if (r.count) found++
      await updateItem(it.id, fields)
      setRun({ done: i + 1, total: todo.length, found })
      await new Promise(res => setTimeout(res, 700))
    }
    await store.reloadItems()
    setRun(null)
    say('Values updated from recent sales: ' + plural(found, 'card') + ' priced.')
  }
  return (
    <div style={{ ...card, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ flex: 1, minWidth: 220, color: '#A1A1AA', fontSize: 14 }}>{run ? `Checking recent sales… ${run.done} of ${run.total} (${run.found} priced)` : `${plural(stale.length, 'card')} without a current value. GrailFindr can price them from recent sales.`}</span>
      {run ? <button style={btnSmall} onClick={() => { stop.current = true }}>Stop</button> : <button style={btnGhost} onClick={go}>Update {Math.min(BATCH, stale.length)} values</button>}
    </div>
  )
}

function Collections({ store, uid, say, items, onFilter, profile, setProfile }) {
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null)
  const counts = useMemo(() => { const m = new Map(); for (const it of items) m.set(it.collection_id || 0, (m.get(it.collection_id || 0) || 0) + (it.qty || 1)); return m }, [items])
  const shareUrl = profile?.username ? (typeof window !== 'undefined' ? window.location.origin : '') + '/?view=collector&u=' + encodeURIComponent(profile.username) : ''
  return (
    <div style={{ ...card, padding: '16px 18px' }}>
      <p style={{ ...eyebrow, color: '#8A93A8', margin: '0 0 10px' }}>Collections</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {store.collections.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {renaming === c.id ? (
              <form style={{ display: 'flex', gap: 6, flex: 1 }} onSubmit={async (e) => { e.preventDefault(); const v = e.target.elements.n.value; const { error } = await renameCollection(c.id, v); if (error) say('Couldn’t rename — ' + error.message, 'error'); setRenaming(null); store.reloadCollections() }}>
                <input name="n" aria-label="Collection name" defaultValue={c.name} maxLength={60} style={{ ...input, padding: '6px 10px' }} autoFocus />
                <button style={btnSmall}>Save</button>
              </form>
            ) : (
              <button onClick={() => onFilter({ collection: String(c.id) })} style={{ flex: '1 1 220px', minWidth: 0, background: 'none', border: 'none', color: '#EDEDEF', fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
                {c.name} <span style={{ ...muted, fontWeight: 400 }}>· {plural(counts.get(c.id) || 0, 'card')}{c.is_public ? ' · public' : ''}</span>
              </button>
            )}
            <button style={btnSmall} onClick={async () => { const { error } = await setCollectionPublic(c.id, !c.is_public); if (error) say(error.message, 'error'); store.reloadCollections() }}>{c.is_public ? 'Make private' : 'Make public'}</button>
            <button style={btnSmall} onClick={() => setRenaming(c.id)}>Rename</button>
            <button style={{ ...btnSmall, color: '#f87171' }} onClick={async () => { if (!window.confirm(`Delete “${c.name}”? Its cards stay in your collection, unfiled.`)) return; const { error } = await deleteCollection(c.id); if (error) say(error.message, 'error'); await store.reloadCollections(); store.reloadItems() }}>Delete</button>
          </div>
        ))}
        {counts.get(0) > 0 && <button onClick={() => onFilter({ collection: 'none' })} style={{ background: 'none', border: 'none', color: '#A1A1AA', fontSize: 14, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Unfiled <span style={muted}>· {plural(counts.get(0), 'card')}</span></button>}
      </div>
      <form style={{ display: 'flex', gap: 8, marginTop: 12 }} onSubmit={async (e) => {
        e.preventDefault(); if (!name.trim()) return
        const { error } = await createCollection(uid, name)
        if (error) say(/duplicate|unique/i.test(error.message) ? 'You already have a collection with that name.' : 'Couldn’t create — ' + error.message, 'error')
        else { setName(''); store.reloadCollections() }
      }}>
        <input aria-label="New collection name" placeholder="New collection, e.g. Patrick Kane PC" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, padding: '8px 12px' }} />
        <button style={btnGhost}>Add</button>
      </form>
      <div style={{ borderTop: '1px solid #232A3E', marginTop: 16, paddingTop: 14, display: 'grid', gap: 10 }}>
        <Toggle checked={profile?.is_public} onChange={async (v) => { const { data, error } = await updateProfile(uid, { is_public: v }); if (error) say(error.message, 'error'); else setProfile(data) }}
          hint={profile?.is_public && shareUrl ? <>Anyone with your link can see it: <a href={shareUrl} style={{ color: ACCENT_TEXT }}>{shareUrl.replace(/^https?:\/\//, '')}</a></> : 'Off: only you see your collection (single collections can still be made public above).'}>
          Public collection page
        </Toggle>
      </div>
    </div>
  )
}

// set slug -> { have (unique cards owned), total, base… }
function setCompletion(items, indexBySlug) {
  const by = new Map()
  for (const it of items) {
    if (it.set_slug === UNMATCHED || !OWNED_STATUSES.has(it.status)) continue
    let s = by.get(it.set_slug)
    if (!s) { const ix = indexBySlug.get(it.set_slug); s = { slug: it.set_slug, name: ix?.name || it.set_name || it.set_slug, total: ix?.cardCount || 0, baseTotal: ix?.baseCount || 0, baseTitle: ix?.baseTitle, keys: new Set(), baseKeys: new Set(), copies: 0, year: ix?.year || 0, sport: ix?.sport || '' }; by.set(it.set_slug, s) }
    const k = itemKey(it)
    s.keys.add(k); s.copies += it.qty || 1
    if (s.baseTitle && sectionKey(it.section) === sectionKey(s.baseTitle)) s.baseKeys.add(k)
  }
  return [...by.values()].map(s => ({ ...s, have: s.keys.size, baseHave: s.baseKeys.size, pct: s.total ? Math.min(100, 100 * (s.baseTotal ? s.baseKeys.size / s.baseTotal : s.keys.size / s.total)) : 0 }))
}

// ---------------- Cards ----------------
const SORTS = [['recent', 'Recently added'], ['set', 'Set'], ['player', 'Player'], ['value', 'Value (high)'], ['paid', 'Price paid (high)'], ['year', 'Season (new)']]
function CardsTab({ items, store, preset, indexBySlug, onEdit, say, dropItems }) {
  const [q, setQ] = useState(preset?.player || '')
  const [status, setStatus] = useState(preset?.status || 'all')
  const [coll, setColl] = useState(preset?.collection || 'all')
  const [only, setOnly] = useState(preset?.unmatched ? 'unmatched' : 'all')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(0)
  const [sel, setSel] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  useEffect(() => { setPage(0) }, [q, status, coll, only, sort])
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = items.filter(it => {
      if (status !== 'all' && it.status !== status) return false
      if (coll === 'none' ? it.collection_id : coll !== 'all' && String(it.collection_id) !== coll) return false
      if (only === 'unmatched' && it.set_slug !== UNMATCHED) return false
      if (only === 'graded' && !it.grader) return false
      if (only === 'autos' && !it.autographed) return false
      if (only === 'photos' && !it.image_url) return false
      if (needle && !(String(it.player || '') + ' ' + (it.set_name || '') + ' ' + (it.section || '') + ' ' + it.card_n + ' ' + (it.tags || []).join(' ') + ' ' + (it.notes || '')).toLowerCase().includes(needle)) return false
      return true
    })
    const yr = (it) => indexBySlug.get(it.set_slug)?.year || 0
    const cmp = { recent: (a, b) => b.id - a.id, set: (a, b) => String(a.set_name).localeCompare(String(b.set_name)) || String(a.card_n).localeCompare(String(b.card_n), 'en', { numeric: true }), player: (a, b) => String(a.player).localeCompare(String(b.player)), value: (a, b) => (b.value ?? -1) - (a.value ?? -1), paid: (a, b) => (b.price_paid ?? -1) - (a.price_paid ?? -1), year: (a, b) => yr(b) - yr(a) }[sort]
    return out.sort(cmp)
  }, [items, q, status, coll, only, sort, indexBySlug])
  const PER = 100
  const shown = filtered.slice(page * PER, page * PER + PER)
  const allOnPage = shown.length > 0 && shown.every(it => sel.has(it.id))
  const collName = new Map(store.collections.map(c => [c.id, c.name]))
  const bulk = async (fields, verb) => {
    setBusy(true); const ids = [...sel]
    const { error } = await updateItems(ids, fields); setBusy(false)
    if (error) say('Couldn’t update — ' + error.message, 'error'); else { say(plural(ids.length, 'card') + ' ' + verb + '.'); setSel(new Set()); store.reloadItems() }
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input aria-label="Search your cards" placeholder="Search player, set, tag, note…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, width: 'min(320px, 100%)', padding: '8px 12px' }} />
        <Select label="Status" ariaLabel="Status" value={status} onChange={setStatus} width={220} options={[['all', 'Any status'], ...STATUSES]} />
        <Select label="Collection" ariaLabel="Collection" value={coll} onChange={setColl} width={240} options={[['all', 'All collections'], ['none', 'Unfiled'], ...store.collections.map(c => [String(c.id), c.name])]} />
        <Select label="Show" ariaLabel="Show" value={only} onChange={setOnly} width={220} options={[['all', 'Everything'], ['graded', 'Graded'], ['autos', 'Autographed'], ['photos', 'With photos'], ['unmatched', 'Not matched yet']]} />
        <Select label="Sort" ariaLabel="Sort" value={sort} onChange={setSort} width={220} options={SORTS} />
      </div>
      {sel.size > 0 && (
        <div style={{ ...card, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', position: 'sticky', top: 70, zIndex: 5 }}>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{sel.size} selected</span>
          <Select ariaLabel="Set status" value="" onChange={(v) => v && bulk({ status: v }, 'updated')} width={220} options={[['', 'Set status…'], ...STATUSES]} />
          <Select ariaLabel="Move to collection" value="" onChange={(v) => v && bulk({ collection_id: v === 'none' ? null : +v }, 'moved')} width={240} options={[['', 'Move to…'], ['none', 'Unfiled'], ...store.collections.map(c => [String(c.id), c.name])]} />
          <button style={{ ...btnSmall, color: '#f87171' }} disabled={busy} onClick={async () => {
            if (!window.confirm(`Delete ${plural(sel.size, 'card')} from your collection? This can’t be undone.`)) return
            setBusy(true); const ids = [...sel]; const { error } = await deleteItems(ids); setBusy(false)
            if (error) say('Couldn’t delete — ' + error.message, 'error'); else { dropItems(ids); setSel(new Set()); say(plural(ids.length, 'card') + ' deleted.') }
          }}>Delete</button>
          <button style={btnSmall} onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
      <p style={{ ...muted, margin: '0 0 8px' }}>{plural(filtered.length, 'entry')} · {plural(filtered.reduce((s, it) => s + (it.qty || 1), 0), 'card')}</p>
      {filtered.length === 0 ? <div style={{ ...card, padding: 24, color: '#A1A1AA', fontSize: 14 }}>Nothing matches. Clear the filters, or add cards from any set page.</div> : (
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, color: '#D4D4D8', minWidth: 720 }}>
            <thead><tr style={{ borderBottom: '1px solid #232A3E' }}>
              <th style={{ ...th, width: 34 }}><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => setSel(s => { const n = new Set(s); for (const it of shown) e.target.checked ? n.add(it.id) : n.delete(it.id); return n })} style={{ accentColor: ACCENT }} /></th>
              <th style={th}>Card</th><th style={th}>Qty</th><th style={th}>Status</th><th style={th}>Collection</th><th style={th}>Grade</th><th style={{ ...th, textAlign: 'right' }}>Paid</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}><span className="sr-only">Edit</span></th>
            </tr></thead>
            <tbody>
              {shown.map(it => (
                <tr key={it.id} style={{ borderTop: '1px solid #1a1f31' }}>
                  <td style={td}><input type="checkbox" aria-label={'Select ' + it.player} checked={sel.has(it.id)} onChange={(e) => setSel(s => { const n = new Set(s); e.target.checked ? n.add(it.id) : n.delete(it.id); return n })} style={{ accentColor: ACCENT }} /></td>
                  <td style={{ ...td, minWidth: 260 }}>
                    <button onClick={() => onEdit(it)} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: '#EDEDEF' }}>
                      <span style={{ fontWeight: 600 }}>{String(it.card_n).startsWith('—') ? '' : <span style={{ color: ACCENT_TEXT }}>#{it.card_n} </span>}{it.player}</span>
                      <span style={{ display: 'block', ...muted, fontSize: 12 }}>{it.set_name || it.set_slug}{it.section && !/^base( set)?$/i.test(it.section) ? ' · ' + it.section : ''}{it.set_slug === UNMATCHED ? ' · not matched yet' : ''}{it.image_url ? ' · 📷' : ''}{it.autographed ? ' · signed' : ''}{it.serial_no ? ' · ' + it.serial_no : ''}</span>
                    </button>
                  </td>
                  <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{it.qty}</td>
                  <td style={td}><StatusChip status={it.status} /></td>
                  <td style={{ ...td, color: '#A1A1AA', fontSize: 13 }}>{collName.get(it.collection_id) || '—'}</td>
                  <td style={{ ...td, fontSize: 13 }}>{it.grader ? it.grader + ' ' + (it.grade || '') : it.condition || <span style={{ color: '#5C6478' }}>raw</span>}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{it.price_paid != null ? fmtMoney(it.price_paid) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{it.value != null ? fmtMoney(it.value) : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}><button style={btnSmall} onClick={() => onEdit(it)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > PER && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 }}>
          <button style={btnSmall} disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={muted}>Page {page + 1} of {Math.ceil(filtered.length / PER)}</span>
          <button style={btnSmall} disabled={(page + 1) * PER >= filtered.length} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

// ---------------- Sets ----------------
function SetsTab({ items, indexBySlug, onOpenChecklist, onOpenSet }) {
  const [show, setShow] = useState('all')
  const [sort, setSort] = useState('pct')
  const rows = useMemo(() => {
    let r = setCompletion(items, indexBySlug)
    if (show === 'complete') r = r.filter(s => s.pct >= 100)
    if (show === 'incomplete') r = r.filter(s => s.pct < 100)
    return r.sort(sort === 'pct' ? (a, b) => b.pct - a.pct || b.have - a.have : sort === 'year' ? (a, b) => b.year - a.year || a.name.localeCompare(b.name) : sort === 'cards' ? (a, b) => b.copies - a.copies : (a, b) => a.name.localeCompare(b.name))
  }, [items, indexBySlug, show, sort])
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Select label="Show" ariaLabel="Show" value={show} onChange={setShow} width={220} options={[['all', 'All sets'], ['incomplete', 'Incomplete'], ['complete', 'Complete']]} />
        <Select label="Sort" ariaLabel="Sort" value={sort} onChange={setSort} width={220} options={[['pct', 'Most complete'], ['cards', 'Most cards'], ['year', 'Newest'], ['name', 'Name']]} />
      </div>
      {rows.length === 0 ? <div style={{ ...card, padding: 24, color: '#A1A1AA', fontSize: 14 }}>No sets here yet. Open any set and hit “Track in My Collection”.</div> : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
          {rows.map(s => (
            <div key={s.slug} style={{ ...card, padding: '14px 16px' }}>
              <p style={{ ...title(15), margin: 0, color: '#fff' }}>{s.name}</p>
              <p style={{ ...muted, fontSize: 12, margin: '4px 0 8px' }}>{s.baseTotal ? `Base ${s.baseHave}/${s.baseTotal} · ` : ''}{s.total ? `Master ${s.have}/${s.total}` : plural(s.have, 'card')} · {plural(s.copies, 'copy')}</p>
              {s.total > 0 && <Progress have={s.baseTotal ? s.baseHave : s.have} total={s.baseTotal || s.total} />}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={{ ...btnAccent, padding: '7px 14px', fontSize: 13 }} onClick={() => onOpenChecklist(s.slug)}>Checklist</button>
                {onOpenSet && <button style={btnSmall} onClick={() => onOpenSet(s.slug)}>View set</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------- Checklist (check off a set) ----------------
function Checklist({ slug, store, uid, say, onBack, onEdit, onOpenSet }) {
  const [setData, setSetData] = useState(null)
  const [secShown, setSecShown] = useState(12)
  const [coll, setColl] = useState('')   // new cards land in this collection
  const [filter, setFilter] = useState('all')
  const busy = useRef(new Set())
  const pendingQty = useRef(new Map())
  useEffect(() => {
    let live = true
    setSetData(null); setSecShown(12)
    ;(async () => {
      let d = await loadSet(slug).catch(() => null)
      if (!d) { const to = (await loadRedirects())[slug]; if (to) d = await loadSet(to).catch(() => null) }
      if (!live) return
      if (d) setSetData(d); else { say('That set’s checklist isn’t available right now (it may have been renamed or removed).', 'error'); onBack() }
    })()
    return () => { live = false }
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = useMemo(() => {
    const m = new Map()
    for (const it of store.items || []) { if (it.set_slug !== slug && it.set_slug !== setData?.slug) continue; const k = cardKey(setData?.slug || slug, it.section, it.card_n); if (!m.has(k)) m.set(k, []); m.get(k).push(it) }
    return m
  }, [store.items, slug, setData])
  if (!setData) return <p role="status" style={muted}>Loading checklist…</p>
  const realSlug = setData.slug || slug
  const total = setData.sections.reduce((s, x) => s + x.cards.length, 0)
  const haveN = setData.sections.reduce((s, sec) => s + sec.cards.filter(c => byKey.has(cardKeyOf(realSlug, sec.title, c))).length, 0)
  const add = async (sec, cards) => {
    const rows = cards.map(c => ({ set_slug: realSlug, set_name: setData.name, section: sec.title, card_n: collectionCardN(c), player: c.p, collection_id: coll ? +coll : null, status: 'have', qty: 1 }))
    const { data, error } = await insertItems(uid, rows)
    if (error) say('Couldn’t save — ' + error.message, 'error')
    if (data?.length) store.setItems(cur => [...(cur || []), ...data])
  }
  const toggle = async (sec, c, on) => {
    const k = cardKeyOf(realSlug, sec.title, c)
    if (busy.current.has(k)) return
    busy.current.add(k)
    try {
      if (on) await add(sec, [c])
      else {
        const its = byKey.get(k) || []
        const detailed = its.length > 1 || its.some(hasDetails)
        if (detailed && !window.confirm(`Remove ${plural(its.reduce((s, it) => s + it.qty, 0), 'copy')} of this card, with their details?`)) return
        const { error } = await deleteItems(its.map(it => it.id))
        if (error) say('Couldn’t save — ' + error.message, 'error'); else { const ids = new Set(its.map(it => it.id)); store.setItems(cur => (cur || []).filter(x => !ids.has(x.id))) }
      }
    } finally { busy.current.delete(k) }
  }
  const bump = async (it, d) => {
    // from the latest copy, not this render's (fast double clicks)
    const cur = (store.items || []).find(x => x.id === it.id) || it
    const qty = Math.max(1, Math.min(9999, (pendingQty.current.get(it.id) ?? cur.qty) + d))
    if (qty === cur.qty && !pendingQty.current.has(it.id)) return
    pendingQty.current.set(it.id, qty)
    store.setItems(list => list.map(x => x.id === it.id ? { ...x, qty } : x))
    const { error } = await updateItem(it.id, { qty })
    if (pendingQty.current.get(it.id) === qty) pendingQty.current.delete(it.id)
    if (error) { say('Couldn’t save — ' + error.message, 'error'); store.reloadItems() }
  }
  return (
    <div>
      <button style={{ ...btnGhost, marginBottom: 14 }} onClick={onBack}>← Back</button>
      <h2 style={{ ...title(24), margin: '0 0 4px', color: '#fff' }}>{setData.name}</h2>
      <p style={{ ...muted, margin: '0 0 10px' }}>{haveN.toLocaleString()} of {total.toLocaleString()} cards · check cards off as you collect them; ✎ adds grading, price and photos.</p>
      <div style={{ maxWidth: 520, marginBottom: 12 }}><Progress have={haveN} total={total} /></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <Select label="Show" ariaLabel="Show" value={filter} onChange={setFilter} width={200} options={[['all', 'All cards'], ['missing', 'Missing'], ['have', 'Have']]} />
        {store.collections.length > 0 && <Select label="Add to" ariaLabel="New cards go to collection" value={coll} onChange={setColl} width={240} options={[['', 'Unfiled'], ...store.collections.map(c => [String(c.id), c.name])]} />}
        {onOpenSet && <button style={btnSmall} onClick={() => onOpenSet(realSlug)}>View set page</button>}
      </div>
      {setData.sections.slice(0, secShown).map((sec, si) => {
        const cards = sec.cards.filter(c => filter === 'all' || (filter === 'have') === byKey.has(cardKeyOf(realSlug, sec.title, c)))
        const missing = sec.cards.filter(c => !byKey.has(cardKeyOf(realSlug, sec.title, c)))
        if (!cards.length) return null
        return (
          <div key={si} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', margin: '0 0 8px' }}>
              <h3 style={{ ...title(16), color: ACCENT_TEXT, margin: 0 }}>{sec.title} <span style={{ color: '#8A93A8', fontWeight: 600 }}>({sec.cards.length - missing.length}/{sec.cards.length})</span></h3>
              {missing.length > 1 && <button style={btnSmall} onClick={() => { if (window.confirm(`Mark all ${missing.length} missing cards in ${sec.title} as collected?`)) add(sec, missing) }}>Check all</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 6 }}>
              {cards.map((c, ci) => {
                const its = byKey.get(cardKeyOf(realSlug, sec.title, c)) || []
                const isC = its.length > 0
                const first = its[0]
                return (
                  <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isC ? '#12200f' : '#121212', border: '1px solid ' + (isC ? '#2f5324' : '#222'), borderRadius: 8, padding: '6px 8px' }}>
                    <input type="checkbox" aria-label={'Collected ' + (c.n ? '#' + c.n + ' ' : '') + c.p} checked={isC} onChange={(e) => toggle(sec, c, e.target.checked)} style={{ accentColor: ACCENT, width: 18, height: 18, flexShrink: 0 }} />
                    <span style={{ color: '#8A93A8', fontSize: 12, minWidth: 30 }}>{c.n || '—'}</span>
                    <span style={{ color: isC ? '#9fd18a' : '#D4D4D8', fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.p}</span>
                    {isC && its.length === 1 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <button aria-label="One fewer copy" onClick={() => bump(first, -1)} disabled={first.qty <= 1} style={{ ...btnSmall, padding: '1px 7px' }}>−</button>
                        <span style={{ color: '#D4D4D8', fontSize: 12, minWidth: 18, textAlign: 'center' }}>{first.qty}</span>
                        <button aria-label="One more copy" onClick={() => bump(first, 1)} style={{ ...btnSmall, padding: '1px 7px' }}>+</button>
                      </span>
                    )}
                    {its.length > 1 && <span style={{ ...muted, fontSize: 12 }}>{its.length} entries</span>}
                    {isC && <button aria-label="Edit details" title="Grading, price, photo…" onClick={() => onEdit(first)} style={{ ...btnSmall, padding: '1px 7px' }}>✎</button>}
                    {first?.grader && <span style={{ fontSize: 11, color: '#facc15', fontWeight: 700 }}>{first.grader} {first.grade}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      {setData.sections.length > secShown && <button style={{ ...btnGhost, display: 'block', margin: '8px auto 0' }} onClick={() => setSecShown(n => n + 12)}>Show {Math.min(12, setData.sections.length - secShown)} more sections ({setData.sections.length - secShown} left)</button>}
    </div>
  )
}

// ---------------- Wantlist ----------------
function WantlistTab({ store, uid, say, indexBySlug, onOpenChecklist, onOpenSet, onWantsChanged }) {
  const wants = store.wants
  const [open, setOpen] = useState({})
  const [rule, setRule] = useState({ kind: 'player', value: '', max_print_run: '', rookies_only: false, autos_only: false })
  const groups = useMemo(() => { const g = {}; for (const w of wants || []) (g[w.set_slug] = g[w.set_slug] || { name: w.set_name || w.set_slug, items: [] }).items.push(w); return g }, [wants])
  const completion = useMemo(() => new Map(setCompletion(store.items || [], indexBySlug).map(s => [s.slug, s])), [store.items, indexBySlug])
  const refresh = () => { store.reloadWants(); onWantsChanged?.() }
  if (wants === null) return <p role="status" style={muted}>Loading…</p>
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, padding: '16px 18px' }}>
        <p style={{ ...eyebrow, color: '#8A93A8', margin: '0 0 4px' }}>Wantlist rules</p>
        <p style={{ ...muted, margin: '0 0 12px' }}>Want everything of a player or team without adding cards one by one. Rules mark matching cards on set and player pages.</p>
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }} onSubmit={async (e) => {
          e.preventDefault()
          if (!rule.value.trim()) return
          const { error } = await addRule(uid, { kind: rule.kind, value: rule.value.trim(), max_print_run: rule.max_print_run ? +rule.max_print_run : null, rookies_only: rule.rookies_only, autos_only: rule.autos_only })
          if (error) say('Couldn’t add the rule — ' + error.message, 'error'); else { setRule(r => ({ ...r, value: '' })); store.reloadRules() }
        }}>
          <Select ariaLabel="Rule type" value={rule.kind} onChange={(v) => setRule(r => ({ ...r, kind: v }))} width={200} options={[['player', 'Every card of player'], ['team', 'Every card of team']]} />
          <input aria-label={rule.kind === 'player' ? 'Player name' : 'Team name'} placeholder={rule.kind === 'player' ? 'Patrick Kane' : 'Chicago Blackhawks'} value={rule.value} maxLength={200} onChange={(e) => setRule(r => ({ ...r, value: e.target.value }))} style={{ ...input, width: 220, padding: '8px 12px' }} />
          <Select ariaLabel="Print run" value={rule.max_print_run} onChange={(v) => setRule(r => ({ ...r, max_print_run: v }))} width={200} options={[['', 'Any print run'], ['1', '1/1 only'], ['10', '/10 or less'], ['25', '/25 or less'], ['99', '/99 or less'], ['499', '/499 or less']]} />
          <Toggle checked={rule.rookies_only} onChange={(v) => setRule(r => ({ ...r, rookies_only: v }))}>Rookies</Toggle>
          <Toggle checked={rule.autos_only} onChange={(v) => setRule(r => ({ ...r, autos_only: v }))}>Autos</Toggle>
          <button style={btnGhost}>Add rule</button>
        </form>
        {store.rules.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
            {store.rules.map(r => (
              <li key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: '#D4D4D8' }}>
                <span style={{ flex: 1 }}>Every <b>{r.value}</b> card{r.kind === 'team' ? ' (team)' : ''}{r.max_print_run ? (r.max_print_run === 1 ? ' · 1/1s' : ' · /' + r.max_print_run + ' or less') : ''}{r.rookies_only ? ' · rookies' : ''}{r.autos_only ? ' · autos' : ''}</span>
                <button style={btnSmall} aria-label={'Remove rule ' + r.value} onClick={async () => { const { error } = await removeRule(r.id); if (error) say(error.message, 'error'); store.reloadRules() }}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {wants.length === 0 && <div style={{ ...card, padding: 24, color: '#A1A1AA', fontSize: 14 }}>Your wantlist is empty. Browse any set and hit <b style={{ color: ACCENT_TEXT }}>+</b> on a card, or “+ Wantlist this set”.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 14 }}>
        {Object.entries(groups).map(([slug, g]) => {
          const c = completion.get(slug), ix = indexBySlug.get(slug)
          const cardsWanted = g.items.filter(i => i.card_n)
          return (
            <div key={slug} style={{ ...card, padding: '16px 18px' }}>
              <p style={{ ...title(15), margin: 0, color: '#fff' }}>{g.name}</p>
              <p style={{ ...muted, fontSize: 12, margin: '4px 0 10px' }}>{g.items.some(i => !i.card_n) ? 'Full set wanted' : plural(cardsWanted.length, 'card') + ' wanted'}{ix?.cardCount ? ` · own ${c?.have || 0}/${ix.cardCount}` : ''}</p>
              {cardsWanted.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 4 }}>
                  {cardsWanted.slice(0, open[slug] ? undefined : 6).map(i => (
                    <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#D4D4D8' }}>
                      <span style={{ color: ACCENT_TEXT, fontWeight: 700, minWidth: 44 }}>{String(i.card_n).startsWith('—') ? '—' : '#' + i.card_n}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.player || ''}{i.section && !/^base( set)?$/i.test(i.section) ? <span style={{ color: '#8A93A8' }}> · {i.section}</span> : null}</span>
                      {slug !== UNMATCHED && <a href={grailfindrFindUrl({ setName: g.name, player: i.player, n: i.card_n, section: i.section })} target="_blank" rel="noreferrer" title="Find it for sale, or save a GrailFindr alert" style={{ color: ACCENT_TEXT, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Find ↗</a>}
                      <button aria-label={'Remove ' + (i.player || 'card') + ' from wantlist'} onClick={async () => { const r = await removeWant(i.id); if (r.error) say('Couldn’t remove — ' + r.error.message, 'error'); refresh() }} style={{ background: 'none', border: 'none', color: '#8A93A8', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>✕</button>
                    </li>
                  ))}
                  {cardsWanted.length > 6 && !open[slug] && <li><button onClick={() => setOpen(o => ({ ...o, [slug]: true }))} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>Show all {cardsWanted.length}</button></li>}
                </ul>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {slug !== UNMATCHED && <button style={{ ...btnAccent, padding: '7px 14px', fontSize: 13 }} onClick={() => onOpenChecklist(slug)}>Checklist</button>}
                {slug !== UNMATCHED && onOpenSet && <button style={btnSmall} onClick={() => onOpenSet(slug)}>View set</button>}
                <button style={{ ...btnSmall, color: '#f87171' }} onClick={async () => {
                  if (!window.confirm(`Remove all ${g.items.length} wantlist entries for ${g.name}?`)) return
                  let failed = 0; for (const i of g.items) { const r = await removeWant(i.id); if (r.error) failed++ }
                  if (failed) say('Couldn’t remove ' + failed + ' of ' + g.items.length + ' — try again.', 'error'); refresh()
                }}>Remove</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------- TCDB hand-off receiver ----------------
// The bookmark (public/tcdb-importer.js) opens ?view=collection&ctab=import&from=tcdb and posts the
// collection here once it has read it. Only messages from tcdb.com are accepted. The payload is kept
// in sessionStorage so it survives signing in (which leaves the page) and a reload.
// Very large collections don't fit in sessionStorage (~5 MB); this tab keeps them in memory too.
const TCDB_KEY = 'cardhq-tcdb-payload'
let tcdbInMemory = null
export const readTcdbPayload = () => { if (tcdbInMemory) return tcdbInMemory; try { return JSON.parse(sessionStorage.getItem(TCDB_KEY) || 'null') } catch { return null } }
const clearTcdbPayload = () => { tcdbInMemory = null; try { sessionStorage.removeItem(TCDB_KEY) } catch {} }
function validTcdbPayload(d) {
  return !!d && d.type === 'cardhq-tcdb-import' && d.v === 1 && Array.isArray(d.items) && d.items.length <= 300000
    && d.items.every(r => r && typeof r === 'object' && typeof r.title === 'string' && r.title.length < 400)
}
function TcdbReceiver({ onPayload }) {
  useEffect(() => {
    if (urlParam('from') !== 'tcdb') return
    let got = !!readTcdbPayload()
    const onMsg = (e) => {
      if (!TCDB_ORIGINS.includes(e.origin) || !validTcdbPayload(e.data)) return
      tcdbInMemory = e.data
      try { sessionStorage.setItem(TCDB_KEY, JSON.stringify(e.data)) } catch {}   // too big: the in-memory copy still works (just not across a sign-in)
      got = true
      window.dispatchEvent(new Event('cardhq-tcdb'))
      onPayload(e.data)
    }
    window.addEventListener('message', onMsg)
    // tell the TCDB tab we're ready (it may still be reading; ask again until it answers)
    const ping = () => { if (window.opener) for (const o of TCDB_ORIGINS) try { window.opener.postMessage({ type: 'cardhq-tcdb-ready' }, o) } catch {} }
    if (!got) ping()
    const t = setInterval(() => { if (got) clearInterval(t); else ping() }, 2000)
    return () => { window.removeEventListener('message', onMsg); clearInterval(t) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ---------------- Import / Export ----------------
// TCDB's condition codes -> ours
const TCDB_COND = { gemmt: 'Gem Mint', mint: 'Mint', 'nm-mt': 'NM-MT', nrmt: 'NM', 'ex-mt': 'EX-MT', ex: 'EX', vgex: 'VG-EX', vg: 'VG', gdvg: 'Good', gd: 'Good', fr: 'Fair', pr: 'Poor' }
const str = (v, n) => (v == null ? '' : String(v)).trim().slice(0, n)
function tcdbRows(p) {
  return p.items.map(r => {
    const t = parseTcdbTitle(r.title)
    const d = r.details && typeof r.details === 'object' ? r.details : {}
    const flags = new Set(t.flags)
    return {
      kind: r.status === 'want' ? 'want' : 'have', source: 'tcdb', source_item_id: str(r.itemId, 60) || null,
      setName: t.setName.slice(0, 300), sport: str(r.sport, 40), cardN: t.cardN.slice(0, 100), player: t.player.slice(0, 300), label: r.title,
      qty: Math.max(1, Math.min(9999, parseInt(r.qty, 10) || 1)), status: ['have', 'trade', 'in_transaction', 'in_transit_in', 'in_transit_out'].includes(r.status) ? r.status : 'have',
      collection: str(r.collection, 60) || null, price_paid: money(d.price || r.price),
      condition: TCDB_COND[str(d.condition, 20).toLowerCase()] || null,
      grader: d.graded && d.grader ? str(d.grader, 20) : null, grade: d.graded && d.grade ? str(d.grade, 10) : null,
      autographed: !!d.autographed || flags.has('AU'), serial_no: str(d.serial, 20) || null,
      notes: str(d.comment, 2000) || null, tags: (Array.isArray(d.tags) ? d.tags : []).slice(0, 20).map(x => str(x, 40)).filter(Boolean),
      acquired_on: isoDate(d.added), tcdb_sid: Number.isInteger(r.sid) ? r.sid : null, tcdb_cid: Number.isInteger(r.cid) ? r.cid : null,
    }
  })
}
// a short stable id for a CSV line, so importing the same file twice (or retrying) doesn't double it
const hashStr = (t) => { let h = 0x811c9dc5, h2 = 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; h2 = (Math.imul(h2, 31) + t.charCodeAt(i)) >>> 0 } return h.toString(36) + h2.toString(36) }
function csvRows(rows, map, fileName) {
  const g = (r, k) => (map[k] ? r[map[k]] : '') || ''
  const seen = new Map()
  return rows.map((r, i) => {
    const line = JSON.stringify(Object.values(r))
    const n = (seen.get(line) || 0) + 1; seen.set(line, n)   // identical lines are separate copies
    let setName = g(r, 'set'); const year = g(r, 'year')
    if (year && !/\b(18|19|20)\d\d\b/.test(setName)) setName = year + ' ' + setName
    const st = g(r, 'status').toLowerCase()
    const want = /want/.test(st)
    return {
      kind: want ? 'want' : 'have', source: 'csv', source_item_id: hashStr(String(fileName || '') + '|' + line + '|' + n).slice(0, 60), row: i + 2,
      setName: setName.slice(0, 300), setSlug: g(r, 'set_slug').slice(0, 200) || null, sport: g(r, 'sport').slice(0, 40), section: g(r, 'section').slice(0, 300), cardN: g(r, 'card_n').replace(/^#/, '').slice(0, 100), player: g(r, 'player').slice(0, 300),
      label: [setName, g(r, 'section'), g(r, 'card_n') && '#' + g(r, 'card_n').replace(/^#/, ''), g(r, 'player')].filter(Boolean).join(' '),
      qty: Math.max(1, Math.min(9999, parseInt(g(r, 'qty'), 10) || 1)), status: /trade/.test(st) ? 'trade' : /sale|sell/.test(st) ? 'sale' : 'have',
      collection: g(r, 'collection').trim().slice(0, 60) || null, price_paid: money(g(r, 'price_paid')), value: money(g(r, 'value')),
      condition: g(r, 'condition').slice(0, 20) || null, grader: g(r, 'grader').slice(0, 20) || null, grade: g(r, 'grade').slice(0, 10) || null, cert_no: g(r, 'cert_no').slice(0, 40) || null,
      serial_no: g(r, 'serial_no').slice(0, 20) || null, autographed: yesNo(g(r, 'autographed')), acquired_on: isoDate(g(r, 'acquired_on')),
      tags: g(r, 'tags').split(/[;,]/).map(t => t.trim()).filter(Boolean).slice(0, 20), notes: g(r, 'notes').slice(0, 2000) || null,
    }
  }).filter(r => r.setName || r.setSlug)
}

function ImportTab({ store, uid, indexSets, say, onWantsChanged, goTab }) {
  const [incoming, setIncoming] = useState(null)   // { src, rows, label }
  const [tcdbCode, setTcdbCode] = useState('')
  const [csv, setCsv] = useState(null)   // { headers, rows, map, name }
  const [gaps, setGaps] = useState(null)
  const fileRef = useRef(null), jsonRef = useRef(null), bmRef = useRef(null)
  // the bookmark's code, with this site's address filled in
  useEffect(() => { fetch('/tcdb-importer.js').then(r => r.ok ? r.text() : '').then(t => setTcdbCode(t.replace("'CARDHQ_ORIGIN'", JSON.stringify(window.location.origin)))).catch(() => {}) }, [])
  const takeTcdb = (p) => { if (validTcdbPayload(p)) setIncoming({ src: 'tcdb', rows: tcdbRows(p), label: 'TCDB' + (p.member ? ' (' + p.member + ')' : ''), full: p.full }) }
  useEffect(() => {
    const p = readTcdbPayload(); if (p) takeTcdb(p)
    const on = () => { const q = readTcdbPayload(); if (q) takeTcdb(q) }
    window.addEventListener('cardhq-tcdb', on)
    return () => window.removeEventListener('cardhq-tcdb', on)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { isAdmin().then(a => { if (a) unmatchedSummary().then(setGaps) }) }, [])
  // comments out (a browser that drops the newlines in a saved bookmark would comment out the rest)
  const bookmarklet = tcdbCode ? 'javascript:' + encodeURIComponent(tcdbCode.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '').replace(/\s*\n\s*/g, '\n').trim()) : ''
  // React blocks javascript: links in href, so the bookmark's address is set on the element directly
  useEffect(() => { if (bmRef.current && bookmarklet) bmRef.current.setAttribute('href', bookmarklet) }, [bookmarklet, incoming, csv])
  const unmatched = (store.items || []).filter(it => it.set_slug === UNMATCHED)
  const exportCsv = () => {
    const coll = new Map(store.collections.map(c => [c.id, c.name]))
    const H = ['Set', 'Insert / parallel', 'Card #', 'Player', 'Qty', 'Status', 'Collection', 'Condition', 'Grader', 'Grade', 'Cert #', 'Serial #', 'Autographed', 'Price paid', 'Value', 'Date acquired', 'Tags', 'Notes', 'Photo', 'Card HQ set ID']
    const rows = (store.items || []).map(it => ({ Set: it.set_name || it.set_slug, 'Insert / parallel': it.section, 'Card #': String(it.card_n).startsWith('—') ? '' : it.card_n, Player: it.player, Qty: it.qty, Status: STATUS_LABEL[it.status], Collection: coll.get(it.collection_id) || '', Condition: it.condition, Grader: it.grader, Grade: it.grade, 'Cert #': it.cert_no, 'Serial #': it.serial_no, Autographed: it.autographed ? 'Yes' : '', 'Price paid': it.price_paid, Value: it.value, 'Date acquired': it.acquired_on, Tags: it.tags, Notes: it.notes, Photo: it.image_url, 'Card HQ set ID': it.set_slug === UNMATCHED ? '' : it.set_slug }))
    const wants = (store.wants || []).map(w => ({ Set: w.set_name || w.set_slug, 'Insert / parallel': w.section, 'Card #': String(w.card_n || '').startsWith('—') ? '' : w.card_n, Player: w.player, Qty: 1, Status: 'Wantlist', 'Card HQ set ID': w.set_slug === UNMATCHED ? '' : w.set_slug }))
    download('cardhq-collection-' + new Date().toISOString().slice(0, 10) + '.csv', toCsv(H, [...rows, ...wants]))
  }
  if (incoming) return <ImportReview incoming={incoming} store={store} uid={uid} indexSets={indexSets} say={say} onWantsChanged={onWantsChanged}
    onDone={(msg) => { if (incoming.src === 'tcdb') clearTcdbPayload(); setIncoming(null); setUrlParam('from', null); say(msg); goTab('overview') }} onCancel={() => { if (incoming.src === 'tcdb') clearTcdbPayload(); setIncoming(null) }} />
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, padding: '18px 20px' }}>
        <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>Import from TCDB</h3>
        <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>Brings over every card in your TCDB collection — quantities, prices, named collections, your wantlist and trade list. Your TCDB account isn’t touched and we never see your TCDB password: the import runs in your own browser.</p>
        <ol style={{ color: '#D4D4D8', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px', paddingLeft: 20 }}>
          <li>Drag this button to your bookmarks bar: {bookmarklet
            ? <a ref={bmRef} onClick={(e) => { e.preventDefault(); say('Drag the button to your bookmarks bar, then click it while you’re on tcdb.com.') }} draggable style={{ ...btnAccent, display: 'inline-block', padding: '5px 12px', fontSize: 13, textDecoration: 'none', margin: '0 4px', cursor: 'grab' }}>Card HQ import</a>
            : <span style={muted}>loading…</span>}
            <span style={{ ...muted, fontSize: 12 }}> (no bookmarks bar? Ctrl+Shift+B / ⌘+Shift+B shows it)</span></li>
          <li>Go to <a href="https://www.tcdb.com" target="_blank" rel="noreferrer" style={{ color: ACCENT_TEXT }}>tcdb.com</a>, sign in, and click the bookmark.</li>
          <li>Pick <b>Quick</b> (about a minute) or <b>Full</b> (adds condition, grading, serial # and notes; about a second per card). Your cards open here for a final check before anything is saved.</li>
        </ol>
        <p style={{ ...muted, fontSize: 12, margin: 0 }}>Re-run it any time: cards you imported before are updated, not doubled. Got a file from the bookmark instead? <button style={btnSmall} onClick={() => jsonRef.current?.click()}>Upload it</button></p>
        <input ref={jsonRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
          try { const p = JSON.parse(await f.text()); if (!validTcdbPayload(p)) throw new Error(); takeTcdb(p) } catch { say('That file isn’t a Card HQ import file from the TCDB bookmark.', 'error') }
        }} />
      </div>

      <div style={{ ...card, padding: '18px 20px' }}>
        <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>Import a spreadsheet (CSV)</h3>
        <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>From Excel, Google Sheets (File → Download → CSV), COMC, CollX, Ludex, Beckett or your own list. You pick which column is which; we match each row to our checklists.</p>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv" style={{ display: 'none' }} onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return
          if (f.size > 20 * 1024 * 1024) { say('That file is over 20 MB — split it into smaller files.', 'error'); return }
          const p = parseCsv(await f.text())
          if (!p.rows.length) { say('That file has no rows.', 'error'); return }
          setCsv({ ...p, map: guessMapping(p.headers), name: f.name })
        }} />
        {!csv ? <button style={btnGhost} onClick={() => fileRef.current?.click()}>Choose a CSV file</button> : (
          <div>
            <p style={{ ...muted, margin: '0 0 10px' }}>{csv.name}: {plural(csv.rows.length, 'row')}. Check the columns:</p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
              {IMPORT_FIELDS.map(([k, l]) => (
                <div key={k}><span style={label}>{l}{['set', 'player'].includes(k) ? ' *' : ''}</span>
                  <Select ariaLabel={l} value={csv.map[k] || ''} onChange={(v) => setCsv(c => ({ ...c, map: { ...c.map, [k]: v || undefined } }))} width={260} style={{ width: '100%' }} options={[['', '— not in file —'], ...csv.headers.map(h => [h, h])]} />
                </div>
              ))}
            </div>
            <p style={{ ...muted, fontSize: 12, margin: '10px 0 0' }}>First row: {csv.map.set ? csv.rows[0][csv.map.set] : '—'} {csv.map.card_n ? '#' + csv.rows[0][csv.map.card_n] : ''} {csv.map.player ? csv.rows[0][csv.map.player] : ''}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button style={btnAccent} disabled={!csv.map.set && !csv.map.set_slug} onClick={() => { const rows = csvRows(csv.rows, csv.map, csv.name); if (!rows.length) { say('No rows have a set name.', 'error'); return } setIncoming({ src: 'csv', rows, label: csv.name }); setCsv(null) }}>Match cards</button>
              <button style={btnGhost} onClick={() => setCsv(null)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...card, padding: '18px 20px' }}>
        <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>Export</h3>
        <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>Your data is yours: download everything — every copy with its details, plus your wantlist — as a spreadsheet. It re-imports here as-is.</p>
        <button style={btnGhost} onClick={exportCsv} disabled={!(store.items || []).length && !(store.wants || []).length}>Download CSV</button>
      </div>

      {unmatched.length > 0 && (
        <div style={{ ...card, padding: '18px 20px' }}>
          <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>{plural(unmatched.length, 'card')} waiting for a match</h3>
          <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '8px 0 12px' }}>These came from an import but Card HQ didn’t have their set or parallel yet. New sets arrive every week — check again any time.</p>
          <button style={btnGhost} onClick={() => setIncoming({ src: 'rematch', rows: unmatched.map(it => ({ kind: 'have', id: it.id, setName: it.set_name, section: it.section || '', cardN: String(it.card_n).startsWith('—') ? '' : it.card_n, player: it.player, label: [it.set_name, it.section, it.card_n, it.player].filter(Boolean).join(' ') })), label: 'Re-match' })}>Re-match now</button>
        </div>
      )}

      {gaps && gaps.length > 0 && (
        <div style={{ ...card, padding: '18px 20px' }}>
          <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>Admin: sets collectors have that we don’t</h3>
          <p style={{ ...muted, margin: '6px 0 10px' }}>From imports, all users combined (no names). Top {Math.min(50, gaps.length)} by collectors:</p>
          <div style={{ display: 'grid', gap: 3, maxHeight: 360, overflowY: 'auto' }}>
            {gaps.slice(0, 50).map(g => <p key={g.set_name} style={{ margin: 0, fontSize: 13, color: '#D4D4D8' }}>{g.set_name} <span style={muted}>· {plural(+g.cards, 'card')} · {plural(+g.collectors, 'collector')}</span></p>)}
          </div>
        </div>
      )}
    </div>
  )
}

function ImportReview({ incoming, store, uid, indexSets, say, onDone, onCancel, onWantsChanged }) {
  const [res, setRes] = useState(null)
  const [prog, setProg] = useState([0, incoming.rows.length])
  const [skip, setSkip] = useState(() => new Set())     // rows not to import
  const [keepUnmatched, setKeepUnmatched] = useState(true)
  const [busy, setBusy] = useState('')
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    let live = true
    const index = buildSetIndex(indexSets || [])
    matchRows(incoming.rows, { index, loadSet: (s) => loadSet(s).catch(() => null), onProgress: (d, t) => live && setProg([d, t]) })
      .then(r => { if (live) setRes(r) })
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!res) return (
    <div style={{ ...card, padding: 22 }}>
      <h3 style={{ ...title(18), margin: 0, color: '#fff' }}>Matching {plural(incoming.rows.length, 'card')} from {incoming.label}…</h3>
      <p role="status" style={{ ...muted, margin: '8px 0 10px' }}>{prog[0].toLocaleString()} of {prog[1].toLocaleString()}</p>
      <div style={{ maxWidth: 480 }}><Progress have={prog[0]} total={prog[1]} /></div>
    </div>
  )
  const rows = incoming.rows.map((r, i) => ({ r, m: res[i], i }))
  const exact = rows.filter(x => x.m.conf === 'exact'), likely = rows.filter(x => x.m.conf === 'likely'), none = rows.filter(x => x.m.conf === 'none')
  const haves = rows.filter(x => x.r.kind !== 'want'), wantsN = rows.length - haves.length
  const doImport = async () => {
    setBusy('Saving…')
    try {
      if (incoming.src === 'rematch') {
        const upd = rows.filter(x => x.m.conf !== 'none' && !skip.has(x.i)).map(x => {
          const it = (store.items || []).find(y => y.id === x.r.id)
          return { ...it, set_slug: x.m.slug, set_name: x.m.setName, section: x.m.section, card_n: collectionCardN({ n: x.m.card_n, p: x.m.player }), player: x.m.player }
        }).filter(x => x.id)
        const { error } = await updateWholeItems(upd)
        if (error) throw error
        await store.reloadItems()
        onDone(upd.length ? plural(upd.length, 'card') + ' matched.' : 'No new matches yet.')
        return
      }
      // named collections first
      const names = [...new Set(incoming.rows.map(r => r.collection).filter(Boolean))]
      const { map, error: ce } = await ensureCollections(uid, names, store.collections)
      if (ce) throw ce
      const collId = (n) => (n && map.get(String(n).trim().slice(0, 60).toLowerCase())?.id) || null
      const existing = new Map((store.items || []).filter(it => it.source && it.source_item_id).map(it => [it.source + ':' + it.source_item_id, it]))
      // the wantlist allows one row per card (set, number, section): check that key as well as the source id
      const wantCardKey = (w) => [w.set_slug, w.card_n ?? '', w.section ?? ''].join('|')
      const existingWants = new Set((store.wants || []).flatMap(w => [wantCardKey(w), w.source && w.source_item_id ? w.source + ':' + w.source_item_id : null].filter(Boolean)))
      const toInsert = [], toUpdate = [], wantRows = []
      for (const { r, m: m0, i } of rows) {
        const m = skip.has(i) ? { conf: 'none' } : m0   // an unticked "check these" row is kept as not matched yet
        const matched = m.conf !== 'none'
        if (!matched && !keepUnmatched) continue
        const where = matched
          ? { set_slug: m.slug, set_name: m.setName, section: m.section, card_n: collectionCardN({ n: m.card_n, p: m.player }), player: m.player }
          : { set_slug: UNMATCHED, set_name: (r.setName || '').slice(0, 300), section: (r.section || '').slice(0, 300) || null, card_n: (r.cardN || ('—' + (r.player || ''))).slice(0, 200), player: (r.player || '').slice(0, 300) }
        if (r.kind === 'want') {
          const ks = [wantCardKey(where), r.source && r.source_item_id ? r.source + ':' + r.source_item_id : null].filter(Boolean)
          if (!ks.some(k => existingWants.has(k))) { ks.forEach(k => existingWants.add(k)); wantRows.push({ ...where, source: r.source, source_item_id: r.source_item_id }) }
          continue
        }
        const row = {
          ...where, collection_id: collId(r.collection), status: r.status || 'have', qty: r.qty || 1, price_paid: r.price_paid ?? null, value: r.value ?? null,
          condition: r.condition || null, grader: r.grader || null, grade: r.grade || null, cert_no: r.cert_no || null, serial_no: r.serial_no || null,
          autographed: !!r.autographed, notes: r.notes || null, tags: r.tags || [], acquired_on: r.acquired_on || null,
          source: r.source, source_item_id: r.source_item_id, tcdb_sid: r.tcdb_sid || null, tcdb_cid: r.tcdb_cid || null,
        }
        const prev = r.source && r.source_item_id && existing.get(r.source + ':' + r.source_item_id)
        if (prev) {
          // A re-import updates what the source knows and keeps what was done here: anything the
          // source leaves blank (a quick import reads no grading), Card HQ-only collections, values,
          // photos, and a match made by hand (unless the card was still unmatched).
          const keep = (k) => row[k] == null || (Array.isArray(row[k]) && !row[k].length) ? prev[k] : row[k]
          const placed = prev.set_slug !== UNMATCHED && prev.set_slug
          toUpdate.push({
            ...prev, ...row,
            ...(placed ? { set_slug: prev.set_slug, set_name: prev.set_name, section: prev.section, card_n: prev.card_n, player: prev.player } : {}),
            collection_id: r.collection ? row.collection_id : prev.collection_id,
            status: r.status && r.status !== 'have' ? row.status : prev.status === 'have' ? row.status : prev.status,
            condition: keep('condition'), grader: keep('grader'), grade: keep('grade'), serial_no: keep('serial_no'), notes: keep('notes'), tags: keep('tags'),
            price_paid: keep('price_paid'), acquired_on: keep('acquired_on'), cert_no: keep('cert_no'),
            value: prev.value, value_at: prev.value_at, image_url: prev.image_url,
          })
        } else toInsert.push(row)
      }
      if (toUpdate.length) { setBusy('Updating ' + plural(toUpdate.length, 'card') + '…'); const { error } = await updateWholeItems(toUpdate); if (error) throw error }
      if (toInsert.length) { const { error } = await insertItems(uid, toInsert, (d, t) => setBusy('Saving ' + d.toLocaleString() + ' of ' + t.toLocaleString() + '…')); if (error) throw error }
      if (wantRows.length) { setBusy('Saving wantlist…'); const { error } = await insertWants(uid, wantRows); if (error) throw error }
      await Promise.all([store.reloadItems(), store.reloadCollections(), store.reloadWants()])
      onWantsChanged?.()
      onDone(`Imported from ${incoming.label}: ${plural(toInsert.length, 'new card')}${toUpdate.length ? ', ' + plural(toUpdate.length, 'updated card') : ''}${wantRows.length ? ', ' + plural(wantRows.length, 'wantlist card') : ''}.`)
    } catch (e) {
      setBusy('')
      // what did save is reloaded, so pressing Import again skips it (the database skips repeats too)
      await Promise.all([store.reloadItems(), store.reloadCollections(), store.reloadWants()]).catch(() => {})
      say('The import stopped — ' + (e.message || e) + '. Press Import again to finish: cards already saved are skipped.', 'error')
    }
  }
  const review = showAll ? likely : likely.slice(0, 60)
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...card, padding: '18px 20px' }}>
        <h3 style={{ ...title(20), margin: 0, color: '#fff' }}>Ready to import from {incoming.label}</h3>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', margin: '14px 0' }}>
          <Tile label="Matched" value={exact.length.toLocaleString()} sub="same set, card # and name" />
          <Tile label="Check these" value={likely.length.toLocaleString()} sub="close match — review below" />
          <Tile label="Not on Card HQ yet" value={none.length.toLocaleString()} sub="set or parallel missing" />
          {incoming.src !== 'rematch' && <Tile label="Includes" value={plural(haves.length, 'card')} sub={wantsN ? plural(wantsN, 'wantlist card') : 'no wantlist cards'} />}
        </div>
        {incoming.src === 'tcdb' && !incoming.full && <p style={{ ...muted, margin: '0 0 10px' }}>Quick import: condition, grading, serial # and notes weren’t read. Run the bookmark’s Full import later to add them — your cards are updated, not doubled.</p>}
        {incoming.src !== 'rematch' && none.length > 0 && (
          <Toggle checked={keepUnmatched} onChange={setKeepUnmatched} hint="Saved with the description from your file, marked “not matched yet”, and matched automatically when you re-match after those sets are added. Nothing you had is left behind.">
            Keep the {plural(none.length, 'card')} Card HQ doesn’t have yet
          </Toggle>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={btnAccent} disabled={!!busy} onClick={doImport}>{busy || (incoming.src === 'rematch' ? `Save ${plural(exact.length + likely.length - skip.size, 'match')}` : 'Import')}</button>
          <button style={btnGhost} disabled={!!busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
      {likely.length > 0 && (
        <div style={{ ...card, padding: '16px 18px' }}>
          <p style={{ ...eyebrow, color: '#8A93A8', margin: '0 0 4px' }}>Check these ({likely.length})</p>
          <p style={{ ...muted, margin: '0 0 10px' }}>Close but not word-for-word (different spelling, base vs. insert naming). Untick any that are wrong — they’ll be kept as “not matched yet” instead.</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {review.map(({ r, m, i }) => (
              <label key={i} style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr)', gap: 8, fontSize: 13, alignItems: 'start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!skip.has(i)} onChange={(e) => setSkip(s => { const n = new Set(s); e.target.checked ? n.delete(i) : n.add(i); return n })} style={{ accentColor: ACCENT, marginTop: 2 }} />
                <span><span style={{ color: '#A1A1AA' }}>{r.label}</span><br /><span style={{ color: '#EDEDEF' }}>→ {m.setName}{m.section && !/^base( set)?$/i.test(m.section) ? ' · ' + m.section : ''} · {m.card_n ? '#' + m.card_n + ' ' : ''}{m.player}</span></span>
              </label>
            ))}
            {likely.length > 60 && !showAll && <button style={btnSmall} onClick={() => setShowAll(true)}>Show all {likely.length}</button>}
          </div>
        </div>
      )}
      {none.length > 0 && (
        <details style={{ ...card, padding: '14px 18px' }}>
          <summary style={{ cursor: 'pointer', color: '#EDEDEF', fontWeight: 600, fontSize: 14 }}>Not on Card HQ yet ({none.length})</summary>
          <div style={{ display: 'grid', gap: 3, marginTop: 10, maxHeight: 360, overflowY: 'auto' }}>
            {none.slice(0, 500).map(({ r, i }) => <p key={i} style={{ margin: 0, fontSize: 13, color: '#A1A1AA' }}>{r.label}</p>)}
            {none.length > 500 && <p style={muted}>…and {none.length - 500} more</p>}
          </div>
        </details>
      )}
    </div>
  )
}

// ---------------- public collector page (?view=collector&u=name) ----------------
export function CollectorView({ username, indexSets, onOpenSet, account }) {
  const [p, setP] = useState(undefined)
  const [items, setItems] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    let live = true
    setP(undefined); setItems(null)
    collectorByName(username || '').then(async (prof) => {
      if (!live) return
      setP(prof)
      if (prof) { const r = await publicItems(prof.id); if (live) setItems(r.failed ? [] : r) }
    })
    return () => { live = false }
  }, [username])
  const indexBySlug = useMemo(() => new Map((indexSets || []).map(s => [s.slug, s])), [indexSets])
  const stats = useMemo(() => collectionStats(items || [], indexBySlug, brandOf), [items, indexBySlug])
  if (p === undefined) return <p role="status" style={muted}>Loading…</p>
  if (!p) return <div style={{ ...card, padding: 28, color: '#A1A1AA' }}>No collector called “{username}”.</div>
  const mine = account?.session?.user?.id === p.id
  const needle = q.trim().toLowerCase()
  const groups = new Map()
  for (const it of items || []) {
    if (it.set_slug === UNMATCHED) continue
    if (needle && !(String(it.player) + ' ' + it.set_name).toLowerCase().includes(needle)) continue
    if (!groups.has(it.set_slug)) groups.set(it.set_slug, [])
    groups.get(it.set_slug).push(it)
  }
  return (
    <section>
      <h1 style={{ ...display, fontSize: 40, margin: 0 }}>{p.display_name || p.username}</h1>
      <p style={{ ...muted, margin: '6px 0 16px' }}>@{p.username} · collecting on Card HQ since {new Date(p.created_at).getFullYear()}</p>
      {items === null ? <p role="status" style={muted}>Loading collection…</p> : items.length === 0 ? (
        <div style={{ ...card, padding: 24, color: '#A1A1AA', fontSize: 14 }}>{mine ? 'Nothing is public yet. Turn on “Public collection page” in My Collection → Overview, or make a single collection public.' : 'This collection is private.'}</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Tile label="Cards" value={stats.cards.toLocaleString()} />
            <Tile label="Sets" value={stats.sets.size.toLocaleString()} />
            <Tile label="Graded" value={stats.graded.toLocaleString()} />
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            <Bars heading="Top players" rows={stats.top(stats.players, 8)} onPick={setQ} />
            <Bars heading="By sport" rows={stats.top(stats.sports, 8)} />
          </div>
          <input aria-label="Search this collection" placeholder="Search player or set…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, width: 'min(360px, 100%)' }} />
          <div style={{ display: 'grid', gap: 10 }}>
            {[...groups.entries()].slice(0, 200).map(([slug, its]) => (
              <div key={slug} style={{ ...card, padding: '12px 16px' }}>
                <button onClick={() => onOpenSet(slug)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', ...title(15), color: '#fff', textAlign: 'left' }}>{indexBySlug.get(slug)?.name || its[0].set_name}</button>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 6 }}>
                  {its.map(it => (
                    <span key={it.id} style={{ fontSize: 13, color: '#D4D4D8' }}>
                      {String(it.card_n).startsWith('—') ? '' : <span style={{ color: ACCENT_TEXT }}>#{it.card_n} </span>}{it.player}{it.section && !/^base( set)?$/i.test(it.section) ? <span style={muted}> · {it.section}</span> : null}
                      {it.grader ? <span style={{ color: '#facc15' }}> {it.grader} {it.grade}</span> : null}{it.qty > 1 ? <span style={muted}> ×{it.qty}</span> : null}
                      {it.image_url ? <a href={it.image_url} target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>📷</a> : null}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {groups.size > 200 && <p style={muted}>Showing 200 of {groups.size} sets — search to narrow.</p>}
          </div>
        </div>
      )}
    </section>
  )
}

// ---------------- Rainbow: every parallel of one card in a set ----------------
const numKey = (n) => { const t = String(n ?? '').trim().replace(/^#/, '').toUpperCase(); return /^\d+$/.test(t) ? String(+t) : t }
const runOf = (title, x) => { const m = /\/\s*(\d{1,5})\b/.exec(String(x || '')) || /\/\s*(\d{1,5})\b/.exec(String(title || '')); return m ? +m[1] : 0 }
export function RainbowDialog({ setData, card: c, onClose, owned, onToggleOwn, isWanted, onWant }) {
  const rows = useMemo(() => {
    if (!setData || !c) return []
    const nk = numKey(c.n), who = String(c.p || '').toLowerCase()
    const out = []
    for (const sec of setData.sections || []) for (const x of sec.cards || []) {
      if (nk ? numKey(x.n) !== nk : true) continue
      if (String(x.p || '').toLowerCase() !== who) continue   // same printed name: "Patrick Kane", not every Kane
      out.push({ sec, c: x, run: runOf(sec.title, x.x) })
    }
    // unnumbered parallels first, then by print run high -> low (the usual rainbow order)
    return out.sort((a, b) => (a.run || 1e9) === (b.run || 1e9) ? 0 : (b.run || 1e9) - (a.run || 1e9))
  }, [setData, c])
  const have = rows.filter(r => owned.get(cardKeyOf(setData.slug, r.sec.title, r.c))).length
  return (
    <Modal open={!!c} onClose={onClose} labelText="Rainbow" width={620}>
      <p style={{ ...muted, margin: '0 40px 2px 0' }}>{setData?.name}</p>
      <h3 style={{ ...title(22), margin: '0 40px 6px 0', color: '#fff' }}>{c?.n ? '#' + c.n + ' ' : ''}{c?.p} — rainbow</h3>
      <p style={{ ...muted, margin: '0 0 10px' }}>{plural(rows.length, 'version')} in this set{have ? ` · you own ${have} of ${rows.length}` : ''}</p>
      <div style={{ maxWidth: 400, marginBottom: 14 }}><Progress have={have} total={rows.length} /></div>
      <div style={{ display: 'grid', gap: 6 }}>
        {rows.map(({ sec, c: x, run }, i) => {
          const n = owned.get(cardKeyOf(setData.slug, sec.title, x)) || 0
          const it = { set_slug: setData.slug, set_name: setData.name, card_n: x.n, section: sec.title, player: x.p }
          const w = isWanted(it)
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', border: '1px solid ' + (n ? '#2f5324' : '#232A3E'), background: n ? '#12200f' : 'transparent', borderRadius: 8 }}>
              <span style={{ flex: 1, minWidth: 0, color: n ? '#9fd18a' : '#D4D4D8', fontSize: 14, fontWeight: 600 }}>{sec.title}</span>
              <span style={{ color: run === 1 ? '#fff' : '#A1A1AA', fontSize: 12, fontWeight: 700, background: run === 1 ? ACCENT : 'none', borderRadius: 999, padding: run === 1 ? '2px 8px' : 0 }}>{run === 1 ? '1/1' : run ? '/' + run : ''}</span>
              <button style={{ ...btnSmall, color: n ? '#9fd18a' : '#A1A1AA' }} aria-pressed={n > 0} onClick={() => onToggleOwn(sec, x)}>{n ? (n > 1 ? n + ' owned' : 'Owned ✓') : 'I have it'}</button>
              <button style={{ ...btnSmall, color: w ? '#fff' : '#A1A1AA', background: w ? ACCENT : 'transparent' }} aria-pressed={w} onClick={() => onWant(it)}>{w ? 'Wanted ✓' : 'Want'}</button>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
