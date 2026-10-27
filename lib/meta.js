// Per-page <title>, description and link previews, built on the server.
//
// The app itself (app/home.js) is a client component that reads the URL in the
// browser, so without this every link — in iMessage, Slack, Google — showed the
// generic home-page title. app/page.js calls pageMeta() for each request.
//
// GOING FORWARD: when you add a new kind of page (a new ?param or ?view=), add a
// branch here so its shared links and search results describe that page.
import { isHidden, setPath as catalogPath } from './catalog'

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
// Parsed copies kept per server instance, so a page view doesn't re-parse the ~1MB index.
const memo = new Map()
const cached = (url, ttlMs = 600000) => {
  const hit = memo.get(url)
  if (hit && Date.now() - hit.at < ttlMs) return hit.p
  const p = getJson(url).then(v => { if (!v) memo.delete(url); return v })
  memo.set(url, { at: Date.now(), p })
  return p
}
const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/i
// The bulk catalog (TCDB imports) lives on the repo's `catalog` branch — see lib/catalog.js.
// Sets from hidden sources (price-guide fragments) get no preview, like on the site.
const CDN = 'https://cdn.jsdelivr.net/gh/tcoulterlcg/card-checklists@catalog/'
const RAW = 'https://raw.githubusercontent.com/tcoulterlcg/card-checklists/catalog/'

const n = (x) => Number(x || 0).toLocaleString('en-US')
const season = (y, sport) => (!y ? '' : ['Hockey', 'Basketball'].includes(sport) ? (y - 1) + '-' + String(y).slice(2) : String(y))

function build(title, description, path, noindex = false) {
  const url = BASE + path
  return {
    title, description,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE, type: 'website', images: ['/apple-icon.png'] },
    twitter: { card: 'summary', title, description, images: ['/apple-icon.png'] },
  }
}

async function setMeta(raw) {
  // catalog (TCDB) slugs keep their capitals ("1950-B-W-Type-2-…"), so keep the case as given
  // and match static slugs case-insensitively (pasted links are often lowercased or not)
  const given = String(raw).trim().replace(/\/+$/, '')
  if (!SLUG.test(given)) return build('Set not found — ' + SITE, DEFAULT_DESC, '/', true)
  let slug = given.toLowerCase()
  const idx = await cached(BASE + '/data/index.json')
  let s = idx?.sets?.find(x => x.slug === slug)
  if (!s) {
    const rd = await cached(BASE + '/data/redirects.json', 3600000)
    if (rd?.[slug]) { slug = rd[slug]; s = idx?.sets?.find(x => x.slug === slug) }
  }
  if (!s) {   // added since the cached index was fetched: read the set file itself
    const f = await getJson(BASE + '/data/' + slug + '.json', 600)
    if (f?.name && !f.incomplete) s = { slug, name: f.name, sport: f.sport, year: f.year, cardCount: (f.sections || []).reduce((a, x) => a + (x.cards || []).length, 0), sections: (f.sections || []).length }
  }
  if (!s) {   // catalog set: read its file for the name and count
    if (slug === given.toLowerCase()) slug = given   // not redirected: use the case as given
    const f = (await getJson(CDN + catalogPath(slug), 86400)) || (await getJson(RAW + catalogPath(slug), 86400))
    if (f?.name && !isHidden(f)) s = { slug, name: f.name, sport: f.sport, year: f.year, cardCount: (f.sections || []).reduce((a, x) => a + (x.cards || []).length, 0), sections: (f.sections || []).length }
  }
  if (!s) return build('Set not found — ' + SITE, DEFAULT_DESC, '/', true)
  const title = `${s.name} Checklist — ${SITE}`
  const bits = [s.cardCount ? n(s.cardCount) + ' cards' : '', s.sections ? n(s.sections) + ' sections' : ''].filter(Boolean).join(' across ')
  const description = `Complete ${s.name} checklist${bits ? ': ' + bits : ''} — base cards, inserts, parallels, autographs and print runs.`
  return build(title, description, '/?set=' + encodeURIComponent(s.slug))
}

async function playerMeta(name, sportWanted) {
  const top = await cached(BASE + '/data/players/top.json', 3600000)
  const want = String(name).toLowerCase()
  // a name rolled into another page ("Shoeless Joe Jackson" -> Joe Jackson) shows that page
  const alias = top?.aka?.find(a => a[1].toLowerCase() === want)
  const fold = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const same = (top?.players || []).filter(r => r[0].toLowerCase() === want)
  // two players share the name (Will Smith): ?sport= picks one
  const bySport = sportWanted && same.length > 1 ? same.find(r => fold(top.sports?.[r[3]]) === fold(sportWanted)) : null
  // ?sport= names a namesake outside the top list: describe the name only, not the other player's numbers
  const p = sportWanted && same.length > 1 ? bySport : same[0] || (alias && top.players.find(r => r[6] === alias[0]))
  const twin = p && same.length > 1
  const nm = p ? p[0] : String(name)
  const title = `${nm} Cards — Every Card, Parallel & Print Run | ${SITE}`
  let description = `Every ${nm} card: autographs, 1/1s, rookies, parallels and print runs, with links to each set checklist.`
  if (p) {
    const sport = top.sports?.[p[3]] || ''
    const span = p[4] && p[5] ? ` from ${season(p[4], sport)} to ${season(p[5], sport)}` : ''
    description = `Every ${nm} card — ${n(p[2])} cards${span}${sport ? ' (' + sport + ')' : ''}: autographs, 1/1s, rookies, parallels and print runs.`
  }
  // only the top players are known here: anyone else keeps their name (noindex), not "not found"
  return build(title, description, '/?player=' + encodeURIComponent(nm) + (twin && top.sports?.[p[3]] ? '&sport=' + encodeURIComponent(top.sports[p[3]]) : ''), !p)
}

const VIEWS = {
  community: ['Community — ' + SITE, 'Completed sets, finished rainbows and grail pulls from the CardHQ community.'],
  collection: ['My Collection — ' + SITE, 'Your wantlist and collection: check off cards as you collect them.'],
  myplayers: ['My Players — ' + SITE, 'The players you collect, with every card, parallel and print run.'],
  feedback: ['Feedback — ' + SITE, 'Report a missing card, parallel or wrong info, or suggest a feature for CardHQ.'],
}

export async function pageMeta(sp = {}) {
  const get = (k) => { const v = Array.isArray(sp[k]) ? sp[k][0] : sp[k]; return v == null ? v : String(v).trim() }   // a blank ?set= is the home page
  try {
    if (get('set')) return await setMeta(get('set'))
    if (get('compare') != null) {
      const names = [get('compare'), get('vs')].filter(Boolean)
      const t = names.length === 2 ? `${names[0]} vs ${names[1]} Cards — ${SITE}` : 'Compare Players — ' + SITE
      const d = names.length === 2 ? `${names[0]} and ${names[1]} side by side: cards, autographs, 1/1s, rookies, patches, shared sets and cards featuring both.` : 'Compare two players’ cards side by side: autographs, 1/1s, rookies, patches and shared sets.'
      return build(t, d, '/?compare=' + encodeURIComponent(names[0] || '') + (names[1] ? '&vs=' + encodeURIComponent(names[1]) : ''), true)
    }
    if (get('player')) return await playerMeta(get('player'), get('sport'))
    // search pages echo the visitor's text: fine for a shared link, never for Google
    if (get('search')) { const q = String(get('search')).slice(0, 80); return build(`“${q}” — Search ${SITE}`, `Players and sets matching “${q}” on CardHQ.`, '/?search=' + encodeURIComponent(q), true) }
    if (VIEWS[get('view')]) return build(...VIEWS[get('view')], '/?view=' + get('view'), ['collection', 'myplayers'].includes(get('view')))   // personal pages: noindex
    if (get('sport')) {
      // only real sports get their own title; anything else is the home page
      const idx = await cached(BASE + '/data/index.json')
      const fold = (x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()   // ?sport=pokemon finds Pokémon
      const want = fold(get('sport'))
      let sp = [...new Set((idx?.sets || []).map(x => x.sport))].find(x => x && fold(x) === want)
      if (!sp) { const m = await cached(RAW + 'manifest.json', 3600000); sp = Object.keys(m?.sports || {}).find(x => fold(x) === want) }   // catalog-only sports (Misc Sports…)
      if (sp) return build(`${sp} Card Checklists — ${SITE}`, `Every ${sp} card set checklist — base, inserts, parallels, autographs and print runs.`, '/?sport=' + encodeURIComponent(sp))
    }
  } catch {}
  return build(DEFAULT_TITLE, DEFAULT_DESC, '/')
}
