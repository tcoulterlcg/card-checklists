// Per-page <title>, description and link previews, built on the server.
//
// The app itself (app/home.js) is a client component that reads the URL in the
// browser, so without this every link — in iMessage, Slack, Google — showed the
// generic home-page title. app/page.js calls pageMeta() for each request.
//
// GOING FORWARD: when you add a new kind of page (a new ?param or ?view=), add a
// branch here so its shared links and search results describe that page.
const BASE = 'https://cardhq.vercel.app'
const SITE = 'CardHQ'
const DEFAULT_TITLE = 'CardHQ — Sports Card & TCG Checklists'
const DEFAULT_DESC = 'Complete checklists for sports card and TCG sets — every base card, insert, parallel and print run. Search any player, track your wantlist and collection.'

// Static index + redirects are deployed with the site; cached for an hour on the server.
// Reads the deployed copy under public/ when it's on disk (local runs), else fetches it.
const getJson = async (url, revalidate = 3600) => {
  if (url.startsWith(BASE + '/data/')) {
    try {
      const { readFile } = await import('node:fs/promises')
      return JSON.parse(await readFile(process.cwd() + '/public' + url.slice(BASE.length), 'utf8'))
    } catch {}
  }
  try { const r = await fetch(url, { next: { revalidate } }); return r.ok ? await r.json() : null } catch { return null }
}
// The bulk catalog (TCDB imports) lives on the repo's `catalog` branch — see lib/catalog.js.
const CDN = 'https://cdn.jsdelivr.net/gh/tcoulterlcg/card-checklists@catalog/'
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h }
const catalogPath = (slug) => 'sets/' + (fnv(slug) & 0xff).toString(16).padStart(2, '0') + '/' + slug + '.json'

const n = (x) => Number(x || 0).toLocaleString('en-US')
const season = (y, sport) => (!y ? '' : ['Hockey', 'Basketball'].includes(sport) ? (y - 1) + '-' + String(y).slice(2) : String(y))

function build(title, description, path) {
  const url = BASE + path
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE, type: 'website', images: ['/apple-icon.png'] },
    twitter: { card: 'summary', title, description, images: ['/apple-icon.png'] },
  }
}

async function setMeta(raw) {
  let slug = String(raw).trim().toLowerCase().replace(/\/+$/, '')
  const idx = await getJson(BASE + '/data/index.json', 600)
  let s = idx?.sets?.find(x => x.slug === slug)
  if (!s) {
    const rd = await getJson(BASE + '/data/redirects.json')
    if (rd?.[slug]) { slug = rd[slug]; s = idx?.sets?.find(x => x.slug === slug) }
  }
  if (!s) {   // added since the cached index was fetched: read the set file itself
    const f = await getJson(BASE + '/data/' + slug + '.json', 600)
    if (f?.name) s = { slug, name: f.name, sport: f.sport, year: f.year, cardCount: (f.sections || []).reduce((a, x) => a + (x.cards || []).length, 0), sections: (f.sections || []).length }
  }
  if (!s) {   // catalog set: read its file for the name and count
    const f = await getJson(CDN + catalogPath(slug), 86400)
    if (f?.name) s = { slug, name: f.name, sport: f.sport, year: f.year, cardCount: (f.sections || []).reduce((a, x) => a + (x.cards || []).length, 0), sections: (f.sections || []).length }
  }
  if (!s) return build('Set not found — ' + SITE, DEFAULT_DESC, '/')
  const title = `${s.name} Checklist — ${SITE}`
  const bits = [s.cardCount ? n(s.cardCount) + ' cards' : '', s.sections ? n(s.sections) + ' sections' : ''].filter(Boolean).join(' across ')
  const description = `Complete ${s.name} checklist${bits ? ': ' + bits : ''} — base cards, inserts, parallels, autographs and print runs.`
  return build(title, description, '/?set=' + encodeURIComponent(s.slug))
}

async function playerMeta(name) {
  const top = await getJson(BASE + '/data/players/top.json')
  const p = top?.players?.find(r => r[0].toLowerCase() === String(name).toLowerCase())
  const nm = p ? p[0] : String(name)
  const title = `${nm} Cards — Every Card, Parallel & Print Run | ${SITE}`
  let description = `Every ${nm} card: autographs, 1/1s, rookies, parallels and print runs, with links to each set checklist.`
  if (p) {
    const sport = top.sports?.[p[3]] || ''
    const span = p[4] && p[5] ? ` from ${season(p[4], sport)} to ${season(p[5], sport)}` : ''
    description = `Every ${nm} card — ${n(p[2])} cards${span}${sport ? ' (' + sport + ')' : ''}: autographs, 1/1s, rookies, parallels and print runs.`
  }
  return build(title, description, '/?player=' + encodeURIComponent(nm))
}

const VIEWS = {
  community: ['Community — ' + SITE, 'Completed sets, finished rainbows and grail pulls from the CardHQ community.'],
  collection: ['My Collection — ' + SITE, 'Your wantlist and collection: check off cards as you collect them.'],
  myplayers: ['My Players — ' + SITE, 'The players you collect, with every card, parallel and print run.'],
}

export async function pageMeta(sp = {}) {
  const get = (k) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])
  try {
    if (get('set')) return await setMeta(get('set'))
    if (get('player')) return await playerMeta(get('player'))
    if (get('search')) return build(`“${get('search')}” — Search ${SITE}`, `Players and sets matching “${get('search')}” on CardHQ.`, '/?search=' + encodeURIComponent(get('search')))
    if (VIEWS[get('view')]) return build(...VIEWS[get('view')], '/?view=' + get('view'))
    if (get('sport')) return build(`${get('sport')} Card Checklists — ${SITE}`, `Every ${get('sport')} card set checklist — base, inserts, parallels, autographs and print runs.`, '/?sport=' + encodeURIComponent(get('sport')))
  } catch {}
  return build(DEFAULT_TITLE, DEFAULT_DESC, '/')
}
