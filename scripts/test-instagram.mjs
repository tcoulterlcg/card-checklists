// Tests lib/instagram-export.js on a made-up Instagram download and lib/instagram-caption.js on
// sample captions: node scripts/test-instagram.mjs ["a caption" …]
import { ZipWriter, BlobWriter, TextReader, Uint8ArrayReader, configure } from '@zip.js/zip.js'
configure({ useWebWorkers: false })
const { readInstagramExport, instagramRows, fixText } = await import('../lib/instagram-export.js')
const moj = (s) => String.fromCharCode(...new TextEncoder().encode(s))
const posts = [
  { media: [{ uri: 'media/posts/202401/aaa.jpg', creation_timestamp: 1704100000, title: moj('Vasy shield ⚡ #bolts') }] },
  { title: moj('Stamkos + Kucherov PSA 10s'), creation_timestamp: 1704200000, media: [{ uri: 'media/posts/202401/bbb.jpg', title: '' }, { uri: 'media/posts/202401/ccc.webp', title: '' }, { uri: 'media/posts/202401/vid.mp4', title: '' }] },
]
const arch = { ig_archived_post_media: [{ media: [{ uri: 'media/archived_posts/202301/ddd.jpg', creation_timestamp: 1672600000, title: 'sold!' }] }] }
const zw = new ZipWriter(new BlobWriter('application/zip'))
await zw.add('instagram-x/your_instagram_activity/content/posts_1.json', new TextReader(JSON.stringify(posts)))
await zw.add('instagram-x/your_instagram_activity/content/archived_posts.json', new TextReader(JSON.stringify(arch)))
for (const f of ['media/posts/202401/aaa.jpg','media/posts/202401/bbb.jpg','media/posts/202401/ccc.webp','media/posts/202401/vid.mp4','media/archived_posts/202301/ddd.jpg']) await zw.add('instagram-x/' + f, new Uint8ArrayReader(new Uint8Array([1,2,3])))
const blob = await zw.close()
const r = await readInstagramExport(blob)
// multi-part download: list of posts in part 1, some photos only in part 2, one photo nowhere
const z1 = new ZipWriter(new BlobWriter('application/zip')), z2 = new ZipWriter(new BlobWriter('application/zip'))
await z1.add('your_instagram_activity/content/posts_1.json', new TextReader(JSON.stringify(posts)))
await z1.add('media/posts/202401/aaa.jpg', new Uint8ArrayReader(new Uint8Array([1])))
await z2.add('part2/media/posts/202401/bbb.jpg', new Uint8ArrayReader(new Uint8Array([1])))
const parts = await readInstagramExport([await z1.close(), await z2.close()])
const ok = parts.posts.length === 2 && parts.missingPhotos === 1 && parts.posts.find(p => p.id === 'bbb')?.photos.length === 1
console.log('multi-part:', ok ? 'OK' : 'FAIL', parts.posts.map(p => p.id), 'missing', parts.missingPhotos)
const p2 = await readInstagramExport(await (async () => { const z = new ZipWriter(new BlobWriter('application/zip')); await z.add('media/posts/x.jpg', new Uint8ArrayReader(new Uint8Array([1]))); return z.close() })())
console.log('photos-only part:', p2.error)
if (!ok) process.exitCode = 1
console.log(JSON.stringify(r.posts.map(p => ({ id: p.id, cap: p.caption, at: p.takenAt, arch: p.archived, photos: p.photos.map(x => x.uri) })), null, 1), 'videos', r.skippedVideos)
const rows = instagramRows([
  { postId: 'aaa', takenAt: '2024-01-01', caption: 'Vasy shield', status: 'owned', photoUrls: ['https://x/p.jpg'], cards: [{ setSlug: 'x', setName: '2018-19 Upper Deck The Cup', section: 'Rookie Auto Patch', cardN: '105', player: 'Andrei Vasilevskiy', serial_number: '23/99', grader: 'PSA', grade: '10' }] },
  { postId: 'ddd', status: 'sold_or_traded', photoUrls: ['https://x/1.jpg', 'https://x/2.jpg'], cards: [{ setName: '2019 Panini Prizm', player: 'A' }, { setName: '2019 Panini Prizm', player: 'B' }] },
  { postId: 'eee', caption: 'beach day', status: 'owned', photoUrls: ['https://x/3.jpg'], cards: [], keepEmpty: true },
  { postId: 'fff', caption: 'lunch', status: 'owned', photoUrls: [], cards: [] },
])
const rowsOk = rows.length === 4 && rows[2].image_url === 'https://x/2.jpg' && rows[1].sold && rows[3].label.includes('beach') && rows.every(r => r.unsure)
console.log('rows:', rowsOk ? 'OK' : 'FAIL', rows.map(r => r.label + ' → ' + r.image_url))
if (!rowsOk) process.exitCode = 1

// caption reader on Card HQ's real data (needs the player index: npm run prebuild, or build-player-index.mjs)
const { captionFacts, captionReader } = await import('../lib/instagram-caption.js')
const facts = [
  ['2015-16 The Cup Connor McDavid RPA 23/99 PSA 10 #oilers', { status: 'owned', serial_number: '23/99', grader: 'PSA', grade: '10', autographed: true }],
  ['SOLD! thanks @buyer', { status: 'sold_or_traded' }],
  ['FS $250 shipped, DM offers', { status: 'for_sale' }],
  ['Trade bait 🔥 /25', { status: 'for_trade', serial_number: '/25' }],
  ['love these trading cards', { status: 'owned' }],
]
for (const [c, want] of facts) {
  const f = captionFacts(fixText(c))
  const bad = Object.entries(want).filter(([k, v]) => f[k] !== v)
  console.log('facts:', bad.length ? 'FAIL' : 'OK', JSON.stringify(c), bad.length ? bad.map(([k, v]) => k + '=' + f[k] + ' (want ' + v + ')') : '')
  if (bad.length) process.exitCode = 1
}
const { readFileSync, existsSync } = await import('node:fs')
const pdir = new URL('../public/data/players/', import.meta.url)
if (!existsSync(new URL('dir.json', pdir))) console.log('caption reader: skipped (no player index built)')
else {
  const dir = JSON.parse(readFileSync(new URL('dir.json', pdir)))
  const index = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url)))
  const sets = index.sets || index
  const loadShard = async (n) => JSON.parse(readFileSync(new URL(n + '.json', pdir)))
  const loadSet = async (slug) => { const u = new URL('../public/data/' + slug + '.json', import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u)) : null }
  const reader = captionReader({ dir, loadShard, sets, loadSet })
  const caps = process.argv.slice(2).length ? process.argv.slice(2) : [
    '2015-16 Upper Deck The Cup Connor McDavid Rookie Auto Patch /99 🔥 #oilers #thecup',
    'Young Guns Auston Matthews 2016-17 Upper Deck',
    'Pulled this 2018 Topps Chrome Shohei Ohtani rookie!',
    'Sunday vibes #hockeycards #connormcdavid #sidneycrosby #alexovechkin #nathanmackinnon #caleMakar',
    'Beautiful day at the lake',
  ]
  for (const c of caps) console.log(JSON.stringify(c), '→', JSON.stringify(await reader.read(c)))
}

const bad = await readInstagramExport(new Blob(['not a zip']))
console.log(bad.error, fixText('plain'))
