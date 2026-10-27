// Matches cards described by text (a TCDB collection row, a CSV line) to Card HQ checklists.
// Pure functions, no network or React: the import screens pass in the set index and a set loader,
// and scripts/test-match.mjs runs the same code in node.
//
// A described card: { setName, year?, sport?, section?, cardN, player, setSlug? }
//   setName  "2007-08 SP Authentic - Holoview FX" (TCDB names inserts and parallels "<set> - <insert>")
// A match:   { slug, setName, section, card_n, player, conf: 'exact' | 'likely' | 'none', why }

const SPORT_WORDS = new Set(['baseball', 'football', 'basketball', 'hockey', 'soccer', 'racing', 'wrestling', 'golf', 'tennis', 'ufc', 'mma', 'boxing', 'entertainment', 'nonsport', 'non', 'sport', 'multi', 'multisport', 'nascar', 'nfl', 'nba', 'nhl', 'mlb'])
const FILLER = new Set(['checklist', 'cards', 'card', 'trading', 'the', 'and', 'of', 'set', 'edition'])
const BRAND = new Set(['topps', 'panini', 'upper', 'deck', 'ud', 'fleer', 'donruss', 'leaf', 'score', 'skybox', 'pacific', 'playoff', 'itg', 'in', 'game'])
const deaccent = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
export const norm = (s) => deaccent(s).toLowerCase().replace(/['‘’`.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

// first year in a set name ("2006-07 …" -> 2006); falls back to the index's year field
export function startYear(name, year) {
  const m = /\b(18|19|20)\d\d\b/.exec(String(name || ''))
  return m ? +m[0] : (+year || 0)
}
function nameTokens(name) {
  return norm(name).split(' ').filter(t => t && !/^(18|19|20)\d\d$/.test(t) && !/^\d\d$/.test(t) && !SPORT_WORDS.has(t) && !FILLER.has(t))
}
const weight = (t) => (BRAND.has(t) ? 0.35 : /^\d+$/.test(t) ? 1.2 : 1)
function similarity(qt, ct) {
  if (!qt.length || !ct.length) return 0
  const C = new Set(ct), Q = new Set(qt)
  let inter = 0, uni = 0
  for (const t of new Set([...Q, ...C])) { const w = weight(t); uni += w; if (Q.has(t) && C.has(t)) inter += w }
  return inter / uni
}

// sports TCDB uses that our index names differently
const SPORT_ALIAS = { 'misc sports': 'Multi-Sport', 'non-sport': 'Non-Sport', mma: 'UFC' }
const sportKey = (s) => { const t = String(s || '').toLowerCase(); return (SPORT_ALIAS[t] || s || '').toLowerCase() }

export function buildSetIndex(sets) {
  const byYear = new Map(), bySlug = new Map()
  for (const s of sets || []) {
    if (!s || !s.slug) continue
    const e = { s, y: startYear(s.name, s.year), toks: nameTokens(s.name), sport: sportKey(s.sport) }
    bySlug.set(s.slug.toLowerCase(), e)
    if (!byYear.has(e.y)) byYear.set(e.y, [])
    byYear.get(e.y).push(e)
  }
  return { byYear, bySlug }
}

// Best candidate sets for a name, highest score first.
export function findSets(idx, { setName, year, sport, setSlug }, limit = 5) {
  if (setSlug) { const e = idx.bySlug.get(String(setSlug).toLowerCase()); if (e) return [{ set: e.s, score: 1 }] }
  const y = startYear(setName, year)
  const qt = nameTokens(setName)
  if (!qt.length) return []
  const pool = y ? [...(idx.byYear.get(y) || []), ...(/\b\d{4}\b/.test(setName || '') ? [] : [...(idx.byYear.get(y - 1) || [])])] : [...idx.byYear.values()].flat()
  const sk = sportKey(sport)
  const out = []
  for (const e of pool) {
    let sc = similarity(qt, e.toks)
    if (sc <= 0) continue
    if (sk && e.sport) sc += e.sport === sk ? 0.08 : -0.15
    out.push({ set: e.s, score: Math.min(1, sc) })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

// --- cards inside a set ---
export const cardNumKey = (n) => {
  let t = String(n ?? '').trim().replace(/^#\s*/, '').toUpperCase().replace(/\s+/g, '')
  if (/^(NNO|N\/?A|-|—|\?)?$/.test(t)) return ''
  if (/^\d+$/.test(t)) t = String(+t)
  return t
}
export function playerScore(a, b) {
  const x = norm(a), y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.85
  const xs = x.split(' '), ys = y.split(' ')
  const inter = xs.filter(t => ys.includes(t)).length
  if (!inter) return 0
  if (xs[xs.length - 1] === ys[ys.length - 1]) return 0.7   // same surname
  return 0.5 * inter / Math.max(xs.length, ys.length)
}
const secKey = (t) => norm(String(t || '').replace(/^\d{4}(?:-\d{2,4})?\s.+?\s+[–—-]\s+/, '')).replace(/(\s+(set|cards?|checklist))+$/, '').trim()
const isBaseTitle = (t) => /^base( set| cards?)?$/i.test(String(t || '').trim()) || secKey(t) === 'base'
// Insert/parallel names, reduced to the words that tell two cards apart.
const SEC_FILLER = new Set(['parallel', 'parallels', 'insert', 'inserts', 'version', 'versions', 'variation', 'variations', 'set', 'cards', 'card', 'the', 'and', 'of', 'edition', 'base'])
const SEC_SYN = { autograph: 'auto', autographs: 'auto', autographed: 'auto', autos: 'auto', au: 'auto', signature: 'sig', signatures: 'sig', signed: 'sig', relics: 'relic', memorabilia: 'relic', jerseys: 'jersey', patches: 'patch', refractors: 'refractor', rookies: 'rookie', rc: 'rookie', colours: 'color', colors: 'color', colour: 'color' }
const MATERIAL = new Set(['jersey', 'patch', 'swatch', 'material', 'materials', 'fabric', 'fabrics', 'threads'])
function secWords(t) {
  const w = secKey(t).split(' ').map(x => SEC_SYN[x] || x).filter(x => x && !SEC_FILLER.has(x) && !/^(18|19|20)\d\d$/.test(x) && !/^\d\d$/.test(x))
  // "Jersey Relics" and "Jersey" name the same card: "relic" adds nothing next to a material word
  return w.some(x => MATERIAL.has(x)) ? w.filter(x => x !== 'relic') : w
}
function sectionScore(insert, title) {
  if (!insert) return isBaseTitle(title) ? 1 : /^base\b/i.test(title || '') ? 0.6 : 0.25
  const a = secWords(insert), b = secWords(title)
  if (!a.length) return isBaseTitle(title) ? 1 : 0.25
  const missing = a.filter(w => !b.includes(w)).length   // TCDB names a word our section lacks: a different card ("Prizm Red" vs "Prizm")
  const extra = b.filter(w => !a.includes(w)).length     // our section adds words ("Holoview FX" vs "Holoview FX Die Cut")
  if (!missing && !extra) return 1
  if (!missing) return extra === 1 ? 0.6 : 0.5
  return missing < a.length ? 0.3 : 0
}

// Best (section, card) in a loaded set for a described card.
export function findCard(set, { section, cardN, player }) {
  const want = cardNumKey(cardN)
  let best = null
  for (const sec of set.sections || []) {
    const ss = sectionScore(section, sec.title)
    if (section && ss < 0.5) continue
    for (const c of sec.cards || []) {
      const nk = cardNumKey(c.n)
      const numOk = want ? nk === want : !nk
      const ps = player ? playerScore(player, c.p) : 0.5
      if (!numOk && !(!want && ps >= 0.85)) continue
      if (want && !numOk) continue
      const score = ss * 2 + ps + (numOk && want ? 1 : 0)
      if (!best || score > best.score) best = { score, sec, c, ss, ps, numOk }
    }
  }
  if (!best) return null
  const conf = best.numOk && best.ps >= 0.85 && best.ss >= 0.8 ? 'exact'
    : best.numOk && (best.ps >= 0.6 || !player) && best.ss >= 0.45 ? 'likely'
    : best.ps >= 0.85 && best.ss >= 0.8 ? 'likely' : 'none'
  return { section: best.sec.title, card: best.c, conf }
}

// TCDB names inserts/parallels "<parent set> - <insert>"; try the whole name first, then the split.
export function nameVariants(setName, section) {
  const out = [{ setName, section }]
  if (!section) {
    const parts = String(setName || '').split(/\s+-\s+/)
    for (let i = parts.length - 1; i >= 1; i--) out.push({ setName: parts.slice(0, i).join(' - '), section: parts.slice(i).join(' - ') })
  }
  return out
}

// Match many rows. loadSet(slug) -> set JSON (or null). Sets are loaded once each, a few at a time.
export async function matchRows(rows, { index, loadSet, onProgress, concurrency = 6 }) {
  const setCache = new Map()
  const getSet = (slug) => { if (!setCache.has(slug)) setCache.set(slug, Promise.resolve(loadSet(slug)).catch(() => null)); return setCache.get(slug) }
  // the same set name repeats on many rows: rank candidates once per (name, year, sport, slug)
  const candCache = new Map()
  const candidates = (q) => {
    const k = [q.setName, q.year, q.sport, q.setSlug].join('\u0000')
    if (!candCache.has(k)) candCache.set(k, findSets(index, q, 4))
    return candCache.get(k)
  }
  const out = new Array(rows.length)
  let done = 0, next = 0
  async function one(i) {
    const r = rows[i]
    let best = null
    for (const v of nameVariants(r.setName, r.section)) {
      for (const cand of candidates({ ...r, ...v })) {
        if (cand.score < 0.45) continue
        const set = await getSet(cand.set.slug)
        if (!set) continue
        const m = findCard(set, { section: v.section, cardN: r.cardN, player: r.player })
        if (!m || m.conf === 'none') continue
        // a weak set-name match can't be "exact"
        const conf = m.conf === 'exact' && cand.score >= 0.7 ? 'exact' : 'likely'
        const rank = (conf === 'exact' ? 2 : 1) + cand.score
        if (!best || rank > best.rank) best = { rank, conf, setScore: cand.score, slug: set.slug || cand.set.slug, setName: set.name || cand.set.name, section: m.section, card_n: m.card.n, player: m.card.p }
      }
    }
    out[i] = best ? { slug: best.slug, setName: best.setName, section: best.section, card_n: best.card_n, player: best.player, conf: best.conf }
      : { conf: 'none', why: candidates({ ...r }).length ? 'card not found in the closest sets' : 'set not on Card HQ yet' }
    done++
    if (onProgress && (done % 25 === 0 || done === rows.length)) onProgress(done, rows.length)
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, async () => { while (next < rows.length) await one(next++) }))
  return out
}

// TCDB row text: "2007-08 O-Pee-Chee Premier #144 Patrick Kane AU, MEM, RC, SN299"
//   -> { setName: '2007-08 O-Pee-Chee Premier', cardN: '144', player: 'Patrick Kane', flags: ['AU','MEM','RC','SN299'] }
const TCDB_FLAG = /^(RC|AU|MEM|SN\d+|SP|SSP|VAR|ERR|COR|UER|TC|TL|CL|HOF|IA|FW|MR|AR|ROO|DP|PROS|1ST|GEM|PATCH|RELIC|UNL|PP|PL|OF)$/   // TCDB writes these in capitals
export function parseTcdbTitle(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const m = /^(.*?)\s+#(\S+)\s*(.*)$/.exec(t)
  const setName = m ? m[1] : t, cardN = m ? m[2] : '', rest = m ? m[3] : ''
  // flags trail the name, comma separated: "Patrick Kane AU, MEM, RC, SN299"
  const parts = rest.split(/,\s*/)
  const words = parts[0].split(' ')
  const flags = []
  while (words.length > 1 && TCDB_FLAG.test(words[words.length - 1])) flags.unshift(words.pop())
  let player = words.join(' ')
  for (const p of parts.slice(1)) { const f = p.trim(); if (TCDB_FLAG.test(f)) flags.push(f); else if (f) player += ', ' + f }
  const sn = flags.map(f => /^SN(\d+)$/.exec(f)).find(Boolean)
  return { setName, cardN, player: player.trim(), flags, printRun: sn ? +sn[1] : null }
}
