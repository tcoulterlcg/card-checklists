'use client'
// Import from Instagram — the browser half. Free: no AI, no server route.
//
// A collector downloads their own Instagram data (Accounts Center → Your information and
// permissions → Download your information → JSON format) and drops the .zip here. The zip is
// read in the browser: each post's caption names the cards (lib/instagram-caption.js, checked
// against Card HQ's own checklists), and only the photos of posts that name a card are opened,
// shrunk to 1280 px and saved to the collector's own folder in Card HQ's Supabase photo bucket
// (cardhq-images). The cards then go through the same matcher and review screen as a TCDB or
// CSV import.
import { supa } from './supa'
export { fixText, readInstagramExport, instagramRows } from './instagram-export'
export { captionReader } from './instagram-caption'

const MAX_EDGE = 1280
const BUCKET = 'cardhq-images'

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' }
// Photo out of the zip → JPEG ≤1280 px, plus a hash of the original file (names the stored copy,
// so the same photo is stored once however often it is imported).
async function shrinkPhoto(entry) {
  const { BlobWriter } = await import('@zip.js/zip.js')
  const ext = (entry.filename.split('.').pop() || '').toLowerCase()
  const blob = await entry.getData(new BlobWriter(MIME[ext] || 'image/jpeg'))
  const srcHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('')
  let bmp
  try { bmp = await createImageBitmap(blob) } catch {
    const e = new Error(/heic|heif/.test(ext) ? 'This browser can’t open HEIC photos — try Safari' : 'Couldn’t open this photo'); e.permanent = true; throw e
  }
  const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h)
  bmp.close?.()
  const out = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('Couldn’t read that photo')), 'image/jpeg', 0.82))
  return { blob: out, srcHash }
}

// One photo from the zip → { url } | { error, retry?, permanent? }
export async function savePhoto(uid, entry) {
  let shot
  try { shot = await shrinkPhoto(entry) } catch (e) { return { error: e.message || 'Couldn’t read that photo', permanent: !!e.permanent } }
  const path = `${uid}/ig-${shot.srcHash.slice(0, 32)}.jpg`
  const { error } = await supa.storage.from(BUCKET).upload(path, shot.blob, { contentType: 'image/jpeg', cacheControl: '31536000' })
  // already saved by an earlier import: the stored copy is the same photo
  if (error && !/exists|duplicate/i.test(error.message || '') && String(error.statusCode) !== '409') {
    return { error: /jwt|auth|sign/i.test(error.message || '') ? 'Sign in again to keep going.' : 'Couldn’t save the photo — ' + (error.message || 'try again'), retry: true }
  }
  return { url: supa.storage.from(BUCKET).getPublicUrl(path).data.publicUrl }
}
