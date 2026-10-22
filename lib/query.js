// Omnibox query parser + player directory matching.
//
// "nikita kucherov 1/1"        -> player terms + serial 1
// "kucherov auto /25"          -> player + AU + serial <= 25
// "bedard rc the cup 2023-24"  -> player + RC + product + season
// "charizard base"             -> player + BASE only
export const TYPE = { BASE: 1, PARALLEL: 2, INSERT: 4, AU: 8, PATCH: 16, RELIC: 32, RC: 64, PLATE: 128, MULTI: 256 }

// Apostrophes and dots join rather than split ("O'Neal" -> "oneal", "C.J." -> "cj"),
// so "shaquille oneal" and "cj stroud" find them.
export const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['\u2018\u2019`.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().replace(/\s+/g, ' ')

const TYPE_WORDS = {
  auto: 'AU', autos: 'AU', autograph: 'AU', autographs: 'AU', autographed: 'AU', au: 'AU', signature: 'AU', signatures: 'AU', signed: 'AU',
  patch: 'PATCH', patches: 'PATCH', logo: 'PATCH', logos: 'PATCH', tag: 'PATCH',
  relic: 'RELIC', relics: 'RELIC', jersey: 'RELIC', jerseys: 'RELIC', mem: 'RELIC', memorabilia: 'RELIC', material: 'RELIC', materials: 'RELIC',
  rc: 'RC', rookie: 'RC', rookies: 'RC', yg: 'RC', 'young guns': 'RC',
  rpa: 'RPA', base: 'BASE', parallel: 'PARALLEL', parallels: 'PARALLEL', insert: 'INSERT', inserts: 'INSERT',
  plate: 'PLATE', plates: 'PLATE', 'printing plate': 'PLATE', 'printing plates': 'PLATE',
  numbered: 'NUMBERED', 'serial numbered': 'NUMBERED', unnumbered: 'UNNUMBERED'
}
const MEM_WORDS = { 'game used': 'GU', 'game worn': 'GU', gu: 'GU', 'player worn': 'PW', 'event worn': 'EW', 'event used': 'EW', manufactured: 'MFG' }
export const MEM_LABEL = { 1: 'GAME-USED', 2: 'PLAYER-WORN', 3: 'EVENT-WORN', 4: 'VARIES', 5: 'MANUFACTURED', 6: 'UNKNOWN' }
export const MEM_KEY = { 1: 'GU', 2: 'PW', 3: 'EW', 4: 'MX', 5: 'MFG', 6: 'UNK' }
export const MEM_COLORS = { GU: '#22c55e', PW: '#38bdf8', EW: '#c084fc', MX: '#f59e0b', MFG: '#9ca3af', UNK: '#6b7280' }
export const memKind = (code) => code ? MEM_KEY[code & 7] : null
export const memTypical = (code) => !!(code & 8)
const SPORT_WORDS = { hockey: 'Hockey', nhl: 'Hockey', baseball: 'Baseball', mlb: 'Baseball', basketball: 'Basketball', nba: 'Basketball', football: 'Football', nfl: 'Football', soccer: 'Soccer', ufc: 'UFC', mma: 'UFC', wrestling: 'Wrestling', wwe: 'Wrestling', golf: 'Golf', tennis: 'Tennis', racing: 'Racing', nascar: 'Racing', f1: 'Racing', pokemon: 'Pokémon', magic: 'Magic', mtg: 'Magic', lorcana: 'Lorcana', 'one piece': 'One Piece', onepiece: 'One Piece', optcg: 'One Piece', yugioh: 'Yu-Gi-Oh!', ygo: 'Yu-Gi-Oh!' }
// Brand / product words are matched against the set name (lower-cased).
const PRODUCT_WORDS = ['topps', 'panini', 'upper deck', 'ud', 'leaf', 'bowman', 'donruss', 'prizm', 'select', 'mosaic', 'optic', 'chrome', 'finest', 'the cup', 'cup', 'ultimate', 'ultimate collection', 'sp authentic', 'spa', 'sp game used', 'spgu', 'spx', 'artifacts', 'series 1', 'series 2', 'opc', 'o-pee-chee', 'mvp', 'ice', 'trilogy', 'black diamond', 'synergy', 'allure', 'credentials', 'stature', 'premier', 'national treasures', 'immaculate', 'flawless', 'contenders', 'obsidian', 'spectra', 'certified', 'absolute', 'phoenix', 'origins', 'noir', 'one and one', 'court kings', 'hoops', 'revolution', 'heritage', 'stadium club', 'allen ginter', 'gypsy queen', 'archives', 'museum', 'tribute', 'dynasty', 'inception', 'tier one', 'triple threads', 'sterling', 'five star', 'definitive', 'transcendent', 'young guns', 'exquisite', 'fleer', 'skybox', 'parkhurst', 'score', 'playbook', 'luminance', 'illusions', 'zenith', 'gold standard', 'crown royale', 'limited', 'elite', 'prestige', 'rookies stars', 'legacy', 'classics', 'chronicles', 'encased', 'eminence', 'impeccable', 'silhouette', 'black', 'metal', 'trinity', 'vivid', 'pro set']
  .sort((a, b) => b.length - a.length)

export function parseQuery(raw) {
  // keep "/" "#" "<=" "-" for the serial / season patterns, then normalise the rest
  let q = ' ' + String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['\u2018\u2019`]/g, '').replace(/[^a-z0-9 \/#<=.-]+/g, ' ').replace(/#\s*\//g, ' /').replace(/\b1\s+of\s+1\b/g, '1/1').replace(/\b(game|player|event)-(used|worn)\b/g, '$1 $2').replace(/\s+/g, ' ') + ' '
  const out = { mem: null, player: '', serial: null, serialMax: null, numbered: null, types: new Set(), sport: null, season: null, products: [], raw }
  // serials: "1/1", "/25", "/ 25", "<= /25", "under /50"
  q = q.replace(/\b1\s*\/\s*1\b/g, (m) => { out.serial = 1; return ' ' })
  q = q.replace(/(?:<=|under|max|below)\s*\/\s*(\d{1,5})\b/g, (m, n) => { out.serialMax = parseInt(n); return ' ' })
  q = q.replace(/\s\/\s*(\d{1,5})\b/g, (m, n) => { out.serial = parseInt(n); return ' ' })
  // seasons / years: 2023-24, 2023 24, 23-24, 2023
  q = q.replace(/\b(19|20)(\d\d)[\s-]+(\d\d)\b/g, (m, c, y, y2) => { out.season = parseInt(c + y) + 1; return ' ' })
  q = q.replace(/\b(\d\d)[\s-](\d\d)\b/g, (m, y, y2) => { if (parseInt(y2) === parseInt(y) + 1) { out.season = 2000 + parseInt(y2); return ' ' } return m })
  q = q.replace(/\b((?:19|20)\d\d)\b/g, (m, y) => { out.season = parseInt(y); return ' ' })
  // type / sport / product words (longest first so "printing plates" beats "plates")
  for (const w of Object.keys(TYPE_WORDS).sort((a, b) => b.length - a.length)) {
    const re = new RegExp('\\s' + w.replace(/ /g, '\\s') + '\\s', 'g')
    if (re.test(q)) { out.types.add(TYPE_WORDS[w]); q = q.replace(re, ' ') }
  }
  for (const w of Object.keys(SPORT_WORDS)) { const re = new RegExp('\\s' + w + '\\s', 'g'); if (re.test(q)) { out.sport = SPORT_WORDS[w]; q = q.replace(re, ' ') } }
  for (const w of PRODUCT_WORDS) {
    const re = new RegExp('\\s' + w.replace(/[-]/g, '\\-').replace(/ /g, '\\s') + '\\s', 'g')
    if (re.test(q)) { out.products.push(w === 'ud' ? 'upper deck' : w === 'spa' ? 'sp authentic' : w === 'spgu' ? 'sp game used' : w === 'opc' ? 'o-pee-chee' : w); q = q.replace(re, ' ') }
  }
  out.mem = null
  for (const w of Object.keys(MEM_WORDS)) { const re = new RegExp('\\s' + w.replace(/ /g, '\\s') + '\\s', 'g'); if (re.test(q)) { out.mem = MEM_WORDS[w]; q = q.replace(re, ' ') } }
  out.player = norm(q)
  return out
}

// Like parseQuery, but a real player's name always wins over the filter words
// it happens to contain: "Magic Johnson" is a person, not the Magic TCG;
// "Sterling Shepard" is not a Topps Sterling filter. The longest leading run
// of words that is exactly a player's name becomes the player; the rest is
// parsed for filters ("magic johnson auto" -> Magic Johnson + autos).
// Hobby nicknames -> the player's name as indexed.
const ALIASES = {
  'wemby': 'victor wembanyama', 'cr7': 'cristiano ronaldo', 'shaq': 'shaquille oneal', 'arod': 'alex rodriguez', 'a rod': 'alex rodriguez',
  'the great one': 'wayne gretzky', 'great one': 'wayne gretzky', 'king james': 'lebron james', 'mj': 'michael jordan', 'his airness': 'michael jordan',
  'the kid': 'ken griffey jr', 'big papi': 'david ortiz', 'giannis': 'giannis antetokounmpo', 'greek freak': 'giannis antetokounmpo',
  'sga': 'shai gilgeous alexander', 'kd': 'kevin durant', 'ad': 'anthony davis', 'cp3': 'chris paul', 'the mailman': 'karl malone',
  'vlad jr': 'vladimir guerrero jr', 'vladdy': 'vladimir guerrero jr', 'tatis jr': 'fernando tatis jr', 'jrod': 'julio rodriguez', 'j rod': 'julio rodriguez',
  'mr october': 'reggie jackson', 'the babe': 'babe ruth', 'sweetness': 'walter payton', 'megatron': 'calvin johnson', 'prime time': 'deion sanders',
  'primetime': 'deion sanders', 'neon deion': 'deion sanders', 'beast mode': 'marshawn lynch', 'gronk': 'rob gronkowski', 'tb12': 'tom brady', 
  'sid the kid': 'sidney crosby', 'ovi': 'alex ovechkin', 'the great 8': 'alex ovechkin', 'mcjesus': 'connor mcdavid', 'super mario': 'mario lemieux',
  'kobe': 'kobe bryant', 'black mamba': 'kobe bryant', 'steph': 'stephen curry', 'chef curry': 'stephen curry', 'joker': 'nikola jokic', 'the joker': 'nikola jokic'
}
// Like parseQuery, but a real player's name always wins over the filter words
// it happens to contain: "Magic Johnson" is a person, not the Magic TCG;
// "Sterling Shepard" is not a Topps Sterling filter. The longest leading run
// of words that is exactly a player's name becomes the player, provided the
// rest is all filter words ("magic johnson auto" -> Magic Johnson + autos;
// "mike trou" is not "Mike" + junk). Nicknames are expanded first.
export function parseQueryFor(dir, raw) {
  let text = String(raw || '').trim()
  const n0 = norm(text)
  if (dir && dir.players && !dir._prefixes) { dir._prefixes = new Set(); for (const r of dir.players) { const k = norm(r[0]).split(' '); for (let i = 1; i <= Math.min(2, k.length); i++) dir._prefixes.add(k.slice(0, i).join(' ')) } }
  for (const a of Object.keys(ALIASES).sort((x, y) => y.length - x.length)) {
    if (!(n0 === a || n0.startsWith(a + ' '))) continue
    if (n0 !== a && dir && dir._prefixes && dir._prefixes.has(a)) break   // "mj melendez" is a real name; bare "mj" is Jordan
    text = ALIASES[a] + ' ' + n0.slice(a.length).trim(); break
  }
  const p = parseQuery(text); p.raw = raw
  if (!dir || !dir.players) return p
  if (!dir._names) { dir._names = new Set(); for (const r of dir.players) dir._names.add(norm(r[0])) }
  const toks = text.split(/\s+/)
  for (let i = toks.length; i >= 1; i--) {
    const cand = norm(toks.slice(0, i).join(' '))
    if (cand.length < 3 || !dir._names.has(cand)) continue
    if (cand === p.player) return p
    const rest = parseQuery(toks.slice(i).join(' '))
    if (rest.player) continue   // leftover words that aren't filters: not a clean name split
    rest.player = cand; rest.raw = raw
    return rest
  }
  return p
}

// Rank directory players for a set of name terms. Every term must prefix-match
// a token of the player's name ("kuch" -> Kucherov, "n kuch" -> Nikita Kucherov).
// Falls back to dropping trailing words nobody's name contains: "charizard 1st edition"
// -> Charizard, "brayden point hockey card" -> Brayden Point.
export function matchPlayers(dir, playerTerms, limit = 8, opts = {}) {
  const hits = matchPlayersCore(dir, playerTerms, limit, opts)
  if (hits.length) return hits
  const words = norm(playerTerms).split(' ').filter(Boolean)
  for (let k = words.length - 1; k >= 1 && k >= words.length - 3; k--) {
    const head = words.slice(0, k).join(' ')
    if (k === 1 && head.length < 6) break   // "mike zzzz" is not Mike
    const h = matchPlayersCore(dir, head, limit, { ...opts, fuzzy: false })
    if (h.length && norm(h[0].name) === head) return h.map(x => ({ ...x, fuzzy: true, partial: true }))   // weak: a set-name match still wins
  }
  return []
}
function matchPlayersCore(dir, playerTerms, limit = 8, opts = {}) {
  const terms = norm(playerTerms).split(' ').filter(Boolean)
  if (!terms.length) return []
  const hits = []
  const players = dir.players
  for (let i = 0; i < players.length; i++) {
    const name = players[i][0]
    const key = players[i][7] || (players[i][7] = norm(name)) // cache
    let ok = true, exact = 0
    for (const t of terms) {
      if (key === t) { exact += 2; continue }
      // first occurrence that starts a word ("v" in "david sills v" is the last token, not the "v" in "david")
      let idx = key.indexOf(t)
      while (idx > 0 && key[idx - 1] !== ' ') idx = key.indexOf(t, idx + 1)
      if (idx === -1) { ok = false; break }
      // whole-token match scores higher than prefix
      const end = idx + t.length
      if (end === key.length || key[end] === ' ') exact++
    }
    if (!ok) continue
    // A name suffix is optional: "patrick mahomes" is as exact for "Patrick Mahomes II"
    // as for a stray "Patrick Mahomes" entry, so card count decides between them.
    const base = key.replace(/ (jr|sr|ii|iii|iv|v)$/, '')
    const tokens = base.split(' ').length
    // Prefer: all terms whole-token, fewer extra tokens (single player over multi-player combos), more cards.
    // all terms whole-token -> 1000; exact full name -> +300; popularity (log cards) breaks ties.
    const whole = exact >= terms.length
    const q = terms.join(' ')
    const exactBonus = key === q || base === q
    // one-word queries usually mean the surname ("jordan" -> Michael Jordan, not Jordan Love)
    const surname = terms.length === 1 && base.split(' ').pop() === terms[0] ? 120 : 0
    const score = (whole ? 1000 : 500) + (exactBonus ? 300 : 0) + surname - Math.abs(tokens - terms.length) * 100 + 150 * Math.log10(players[i][2] + 1)
    hits.push({ id: players[i][6] ?? i, key, name, cards: players[i][2], sport: dir.sports[players[i][3]], minYear: players[i][4], maxYear: players[i][5], shard: players[i][1], score, exactBonus })
    if (hits.length > 4000) break
  }
  // A stray one-word entry ("Messi", 12 cards) shouldn't outrank the real player
  // ("Lionel Messi", 2,000): the exact-name bonus needs real volume behind it.
  const maxCards = hits.reduce((m, h) => Math.max(m, h.cards), 0)
  for (const h of hits) if (h.exactBonus && h.cards * 10 < maxCards) h.score -= 300
  hits.sort((a, b) => b.score - a.score || b.cards - a.cards)
  // Hide scraped one-offs that are a real player's name plus extra words
  // ("8 Patrick Mahomes II", "Topps Now Vladimir Guerrero Jr. Postseason Auto On Card").
  const big = hits.filter(h => h.cards >= 20).map(h => [h.key, h.cards])
  const shown = hits.filter(h => !big.some(([k, n]) => k !== h.key && h.key.includes(k) && h.cards <= Math.max(3, n / 100)))
  if (shown.length || terms.join('').length < 4 || opts.fuzzy === false) return shown.slice(0, limit)
  return fuzzyPlayers(dir, terms, limit)
}

// Typo fallback ("mcdavd", "conor mcdavid"): every term within a small edit
// distance of a different word of the name. Only players with some volume.
function editDist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j] }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}
function fuzzyPlayers(dir, terms, limit) {
  const out = []
  for (let i = 0; i < dir.players.length; i++) {
    const p = dir.players[i]; if (p[2] < 30) continue
    const words = (p[7] || (p[7] = norm(p[0]))).split(' ')
    let cost = 0, ok = true
    for (const t of terms) {
      const max = t.length >= 7 ? 2 : t.length >= 4 ? 1 : 0
      let best = 99
      for (const w of words) { const d = w.startsWith(t) ? 0 : editDist(t, w.slice(0, Math.max(t.length, w.length)), max); if (d < best) best = d }
      if (best > max) { ok = false; break }
      cost += best
    }
    if (ok) out.push({ id: p[6] ?? i, name: p[0], cards: p[2], sport: dir.sports[p[3]], minYear: p[4], maxYear: p[5], shard: p[1], score: -cost * 1000 + Math.log10(p[2] + 1), fuzzy: true })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

export function typeLabel(t) {
  if (t & TYPE.PLATE) return (t & TYPE.RC) ? 'RC PLATE' : 'PLATE'
  const au = t & TYPE.AU, pa = t & TYPE.PATCH, rc = t & TYPE.RC, rel = t & TYPE.RELIC
  if (au && pa && rc) return 'RPA'
  if (au && pa) return 'PATCH AUTO'
  if (au && rc) return 'ROOKIE AUTO'
  if (au && rel) return 'RELIC AUTO'
  if (au) return 'AUTO'
  if (pa) return 'PATCH'
  if (rel) return 'RELIC'
  if (rc && (t & TYPE.PARALLEL)) return 'RC PARALLEL'
  if (rc) return 'ROOKIE'
  if (t & TYPE.BASE) return 'BASE'
  if (t & TYPE.PARALLEL) return 'PARALLEL'
  return 'INSERT'
}
export const TYPE_COLORS = { RPA: '#d4a843', 'PATCH AUTO': '#e11d48', 'ROOKIE AUTO': '#8b5cf6', 'RELIC AUTO': '#60a5fa', AUTO: '#60a5fa', PATCH: '#16a34a', RELIC: '#f97316', ROOKIE: '#4ade80', 'RC PARALLEL': '#4ade80', 'RC PLATE': '#4ade80', PLATE: '#9ca3af', BASE: '#9ca3af', PARALLEL: '#9ca3af', INSERT: '#9ca3af' }

// Does a row pass the parsed query's card-level filters?
export function rowMatches(parsed, row, setMeta) {
  const [, , , , , serial, type] = row
  if (parsed.serial != null && serial !== parsed.serial) return false
  if (parsed.serialMax != null && !(serial > 0 && serial <= parsed.serialMax)) return false
  for (const t of parsed.types) {
    if (t === 'NUMBERED' && !(serial > 0)) return false
    if (t === 'UNNUMBERED' && serial > 0) return false
    if (t === 'RPA' && !((type & TYPE.AU) && (type & TYPE.PATCH) && (type & TYPE.RC))) return false
    if (TYPE[t] && !(type & TYPE[t])) return false
  }
  if (parsed.sport && setMeta && setMeta.sport !== parsed.sport) return false
  if (parsed.season && setMeta && setMeta.year !== parsed.season) return false
  if (parsed.products.length && setMeta) {
    const n = (setMeta.name || '').toLowerCase()
    for (const p of parsed.products) if (!n.includes(p)) return false
  }
  return true
}

export function serialLabel(s) { return s === 1 ? '1/1' : s > 0 ? '/' + s : '' }
