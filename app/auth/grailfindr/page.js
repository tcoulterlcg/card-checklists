'use client'
// Finishes "Continue with GrailFindr". GrailFindr sends a one-time sign-in token
// in the URL fragment (never sent to a server); we trade it for a Card HQ session
// and continue to the page the person started on.
import { useEffect, useState } from 'react'
import { supa, grailfindrConnectUrl, takeGrailfindrState } from '../../../lib/supa'

// Only same-site paths. Browsers drop tabs/newlines while parsing, so "/\t/evil.com"
// would become "//evil.com" — resolve it and compare origins instead of pattern-matching.
const safePath = (p) => {
  if (!p || /[\x00-\x1f\\]/.test(p)) return '/'
  try { const u = new URL(p, window.location.origin); return u.origin === window.location.origin ? u.pathname + u.search + u.hash : '/' } catch { return '/' }
}
// GrailFindr error codes -> fixed text (never echo the URL's own wording onto the page).
const ERRORS = { access_denied: 'Sign-in was cancelled.', expired: 'That sign-in link expired. Try again.' }

export default function GrailFindrHandoff() {
  const [error, setError] = useState('')

  useEffect(() => {
    // GrailFindr's account menu starts here (?start=1): make the check value, then go to GrailFindr
    if (new URLSearchParams(window.location.search).has('start') && !window.location.hash) { window.location.replace(grailfindrConnectUrl('/')); return }
    const frag = new URLSearchParams(window.location.hash.slice(1))
    // Drop the token from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname)
    const tokenHash = frag.get('token_hash')
    const next = safePath(frag.get('next'))
    if (!tokenHash) { setError(ERRORS[frag.get('error')] || 'That sign-in link is missing or expired.'); return }
    // Only a sign-in this browser started: a link carrying someone else's token (made to sign you
    // into their account) has no matching check value and is refused.
    if (!takeGrailfindrState(frag.get('state'))) { setError('That sign-in link didn’t start here. Try again.'); return }
    supa.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }).then(({ error }) => {
      if (error) setError('That sign-in link expired. Try again.')
      else window.location.replace(next)
    })
  }, [])

  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0D16', color: '#EDEDEF', fontFamily: 'inherit', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        {error ? (
          <>
            <p style={{ fontSize: 16, margin: '0 0 16px' }}>{error}</p>
            <a href={grailfindrConnectUrl('/')} style={{ color: '#7FA2FF', fontWeight: 600 }}>Continue with GrailFindr</a>
            <span style={{ color: '#8A93A8' }}> · </span>
            <a href="/" style={{ color: '#8A93A8' }}>Back to CardHQ</a>
          </>
        ) : (
          <p style={{ fontSize: 16, color: '#A1A1AA' }}>Signing you in with GrailFindr…</p>
        )}
      </div>
    </main>
  )
}
