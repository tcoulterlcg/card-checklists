// Import from Instagram — reading the collector's Instagram download (no network, no React).
// Used in the browser by lib/instagram.js and in node by scripts/test-instagram.mjs.
//
// The collector downloads their own Instagram data (Accounts Center → Your information and
// permissions → Download your information → JSON format) and picks the .zip. Only the zip's
// directory and the posts JSON are read here; photos are opened one at a time later, so a
// multi-GB export never has to be loaded or uploaded whole.

const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i

// Instagram writes UTF-8 text as if each byte were a Latin-1 character ("Lightning âš¡").
export function fixText(s) {
  const t = String(s || '')
  if (!/[Â-ô][\u0080-¿]/.test(t)) return t
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(t, c => c.charCodeAt(0) & 0xff)) } catch { return t }
}

// Every object with a media: [{ uri }] list, anywhere in an export JSON file. Instagram has
// moved and renamed these files several times (content/posts_1.json, your_instagram_activity/
// content/posts_1.json, archived_posts.json → ig_archived_post_media), so walk instead of
// hard-coding one shape.
function collectPosts(node, out, archived) {
  if (Array.isArray(node)) { for (const x of node) collectPosts(x, out, archived); return }
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node.media) && node.media.some(m => m && typeof m.uri === 'string')) {
    const media = node.media.filter(m => m && typeof m.uri === 'string')
    const caption = fixText(node.title || media.find(m => m.title)?.title || '')
    const ts = +(node.creation_timestamp || media[0].creation_timestamp || 0)
    out.push({ caption, takenAt: ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null, ts, archived, uris: media.map(m => m.uri) })
    return
  }
  for (const v of Object.values(node)) collectPosts(v, out, archived)
}

// Instagram splits big downloads into several zip parts (photos are often in a different part
// from posts_1.json), so every part the collector picks is read together.
// → { posts: [{ id, caption, takenAt, archived, photos: [{ uri, entry }] }], skippedVideos, missingPhotos, close } | { error }
export async function readInstagramExport(files) {
  const { ZipReader, BlobReader, TextWriter, configure } = await import('@zip.js/zip.js')
  configure({ useWebWorkers: false })
  const list = Array.isArray(files) ? files : [files]
  const readers = [], byPath = new Map()
  for (const file of list) {
    const reader = new ZipReader(new BlobReader(file))
    let entries
    try { entries = await reader.getEntries() } catch {
      readers.forEach(r => r.close().catch(() => {}))
      return { error: (list.length > 1 ? (file.name || 'One file') + ' isn’t a zip file. ' : 'That file isn’t a zip file. ') + 'Upload the .zip Instagram sent you, without unzipping it.' }
    }
    readers.push(reader)
    for (const e of entries) if (!e.directory) byPath.set(e.filename.replace(/\\/g, '/'), e)
  }
  const close = () => readers.forEach(r => r.close().catch(() => {}))
  const paths = [...byPath.keys()]
  const postFiles = paths.filter(f => /(^|\/)(posts_\d+|archived_posts)\.json$/i.test(f))
  if (!postFiles.length) {
    close()
    if (paths.some(f => /(^|\/)posts_\d+\.html$/i.test(f))) return { error: 'This download is in HTML format. Request a new one from Instagram and pick Format: JSON.' }
    if (paths.some(f => /(^|\/)media\//i.test(f))) return { error: 'This part of your download has photos but not the list of posts. Choose all the parts Instagram sent you together.' }
    if (paths.some(f => /\.json$/i.test(f))) return { error: 'This download has no posts in it. When you request it, include Content (or all your information).' }
    return { error: 'No Instagram posts found. Make sure it’s the “Download your information” file from Instagram.' }
  }
  const raw = []
  for (const f of postFiles) {
    try { collectPosts(JSON.parse(await byPath.get(f).getData(new TextWriter())), raw, /archived/i.test(f)) } catch { /* a damaged file: skip it, keep the rest */ }
  }
  // Photo paths in the JSON start at media/…; in the zip they may sit under a top folder.
  const byMedia = new Map()
  for (const [p, e] of byPath) { const i = p.search(/(^|\/)media\//i); if (i >= 0) byMedia.set(p.slice(p[i] === '/' ? i + 1 : i), e) }
  const find = (uri) => { const u = String(uri).replace(/^\/+/, ''); return byPath.get(u) || byMedia.get(u.slice(Math.max(0, u.search(/media\//i)))) || null }
  let skippedVideos = 0, missingPhotos = 0
  const seen = new Set(), posts = []
  for (const p of raw.sort((a, b) => b.ts - a.ts)) {
    const photos = []
    for (const uri of p.uris) {
      if (!PHOTO_EXT.test(uri)) { skippedVideos++; continue }
      if (seen.has(uri)) continue
      const entry = find(uri)
      if (!entry) { missingPhotos++; continue }
      seen.add(uri); photos.push({ uri, entry })
    }
    if (!photos.length) continue
    // stable across re-downloads of the same account: Instagram keeps each photo's file name
    const id = (photos[0].uri.split('/').pop() || '').replace(/\.\w+$/, '').slice(0, 40) || String(p.ts)
    posts.push({ id, caption: p.caption, takenAt: p.takenAt, archived: p.archived, photos })
  }
  return { posts, skippedVideos, missingPhotos, close }
}

const str = (v, n) => String(v ?? '').trim().slice(0, n)

// Read posts → import rows for lib/match.js and the review screen. One row per card the caption
// names (the caption reader already placed most of them in a Card HQ set); cards share the post's
// photo, or get one photo each when the post has exactly one photo per card. A post whose
// caption names no card becomes one "not matched yet" row with its photo only when asked
// (keepEmpty), so a selfie isn't imported as a card.
//   posts: [{ postId, takenAt, caption, status, cards, photoUrls, keepEmpty }]
export function instagramRows(posts) {
  const rows = []
  for (const d of posts) {
    const cards = Array.isArray(d.cards) && d.cards.length ? d.cards : d.keepEmpty ? [{ setName: '', player: '', empty: true }] : []
    const urls = d.photoUrls || []
    const cap = str(d.caption, 400)
    cards.forEach((c, k) => {
      const setName = str(c.setName, 200) || (c.empty ? 'Instagram post' : 'Unidentified card (Instagram post)')
      const section = str(c.section, 200), cardN = str(c.cardN, 40).replace(/^#/, ''), player = str(c.player, 200)
      const grader = c.grader || null
      rows.push({
        kind: 'have', source: 'instagram', source_item_id: (d.postId + ':' + k).slice(0, 60),
        setName, setSlug: c.setSlug || undefined, section, cardN, player,
        label: c.empty ? (cap ? '“' + cap.slice(0, 90) + (cap.length > 90 ? '…”' : '”') : 'Post with no caption') : [setName, section, cardN && '#' + cardN, player].filter(Boolean).join(' '),
        qty: 1, status: d.status === 'for_sale' ? 'sale' : d.status === 'for_trade' ? 'trade' : 'have',
        sold: d.status === 'sold_or_traded' || d.status === 'not_mine', unsure: true,
        serial_no: str(c.serial_number, 20) || null, autographed: !!c.autographed,
        grader, grade: grader ? str(c.grade, 10) || null : null,
        notes: ('From Instagram' + (d.takenAt ? ' post, ' + d.takenAt : '') + (cap ? ': ' + cap : '')).slice(0, 2000),
        image_url: urls[cards.length === urls.length ? k : 0] || null, tags: ['instagram'],
      })
    })
  }
  return rows
}
