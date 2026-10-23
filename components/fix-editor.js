'use client'
// Admin-only: turn a report (or anything you spot) into a data fix. Fixes are
// saved to cardhq_corrections and layered on top of the set file (lib/corrections.js),
// so they show on the set page immediately and survive re-imports.
import { useEffect, useMemo, useState } from 'react'
import { Select } from './dropdown'
import { loadSet } from '../lib/catalog'
import { OPS, describe, parseCardList, applyCorrections } from '../lib/corrections'
import { addCorrection, listCorrections, revertCorrection, restoreCorrection, setFeedbackStatus } from '../lib/supa'
import { ACCENT, ACCENT_TEXT, TEXT, TEXT_2, LABEL, LINE, eyebrow, title, buttonText } from '../lib/theme'

const SECONDARY = '#8A93A8'
const card = { background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid ' + LINE, borderRadius: 14 }
const btnAccent = { ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 14 }
const btnGhost = { ...buttonText, background: 'transparent', color: TEXT_2, border: '1px solid ' + LINE, borderRadius: 10, padding: '6px 12px', cursor: 'pointer', fontSize: 12 }
const input = { background: '#0F1320', border: '1px solid ' + LINE, borderRadius: 10, color: TEXT, padding: '10px 12px', fontSize: 14, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const fieldLabel = { ...eyebrow, fontSize: 12, color: SECONDARY, display: 'block', margin: '12px 0 6px' }
const MEM = [['', 'Same as source / none'], ['GU', 'Game-used'], ['PW', 'Player-worn'], ['EW', 'Event-worn'], ['MX', 'Varies by card'], ['MFG', 'Manufactured'], ['UNK', 'Unknown']]
const NEW = '__new__'

const Field = ({ label, children }) => <label style={{ display: 'block', minWidth: 0 }}><span style={fieldLabel}>{label}</span>{children}</label>

// Best first guess from a collector's report.
function guess(fb, sections) {
  const d = fb?.details || {}
  const sec = d.section && sections.includes(d.section) ? d.section : ''
  if (fb?.kind === 'missing_parallel') {
    const t = [d.parallel, d.print_run && (String(d.print_run).startsWith('/') ? d.print_run : '/' + d.print_run)].filter(Boolean).join(' ')
    return { op: 'copy_section', from: sec || sections[0] || '', title: t, mem: '' }
  }
  if (fb?.kind === 'wrong_info') return { op: 'edit_card', section: sec || sections[0] || '' }
  return { op: 'add_card', section: sec || sections[0] || NEW, n: fb?.card_n || '', p: fb?.player || '' }
}

export function FixEditor({ open, onClose, slug, feedback, onSaved }) {
  const [set, setSet] = useState(null)
  const [fixes, setFixes] = useState([])
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')
  const up = (k) => (v) => setF(o => ({ ...o, [k]: v && v.target ? v.target.value : v }))

  const reload = async () => {
    const [s, list] = await Promise.all([loadSet(slug), listCorrections(slug)])
    setSet(s || { sections: [] }); setFixes(list)
    return s
  }
  useEffect(() => {
    if (!open || !slug) return
    setSet(null); setErr(''); setSaved('')
    reload().then(s => setF(guess(feedback, (s?.sections || []).map(x => x.title))))
    const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('[role=dialog][aria-label]:not([aria-label="Fix the data"])')) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, slug, feedback?.id])

  const titles = (set?.sections || []).map(s => s.title)
  const secOpts = titles.map(t => [t, t + ' (' + (set.sections.find(s => s.title === t).cards.length) + ')'])
  const cardsOf = (t) => set?.sections.find(s => s.title === t)?.cards || []
  const cardOpts = useMemo(() => cardsOf(f.section).map((c, i) => [String(i), (c.n ? '#' + c.n + ' ' : '') + c.p + (c.t ? ' · ' + c.t : '')]), [set, f.section])
  const picked = f.card != null ? cardsOf(f.section)[+f.card] : null

  // pick a card to fix -> prefill its current values
  useEffect(() => { if (picked && f.op === 'edit_card') setF(o => ({ ...o, n: picked.n || '', p: picked.p || '', t: picked.t || '', x: picked.x || '' })) }, [f.card, f.op])

  if (!open) return null

  function build() {
    const section = f.section === NEW ? (f.newSection || '').trim() : f.section
    switch (f.op) {
      case 'add_card':
        if (!section) return 'Pick or name a section.'
        if (!(f.p || '').trim()) return 'Player / character is required.'
        return { section, card: { n: (f.n || '').trim().replace(/^#/, ''), p: f.p.trim(), t: (f.t || '').trim(), x: (f.x || '').trim() } }
      case 'edit_card': {
        if (!picked) return 'Pick the card to fix.'
        const next = { n: (f.n || '').trim().replace(/^#/, ''), p: (f.p || '').trim(), t: (f.t || '').trim(), x: (f.x || '').trim() }
        const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== (picked[k] || '')))
        if (!next.p) return 'Player can’t be empty — use Remove a card instead.'
        if (!Object.keys(changed).length) return 'Nothing changed yet.'
        return { section, match: { n: picked.n || '', p: picked.p }, set: changed }
      }
      case 'remove_card':
        if (!picked) return 'Pick the card to remove.'
        return { section, match: { n: picked.n || '', p: picked.p } }
      case 'copy_section':
        if (!f.from) return 'Pick the section to copy.'
        if (!(f.title || '').trim()) return 'Name the new parallel (include the print run, e.g. “Black Foil Shield /1”).'
        if (titles.some(t => t.toLowerCase() === f.title.trim().toLowerCase())) return 'A section with that name already exists.'
        return { from: f.from, title: f.title.trim(), ...(f.mem ? { mem: f.mem } : {}) }
      case 'add_section': {
        if (!(f.title || '').trim()) return 'Name the section.'
        const cards = parseCardList(f.list)
        if (!cards.length) return 'Paste at least one card: “#, player, team, flag” per line.'
        return { title: f.title.trim(), cards, ...(f.mem ? { mem: f.mem } : {}) }
      }
      case 'rename_section':
        if (!f.from || !(f.title || '').trim()) return 'Pick a section and its new name.'
        return { from: f.from, title: f.title.trim() }
    }
    return 'Pick what to change.'
  }
  const payload = open && set ? build() : null
  const preview = payload && typeof payload === 'object' ? describe(f.op, payload) : null

  async function save() {
    if (typeof payload === 'string') { setErr(payload); return }
    // sanity check: the fix has to change the set
    if (JSON.stringify(applyCorrections(set, [{ op: f.op, payload }])) === JSON.stringify(set)) { setErr('That wouldn’t change anything in this set.'); return }
    setBusy(true); setErr('')
    const r = await addCorrection({ set_slug: slug, op: f.op, payload, feedback_id: feedback?.id || null })
    if (!r.error && feedback?.id) await setFeedbackStatus(feedback.id, 'applied', preview)
    setBusy(false)
    if (r.error) { setErr('Couldn’t save — ' + r.error.message); return }
    setSaved(preview)
    const s = await reload()
    setF(o => ({ ...guess(null, (s?.sections || []).map(x => x.title)), op: o.op }))
    onSaved && onSaved()
  }
  const toggle = async (fx) => {
    const r = fx.status === 'active' ? await revertCorrection(fx.id) : await restoreCorrection(fx.id)
    if (!r.error) { await reload(); onSaved && onSaved() }
  }

  const cardFields = (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,2fr)', gap: 10 }}>
      <Field label="Card #"><input style={input} value={f.n || ''} onChange={up('n')} placeholder="e.g. 241" /></Field>
      <Field label="Player / character"><input style={input} value={f.p || ''} onChange={up('p')} /></Field>
      <Field label="Flag"><input style={input} value={f.x || ''} onChange={up('x')} placeholder="RC, SP…" /></Field>
      <Field label="Team"><input style={input} value={f.t || ''} onChange={up('t')} /></Field>
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 91, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Fix the data" onClick={(e) => e.stopPropagation()}
        style={{ ...card, width: 'min(600px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: 24, position: 'relative', boxSizing: 'border-box' }}>
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, background: 'none', border: 'none', color: LABEL, fontSize: 20, cursor: 'pointer', borderRadius: 8 }}>×</button>
        <h3 style={{ ...title(22), margin: 0, color: '#fff' }}>Fix the data</h3>
        <p style={{ color: SECONDARY, fontSize: 13, margin: '6px 0 0' }}>{set?.name || slug}</p>
        {feedback && (
          <div style={{ border: '1px solid ' + LINE, borderRadius: 10, padding: '10px 12px', marginTop: 12, fontSize: 13, color: TEXT_2, lineHeight: 1.5 }}>
            <span style={{ ...eyebrow, fontSize: 11, color: SECONDARY }}>Report</span>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{[feedback.details?.section, feedback.card_n && '#' + feedback.card_n, feedback.player].filter(Boolean).join(' · ')}{feedback.details?.parallel ? ' · ' + feedback.details.parallel + ' ' + (feedback.details.print_run || '') : ''}</div>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: TEXT }}>{feedback.message}</div>
          </div>
        )}

        {!set ? <p style={{ color: LABEL, fontSize: 14 }}>Loading set…</p> : (
          <>
            <Field label="Change">
              <Select ariaLabel="Change" value={f.op} onChange={(op) => setF(o => ({ ...o, op, card: null }))} width={520} style={{ width: '100%' }} options={Object.entries(OPS)} />
            </Field>

            {['add_card', 'edit_card', 'remove_card'].includes(f.op) && (
              <Field label="Section">
                <Select ariaLabel="Section" value={f.section} onChange={(v) => setF(o => ({ ...o, section: v, card: null }))} width={520} style={{ width: '100%' }}
                  options={f.op === 'add_card' ? [...secOpts, [NEW, '+ New section…']] : secOpts} />
              </Field>
            )}
            {f.op === 'add_card' && f.section === NEW && <Field label="New section name"><input style={input} value={f.newSection || ''} onChange={up('newSection')} placeholder="e.g. Rookie Patch Autographs Black Foil Shield /1" /></Field>}
            {['edit_card', 'remove_card'].includes(f.op) && (
              <Field label="Card">
                <Select ariaLabel="Card" value={f.card ?? ''} onChange={up('card')} width={520} style={{ width: '100%' }} options={[['', 'Pick a card…'], ...cardOpts]} />
              </Field>
            )}
            {(f.op === 'add_card' || (f.op === 'edit_card' && picked)) && cardFields}

            {['copy_section', 'rename_section'].includes(f.op) && (
              <Field label={f.op === 'copy_section' ? 'Copy cards from' : 'Section'}>
                <Select ariaLabel="From section" value={f.from || ''} onChange={up('from')} width={520} style={{ width: '100%' }} options={[['', 'Pick a section…'], ...secOpts]} />
              </Field>
            )}
            {['copy_section', 'add_section', 'rename_section'].includes(f.op) && (
              <Field label={f.op === 'rename_section' ? 'New name' : 'Section name'}>
                <input style={input} value={f.title || ''} onChange={up('title')} placeholder={f.op === 'copy_section' ? 'e.g. Rookie Patch Autographs Black Foil Shield /1' : ''} />
              </Field>
            )}
            {['copy_section', 'add_section'].includes(f.op) && (
              <Field label="Material">
                <Select ariaLabel="Material" value={f.mem || ''} onChange={up('mem')} width={520} style={{ width: '100%' }} options={MEM} />
              </Field>
            )}
            {f.op === 'add_section' && (
              <Field label="Cards — one per line: #, player, team, flag">
                <textarea style={{ ...input, minHeight: 120, fontFamily: 'ui-monospace, monospace', fontSize: 13 }} value={f.list || ''} onChange={up('list')} placeholder={'1, Connor Bedard, Chicago Blackhawks, RC\n2, Adam Fantilli, Columbus Blue Jackets, RC'} />
              </Field>
            )}

            {preview && <p style={{ color: TEXT_2, fontSize: 13, margin: '14px 0 0' }}>Will save: <span style={{ color: TEXT }}>{preview}</span></p>}
            {err && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
            {saved && !err && <p role="status" style={{ color: '#4ade80', fontSize: 13, margin: '10px 0 0' }}>Saved — live on the set page now: {saved}{feedback ? ' (report marked Fixed)' : ''}</p>}
            <button onClick={save} disabled={busy} style={{ ...btnAccent, width: '100%', marginTop: 14, opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save fix'}</button>

            {fixes.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <span style={{ ...eyebrow, fontSize: 12, color: SECONDARY }}>Fixes on this set</span>
                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  {fixes.map(fx => (
                    <div key={fx.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: fx.status === 'active' ? TEXT : SECONDARY, textDecoration: fx.status === 'active' ? 'none' : 'line-through' }}>
                      <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{describe(fx.op, fx.payload)}</span>
                      <button style={btnGhost} onClick={() => toggle(fx)}>{fx.status === 'active' ? 'Undo' : 'Restore'}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
