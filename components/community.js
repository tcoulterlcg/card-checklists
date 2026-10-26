'use client'
// Community features: auth chip and achievement forum (My Collection lives in components/collection.js). Dark + electric blue to match the site shell. Data via lib/supa.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDialogFocus } from './dialog-focus'
import { supa, signOutHere, grailfindrConnectUrl, grailfindrSignupUrl, grailfindrForgotUrl, GRAILFINDR_URL, getProfile, ensureProfile, updateProfile } from '../lib/supa'
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
    // undefined back means the read failed: try again a few times rather than "Loading…" forever
    let tries = 0, timer = 0
    const load = () => getProfile(uid).then(p => {
      if (!live) return
      if (p === undefined && ++tries < 4) timer = setTimeout(load, 2000 * tries)
      else setProfile(p)
    })
    load()
    return () => { live = false; clearTimeout(timer) }
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
              <input style={input} type="email" required autoComplete="email" aria-label="Email address" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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

// --------------- Community boards: see components/forum.js ---------------
export { CommunityView } from './forum'
