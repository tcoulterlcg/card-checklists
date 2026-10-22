'use client'
// Community + Collection features: auth chip, achievement forum, wantlist /
// collection tracker. Dark + electric blue to match the site shell. Data via lib/supa.
import { loadSet } from '../lib/catalog'
import { useEffect, useMemo, useRef, useState } from 'react'
import { collectionCardN, supa, grailfindrConnectUrl, grailfindrSignupUrl, grailfindrForgotUrl, GRAILFINDR_URL, getProfile, ensureProfile, addWant, removeWant, myWantlist, toggleCollected, myCollection, uploadCardImage, setCollectionImage, forumFeed, createPost, react, comments, addComment, grailSets, notifyGrailCompletion } from '../lib/supa'
import { ACCENT, ACCENT_TEXT, BG, SURFACE, SURFACE_2, LINE, CHIP_LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'

const card = { background: 'linear-gradient(155deg, #121626, #0F1320)', border: '1px solid #232A3E', borderRadius: 14 }
const btnAccent = { ...buttonText, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', fontSize: 14 }
const btnGhost = { ...buttonText, background: 'transparent', color: '#A1A1AA', border: '1px solid #232A3E', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }
const input = { background: '#0F1320', border: '1px solid #232A3E', borderRadius: 10, color: '#EDEDEF', padding: '11px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box' }

// --------------- auth hook + chip ---------------
export function useAccount() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    supa.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session?.user) { setProfile(null); return }
    getProfile(session.user.id).then(setProfile)
  }, [session])
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
      <span title={name} style={{ width: 32, height: 32, boxSizing: 'border-box', borderRadius: '50%', background: '#1E2A4A', border: '1px solid #2E3E6B', color: '#C9D6FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12 }}>{name.slice(0, 2).toUpperCase()}</span>
      <a href={GRAILFINDR_URL} title="Your account also works on GrailFindr" style={{ color: '#8A93A8', fontSize: 12, textDecoration: 'none' }}>GrailFindr ↗</a>
      <button onClick={() => supa.auth.signOut()} style={{ background: 'none', border: 'none', color: '#8A93A8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
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
  // Escape closes; focus goes into the dialog and back to where it was after.
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus() }
  }, [open])
  if (!open) return null
  const needsProfile = session && !profile
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label="Sign in to Card HQ" onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(420px, 92vw)', padding: 28, position: 'relative' }}>
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, background: 'none', border: 'none', color: '#8A8A93', fontSize: 20, cursor: 'pointer', borderRadius: 8 }}>×</button>
        {!session ? (
          <>
            <h3 style={{ ...title(24), margin: 0, color: '#fff' }}>Sign in to Card HQ</h3>
            <p style={{ color: '#A1A1AA', fontSize: 14, lineHeight: 1.6, margin: '10px 0 18px' }}>Card HQ uses your GrailFindr account — one login for both. Track your wantlist, check off cards as you collect them, and share accomplishments.</p>
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
        ) : needsProfile ? (
          <>
            <h3 style={{ ...title(24), margin: 0, color: '#fff' }}>Pick a username</h3>
            <p style={{ color: '#A1A1AA', fontSize: 14, margin: '10px 0 16px' }}>This is how you appear on wantlists and in the community.</p>
            <input style={input} placeholder="e.g. patchhunter99" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
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
          <>
            <h3 style={{ ...title(20), margin: 0, color: '#fff' }}>You're signed in</h3>
            <button style={{ ...btnAccent, width: '100%', marginTop: 16 }} onClick={onClose}>Start collecting</button>
          </>
        )}
      </div>
    </div>
  )
}

// --------------- My Collection (wantlist + checkoff + uploads) ---------------
export function CollectionView({ account, indexSets, onOpenAuth, onOpenSet }) {
  const { session, profile } = account
  const [wants, setWants] = useState(null)
  const [collected, setCollected] = useState(null)
  const [activeSlug, setActiveSlug] = useState(null)
  const [secShown, setSecShown] = useState(12) // big sets have hundreds of parallel sections
  const [setData, setSetData] = useState(null)
  const [grails, setGrails] = useState([])
  const [notice, setNotice] = useState('')
  const fileRef = useRef(null)
  const [uploadTarget, setUploadTarget] = useState(null)

  useEffect(() => { grailSets().then(setGrails) }, [])
  useEffect(() => {
    if (!session?.user) return
    myWantlist(session.user.id).then(setWants)
    myCollection(session.user.id).then(setCollected)
  }, [session])
  useEffect(() => {
    if (!activeSlug) { setSetData(null); return }
    setSecShown(12)
    loadSet(activeSlug).then(setSetData).catch(() => setSetData(null))
  }, [activeSlug])

  if (!session) return (
    <div className="hq-panel" style={{ ...card, padding: 40, textAlign: 'center' }}>
      <h2 style={{ ...title(32), margin: 0, color: '#fff' }}>Track your collection</h2>
      <p style={{ color: '#A1A1AA', maxWidth: 480, margin: '12px auto 20px', fontSize: 14, lineHeight: 1.6 }}>Build a wantlist of cards, parallels, or whole sets. Check cards off as you land them and upload photos of your copies.</p>
      <button style={btnAccent} onClick={onOpenAuth}>Sign in to start</button>
    </div>
  )

  const ckey = (slug, section, n) => slug + '||' + (section || '') + '||' + n
  const collectedKeys = new Set((collected || []).map(c => ckey(c.set_slug, c.section, c.card_n)))
  const collectedRec = new Map((collected || []).map(c => [ckey(c.set_slug, c.section, c.card_n), c]))
  const wantsBySets = {}
  for (const w of wants || []) { (wantsBySets[w.set_slug] = wantsBySets[w.set_slug] || { name: w.set_name || w.set_slug, items: [] }).items.push(w) }

  async function checkGrailCompletion(slug, name) {
    const g = grails.find(x => x.set_slug === slug)
    if (!g || !g.notify) return
    const data = setData && setData.slug === slug ? setData : await loadSet(slug)
    if (!data) return
    const total = data.sections.reduce((n, s) => n + s.cards.length, 0)
    const mine = (await myCollection(session.user.id, slug)).length
    if (total > 0 && mine >= total) {
      await notifyGrailCompletion(session.user.id, profile?.username || 'unknown', slug, name, g.tier)
      setNotice('Grail completion recorded — the site manager has been notified. Post it in the Community tab!')
    }
  }

  return (
    <section>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
        const f = e.target.files?.[0]
        if (!f || !uploadTarget) return
        const { url, error } = await uploadCardImage(session.user.id, f)
        if (!error && url) { await setCollectionImage(uploadTarget, url); myCollection(session.user.id).then(setCollected) }
        e.target.value = ''
      }} />
      {notice && <div style={{ ...card, borderColor: ACCENT, padding: '14px 18px', marginBottom: 18, color: ACCENT_TEXT, fontWeight: 600, fontSize: 14 }}>{notice}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <h1 style={{ ...display, fontSize: 40, margin: 0 }}>My Collection</h1>
        <span style={{ color: '#8A8A93', fontSize: 13 }}>{(wants || []).length} wantlist items · {(collected || []).length} cards collected</span>
      </div>

      {activeSlug && setData ? (
        <div>
          <button style={{ ...btnGhost, marginBottom: 16 }} onClick={() => setActiveSlug(null)}>← Back to wantlist</button>
          <h2 style={{ ...title(24), margin: '0 0 4px' }}>{setData.name}</h2>
          <p style={{ color: '#8A8A93', fontSize: 13, margin: '0 0 16px' }}>Check off cards as you collect them. {grails.some(g => g.set_slug === activeSlug) && <span style={{ color: ACCENT_TEXT, fontWeight: 700 }}>★ GRAIL SET — completion is site-verified and celebrated.</span>}</p>
          {setData.sections.slice(0, secShown).map((sec, si) => (
            <div key={si} style={{ marginBottom: 18 }}>
              <h3 style={{ ...title(16), color: ACCENT_TEXT, margin: '0 0 8px' }}>{sec.title} <span style={{ color: '#6B7080', fontWeight: 600 }}>({sec.cards.length})</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 6 }}>
                {sec.cards.map((c, ci) => {
                  const cn = collectionCardN(c)
                  const key = ckey(activeSlug, sec.title, cn)
                  const isC = collectedKeys.has(key)
                  const rec = collectedRec.get(key)
                  return (
                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isC ? '#12200f' : '#121212', border: '1px solid ' + (isC ? '#2f5324' : '#222'), borderRadius: 8, padding: '7px 10px' }}>
                      <input type="checkbox" aria-label={'Collected ' + (c.n ? '#' + c.n + ' ' : '') + c.p} checked={isC} onChange={async (e) => {
                        const { error } = await toggleCollected(session.user.id, { set_slug: activeSlug, card_n: cn, section: sec.title, player: c.p }, e.target.checked)
                        if (error) setNotice('Couldn’t save that change — ' + error.message)
                        const next = await myCollection(session.user.id)
                        setCollected(next)
                        if (e.target.checked) checkGrailCompletion(activeSlug, setData.name)
                      }} style={{ accentColor: ACCENT, width: 18, height: 18, flexShrink: 0 }} />
                      <span style={{ color: '#8A8A93', fontSize: 12, minWidth: 34 }}>{c.n || '—'}</span>
                      <span style={{ color: isC ? '#9fd18a' : '#D4D4D8', fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.p}</span>
                      {isC && (rec?.image_url
                        ? <a href={rec.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: ACCENT_TEXT }}>photo</a>
                        : <button onClick={() => { setUploadTarget(rec?.id); fileRef.current?.click() }} style={{ background: 'none', border: '1px solid #232A3E', color: '#8A8A93', fontSize: 12, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>+ photo</button>)}
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
              return (
                <div key={slug} style={{ ...card, padding: '18px 20px' }}>
                  <p style={{ ...title(16), margin: 0, color: '#fff' }}>{g.name}</p>
                  <p style={{ color: '#8A8A93', fontSize: 13, margin: '4px 0 10px' }}>
                    {g.items.some(i => !i.card_n) ? 'Full set wanted' : `${g.items.length} card${g.items.length === 1 ? '' : 's'} wanted`}
                    {total ? ` · ${mine}/${total} collected` : ''}
                    {grails.some(x => x.set_slug === slug) && <span style={{ color: ACCENT_TEXT, fontWeight: 700 }}> · ★ GRAIL</span>}
                  </p>
                  {total > 0 && (
                    <div style={{ height: 6, background: '#222', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: Math.min(100, (mine / total) * 100) + '%', background: ACCENT }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button style={btnAccent} onClick={() => setActiveSlug(slug)}>Open checklist</button>
                    {onOpenSet && <button style={btnGhost} onClick={() => onOpenSet(slug)}>View set</button>}
                    <button style={{ ...btnGhost, color: '#a55' }} onClick={async () => {
                      for (const i of g.items) await removeWant(i.id)
                      myWantlist(session.user.id).then(setWants)
                    }}>Remove</button>
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
  const [grails, setGrails] = useState([])
  const [openComments, setOpenComments] = useState({})
  const [commentDraft, setCommentDraft] = useState({})

  useEffect(() => { forumFeed().then(setFeed); grailSets().then(setGrails) }, [])
  const setMatches = useMemo(() => {
    const q = setQuery.trim().toLowerCase()
    if (q.length < 2) return []
    return (indexSets || []).filter(s => s.name.toLowerCase().includes(q)).slice(0, 6)
  }, [setQuery, indexSets])

  async function submit() {
    if (!postTitle.trim()) return
    const g = chosenSet ? grails.find(x => x.set_slug === chosenSet.slug) : null
    await createPost(session.user.id, { title: postTitle.trim(), body: body.trim() || null, set_slug: chosenSet?.slug || null, achievement: ach, grail_tier: g ? g.tier : null })
    if (g && g.notify && ach === 'set-completion') await notifyGrailCompletion(session.user.id, profile?.username || 'unknown', chosenSet.slug, chosenSet.name, g.tier)
    setPostTitle(''); setBody(''); setChosenSet(null); setSetQuery(''); setComposing(false)
    forumFeed().then(setFeed)
  }

  return (
    <section>
      <div style={{ background: 'linear-gradient(140deg, #0f1526, #0F1320)', border: '1px solid ' + ACCENT + '33', borderRadius: 18, padding: 30, marginBottom: 22 }} className="hq-panel">
        <h1 style={{ ...display, fontSize: 40, margin: 0, lineHeight: 1 }}>Community</h1>
        <p style={{ color: '#aaa', fontSize: 16, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
          Collecting accomplishments from the CardHQ community — completed sets, finished rainbows, grail pulls. Grail-tier completions are verified and celebrated.
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
            <input style={input} placeholder="Title — e.g. Finished the 2004-05 Megacracks base set!" value={postTitle} onChange={(e) => setPostTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ACHIEVEMENTS.map(([v, label]) => (
                <button key={v} onClick={() => setAch(v)} style={{ ...btnGhost, padding: '7px 12px', fontSize: 12, borderColor: ach === v ? ACCENT : '#232A3E', color: ach === v ? ACCENT_TEXT : '#A1A1AA' }}>{label}</button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input style={input} placeholder="Link a set (start typing its name)…" value={chosenSet ? chosenSet.name : setQuery}
                onChange={(e) => { setChosenSet(null); setSetQuery(e.target.value) }} />
              {setMatches.length > 0 && !chosenSet && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#121626', border: '1px solid #232A3E', borderRadius: 10, overflow: 'hidden' }}>
                  {setMatches.map(s => (
                    <div key={s.slug} onClick={() => { setChosenSet(s); setSetQuery('') }} style={{ padding: '9px 13px', fontSize: 13, color: '#ccc', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                      {s.name} <span style={{ color: '#6B7080' }}>({s.cardCount} cards)</span>
                      {grails.some(g => g.set_slug === s.slug) && <span style={{ color: ACCENT_TEXT, fontWeight: 700 }}> ★ GRAIL</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="Tell the story — how long it took, the last card you needed…" value={body} onChange={(e) => setBody(e.target.value)} />
            <button style={{ ...btnAccent, justifySelf: 'start' }} onClick={submit}>Post it</button>
          </div>
        </div>
      )}

      {!feed ? <p style={{ color: '#6B7080' }}>Loading feed…</p> : feed.failed ? (
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
            const isGrail = !!p.grail_tier
            const fires = (p.forum_reactions || []).length
            const nComments = (p.forum_comments || []).length
            const achLabel = (ACHIEVEMENTS.find(a => a[0] === p.achievement) || [])[1]
            return (
              <div key={p.id} style={{ ...card, padding: '20px 22px', border: isGrail ? '1px solid ' + ACCENT : card.border, boxShadow: isGrail ? '0 0 24px ' + ACCENT + '22' : 'none' }}>
                {isGrail && <p style={{ ...eyebrow, margin: '0 0 8px', color: ACCENT_TEXT }}>★ {p.grail_tier === 'extreme' ? 'Extreme difficulty' : 'Hard'} · verified grail set</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#232A3E', color: ACCENT_TEXT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(p.profiles?.username || '?')[0].toUpperCase()}</span>
                  <span style={{ color: '#D4D4D8', fontWeight: 700, fontSize: 14 }}>{p.profiles?.username || 'collector'}</span>
                  <span style={{ color: '#6B7080', fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  {achLabel && <span style={{ ...eyebrow, marginLeft: 'auto', background: isGrail ? ACCENT : '#1A1F31', color: isGrail ? '#fff' : '#A1A1AA', padding: '4px 10px', borderRadius: 999, fontSize: 12 }}>{achLabel}</span>}
                </div>
                <h3 style={{ ...title(20), margin: 0, color: '#fff', lineHeight: 1.15 }}>{p.title}</h3>
                {p.body && <p style={{ color: '#b5b5b5', fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' }}>{p.body}</p>}
                <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
                  <button onClick={async () => { if (!session) { onOpenAuth(); return } await react(p.id, session.user.id, 'fire'); forumFeed().then(setFeed) }}
                    style={{ background: 'none', border: '1px solid #232A3E', color: '#D4D4D8', borderRadius: 999, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>🔥 {fires || ''}</button>
                  <button onClick={async () => {
                    const open = !openComments[p.id]
                    setOpenComments({ ...openComments, [p.id]: open })
                    if (open) { const cs = await comments(p.id); setOpenComments(o => ({ ...o, [p.id]: cs })) }
                  }} style={{ background: 'none', border: 'none', color: '#8A8A93', fontSize: 13, cursor: 'pointer' }}>💬 {nComments} comments</button>
                </div>
                {Array.isArray(openComments[p.id]) && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #222', paddingTop: 12 }}>
                    {openComments[p.id].map(c => (
                      <p key={c.id} style={{ margin: '0 0 8px', fontSize: 13, color: '#A1A1AA' }}><b style={{ color: ACCENT_TEXT }}>{c.profiles?.username || '?'}</b> {c.body}</p>
                    ))}
                    {session && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input style={{ ...input, padding: '8px 12px' }} placeholder="Add a comment…" value={commentDraft[p.id] || ''} onChange={(e) => setCommentDraft({ ...commentDraft, [p.id]: e.target.value })} />
                        <button style={{ ...btnGhost }} onClick={async () => {
                          const t = (commentDraft[p.id] || '').trim(); if (!t) return
                          await addComment(p.id, session.user.id, t)
                          setCommentDraft({ ...commentDraft, [p.id]: '' })
                          const cs = await comments(p.id); setOpenComments(o => ({ ...o, [p.id]: cs }))
                        }}>Post</button>
                      </div>
                    )}
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
