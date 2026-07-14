'use client'
// Community + Collection features: auth chip, achievement forum, wantlist /
// collection tracker. Dark + gold to match the site shell. Data via lib/supa.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supa, getProfile, ensureProfile, addWant, removeWant, myWantlist, toggleCollected, myCollection, uploadCardImage, setCollectionImage, forumFeed, createPost, react, comments, addComment, grailSets, notifyGrailCompletion } from '../lib/supa'

const GOLD = '#d4a843'
const condensed = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif" }
const card = { background: 'linear-gradient(155deg, #161616, #0d0d0d)', border: '1px solid #262626', borderRadius: 14 }
const btnGold = { ...condensed, background: GOLD, color: '#111', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 14, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }
const btnGhost = { ...condensed, background: 'transparent', color: '#bbb', border: '1px solid #333', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 13, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer' }
const input = { background: '#111', border: '1px solid #2e2e2e', borderRadius: 10, color: '#eee', padding: '11px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box' }

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
    <button onClick={onOpenAuth} style={{ ...btnGhost, borderColor: GOLD + '55', color: GOLD }}>Sign in</button>
  )
  const name = profile?.username || session.user.email?.split('@')[0] || 'collector'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 26, height: 26, borderRadius: '50%', background: GOLD, color: '#111', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{name[0].toUpperCase()}</span>
      <span style={{ color: '#ddd', fontSize: 13, fontWeight: 600 }}>{name}</span>
      <button onClick={() => supa.auth.signOut()} style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer' }}>sign out</button>
    </span>
  )
}

export function AuthModal({ open, onClose, account }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [username, setUsername] = useState('')
  const [err, setErr] = useState('')
  const { session, profile, setProfile } = account
  if (!open) return null
  const needsProfile = session && !profile
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000a', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 'min(420px, 92vw)', padding: 28 }}>
        {!session ? (
          <>
            <h3 style={{ ...condensed, margin: 0, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>Join Checklist HQ</h3>
            <p style={{ color: '#999', fontSize: 13.5, lineHeight: 1.6, margin: '10px 0 18px' }}>Track your wantlist, check off cards as you collect them, upload photos, and share accomplishments. We email you a magic sign-in link — no password.</p>
            {sent ? (
              <p style={{ color: GOLD, fontSize: 14, fontWeight: 600 }}>Check your email — the sign-in link is on its way.</p>
            ) : (
              <>
                <input style={input} type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                {err && <p style={{ color: '#f87171', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
                <button style={{ ...btnGold, width: '100%', marginTop: 12 }} onClick={async () => {
                  setErr('')
                  const { error } = await supa.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined } })
                  if (error) setErr(error.message); else setSent(true)
                }}>Email me a sign-in link</button>
              </>
            )}
          </>
        ) : needsProfile ? (
          <>
            <h3 style={{ ...condensed, margin: 0, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>Pick a username</h3>
            <p style={{ color: '#999', fontSize: 13.5, margin: '10px 0 16px' }}>This is how you appear on wantlists and in the community.</p>
            <input style={input} placeholder="e.g. patchhunter99" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
            {err && <p style={{ color: '#f87171', fontSize: 12.5, margin: '8px 0 0' }}>{err}</p>}
            <button style={{ ...btnGold, width: '100%', marginTop: 12 }} onClick={async () => {
              setErr('')
              if (username.length < 3) { setErr('At least 3 characters.'); return }
              const { data, error } = await ensureProfile(session.user.id, username)
              if (error) setErr(error.message.includes('duplicate') ? 'Username taken — try another.' : error.message)
              else { setProfile(data); onClose() }
            }}>Create profile</button>
          </>
        ) : (
          <>
            <h3 style={{ ...condensed, margin: 0, fontSize: 24, fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>You're signed in</h3>
            <button style={{ ...btnGold, width: '100%', marginTop: 16 }} onClick={onClose}>Start collecting</button>
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
    fetch('/data/' + activeSlug + '.json').then(r => r.json()).then(setSetData).catch(() => setSetData(null))
  }, [activeSlug])

  if (!session) return (
    <div style={{ ...card, padding: 40, textAlign: 'center' }}>
      <h2 style={{ ...condensed, fontSize: 32, fontWeight: 800, textTransform: 'uppercase', margin: 0, color: '#fff' }}>Track your collection</h2>
      <p style={{ color: '#999', maxWidth: 480, margin: '12px auto 20px', fontSize: 14.5, lineHeight: 1.6 }}>Build a wantlist of cards, parallels, or whole sets. Check cards off as you land them and upload photos of your copies.</p>
      <button style={btnGold} onClick={onOpenAuth}>Sign in to start</button>
    </div>
  )

  const collectedKeys = new Set((collected || []).map(c => c.set_slug + '||' + c.card_n))
  const wantsBySets = {}
  for (const w of wants || []) { (wantsBySets[w.set_slug] = wantsBySets[w.set_slug] || { name: w.set_name || w.set_slug, items: [] }).items.push(w) }

  async function checkGrailCompletion(slug, name) {
    const g = grails.find(x => x.set_slug === slug)
    if (!g || !g.notify) return
    const data = setData && setData.slug === slug ? setData : await fetch('/data/' + slug + '.json').then(r => r.json()).catch(() => null)
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
      {notice && <div style={{ ...card, borderColor: GOLD, padding: '14px 18px', marginBottom: 18, color: GOLD, fontWeight: 600, fontSize: 14 }}>{notice}</div>}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <h1 style={{ ...condensed, fontSize: 38, fontWeight: 800, textTransform: 'uppercase', margin: 0 }}>My Collection</h1>
        <span style={{ color: '#888', fontSize: 13 }}>{(wants || []).length} wantlist items · {(collected || []).length} cards collected</span>
      </div>

      {activeSlug && setData ? (
        <div>
          <button style={{ ...btnGhost, marginBottom: 16 }} onClick={() => setActiveSlug(null)}>← Back to wantlist</button>
          <h2 style={{ ...condensed, fontSize: 26, fontWeight: 800, textTransform: 'uppercase', margin: '0 0 4px' }}>{setData.name}</h2>
          <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>Check off cards as you collect them. {grails.some(g => g.set_slug === activeSlug) && <span style={{ color: GOLD, fontWeight: 700 }}>★ GRAIL SET — completion is site-verified and celebrated.</span>}</p>
          {setData.sections.map((sec, si) => (
            <div key={si} style={{ marginBottom: 18 }}>
              <h3 style={{ ...condensed, fontSize: 18, fontWeight: 800, textTransform: 'uppercase', color: GOLD, margin: '0 0 8px' }}>{sec.title} <span style={{ color: '#666', fontWeight: 600 }}>({sec.cards.length})</span></h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 6 }}>
                {sec.cards.map((c, ci) => {
                  const key = activeSlug + '||' + c.n
                  const isC = collectedKeys.has(key)
                  const rec = (collected || []).find(x => x.set_slug === activeSlug && x.card_n === c.n)
                  return (
                    <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 8, background: isC ? '#12200f' : '#121212', border: '1px solid ' + (isC ? '#2f5324' : '#222'), borderRadius: 8, padding: '7px 10px' }}>
                      <input type="checkbox" checked={isC} onChange={async (e) => {
                        await toggleCollected(session.user.id, { set_slug: activeSlug, card_n: c.n, section: sec.title, player: c.p }, e.target.checked)
                        const next = await myCollection(session.user.id)
                        setCollected(next)
                        if (e.target.checked) checkGrailCompletion(activeSlug, setData.name)
                      }} style={{ accentColor: GOLD, width: 15, height: 15, flexShrink: 0 }} />
                      <span style={{ color: '#777', fontSize: 12, minWidth: 34 }}>{c.n}</span>
                      <span style={{ color: isC ? '#9fd18a' : '#ddd', fontSize: 13, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.p}</span>
                      {isC && (rec?.image_url
                        ? <a href={rec.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: GOLD }}>photo</a>
                        : <button onClick={() => { setUploadTarget(rec?.id); fileRef.current?.click() }} style={{ background: 'none', border: '1px solid #333', color: '#888', fontSize: 10.5, borderRadius: 6, padding: '2px 7px', cursor: 'pointer' }}>+ photo</button>)}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {(wants || []).length === 0 && (
            <div style={{ ...card, padding: 28, marginBottom: 18 }}>
              <p style={{ color: '#bbb', margin: 0, fontSize: 14.5 }}>Your wantlist is empty. Browse any set and hit <b style={{ color: GOLD }}>+ Wantlist</b> — or add whole sets, single cards, or specific parallels.</p>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
            {Object.entries(wantsBySets).map(([slug, g]) => {
              const idx = (indexSets || []).find(s => s.slug === slug)
              const total = idx ? idx.cardCount : null
              const mine = (collected || []).filter(c => c.set_slug === slug).length
              return (
                <div key={slug} style={{ ...card, padding: '18px 20px' }}>
                  <p style={{ ...condensed, margin: 0, fontSize: 19, fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>{g.name}</p>
                  <p style={{ color: '#888', fontSize: 12.5, margin: '4px 0 10px' }}>
                    {g.items.some(i => !i.card_n) ? 'Full set wanted' : `${g.items.length} card${g.items.length === 1 ? '' : 's'} wanted`}
                    {total ? ` · ${mine}/${total} collected` : ''}
                    {grails.some(x => x.set_slug === slug) && <span style={{ color: GOLD, fontWeight: 700 }}> · ★ GRAIL</span>}
                  </p>
                  {total > 0 && (
                    <div style={{ height: 6, background: '#222', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                      <div style={{ height: '100%', width: Math.min(100, (mine / total) * 100) + '%', background: GOLD }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btnGold} onClick={() => setActiveSlug(slug)}>Open checklist</button>
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
  const [title, setTitle] = useState('')
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
    if (!title.trim()) return
    const g = chosenSet ? grails.find(x => x.set_slug === chosenSet.slug) : null
    await createPost(session.user.id, { title: title.trim(), body: body.trim() || null, set_slug: chosenSet?.slug || null, achievement: ach, grail_tier: g ? g.tier : null })
    if (g && g.notify && ach === 'set-completion') await notifyGrailCompletion(session.user.id, profile?.username || 'unknown', chosenSet.slug, chosenSet.name, g.tier)
    setTitle(''); setBody(''); setChosenSet(null); setSetQuery(''); setComposing(false)
    forumFeed().then(setFeed)
  }

  return (
    <section>
      <div style={{ background: 'linear-gradient(140deg, #1a1512, #0e0e0e)', border: '1px solid ' + GOLD + '33', borderRadius: 18, padding: 30, marginBottom: 22 }}>
        <h1 style={{ ...condensed, fontSize: 40, fontWeight: 800, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>Community</h1>
        <p style={{ color: '#aaa', fontSize: 15, lineHeight: 1.6, maxWidth: 720, margin: '14px 0 0' }}>
          Collecting accomplishments from the Checklist HQ community — completed sets, finished rainbows, grail pulls. Grail-tier completions are verified and celebrated.
        </p>
        <div style={{ marginTop: 18 }}>
          {session
            ? <button style={btnGold} onClick={() => setComposing(!composing)}>{composing ? 'Cancel' : '+ Share an accomplishment'}</button>
            : <button style={btnGold} onClick={onOpenAuth}>Sign in to post</button>}
        </div>
      </div>

      {composing && session && (
        <div style={{ ...card, padding: 22, marginBottom: 22 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input style={input} placeholder="Title — e.g. Finished the 2004-05 Megacracks base set!" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ACHIEVEMENTS.map(([v, label]) => (
                <button key={v} onClick={() => setAch(v)} style={{ ...btnGhost, padding: '7px 12px', fontSize: 12, borderColor: ach === v ? GOLD : '#333', color: ach === v ? GOLD : '#999' }}>{label}</button>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <input style={input} placeholder="Link a set (start typing its name)…" value={chosenSet ? chosenSet.name : setQuery}
                onChange={(e) => { setChosenSet(null); setSetQuery(e.target.value) }} />
              {setMatches.length > 0 && !chosenSet && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, background: '#181818', border: '1px solid #333', borderRadius: 10, overflow: 'hidden' }}>
                  {setMatches.map(s => (
                    <div key={s.slug} onClick={() => { setChosenSet(s); setSetQuery('') }} style={{ padding: '9px 13px', fontSize: 13, color: '#ccc', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                      {s.name} <span style={{ color: '#666' }}>({s.cardCount} cards)</span>
                      {grails.some(g => g.set_slug === s.slug) && <span style={{ color: GOLD, fontWeight: 700 }}> ★ GRAIL</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="Tell the story — how long it took, the last card you needed…" value={body} onChange={(e) => setBody(e.target.value)} />
            <button style={{ ...btnGold, justifySelf: 'start' }} onClick={submit}>Post it</button>
          </div>
        </div>
      )}

      {!feed ? <p style={{ color: '#666' }}>Loading feed…</p> : feed.length === 0 ? (
        <div style={{ ...card, padding: 32, textAlign: 'center' }}>
          <p style={{ ...condensed, fontSize: 22, fontWeight: 800, textTransform: 'uppercase', color: '#fff', margin: 0 }}>Be the first to post</p>
          <p style={{ color: '#999', fontSize: 14, margin: '8px 0 0' }}>Complete a set, share the story, claim the flex.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {feed.map(p => {
            const isGrail = !!p.grail_tier
            const fires = (p.forum_reactions || []).length
            const nComments = (p.forum_comments || []).length
            const achLabel = (ACHIEVEMENTS.find(a => a[0] === p.achievement) || [])[1]
            return (
              <div key={p.id} style={{ ...card, padding: '20px 22px', border: isGrail ? '1px solid ' + GOLD : card.border, boxShadow: isGrail ? '0 0 24px ' + GOLD + '22' : 'none' }}>
                {isGrail && <p style={{ ...condensed, margin: '0 0 8px', color: GOLD, fontSize: 12, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>★ {p.grail_tier === 'extreme' ? 'Extreme difficulty' : 'Hard'} · verified grail set</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#2a2a2a', color: GOLD, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>{(p.profiles?.username || '?')[0].toUpperCase()}</span>
                  <span style={{ color: '#ddd', fontWeight: 700, fontSize: 14 }}>{p.profiles?.username || 'collector'}</span>
                  <span style={{ color: '#555', fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  {achLabel && <span style={{ ...condensed, marginLeft: 'auto', background: isGrail ? GOLD : '#242424', color: isGrail ? '#111' : '#bbb', fontWeight: 800, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999 }}>{achLabel}</span>}
                </div>
                <h3 style={{ ...condensed, margin: 0, fontSize: 24, fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>{p.title}</h3>
                {p.body && <p style={{ color: '#b5b5b5', fontSize: 14, lineHeight: 1.6, margin: '8px 0 0' }}>{p.body}</p>}
                <div style={{ display: 'flex', gap: 14, marginTop: 14, alignItems: 'center' }}>
                  <button onClick={async () => { if (!session) { onOpenAuth(); return } await react(p.id, session.user.id, 'fire'); forumFeed().then(setFeed) }}
                    style={{ background: 'none', border: '1px solid #333', color: '#ddd', borderRadius: 999, padding: '5px 12px', fontSize: 13, cursor: 'pointer' }}>🔥 {fires || ''}</button>
                  <button onClick={async () => {
                    const open = !openComments[p.id]
                    setOpenComments({ ...openComments, [p.id]: open })
                    if (open) { const cs = await comments(p.id); setOpenComments(o => ({ ...o, [p.id]: cs })) }
                  }} style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer' }}>💬 {nComments} comments</button>
                </div>
                {Array.isArray(openComments[p.id]) && (
                  <div style={{ marginTop: 12, borderTop: '1px solid #222', paddingTop: 12 }}>
                    {openComments[p.id].map(c => (
                      <p key={c.id} style={{ margin: '0 0 8px', fontSize: 13, color: '#bbb' }}><b style={{ color: GOLD }}>{c.profiles?.username || '?'}</b> {c.body}</p>
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
