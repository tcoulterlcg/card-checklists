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

// → { posts: [{ id, caption, takenAt, archived, photos: [{ uri, entry }] }], skippedVideos, error? }
export async function readInstagramExport(file) {
  const { ZipReader, BlobReader, TextWriter, configure } = await import('@zip.js/zip.js')
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(file))
  let entries
  try { entries = await reader.getEntries() } catch { return { error: 'That file isn’t a zip file. Upload the .zip Instagram emailed you, without unzipping it.' } }
  const byPath = new Map(entries.filter(e => !e.directory).map(e => [e.filename.replace(/\\/g, '/'), e]))
  const files = [...byPath.keys()]
  const postFiles = files.filter(f => /(^|\/)(posts_\d+|archived_posts)\.json$/i.test(f))
  if (!postFiles.length) {
    if (files.some(f => /(^|\/)posts_\d+\.html$/i.test(f))) return { error: 'This download is in HTML format. Request a new one from Instagram and pick Format: JSON.' }
    if (files.some(f => /\.json$/i.test(f)) && !files.some(f => /media\//i.test(f))) return { error: 'This download has no posts in it. When you request it, choose “All available information” (or tick Content/Posts).' }
    return { error: 'No Instagram posts found in this zip. Make sure it’s the “Download your information” file from Instagram.' }
  }
  const raw = []
  for (const f of postFiles) {
    try { collectPosts(JSON.parse(await byPath.get(f).getData(new TextWriter())), raw, /archived/i.test(f)) } catch { /* a damaged file: skip it, keep the rest */ }
  }
  // the zip may sit inside a top folder; find each photo by the end of its path
  const find = (uri) => {
    const u = String(uri).replace(/^\/+/, '')
    if (byPath.has(u)) return byPath.get(u)
    for (const [p, e] of byPath) if (p.endsWith('/' + u)) return e
    return null
  }
  let skippedVideos = 0
  const seen = new Set(), posts = []
  for (const p of raw.sort((a, b) => b.ts - a.ts)) {
    const photos = []
    for (const uri of p.uris) {
      if (!PHOTO_EXT.test(uri)) { skippedVideos++; continue }
      const entry = find(uri)
      if (entry && !seen.has(uri)) { seen.add(uri); photos.push({ uri, entry }) }
    }
    if (!photos.length) continue
    // stable across re-downloads of the same account: Instagram keeps each photo's file name
    const id = (photos[0].uri.split('/').pop() || '').replace(/\.\w+$/, '').slice(0, 40) || String(p.ts)
    posts.push({ id, caption: p.caption, takenAt: p.takenAt, archived: p.archived, photos })
  }
  return { posts, skippedVideos, close: () => reader.close().catch(() => {}) }
}

const str = (v, n) => String(v ?? '').trim().slice(0, n)
const GRADERS = { psa: 'PSA', bgs: 'BGS', beckett: 'BGS', sgc: 'SGC', cgc: 'CGC', csg: 'CSG', hga: 'HGA', tag: 'TAG', isa: 'ISA', gma: 'GMA', ksa: 'KSA' }

// Identified photos → import rows for lib/match.js and the review screen. One row per card;
// cards in the same photo share the photo. A card the model couldn't name is still kept (as
// "not matched yet", with its photo) so nothing in the collection is lost.
export function instagramRows(done) {
  const rows = []
  for (const d of done) {
    const cards = Array.isArray(d.cards) ? d.cards : []
    cards.forEach((c, k) => {
      const year = str(c.year, 9)
      let setName = str(c.set, 200)
      if (year && setName && !/\b(18|19|20)\d\d\b/.test(setName)) setName = year + ' ' + setName
      if (!setName) setName = 'Unidentified card (Instagram photo)'
      const section = str(c.insert_or_parallel, 200)
      const cardN = str(c.card_number, 40).replace(/^#/, '')
      const player = str(c.player, 200)
      const grader = GRADERS[str(c.grader, 20).toLowerCase()] || (c.grader ? 'Other' : null)
      rows.push({
        kind: 'have', source: 'instagram', source_item_id: (d.postId + ':' + d.photo + ':' + k).slice(0, 60),
        setName, sport: str(c.sport, 40), section, cardN, player,
        label: [setName, section, cardN && '#' + cardN, player].filter(Boolean).join(' '),
        qty: 1, status: d.status === 'for_sale' ? 'sale' : d.status === 'for_trade' ? 'trade' : 'have',
        sold: d.status === 'sold_or_traded' || d.status === 'not_mine', unsure: c.confidence === 'low',
        serial_no: str(c.serial_number, 20) || null, autographed: !!c.autographed,
        grader, grade: grader ? str(c.grade, 10) || null : null, cert_no: grader ? str(c.cert_number, 40) || null : null,
        notes: d.takenAt ? 'From Instagram post, ' + d.takenAt : 'From Instagram',
        image_url: d.photoUrl || null, tags: ['instagram'],
      })
    })
  }
  return rows
}
