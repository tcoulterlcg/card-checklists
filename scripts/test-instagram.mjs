// Tests lib/instagram-export.js on a made-up Instagram download: node scripts/test-instagram.mjs
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
console.log(JSON.stringify(r.posts.map(p => ({ id: p.id, cap: p.caption, at: p.takenAt, arch: p.archived, photos: p.photos.map(x => x.uri) })), null, 1), 'videos', r.skippedVideos)
const rows = instagramRows([{ postId: 'aaa', photo: 0, takenAt: '2024-01-01', status: 'owned', photoUrl: 'https://x/p.jpg', cards: [{ year: '2018-19', set: 'Upper Deck The Cup', insert_or_parallel: 'Rookie Auto Patch', card_number: '#105', player: 'Andrei Vasilevskiy', serial_number: '23/99', grader: 'psa', grade: '10', confidence: 'high' }, { set: '', player: '', confidence: 'low' }] }, { postId: 'ddd', photo: 0, status: 'sold_or_traded', cards: [{ set: 'Panini Prizm', player: 'X', confidence: 'medium' }] }])
console.log(rows)
const bad = await readInstagramExport(new Blob(['not a zip']))
console.log(bad.error, fixText('plain'))
