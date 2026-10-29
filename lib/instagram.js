'use client'
// Import from Instagram — the browser half.
//
// A collector downloads their own Instagram data (Accounts Center → Your information and
// permissions → Download your information → JSON format) and drops the .zip here. The zip is
// read in the browser: only the posts' photos are opened, one at a time, so even a multi-GB
// export never gets uploaded whole. Each photo is shrunk to 1600 px and sent to
// /api/instagram/identify, which saves it to Card HQ's photo storage and asks the vision model
// which cards it shows. The cards then go through the same matcher and review screen as a
// TCDB or CSV import.
import { supa } from './supa'
export { fixText, readInstagramExport, instagramRows } from './instagram-export'

const MAX_EDGE = 1600

// Photo out of the zip → JPEG no larger than 1600 px, as base64 (no data: prefix).
export async function shrinkPhoto(entry) {
  const { BlobWriter } = await import('@zip.js/zip.js')
  const blob = await entry.getData(new BlobWriter())
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const out = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Couldn’t read that photo')), 'image/jpeg', 0.85))
  const bytes = new Uint8Array(await out.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

// One photo → { photoUrl, cards: [...], status, cached } — or { error, quota? }
export async function identifyPhoto({ image, caption, takenAt }) {
  const { data } = await supa.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return { error: 'Sign in again to keep going.' }
  const r = await fetch('/api/instagram/identify', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ image, caption: String(caption || '').slice(0, 2200), takenAt }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return { error: j.error || 'Couldn’t check that photo (' + r.status + ')', quota: r.status === 429, retry: r.status >= 500 }
  return j
}

export async function instagramQuota() {
  const { data, error } = await supa.rpc('cardhq_ai_photos_left')
  return error ? null : data
}
