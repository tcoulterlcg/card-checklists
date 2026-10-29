// Import from Instagram — which cards a post shows, read from its caption alone (no AI, no
// network of its own). Collectors' captions usually name the player and the product
// ("2015-16 The Cup Connor McDavid RPA /99 #oilers"), so the caption is checked against Card HQ's
// own data: the player directory names the player, that player's rows in the player index say
// which of their cards Card HQ has, and the caption's year, product, insert and serial words pick
// the card. Pure functions with injected loaders, so scripts/test-instagram.mjs runs it in node.
//
//   const reader = captionReader({ dir, loadShard, sets, loadSet })   // dir = players/dir.json
//   await reader.read(caption) → { status, cards: [{ setSlug?, setName, section, cardN, player, serial_number, grader, grade, autographed }] }
//
// Every card it finds goes to the review screen's "Check these" (the import marks them unsure):
// a caption is a hint, not proof.
import { startYear } from './match.js'
import { ALIASES } from './query.js'

export const capNorm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['‘’`.]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()

// "#ConnorMcDavid" → "Connor McDavid"; "@user" and links dropped. Hashtags are kept apart: a
// name in the text beats a name that only appears in a pile of hashtags.
export function splitCaption(caption) {
  const raw = String(caption || '').replace(/https?:\/\/\S+/g, ' ').replace(/@[\w.]+/g, ' ')
  const tags = []
  // "#57" / "#RA-SO" is a card number, not a hashtag
  const body = raw.replace(/#([\p{L}\p{N}_]+)/gu, (m, t) => { if (/^(?:[A-Z]{1,5}-?)?\d{1,4}[A-Za-z]?$/.test(t) && /\d/.test(t)) return m; tags.push(t.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2')); return ' ' })
  return { body, tags }
}

const GRADERS = { psa: 'PSA', bgs: 'BGS', beckett: 'BGS', sgc: 'SGC', cgc: 'CGC', csg: 'CSG', hga: 'HGA', tag: 'TAG', isa: 'ISA', gma: 'GMA', ksa: 'KSA' }
// What the caption says about the post as a whole: sold, for sale, serial, grade, autograph.
export function captionFacts(caption) {
  const { body, tags } = splitCaption(caption)
  const all = body + ' ' + tags.join(' ')
  const low = all.toLowerCase()
  const status = /\b(sold|traded(?! for)|off to (?:a |its )?new home|sent to (?:a |its )?new home|no longer available)\b/.test(low) ? 'sold_or_traded'
    : /\b(fs|for sale|selling|dm (?:me )?(?:for|w(?:ith)?) offers?|dm offers|taking offers|available|obo|bin)\b|\$\s?\d/.test(low) ? 'for_sale'
    : /\b(ft|for trade|trade bait|looking to trade|open to trades?)\b/.test(low) ? 'for_trade'
    : /\b(not mine|pulled by|congrats to|hit for|for a customer)\b/.test(low) ? 'not_mine'
    : 'owned'
  // serial: "23/99", "/99", "1/1", "1 of 1"
  const sm = /(?:^|[^\d/])(\d{1,4})\s*(?:\/|of)\s*(\d{1,4})\b/i.exec(all.replace(/\b(19|20)\d\d\s*\/\s*\d\d\b/g, ' '))
  const bare = /(?:^|\s)\/\s*(\d{1,4})\b/.exec(all)
  const sr = sm && +sm[1] <= +sm[2] && +sm[2] > 0 ? sm[1] + '/' + sm[2] : bare && +bare[1] > 0 ? '/' + bare[1] : ''
  const gm = /\b(psa|bgs|beckett|sgc|cgc|csg|hga|tag|isa|gma|ksa)\s*(?:gem\s*(?:mint|mt)?\s*)?(10|[1-9](?:\.5)?)\b/i.exec(all)
  const run = sr ? +sr.split('/')[1] : 0
  return {
    status, body, tags,
    serial_number: sr, printRun: run,
    grader: gm ? GRADERS[gm[1].toLowerCase()] : null, grade: gm ? gm[2] : null,
    autographed: /\b(auto(?:graph(?:ed)?)?s?|signed|signature|rpa|sig)\b/i.test(all),
    season: seasonOf(all),
    cardN: ((/(?:^|\s)#\s?((?:[A-Z]{1,5}-?)?\d{1,4}[A-Za-z]?)\b/.exec(body) || [])[1] || '').toUpperCase(),
  }
}
// "2015-16" / "15-16" → 2015; "2023" → 2023 (also matches a 2022-23 set); none → 0
function seasonOf(t) {
  let m = /\b((?:19|20)\d\d)\s*[-–/]\s*(\d\d)\b/.exec(t)
  if (m && (+m[2] === (+m[1] + 1) % 100)) return { start: +m[1], exact: true }
  m = /(?:^|[\s#])(\d\d)\s*[-–/]\s*(\d\d)\b/.exec(t)
  if (m && +m[2] === (+m[1] + 1) % 100) return { start: (+m[1] > 40 ? 1900 : 2000) + +m[1], exact: true }
  m = /\b((?:19|20)\d\d)\b/.exec(t)
  return m ? { start: +m[1], exact: false } : null
}

// Words in set and insert names that captions shorten or spell differently.
const SYN = {
  autograph: 'auto', autographs: 'auto', autographed: 'auto', autos: 'auto', signed: 'auto', signature: 'auto', signatures: 'auto', au: 'auto',
  patches: 'patch', jerseys: 'jersey', relics: 'relic', memorabilia: 'relic', refractors: 'refractor', rookies: 'rookie', rc: 'rookie', yg: 'young guns',
  rpa: 'rookie patch auto', opc: 'o pee chee', ud: 'upper deck', spa: 'sp authentic', spgu: 'sp game used', nt: 'national treasures', colours: 'color', colors: 'color', colour: 'color',
  prizms: 'prizm', 'ssp': 'sp',
}
const FILLER = new Set(['the', 'and', 'of', 'set', 'cards', 'card', 'edition', 'hockey', 'baseball', 'football', 'basketball', 'soccer', 'racing', 'wrestling', 'golf', 'tennis', 'ufc', 'mma', 'boxing', 'checklist', 'trading', 'series', 'parallel', 'parallels', 'insert', 'inserts', 'version', 'base'])
const BRAND = new Set(['topps', 'panini', 'upper', 'deck', 'fleer', 'donruss', 'leaf', 'score', 'skybox', 'pacific', 'playoff', 'itg', 'in', 'game'])
const words = (s) => capNorm(s).split(' ').flatMap(w => (SYN[w] || w).split(' ')).filter(w => w && !/^(18|19|20)\d\d$/.test(w) && !/^\d\d$/.test(w))
const key = (s) => words(s).filter(w => !FILLER.has(w))

// Player names → directory rows, longest names first. One-word names only for long, rare words
// ("Charizard"), never "Rookie" or "Auto".
const COMMON = new Set(['rookie', 'auto', 'patch', 'jersey', 'gold', 'silver', 'black', 'red', 'blue', 'green', 'purple', 'orange', 'young', 'guns', 'the', 'cup', 'hockey', 'baseball', 'football', 'basketball', 'card', 'cards', 'collection', 'mint', 'grail', 'pc', 'hit', 'pull', 'box', 'break', 'sold', 'trade', 'sale', 'prizm', 'chrome', 'select', 'mosaic', 'optic', 'refractor'])
// Names that are also product words ("Upper Deck", "Stadium Club": there are cards *of* them) are
// left out when they appear in several set names. Hashtags run names together ("#connormcdavid"),
// so two-plus-word names are also kept without spaces.
export function nameIndex(dir, sets) {
  if (dir._capNames) return dir._capNames
  const inSets = new Map()
  for (const s of sets || []) { const t = capNorm(s.name).split(' '), seen = new Set(); for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= t.length; i++) seen.add(t.slice(i, i + n).join(' ')); for (const g of seen) inSets.set(g, (inSets.get(g) || 0) + 1) }
  const m = new Map()
  const put = (k, i) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(i)) m.get(k).push(i) }
  const add = (n, i) => {
    const k = capNorm(n); if (!k) return
    const t = k.split(' ')
    if (t.length < 2 && (k.length < 7 || COMMON.has(k))) return
    if (t.every(w => COMMON.has(w)) || (inSets.get(k) || 0) >= 3) return
    put(k, i)
    if (t.length >= 2 && k.length >= 9) put(t.join(''), i)
  }
  const pos = new Map()
  dir.players.forEach((p, i) => { add(p[0], i); pos.set(p[6] ?? i, i) })
  for (const [id, name] of dir.aka || []) { const i = pos.get(id); if (i != null) add(name, i) }
  // hobby nicknames ("Wemby", "Ovi") → the player they mean, unless the nickname is somebody's name
  for (const [nick, full] of Object.entries(ALIASES)) { const k = capNorm(nick); if (k.length >= 3 && !m.has(k) && m.has(full)) for (const i of m.get(full)) put(k, i) }
  dir._capNames = m
  return m
}
// Names found in a run of text, longest first, never two overlapping. "Kucherov" alone is not
// enough (dozens of players share surnames across sports); the set's own cards settle surnames later.
function findNames(names, text) {
  const t = capNorm(text).split(' ').filter(Boolean)
  const found = [], used = new Array(t.length).fill(false)
  for (let len = 4; len >= 1; len--) {
    for (let i = 0; i + len <= t.length; i++) {
      if (used.slice(i, i + len).some(Boolean)) continue
      const k = t.slice(i, i + len).join(' ')
      const hit = names.get(k)
      if (!hit) continue
      found.push({ name: k, players: hit, at: i })
      for (let j = i; j < i + len; j++) used[j] = true
    }
  }
  return found.sort((a, b) => a.at - b.at)
}

// How well a set name fits the caption: every distinctive word of the set must be in the caption.
function setFit(setName, capWords) {
  const k = key(setName)
  if (!k.length) return 0
  const brandless = k.filter(w => !BRAND.has(w) && !/^\d$/.test(w))   // "Series 1": captions leave the number off
  if (brandless.some(w => !capWords.has(w))) return 0
  // a plain brand set ("2023 Donruss", "Upper Deck Series 1") only when the caption names the brand
  if (!brandless.length && k.some(w => BRAND.has(w) && !capWords.has(w))) return 0
  return brandless.length + 0.3 * k.filter(w => BRAND.has(w) && capWords.has(w)).length + 0.01
}
const seasonOk = (season, setName, setYear) => {
  if (!season) return true
  const y = startYear(setName, setYear)
  return season.exact ? y === season.start : (y === season.start || y === season.start - 1)
}
// Insert / parallel: the section whose words are in the caption, preferring the most words; a
// section the caption doesn't mention at all only wins when it is the base card.
// Rookie / auto / patch / relic are compared through the card's type flags where the player index
// has them (The Cup's rookie patch autos are its "Base Set"), not through the section's words.
const KIND = new Set(['rookie', 'auto', 'patch', 'jersey', 'relic', 'swatch', 'material', 'materials', 'young', 'guns'])
const T = { AU: 8, PATCH: 16, RELIC: 32, RC: 64 }
function kindFit(type, capWords) {
  let sc = 0
  const want = { AU: capWords.has('auto'), PATCH: capWords.has('patch'), RELIC: capWords.has('jersey') || capWords.has('relic') || capWords.has('swatch'), RC: capWords.has('rookie') || capWords.has('young') }
  for (const k of ['AU', 'PATCH', 'RELIC', 'RC']) {
    const has = !!(type & T[k])
    if (want[k] && has) sc += 1.5
    // a patch the index files as a relic (or the other way round) isn't held against it
    else if (want[k] !== has && !(k === 'PATCH' && (type & T.RELIC)) && !(k === 'RELIC' && want.PATCH)) sc -= k === 'RC' && has ? 0.3 : 1.5
  }
  return sc
}
const numFit = (want, n) => !want ? 0 : String(n || '').toUpperCase().replace(/^#/, '') === want ? 4 : -1
function sectionFit(title, capWords, printRun, rowSerial, type) {
  const w = key(title).filter(x => !BRAND.has(x) && (type == null || !KIND.has(x)))
  const hit = w.filter(x => capWords.has(x)).length, miss = w.length - hit
  let sc = hit * 2 - miss * 1.2
  if (/^base( set| cards?)?$/i.test(String(title || '').trim()) || !w.length) sc += 0.5
  if (printRun) sc += rowSerial === printRun ? 3 : rowSerial ? -2 : -0.5
  return sc
}

export function captionReader({ dir, loadShard, sets, loadSet }) {
  const names = dir && dir.players ? nameIndex(dir, sets) : new Map()
  const bySlug = new Map((sets || []).map(s => [s.slug, s]))
  const setsByYear = new Map()
  for (const s of sets || []) { const y = startYear(s.name, s.year); if (!setsByYear.has(y)) setsByYear.set(y, []); setsByYear.get(y).push(s) }

  // A named player's best card for this caption, from their rows in the player index.
  async function cardFor(players, facts, capWords) {
    let best = null
    for (const i of players) {
      const p = dir.players[i]
      const sh = await loadShard(p[1])
      for (const r of sh.rows || []) {
        if (r[0] !== p[6]) continue
        const slug = sh.slugs[r[1]], meta = bySlug.get(slug)
        if (!meta || !seasonOk(facts.season, meta.name, meta.year)) continue
        const sf = setFit(meta.name, capWords)
        if (!sf) continue
        const sec = sh.sections[r[2]]
        const score = sf * 3 + sectionFit(sec, capWords, facts.printRun, r[5], r[6]) + kindFit(r[6], capWords) + numFit(facts.cardN, r[3])
        if (!best || score > best.score) best = { score, slug, setName: meta.name, section: sec, cardN: r[3], player: r[8] != null ? sh.labels[r[8]] : p[0] }
      }
    }
    return best
  }
  // No full name in the caption, but a product is named: look in that set for a surname the caption uses.
  async function bySurname(facts, capWords, bodyWords) {
    const pool = facts.season ? [...(setsByYear.get(facts.season.start) || []), ...(facts.season.exact ? [] : setsByYear.get(facts.season.start - 1) || [])] : []
    const ranked = pool.map(s => ({ s, f: setFit(s.name, capWords) })).filter(x => x.f >= 0.5).sort((a, b) => b.f - a.f)
    // the best-fitting sets (Series 1 and Series 2 fit "2013-14 Upper Deck" equally): look in each
    const top = ranked.filter(x => x.f === (ranked[0] && ranked[0].f)).slice(0, 3)
    let best = null, tie = false
    for (const { s: meta } of top) {
      const set = await loadSet(meta.slug).catch(() => null)
      if (!set) continue
      for (const sec of set.sections || []) for (const c of sec.cards || []) {
        const last = capNorm(c.p).split(' ').pop()
        if (!last || last.length < 4 || COMMON.has(last) || !bodyWords.has(last)) continue
        const score = sectionFit(sec.title, capWords, facts.printRun, 0) + numFit(facts.cardN, c.n)
        if (best && score === best.score && capNorm(best.player) !== capNorm(c.p)) tie = true
        if (!best || score > best.score) { best = { score, slug: meta.slug, setName: set.name || meta.name, section: sec.title, cardN: c.n, player: c.p }; tie = false }
      }
    }
    return best && !tie ? best : null
  }

  async function read(caption) {
    const facts = captionFacts(caption)
    const capWords = new Set(words(facts.body + ' ' + facts.tags.join(' ')))
    const bodyWords = new Set(words(facts.body))
    // names in the text first; hashtag-only names only when the text names nobody, and not a hashtag pile
    let found = findNames(names, facts.body), tagOnly = false
    if (!found.length) { found = facts.tags.flatMap(t => findNames(names, t)); tagOnly = true; if (found.length > 4) found = [] }
    const seen = new Set(), cards = []
    for (const f of found.slice(0, 8)) {
      if (seen.has(f.name)) continue
      seen.add(f.name)
      const c = await cardFor(f.players, facts, capWords)
      // the player is named but Card HQ can't tell which card: kept with what the caption says
      // (not for a name that is only a hashtag: "#mcdavid" on a pack photo isn't a McDavid card)
      if (!c && tagOnly) continue
      cards.push(c || { setName: [facts.season && (facts.season.exact ? facts.season.start + '-' + String((facts.season.start + 1) % 100).padStart(2, '0') : facts.season.start), productWords(facts.body)].filter(Boolean).join(' '), section: '', cardN: '', player: dir.players[f.players[0]][0] })
    }
    if (!cards.length) { const c = await bySurname(facts, capWords, bodyWords); if (c) cards.push(c) }
    return {
      status: facts.status,
      cards: cards.map(c => ({ setSlug: c.slug, setName: c.setName, section: /^base( set| cards?)?$/i.test(c.section || '') ? '' : c.section || '', cardN: c.cardN || '', player: c.player, serial_number: facts.serial_number, grader: facts.grader, grade: facts.grade, autographed: facts.autographed })),
    }
  }
  return { read }
}

// The product named in free text, for a card Card HQ couldn't place ("Upper Deck The Cup").
const PRODUCTS = ['upper deck', 'the cup', 'sp authentic', 'sp game used', 'o pee chee', 'young guns', 'national treasures', 'immaculate', 'flawless', 'prizm', 'select', 'mosaic', 'optic', 'topps chrome', 'bowman chrome', 'bowman', 'topps', 'panini', 'donruss', 'leaf', 'fleer', 'skybox', 'ice', 'artifacts', 'trilogy', 'black diamond', 'ultimate collection', 'premier', 'contenders', 'spectra', 'obsidian', 'heritage', 'stadium club', 'finest', 'museum collection', 'dynasty', 'triple threads', 'tribute', 'allure', 'synergy', 'parkhurst', 'score', 'hoops', 'chronicles', 'certified', 'absolute', 'one and one', 'noir', 'eminence', 'impeccable', 'spx', 'mvp', 'credentials', 'stature', 'clear cut', 'exquisite']
function productWords(text) {
  const t = ' ' + capNorm(text) + ' ', out = []
  for (const p of PRODUCTS) if (t.includes(' ' + p + ' ') && !out.some(o => o.includes(p))) out.push(p)
  return out.map(p => p.replace(/\b\w/g, c => c.toUpperCase())).join(' ')
}
