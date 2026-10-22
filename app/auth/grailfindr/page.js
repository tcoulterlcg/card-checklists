'use client'
// Finishes "Continue with GrailFindr". GrailFindr sends a one-time sign-in token
// in the URL fragment (never sent to a server); we trade it for a Card HQ session
// and continue to the page the person started on.
import { useEffect, useState } from 'react'
import { supa, grailfindrConnectUrl } from '../../../lib/supa'

const safePath = (p) => (p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p : '/')

export default function GrailFindrHandoff() {
  const [error, setError] = useState('')

  useEffect(() => {
    const frag = new URLSearchParams(window.location.hash.slice(1))
    // Drop the token from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname)
    const tokenHash = frag.get('token_hash')
    const next = safePath(frag.get('next'))
    if (!tokenHash) { setError(frag.get('error') || 'That sign-in link is missing or expired.'); return }
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
            <a href="/" style={{ color: '#8A93A8' }}>Back to Card HQ</a>
          </>
        ) : (
          <p style={{ fontSize: 16, color: '#A1A1AA' }}>Signing you in with GrailFindr…</p>
        )}
      </div>
    </main>
  )
}
