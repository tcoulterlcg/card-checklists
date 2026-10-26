'use client'
// Community + Collection features: auth chip, achievement forum, wantlist /
// collection tracker. Dark + electric blue to match the site shell. Data via lib/supa.
import { loadSet, loadRedirects, sectionKey } from '../lib/catalog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogFocus } from './dialog-focus'
import { collectionCardN, supa, signOutHere, grailfindrConnectUrl, grailfindrSignupUrl, grailfindrForgotUrl, grailfindrFindUrl, GRAILFINDR_URL, getProfile, ensureProfile, updateProfile, addWant, removeWant, deletePost, myWantlist, toggleCollected, myCollection, uploadCardImage, setCollectionImage, forumFeed, createPost, react, comments, addComment } from '../lib/supa'
import { ACCENT, ACCENT_TEXT, BG, SURFACE, SURFACE_2, LINE, CHIP_LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'

const card = { background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid #232A3E', borderRadius: 14 }
const btnAccent = { ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 14 }
const btnGhost = { ...buttonText, background: 'transparent', color: '#A1A1AA', border: '1px solid #232A3E', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }
const input = { background: '#0F1320', border: '1px solid #232A3E', borderRadius: 10, color: '#EDEDEF', padding: '11px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box' }

// --------------- auth hook + chip ---------------
export function useAccount() {
  const [session, setSession] = useState(null)
  // profile: undefined while loading (or if the load failed), null when the account has none yet
  const [profile, setProfile] = useState(undefined)
  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) { setProfile(null); return }
    let live = true   // a late reply for a previous account must not land on this one
    setProfile(undefined)
    getProfile(uid).then(p => { if (live) setProfile(p) })
    return () => { live = false }
  }, [uid])
  return { session, profile, setProfile }
}

export function AccountChip({ account, onOpenAuth }) {
  const { session, profile } = account
  if (!session) return (
    <button className="hq-signin" onClick={onOpenAuth}>Sign in</button>
  )
  const name = profile?.username || session.user.email?.split('@')[0] || 'collector'
  return (
    <span className="hq-account" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button onClick={onOpenAuth} title={'Your profile (' + name + ')'} aria-label="Your profile" style={{ width: 32, height: 32, boxSizing: 'border-box', borderRadius: '50%', background: '#1E2A4A', border: '1px solid #2E3E6B', color: '#C9D6FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>{name.slice(0, 2).toUpperCase()}</button>
      <a href={GRAILFINDR_URL} title="Your account also works on GrailFindr" style={{ color: '#8A93A8', fontSize: 12, textDecoration: 'none' }}>GrailFindr ↗</a>
      <button onClick={signOutHere} style={{ background: 'none', border: 'none', color: '#8A93A8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
    </span>
  )
}

export function AuthModal({ open, onClose, account }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [username, setUsername] = useState('')
  const [err, setErr] = useState('')
  const { session, profile, setProfile } = account
  // Closing (or signing in/out) clears the form, so a typed password never lingers on a shared computer.
  useEffect(() => { if (!open) { setPassword(''); setErr(''); setBusy(false) } }, [open])
  useEffect(() => { setPassword(''); setErr('') }, [session?.user?.id])
  // Escape closes; focus goes into the dialog and back to where it was after.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus() }
  }, [open])
  const boxRef = useRef(null)
  useDialogFocus(boxRef, open)
  if (!open) return null
  const needsProfile = session && profile === null
  const profileLoading = session && profile === undefined
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-label={session ? "Your profile" : "Sign in to CardHQ"} onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(420px, 92vw)', padding: 28, position: 'relative' }}>
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, background: 'none', border: 'none', color: '#8A93A8', fontSize: 20, cursor: 'pointer', borderRadius: 8 }}>×</button>
        {!session ? (
          <>
            <h3 style={{ ...title(24), margin: 0, color: '#fff' }}>Sign in to CardHQ</h3>
            <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '10px 0 18px' }}>CardHQ uses your GrailFindr account — one login for both. Track your wantlist, check off cards as you collect them, and share accomplishments.</p>
            <a href={grailfindrConnectUrl()} style={{ ...btnAccent, display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box', width: '100%' }}>Continue with GrailFindr</a>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', color: '#5B6478', fontSize: 12 }}>
              <span style={{ flex: 1, height: 1, background: '#232A3E' }} />or sign in here<span style={{ flex: 1, height: 1, background: '#232A3E' }} />
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault()
              setErr(''); setBusy(true)
              const { error } = await supa.auth.signInWithPassword({ email, password })
              setBusy(false)
              if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
            }}>
              <input style={input} type="email" required autoFocus autoComplete="email" aria-label="Email address" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input style={{ ...input, marginTop: 10 }} type="password" required autoComplete="current-password" aria-label="Password" placeholder="GrailFindr password" value={password} onChange={(e) => setPassword(e.target.value)} />
              {err && <p style={{ color: '#f87171', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
              <button type="submit" disabled={busy} style={{ ...btnGhost, width: '100%', marginTop: 12, color: '#EDEDEF' }}>{busy ? '…' : 'Sign in'}</button>
            </form>
            <p style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 0', fontSize: 13 }}>
              <a href={grailfindrSignupUrl()} style={{ color: ACCENT_TEXT, textDecoration: 'none', fontWeight: 600 }}>Create an account</a>
              <a href={grailfindrForgotUrl()} style={{ color: '#8A93A8', textDecoration: 'none' }}>Forgot password?</a>
            </p>
          </>
        ) : profileLoading ? (
          <p role="status" style={{ color: '#A1A1AA', fontSize: 14, margin: '8px 0' }}>Loading your profile…</p>
        ) : needsProfile ? (
          <>
            <h3 style={{ ...title(24), margin: 0, color: '#fff' }}>Pick a username</h3>
            <p style={{ color: '#A1A1AA', fontSize: 14, margin: '10px 0 16px' }}>This is how you appear on wantlists and in the community.</p>
            <input style={input} maxLength={24} aria-label="Username" placeholder="e.g. patchhunter99" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
            {err && <p style={{ color: '#f87171', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
            <button style={{ ...btnAccent, width: '100%', marginTop: 12 }} onClick={async () => {
              setErr('')
              if (username.length < 3) { setErr('At least 3 characters.'); return }
              const { data, error } = await ensureProfile(session.user.id, username)
              if (error) setErr(error.message.includes('duplicate') ? 'Username taken — try another.' : error.message)
              else { setProfile(data); onClose() }
            }}>Create profile</button>
          </>
        ) : (
          <ProfileEditor session={session} profile={profile} setProfile={setProfile} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

// Signed-in view of the account dialog: change username / display name.
function ProfileEditor({ session, profile, setProfile, onClose }) {
  const [username, setUsername] = useState(profile?.username || '')
  const [display, setDisplay] = useState(profile?.display_name || '')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    setErr(''); setMsg('')
    if (username.length < 3 || username.length > 24) { setErr('Username must be 3–24 characters.'); return }
    const { data, error } = await updateProfile(session.user.id, { username, display_name: display.trim() || null })
    if (error) setErr(/duplicate|unique/i.test(error.message) ? 'That username is taken — try another.' : error.message)
    else { setProfile(data); setMsg('Saved.') }
  }
  return (
    <>
      <h3 style={{ ...title(22), margin: 0, color: '#fff' }}>Your profile</h3>
      <p style={{ color: '#8A93A8', fontSize: 13, margin: '6px 0 16px' }}>Signed in as {session.user.email}</p>
      <label style={{ display: 'block', color: '#A1A1AA', fontSize: 12, fontWeight: 600, marginBottom: 6 }} htmlFor="hq-username">Username (shown on posts)</label>
      <input id="hq-username" maxLength={24} style={input} value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
      <label style={{ display: 'block', color: '#A1A1AA', fontSize: 12, fontWeight: 600, margin: '12px 0 6px' }} htmlFor="hq-display">Display name (optional)</label>
      <input id="hq-display" style={input} value={display} maxLength={40} onChange={(e) => setDisplay(e.target.value)} />
      {err && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
      {msg && <p role="status" style={{ color: '#4ade80', fontSize: 13, margin: '8px 0 0' }}>{msg}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button style={{ ...btnAccent, flex: 1 }} onClick={save}>Save</button>
        <button style={{ ...btnGhost, flex: 1 }} onClick={onClose}>Close</button>
      </div>
    </>
  )
}

// --------------- My Collection (wantlist + checkoff + uploads) ---------------
export function CollectionView({ account, indexSets, onOpenAuth, onOpenSet, onWantsChanged }) {
  const { session, profile } = account
  const [wants, setWants] = useState(null)
  const [collected, setCollected] = useState(null)
  // ?view=collection&cset=<slug> keeps the open checklist across reloads and shared links
  const [activeSlug, setActiveSlugState] = useState(() => { try { return new URLSearchParams(window.location.search).get('cset') } catch { return null } })
  const setActiveSlug = (slug) => {
    setActiveSlugState(slug)
    try { const u = new URL(window.location.href); if (slug) u.searchParams.set('cset', slug); else u.searchParams.delete('cset'); window.history.replaceState(window.history.state, '', u) } catch {}
  }
  const [wantOpen, setWantOpen] = useState({})     // wantlist cards: show all for a set
  const [confirmRm, setConfirmRm] = useState(null)  // set slug whose whole wantlist is about to be removed
  const [secShown, setSecShown] = useState(12) // big sets have hundreds of parallel sections
  const [setData, setSetData] = useState(null)
  const [notice, setNotice] = useState('')
  const fileRef = useRef(null)
  const [uploadTarget, setUploadTarget] = useState(null)

  useEffect(() => {
    if (!session?.user) return
    myWantlist(session.user.id).then(setWants)
    myCollection(session.user.id).then(setCollected)
  }, [session])
  useEffect(() => {
    if (!activeSlug) { setSetData(null); return }
    setSecShown(12); setSetData(null)
    let live = true
    // wantlist rows keep the slug they were saved under; follow renames/merges to today's set
    ;(async () => {
      let d = await loadSet(activeSlug).catch(() => null)
      if (!d) { const to = (await loadRedirects())[activeSlug]; if (to) d = await loadSet(to).catch(() => null) }
      if (!live) return
      if (d) setSetData(d)
      else { setNotice('That set’s checklist isn’t available right now (it may have been renamed or removed).'); setActiveSlug(null) }
    })()
    return () => { live = false }
  }, [activeSlug])

  if (!session) return (
    <div className="hq-panel" style={{ ...card, padding: 40, textAlign: 'center' }}>
      <h2 style={{ ...title(32), margin: 0, color: '#fff' }}>Track your collection</h2>
      <p style={{ color: '#A1A1AA', maxWidth: 480, margin: '12px auto 20px', fontSize: 14, lineHeight: 1.6 }}>Build a wantlist of cards, parallels, or whole sets. Check cards off as you land them and upload photos of your copies.</p>
      <button style={btnAccent} onClick={onOpenAuth}>Sign in to start</button>
    </div>
  )

  const ckey = (slug, section, n) => slug + '||' + sectionKey(section) + '||' + n   // tolerant of renamed section titles
  const collectedKeys = new Set((collected || []).map(c => ckey(c.set_slug, c.section, c.card_n)))
  const collectedRec = new Map((collected || []).map(c => [ckey(c.set_slug, c.section, c.card_n), c]))
  const wantsBySets = {}
  for (const w of wants || []) { (wantsBySets[w.set_slug] = wantsBySets[w.set_slug] || { name: w.set_name || w.set_slug, items: [] }).items.push(w) }


  return (
    <section>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f || !uploadTarget) return
        const { url, error } = await uploadCardImage(session.user.id, f)
        if (error) setNotice('Couldn’t upload that photo — ' + error.message)
        else if (url) {
          const r = await setCollectionImage(uploadTarget, url)
          if (r.error) setNotice('Couldn’t save that photo — ' + r.error.message)
          myCollection(session.user.id).then(setCollected)
        }
        e.target.value = ''
      }} />
      {notice && <div style={{ ...card, borderColor: ACCENT, padding: '14px 18px', marginBottom: 18, color: ACCENT_TEXT, fontWeight: 600, fontSize: 14 }}>{notice}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <h1 style={{ ...display, fontSize: 40, margin: 0 }}>My Collection</h1>
        <span style={{ color: '#8A93A8', fontSize: 13 }}>{(wants || []).length} wantlist item{(wants || []).length === 1 ? '' : 's'} · {(collected || []).length} card{(collected || []).length === 1 ? '' : 's'} collected</span>
      </div>

      {activeSlug && !setData ? (
        <p role="status" style={{ color: '#8A93A8', fontSize: 14 }}>Loading checklist…</p>
      ) : activeSlug && setData ? (
        <div>
          <button style={{ ...btnGhost, marginBottom: 16 }} onClick={() => setActiveSlug(null)}>← Back to wantlist</button>
          <h2 style={{ ...title(24), margin: '0 0 4px' }}>{setData.name}</h2>
          <p style={{ color: '#8A93A8', fontSize: 13, margin: '0 0 16px' }}>Check off cards as you collect them.</p>
          {setData.sections.slice(0, secShown).map((sec, si) => (
            <div key={si} style={{ marginBottom: 18 }}>
              <h3 style={{ ...title(16), color: ACCENT_TEXT, margin: '0 0 8px' }}>{sec.title} <span style={{ color: '#8A93A8', fontWeight: 600 }}>({sec.cards.length})</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 6 }}>
                {sec.cards.map((c, ci) => {
                  const cn = collectionCardN(c)
                  const key = ckey(activeSlug, sec.title, cn)
                  const isC = collectedKeys.has(key)
                  const rec = collectedRec.get(key)
                  return (
                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isC ? '#12200f' : '#121212', border: '1px solid ' + (isC ? '#2f5324' : '#222'), borderRadius: 8, padding: '7px 10px' }}>
                      <input type="checkbox" aria-label={'Collected ' + (c.n ? '#' + c.n + ' ' : '') + c.p} checked={isC} onChange={async (e) => {
                        const { error } = await toggleCollected(session.user.id, { set_slug: activeSlug, card_n: cn, section: !e.target.checked && rec ? rec.section : sec.title, player: c.p }, e.target.checked)   // uncheck the saved row, even if saved under an older title
                        if (error) setNotice('Couldn’t save that change — ' + error.message)
                        const next = await myCollection(session.user.id)
                        setCollected(next)
                      }} style={{ accentColor: ACCENT, width: 18, height: 18, flexShrink: 0 }} />
                      <span style={{ color: '#8A93A8', fontSize: 12, minWidth: 34 }}>{c.n || '—'}</span>
                      <span style={{ color: isC ? '#9fd18a' : '#D4D4D8', fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.p}</span>
                      {isC && (rec?.image_url
                        ? <a href={rec.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT_TEXT }}>photo</a>
                        : <button onClick={() => { setUploadTarget(rec?.id); fileRef.current?.click() }} style={{ background: 'none', border: '1px solid #232A3E', color: '#8A93A8', fontSize: 12, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>+ photo</button>)}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {setData.sections.length > secShown && (
            <button style={{ ...btnGhost, display: 'block', margin: '8px auto 0' }} onClick={() => setSecShown(n => n + 12)}>
              Show {Math.min(12, setData.sections.length - secShown)} more sections ({setData.sections.length - secShown} left)
            </button>
          )}
        </div>
      ) : (
        <>
          {(wants || []).length === 0 && (
            <div style={{ ...card, padding: 28, marginBottom: 18 }}>
              <p style={{ color: '#A1A1AA', margin: 0, fontSize: 14 }}>Your wantlist is empty. Browse any set and hit <b style={{ color: ACCENT_TEXT }}>+ Wantlist</b> — or add whole sets, single cards, or specific parallels.</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 14 }}>
            {Object.entries(wantsBySets).map(([slug, g]) => {
              const idx = (indexSets || []).find(s => s.slug === slug)
              const total = idx ? idx.cardCount : null
              const mine = (collected || []).filter(c => c.set_slug === slug).length
              // base-set progress (what "completing a set" usually means) next to the master set (every parallel)
              const baseTotal = idx?.baseCount || 0
              const baseMine = baseTotal ? (collected || []).filter(c => c.set_slug === slug && sectionKey(c.section) === sectionKey(idx.baseTitle)).length : 0
              return (
                <div key={slug} style={{ ...card, padding: '18px 20px' }}>
                  <p style={{ ...title(16), margin: 0, color: '#fff' }}>{g.name}</p>
                  <p style={{ color: '#8A93A8', fontSize: 13, margin: '4px 0 10px' }}>
                    {g.items.some(i => !i.card_n) ? 'Full set wanted' : `${g.items.length} card${g.items.length === 1 ? '' : 's'} wanted`}
                    {baseTotal ? ` · base ${baseMine}/${baseTotal}` : ''}{total ? ` · master ${mine}/${total}` : ''}
                  </p>
                  {total > 0 && (
                    <div style={{ height: 6, background: '#222', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: Math.min(100, (baseTotal ? baseMine / baseTotal : mine / total) * 100) + '%', background: ACCENT }} />
                    </div>
                  )}
                  {/* the actual cards wanted, each removable */}
                  {g.items.some(i => i.card_n) && (
                    <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 4 }}>
                      {g.items.filter(i => i.card_n).slice(0, wantOpen[slug] ? undefined : 6).map(i => (
                        <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#D4D4D8' }}>
                          <span style={{ color: ACCENT_TEXT, fontWeight: 700, minWidth: 44 }}>{String(i.card_n).startsWith('—') ? '—' : '#' + i.card_n}</span>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.player || ''}{i.section && i.section !== 'Base' ? <span style={{ color: '#8A93A8' }}> · {i.section}</span> : null}</span>
                          <a href={grailfindrFindUrl({ setName: g.name, player: i.player, n: i.card_n, section: i.section })} target="_blank" rel="noreferrer" title="Find it on GrailFindr" style={{ color: ACCENT_TEXT, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>Find ↗</a>
                          <button aria-label={'Remove ' + (i.player || 'card') + ' from wantlist'} onClick={async () => { await removeWant(i.id); myWantlist(session.user.id).then(setWants); onWantsChanged?.() }}
                            style={{ background: 'none', border: 'none', color: '#8A93A8', cursor: 'pointer', fontSize: 14, padding: '2px 6px' }}>✕</button>
                        </li>
                      ))}
                      {g.items.filter(i => i.card_n).length > 6 && !wantOpen[slug] && (
                        <li><button onClick={() => setWantOpen(o => ({ ...o, [slug]: true }))} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'inherit' }}>Show all {g.items.filter(i => i.card_n).length}</button></li>
                      )}
                    </ul>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button style={btnAccent} onClick={() => setActiveSlug(slug)}>Open checklist</button>
                    {onOpenSet && <button style={btnGhost} onClick={() => onOpenSet(slug)}>View set</button>}
                    {confirmRm === slug ? (
                      <>
                        <button style={{ ...btnGhost, color: '#fff', background: '#7f1d1d', borderColor: '#7f1d1d' }} onClick={async () => {
                          for (const i of g.items) await removeWant(i.id)
                          setConfirmRm(null); myWantlist(session.user.id).then(setWants); onWantsChanged?.()
                        }}>Remove all {g.items.length}</button>
                        <button style={btnGhost} onClick={() => setConfirmRm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button style={{ ...btnGhost, color: '#a55' }} onClick={() => setConfirmRm(slug)}>Remove</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

// --------------- Community (achievement forum) ---------------
const ACHIEVEMENTS = [
  ['set-completion', 'Set Complete'], ['rainbow', 'Rainbow Complete'], ['grail-pull', 'Grail Pull'],
  ['vintage-milestone', 'Vintage Milestone'], ['pc-showcase', 'PC Showcase'], ['other', 'Other'],
]
export function CommunityView({ account, indexSets, onOpenAuth }) {
  const { session, profile } = account
  const [feed, setFeed] = useState(null)
  const [composing, setComposing] = useState(false)
  const [postTitle, setPostTitle] = useState('')
  const [body, setBody] = useState('')
  const [ach, setAch] = useState('set-completion')
  const [setQuery, setSetQuery] = useState('')
  const [chosenSet, setChosenSet] = useState(null)
  const [openComments, setOpenComments] = useState({})
  const [commentDraft, setCommentDraft] = useState({})
  const [postErr, setPostErr] = useState('')
  const [commentErr, setCommentErr] = useState({})
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)          // a post is being sent (no double posts)
  const [sending, setSending] = useState({})       // post id -> comment being sent
  useEffect(() => { if (profile) setPostErr(e => e.startsWith('Pick a username') ? '' : e) }, [profile])
  // Posts and comments need a username (forum rows reference the profile). People who
  // sign in through GrailFindr never saw the "Pick a username" step, so ask here
  // instead of letting the insert fail and silently throwing away their post.
  const needName = () => {
    if (profile) return false
    if (profile === undefined) { setPostErr('Still loading your profile — try again in a moment. Your post is still here.'); return true }
    setPostErr('Pick a username first — it’s how you appear in the community. Your post is still here.'); onOpenAuth(); return true
  }

  useEffect(() => { forumFeed().then(setFeed) }, [])
  const setMatches = useMemo(() => {
    const q = setQuery.trim().toLowerCase()
    if (q.length < 2) return []
    return (indexSets || []).filter(s => s.name.toLowerCase().includes(q)).slice(0, 6)
  }, [setQuery, indexSets])

  async function submit() {
    if (busy) return
    setPostErr('')
    if (!postTitle.trim()) { setPostErr('Add a title first.'); return }
    if (needName()) return
    setBusy(true)
    const r = await createPost(session.user.id, { title: postTitle.trim(), body: body.trim() || null, set_slug: chosenSet?.slug || null, achievement: ach })
    setBusy(false)
    if (r?.error) { setPostErr('Couldn’t post: ' + r.error.message + '. Your draft is still here.'); return }
    setPostTitle(''); setBody(''); setChosenSet(null); setSetQuery(''); setComposing(false)
    forumFeed().then(setFeed)
  }

  return (
    <section>
      <div style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: 30, marginBottom: 22 }} className="hq-panel">
        <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>Community</h1>
        <p style={{ color: '#A3ABBD', fontSize: 16, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
          Collecting accomplishments from the CardHQ community — completed sets, finished rainbows, grail pulls.
        </p>
        <div style={{ marginTop: 18 }}>
          {session
            ? <button style={btnAccent} onClick={() => setComposing(!composing)}>{composing ? 'Cancel' : '+ Share an accomplishment'}</button>
            : <button style={btnAccent} onClick={onOpenAuth}>Sign in to post</button>}
        </div>
      </div>

      {composing && session && (
        <div style={{ ...card, padding: 22, marginBottom: 22 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input style={input} maxLength={120} aria-label="Post title" placeholder="Title — e.g. Finished the 2004-05 Megacracks base set!" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ACHIEVEMENTS.map(([v, label]) => (
                <button key={v} onClick={() => setAch(v)} style={{ ...btnGhost, padding: '7px 12px', fontSize: 12, borderColor: ach === v ? ACCENT : '#232A3E', color: ach === v ? ACCENT_TEXT : '#A1A1AA' }}>{label}</button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input style={input} aria-label="Link a set" placeholder="Link a set (start typing its name)…" value={chosenSet ? chosenSet.name : setQuery}
                onChange={(e) => { setChosenSet(null); setSetQuery(e.target.value) }} />
              {setMatches.length > 0 && !chosenSet && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#121626', border: '1px solid #232A3E', borderRadius: 10, overflow: 'hidden' }}>
                  {setMatches.map(s => (
                    <div key={s.slug} onClick={() => { setChosenSet(s); setSetQuery('') }} style={{ padding: '9px 13px', fontSize: 13, color: '#ccc', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                      {s.name} <span style={{ color: '#8A93A8' }}>({s.cardCount} card{s.cardCount === 1 ? '' : 's'})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} maxLength={5000} aria-label="Post text" placeholder="Tell the story — how long it took, the last card you needed…" value={body} onChange={(e) => setBody(e.target.value)} />
            {postErr && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{postErr}</p>}
            <button style={{ ...btnAccent, justifySelf: 'start', opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>{busy ? 'Posting…' : 'Post it'}</button>
          </div>
        </div>
      )}

      {!feed ? <p style={{ color: '#8A93A8' }}>Loading feed…</p> : feed.failed ? (
        <div style={{ ...card, padding: 24, textAlign: 'center' }}>
          <p style={{ color: '#A1A1AA', fontSize: 14, margin: 0 }}>Couldn't load the community feed. Check your connection.</p>
          <button onClick={() => { setFeed(null); forumFeed().then(setFeed) }} style={{ marginTop: 12, background: 'none', border: '1px solid #2A3247', color: '#ECEEF3', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Try again</button>
        </div>
      ) : feed.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center' }}>
          <p style={{ ...title(18), color: '#fff', margin: 0 }}>Be the first to post</p>
          <p style={{ color: '#A1A1AA', fontSize: 14, margin: '8px 0 0' }}>Complete a set, share the story, claim the flex.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {feed.map(p => {
            const fires = (p.forum_reactions || []).length
            const myFire = !!session && (p.forum_reactions || []).some(r => r.user_id === session.user.id)
            const nComments = (p.forum_comments || []).length
            const achLabel = (ACHIEVEMENTS.find(a => a[0] === p.achievement) || [])[1]
            return (
              <div key={p.id} style={{ ...card, padding: '20px 22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#232A3E', color: ACCENT_TEXT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(p.profiles?.username || '?')[0].toUpperCase()}</span>
                  <span style={{ color: '#D4D4D8', fontWeight: 700, fontSize: 14 }}>{p.profiles?.username || 'collector'}</span>
                  <span style={{ color: '#8A93A8', fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  {achLabel && <span style={{ ...eyebrow, marginLeft: 'auto', background: '#1A1F31', color: '#A1A1AA', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>{achLabel}</span>}
                </div>
                <h3 style={{ ...title(20), margin: 0, color: '#fff', lineHeight: 1.15 }}>{p.title}</h3>
                {p.body && <p style={{ color: '#b5b5b5', fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' }}>{p.body}</p>}
                <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
                  <button onClick={async () => { if (!session) { onOpenAuth(); return } await react(p.id, session.user.id, 'fire', !myFire); forumFeed().then(setFeed) }} aria-pressed={myFire} title={myFire ? 'Remove your 🔥' : 'Give this a 🔥'}
                    style={{ background: myFire ? 'rgba(249,115,22,0.15)' : 'none', border: '1px solid ' + (myFire ? '#f97316' : '#232A3E'), color: '#D4D4D8', borderRadius: 999, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>🔥 {fires || ''}</button>
                  <button onClick={async () => {
                    const open = !openComments[p.id]
                    setOpenComments(o => ({ ...o, [p.id]: open }))
                    if (open) { const cs = await comments(p.id); setOpenComments(o => ({ ...o, [p.id]: cs })) }
                  }} style={{ background: 'none', border: 'none', color: '#8A93A8', fontSize: 13, cursor: 'pointer' }}>💬 {nComments} comment{nComments === 1 ? '' : 's'}</button>
                  {session && p.user_id === session.user.id && (confirmDel === p.id ? (
                    <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                      <span style={{ color: '#A1A1AA' }}>Delete this post?</span>
                      <button onClick={async () => { const r = await deletePost(p.id); setConfirmDel(null); if (!r.error) forumFeed().then(setFeed) }} style={{ background: '#7f1d1d', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                      <button onClick={() => setConfirmDel(null)} style={{ background: 'none', border: '1px solid #232A3E', color: '#A1A1AA', borderRadius: 6, padding: '5px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDel(p.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8A93A8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                  ))}
                </div>
                {Array.isArray(openComments[p.id]) && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #222', paddingTop: 12 }}>
                    {openComments[p.id].map(c => (
                      <p key={c.id} style={{ margin: '0 0 8px', fontSize: 13, color: '#A1A1AA' }}><b style={{ color: ACCENT_TEXT }}>{c.profiles?.username || '?'}</b> {c.body}</p>
                    ))}
                    {session && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input style={{ ...input, padding: '8px 12px' }} maxLength={1000} aria-label="Add a comment" placeholder="Add a comment…" value={commentDraft[p.id] || ''} onChange={(e) => { const v = e.target.value; setCommentDraft(d => ({ ...d, [p.id]: v })) }} />
                        <button style={{ ...btnGhost }} disabled={!!sending[p.id]} onClick={async () => {
                          const t = (commentDraft[p.id] || '').trim(); if (!t || sending[p.id]) return
                          if (needName()) return
                          setSending(x => ({ ...x, [p.id]: true }))
                          const r = await addComment(p.id, session.user.id, t)
                          setSending(x => ({ ...x, [p.id]: false }))
                          if (r?.error) { setCommentErr(e => ({ ...e, [p.id]: 'Couldn’t comment: ' + r.error.message })); return }
                          setCommentErr(e => ({ ...e, [p.id]: '' })); forumFeed().then(setFeed)   // refresh the comment count
                          setCommentDraft(d => ({ ...d, [p.id]: '' }))
                          const cs = await comments(p.id); setOpenComments(o => ({ ...o, [p.id]: cs }))
                        }}>Post</button>
                      </div>
                    )}
                    {commentErr[p.id] && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '6px 0 0' }}>{commentErr[p.id]}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
