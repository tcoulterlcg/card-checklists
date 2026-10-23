'use client'
// Community feedback: collectors report data problems (missing cards, wrong
// info, missing parallels like shields / SuperFractors / game-used) and suggest
// features. Rows land in cardhq_feedback (GrailFindr account project); admins
// triage them at ?view=feedback, everyone else sees the status of their own.
import { useEffect, useState } from 'react'
import { Select } from './dropdown'
import { submitFeedback, listFeedback, setFeedbackStatus, isAdmin, newFeedbackCount } from '../lib/supa'
import { ACCENT, ACCENT_TEXT, TEXT, TEXT_2, LABEL, LINE, display, eyebrow, title, buttonText } from '../lib/theme'

const SECONDARY = '#8A93A8'
const card = { background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid ' + LINE, borderRadius: 14 }
const btnAccent = { ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 14 }
const btnGhost = { ...buttonText, background: 'transparent', color: TEXT_2, border: '1px solid ' + LINE, borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }
const input = { background: '#0F1320', border: '1px solid ' + LINE, borderRadius: 10, color: TEXT, padding: '11px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const fieldLabel = { ...eyebrow, fontSize: 12, color: SECONDARY, display: 'block', margin: '14px 0 6px' }

export const KINDS = [
  ['missing_card', 'A card is missing'],
  ['wrong_info', 'Card info is wrong'],
  ['missing_parallel', 'Missing insert or parallel'],
  ['duplicate_set', 'This set is listed twice'],
  ['other_data', 'Something else with the data'],
  ['feature', 'Feature idea'],
]
const KIND_LABEL = Object.fromEntries(KINDS)
const MATERIALS = [['', 'Not sure / n.a.'], ['GU', 'Game-used'], ['PW', 'Player-worn'], ['EW', 'Event-worn'], ['MFG', 'Manufactured patch'], ['SHIELD', 'Shield / logoman / laundry tag'], ['AUTO', 'Autograph']]
const STATUSES = [['new', 'New'], ['accepted', 'Accepted'], ['applied', 'Fixed on site'], ['rejected', 'Not changed'], ['duplicate', 'Duplicate']]
const STATUS_LABEL = Object.fromEntries(STATUSES)
const STATUS_COLOR = { new: ACCENT_TEXT, accepted: '#d4a843', applied: '#4ade80', rejected: SECONDARY, duplicate: SECONDARY }

// context: { set_slug?, set_name?, sections?: [title], section?, card_n?, player?, kind? }
export function FeedbackModal({ open, onClose, account, context = {}, onOpenAuth }) {
  const [kind, setKind] = useState('missing_card')
  const [section, setSection] = useState('')
  const [cardN, setCardN] = useState('')
  const [player, setPlayer] = useState('')
  const [parallel, setParallel] = useState('')
  const [run, setRun] = useState('')
  const [material, setMaterial] = useState('')
  const [source, setSource] = useState('')
  const [message, setMessage] = useState('')
  const [trap, setTrap] = useState('')   // honeypot — bots fill every field
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(context.kind || (context.set_slug || context.player ? 'missing_card' : 'feature'))
    setSection(context.section || ''); setCardN(context.card_n != null ? String(context.card_n) : ''); setPlayer(context.player || '')
    setParallel(''); setRun(''); setMaterial(''); setSource(''); setMessage(''); setTrap(''); setErr(''); setDone(false)
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus() }
  }, [open])
  if (!open) return null

  const isFeature = kind === 'feature'
  const needsSignIn = !isFeature && !account.session
  const cardish = ['missing_card', 'wrong_info', 'missing_parallel'].includes(kind)

  async function send(e) {
    e.preventDefault()
    if (trap) { setDone(true); return }
    if (needsSignIn) { onOpenAuth(); return }
    const msg = message.trim()
    if (msg.length < 3) { setErr('Tell us a bit more (a few words is fine).'); return }
    const details = {}
    if (!isFeature) {
      if (section) details.section = section
      if (kind === 'missing_parallel') { if (parallel.trim()) details.parallel = parallel.trim(); if (run.trim()) details.print_run = run.trim(); if (material) details.material = material }
      if (source.trim()) details.source = source.trim().slice(0, 500)
    }
    setBusy(true); setErr('')
    const r = await submitFeedback({
      kind, message: msg.slice(0, 2000), details,
      set_slug: isFeature ? null : context.set_slug || null,
      set_name: isFeature ? null : context.set_name || null,
      card_n: cardish && cardN.trim() ? cardN.trim().slice(0, 100) : null,
      player: cardish && player.trim() ? player.trim().slice(0, 200) : (!isFeature && context.player) || null,
      page_url: (location.pathname + location.search).slice(0, 1000),
    })
    setBusy(false)
    if (r.error) setErr(r.error.message.includes('Too many') ? r.error.message : 'Couldn’t send that — ' + r.error.message)
    else setDone(true)
  }

  const placeholder = {
    missing_card: 'e.g. #241 Connor Bedard Young Guns isn’t listed',
    wrong_info: 'What’s wrong and what it should be',
    missing_parallel: 'e.g. Black Foil Shield parallel, /1 — exists for every Rookie Patch Auto',
    duplicate_set: 'Which other set is the same product?',
    other_data: 'What did you notice?',
    feature: 'What would make CardHQ better for you?',
  }[kind]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Send feedback" onClick={(e) => e.stopPropagation()}
        style={{ ...card, width: 'min(520px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: 26, position: 'relative', boxSizing: 'border-box' }}>
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, background: 'none', border: 'none', color: LABEL, fontSize: 20, cursor: 'pointer', borderRadius: 8 }}>×</button>
        {done ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <h3 style={{ ...title(22), margin: 0, color: '#fff' }}>Thanks — got it.</h3>
            <p style={{ color: TEXT_2, fontSize: 14, lineHeight: 1.6, margin: '10px 0 18px' }}>
              {isFeature ? 'Every idea gets read.' : 'Every report is checked before the data changes.'}
              {account.session ? ' You can follow its status under My reports.' : ''}
            </p>
            <button style={btnAccent} onClick={onClose}>Done</button>
          </div>
        ) : (
          <form onSubmit={send}>
            <h3 style={{ ...title(22), margin: 0, color: '#fff' }}>{isFeature ? 'Suggest a feature' : 'Report a problem'}</h3>
            {context.set_name && !isFeature && <p style={{ color: SECONDARY, fontSize: 13, margin: '6px 0 0' }}>{context.set_name}</p>}
            {!context.set_name && context.player && !isFeature && <p style={{ color: SECONDARY, fontSize: 13, margin: '6px 0 0' }}>{context.player}</p>}

            <span style={fieldLabel}>What’s this about?</span>
            <Select ariaLabel="Feedback type" value={kind} onChange={setKind} width={480} style={{ width: '100%' }}
              options={context.set_slug ? KINDS : KINDS.filter(([k]) => k !== 'duplicate_set')} />

            {!isFeature && context.sections && context.sections.length > 0 && (
              <>
                <span style={fieldLabel}>Section</span>
                <Select ariaLabel="Section" value={section} onChange={setSection} width={480} style={{ width: '100%' }}
                  options={[['', context.sections.length > 1 ? 'Whole set / not sure' : context.sections[0]], ...context.sections.map(t => [t, t])]} />
              </>
            )}

            {cardish && (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10 }}>
                <label><span style={fieldLabel}>Card #</span><input style={input} value={cardN} onChange={(e) => setCardN(e.target.value)} placeholder="e.g. 241" /></label>
                <label><span style={fieldLabel}>Player / character</span><input style={input} value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="e.g. Connor Bedard" /></label>
              </div>
            )}

            {kind === 'missing_parallel' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 10 }}>
                  <label><span style={fieldLabel}>Parallel / insert name</span><input style={input} value={parallel} onChange={(e) => setParallel(e.target.value)} placeholder="e.g. SuperFractor" /></label>
                  <label><span style={fieldLabel}>Print run</span><input style={input} value={run} onChange={(e) => setRun(e.target.value)} placeholder="e.g. /1" /></label>
                </div>
                <span style={fieldLabel}>Material</span>
                <Select ariaLabel="Material" value={material} onChange={setMaterial} width={480} style={{ width: '100%' }} options={MATERIALS} />
              </>
            )}

            <label>
              <span style={fieldLabel}>{isFeature ? 'Your idea' : 'Details'}</span>
              <textarea style={{ ...input, minHeight: 96, resize: 'vertical' }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={placeholder} maxLength={2000} required />
            </label>

            {!isFeature && (
              <label>
                <span style={fieldLabel}>Source (optional)</span>
                <input style={input} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Link to a checklist, sell sheet, eBay listing or photo" />
              </label>
            )}

            <input aria-hidden="true" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} name="website"
              style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />

            {err && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
            {needsSignIn ? (
              <div style={{ marginTop: 16 }}>
                <p style={{ color: TEXT_2, fontSize: 13, lineHeight: 1.5, margin: '0 0 10px' }}>Data corrections need a free account (your GrailFindr login) so we can follow up and credit you.</p>
                <button type="button" style={{ ...btnAccent, width: '100%' }} onClick={onOpenAuth}>Sign in to send</button>
              </div>
            ) : (
              <button type="submit" disabled={busy} style={{ ...btnAccent, width: '100%', marginTop: 16, opacity: busy ? 0.7 : 1 }}>{busy ? 'Sending…' : 'Send'}</button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

// Admin check + count of new reports (for the "Feedback (3)" link).
export function useFeedbackAdmin(account) {
  const [admin, setAdmin] = useState(false)
  const [count, setCount] = useState(0)
  const uid = account.session?.user?.id
  useEffect(() => {
    if (!uid) { setAdmin(false); setCount(0); return }
    let live = true
    isAdmin().then(a => { if (!live) return; setAdmin(a); if (a) newFeedbackCount().then(n => live && setCount(n)) })
    return () => { live = false }
  }, [uid])
  return { admin, count, refresh: () => admin && newFeedbackCount().then(setCount) }
}

// ?view=feedback — admins: the triage queue. Everyone else: their own reports.
export function FeedbackView({ account, admin, onOpenAuth, onOpenSet, onNew, onChanged, onFix, version }) {
  const [status, setStatus] = useState(admin ? 'new' : 'all')
  const [kind, setKind] = useState('all')
  const [rows, setRows] = useState(null)
  const uid = account.session?.user?.id
  useEffect(() => { setStatus(admin ? 'new' : 'all') }, [admin])
  const load = () => { setRows(null); listFeedback({ status }).then(setRows) }
  useEffect(() => { if (uid) load() }, [uid, status, version])

  if (!account.session) return (
    <section style={{ ...card, padding: 28, textAlign: 'center' }}>
      <h1 style={{ ...display, fontSize: 40, margin: 0 }}>Feedback</h1>
      <p style={{ color: TEXT_2, fontSize: 15, margin: '12px 0 18px' }}>Sign in to see the reports you’ve sent — or suggest a feature without an account.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button style={btnAccent} onClick={onOpenAuth}>Sign in</button>
        <button style={btnGhost} onClick={() => onNew({ kind: 'feature' })}>Suggest a feature</button>
      </div>
    </section>
  )

  const shown = (rows || []).filter(r => kind === 'all' || r.kind === kind)
  const update = async (r, st) => {
    const { error } = await setFeedbackStatus(r.id, st)
    if (!error) { setRows(rs => status === 'all' ? rs.map(x => x.id === r.id ? { ...x, status: st } : x) : rs.filter(x => x.id !== r.id)); onChanged && onChanged() }
  }

  return (
    <section>
      <div style={{ ...card, padding: '26px 28px', marginBottom: 18 }}>
        <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>{admin ? 'Feedback inbox' : 'My reports'}</h1>
        <p style={{ color: TEXT_2, fontSize: 15, lineHeight: 1.6, margin: '12px 0 0', maxWidth: 720 }}>
          {admin ? 'Data corrections and feature ideas from collectors. Mark each one once it’s handled.' : 'Problems you’ve reported and ideas you’ve sent, with where each one stands.'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <Select ariaLabel="Status" value={status} onChange={setStatus} defaultValue={admin ? 'new' : 'all'} width={240} options={[['all', 'Any status'], ...STATUSES]} />
          <Select ariaLabel="Type" value={kind} onChange={setKind} defaultValue="all" width={300} options={[['all', 'Any type'], ...KINDS]} />
          <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={() => onNew({ kind: 'feature' })}>Suggest a feature</button>
        </div>
      </div>

      {rows === null ? <p style={{ color: LABEL, fontSize: 14 }}>Loading…</p>
        : rows.failed ? <p style={{ color: '#f87171', fontSize: 14 }}>Couldn’t load feedback. Try again in a moment.</p>
        : shown.length === 0 ? <p style={{ color: SECONDARY, fontSize: 14 }}>{admin ? 'Nothing here — inbox zero.' : 'Nothing yet. Spot a missing card or parallel? Use “Report a problem” on any set page.'}</p>
        : (
          <div style={{ display: 'grid', gap: 10 }}>
            {shown.map(r => (
              <article key={r.id} style={{ ...card, padding: '16px 18px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ ...eyebrow, fontSize: 12, color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                  <span style={{ ...eyebrow, fontSize: 12, color: SECONDARY }}>{KIND_LABEL[r.kind]}</span>
                  <span style={{ color: SECONDARY, fontSize: 12, marginLeft: 'auto' }}>
                    {admin && (r.username ? '@' + r.username + ' · ' : r.user_id ? 'signed-in collector · ' : 'anonymous · ')}
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                {(r.set_name || r.card_n || r.player) && (
                  <p style={{ margin: '8px 0 0', fontSize: 14, color: TEXT }}>
                    {r.set_slug ? <button onClick={() => onOpenSet(r.set_slug)} style={{ background: 'none', border: 'none', padding: 0, color: ACCENT_TEXT, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, textAlign: 'left' }}>{r.set_name || r.set_slug}</button> : null}
                    {r.details?.section ? <span style={{ color: TEXT_2 }}> · {r.details.section}</span> : null}
                    {r.card_n ? <span style={{ color: TEXT_2 }}> · #{r.card_n}</span> : null}
                    {r.player ? <span style={{ color: TEXT_2 }}> · {r.player}</span> : null}
                  </p>
                )}
                {(r.details?.parallel || r.details?.print_run || r.details?.material) && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: TEXT_2 }}>
                    Parallel: {[r.details.parallel, r.details.print_run, MATERIALS.find(m => m[0] === r.details.material)?.[1]].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p style={{ margin: '8px 0 0', fontSize: 14, color: TEXT, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.message}</p>
                {r.details?.source && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, overflowWrap: 'anywhere' }}>
                    {/^https?:\/\//i.test(r.details.source)
                      ? <a href={r.details.source} target="_blank" rel="noopener noreferrer nofollow" style={{ color: ACCENT_TEXT }}>Source ↗</a>
                      : <span style={{ color: TEXT_2 }}>Source: {r.details.source}</span>}
                  </p>
                )}
                {r.admin_note && <p style={{ margin: '8px 0 0', fontSize: 13, color: SECONDARY }}>Note: {r.admin_note}</p>}
                {admin && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {r.set_slug && r.kind !== 'feature' && onFix && (
                      <button onClick={() => onFix(r)} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12, background: ACCENT, color: '#fff', border: 'none' }}>Fix it</button>
                    )}
                    {STATUSES.filter(([s]) => s !== r.status).map(([s, l]) => (
                      <button key={s} onClick={() => update(r, s)} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12, color: s === 'applied' ? '#4ade80' : TEXT_2 }}>{l}</button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
    </section>
  )
}
