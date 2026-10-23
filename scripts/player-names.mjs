// Player-name rules for the player index: how a raw checklist string becomes the
// people / characters it credits, and which spellings of one person or character
// roll up into a single player page.
//
//   "Shoeless Joe Jackson" + "Joe Jackson"        -> Joe Jackson
//   "Carnell \"Cadillac\" Williams" + "Cadillac Williams" + "Carnell Williams" -> one page
//   "Elsa — Snow Queen", "Idina Menzel as Elsa"   -> Elsa (the actor also gets the card)
//   "Charizard ex", "Dark Charizard", "Charizard VMAX" -> Charizard
//   "Joe Jackson 1", "Ken Griffey Jr. TTARC-AGT", "Ken GriffeyJr." -> scrape junk folded in
//
// Each card row keeps the label it was printed under, so the player page can
// narrow back down to one variant ("Appears as" filter).
import { norm } from '../lib/query.js'
export { norm }

// Sports whose "players" are characters / card names rather than athletes.
export const CHARACTER = new Set(['Entertainment', 'Non-Sport', 'Lorcana', 'Disney', 'Pokémon', 'Magic', 'One Piece', 'Yu-Gi-Oh!'])
// Characters cross over between games and non-sport sets (Elsa in Lorcana and in Frozen
// sticker sets); athletes only merge within their own sport.
// Games whose "players" are card titles, not characters ("Dark Ritual" is not "Ritual").
const CARD_NAMES = new Set(['Magic', 'Yu-Gi-Oh!'])
export const family = (sport) => CHARACTER.has(sport) ? 'CHAR' : (sport || '')

// Clean a raw player string from the scrapes: drop trailing flag junk some TCDB
// pages carry ("AU, MEM, SN10MEM: Game-Used Memorabilia"), parenthetical
// variants and stray asterisks, then split multi-player cards.
export function splitPlayers(raw) {
  let p = String(raw || '')
    .replace(/\s+(AU|MEM|SN\d+)(,\s*(AU|MEM|SN\d+))*\s*MEM:.*$/i, '')
    .replace(/\s*\((foil|gold|silver|black|variation|sp|ssp|rc)\)\s*$/i, '')
    .replace(/\s*\*+\s*$/, '')
    .replace(/\s+:\s+.*$/, '')
    .replace(/\s+(CL|SP|SSP|RC|AU|VAR|HOF|UER|COR|ERR|Gold|Silver|Black|Red|Blue|Green|Orange|Purple|Pink|Variation|Refractor|Checklist)$/i, '')
    .trim()
  // memorabilia piece glued to the name: "Austin Jackson (Pants)", "Eddie Murray #/ 25 Pants", "Don Mattingly (Jacket)"
  p = p.replace(/\s*\(?\s*(?:#?\s*\/\s*\d+\s*)?\b(?:jersey|jerseys|pants|jacket|bat|bats|shoes?|gloves?|helmet|cap|hat|socks?|wristband|fabric|swatch|button|jersey number|jersey auto)\s*\)?$/i, (m) => /\S+\s+\S+/.test(p.slice(0, p.length - m.length).trim()) ? '' : m).trim()
  // "Best There Is...Best There Was (Mike Piazza/Josh Gibson)" -> the players in the parentheses
  const inner = p.match(/^[^()]+\(([^()]*\/[^()]*)\)$/)
  if (inner) p = inner[1]
  if (!p) return []
  return p.split(/\s*\/\s*|\s+\|\s+/)
    .map(x => {
      x = x.trim()
      if (x.endsWith(')') && !x.includes('(')) x = x.slice(0, -1).trim()     // "Josh Gibson)"
      if (x.startsWith('(') && !x.includes(')')) x = x.slice(1).trim()
      if (x.includes('(') && !x.includes(')')) x = x.replace(/\s*\(.*$/, '') // "5 (Jersey"
      return x
    })
    // drop bare numbers and piece counts: "25", "10)", "25 Jersey", "15\""
    .filter(x => x.length > 1 && /[A-Za-zÀ-ɏ]{2}/.test(x) && !/^\d+["']?\s*\(?(jersey|jerseys|pants|jacket|bat|shoes?|gloves?|helmet|cap|hat|socks?|patch|auto)\b/i.test(x))
}

// One printed name -> the subjects it credits, each { label, base }.
//   label: the name as printed, minus scrape junk (shown in the "Appears as" filter)
//   base:  the person / character the card belongs to (grouping key = norm(base))
export function subjects(name, sport) {
  const ch = CHARACTER.has(sport)
  let label = String(name).replace(/\s+/g, ' ').trim()
  if (!ch) {
    label = label
      .replace(/^[A-Z0-9]{2,}-[A-Z0-9]{1,}(?:-[A-Z0-9]+)*\s+(?=\S+\s+\S)/, '')   // "MMJRA-KGJ Ken Griffey Jr."
      .replace(/\s+[A-Z0-9]{2,}-[A-Z0-9]{1,}(?:-[A-Z0-9]+)*$/, '')              // "Ken Griffey Jr. TTARC-AGT"
      .replace(/(\S\s+\S+)\s+\d{1,2}$/, '$1')                                     // "Joe Jackson 1"
      .trim()
  }
  label = label.replace(/\s+SN\d{1,5}$/, '').trim()   // print-run flag glued on: "Simba & Friends SN25"
  if (!label) return []
  if (!ch) return [{ label, base: label }]
  // "Idina Menzel as Elsa": the card belongs to the character and to the actor.
  const as = (sport === 'Entertainment' || sport === 'Non-Sport') && label.match(/^((?:[A-Z][\w'.-]*\s+){1,3}[A-Z][\w'.-]*)\s+as\s+([A-Z0-9].{1,60})$/)
  if (as) return [{ label: as[1], base: as[1] }, ...subjects(as[2], sport).map(s => ({ label, base: s.base }))]
  let base = label.replace(/\s+[—–]\s+.+$/, '')   // Lorcana: "Elsa — Snow Queen"
  if (sport === 'Pokémon') {
    // tag teams credit both Pokémon: "Reshiram & Charizard-GX"
    const parts = base.replace(POKE_SUFFIX, '').split(/\s+&\s+/).map(pokemonBase).filter(x => x.length > 1)
    if (parts.length > 1) return parts.map(b => ({ label, base: b }))
    base = parts[0] || ''
  }
  return [{ label, base: base || label }]
}

const POKE_SUFFIX = /[-\s](GX|EX|ex|V|VMAX|VSTAR|V-UNION|LV\.?\s?X|BREAK|Prime|LEGEND|δ|☆|◇|Star|G|GL|FB|C|E4|4|Lv\.?\s?\d+)$/
const POKE_PREFIX = /^(Dark|Light|Shining|Radiant|Mega|Galarian|Alolan|Hisuian|Paldean|Gigantamax|Primal|Shadow|Ancient)\s+(?=\S)/
function pokemonBase(s) {
  let b = s.replace(/^#\d+\s+/, '').replace(/\s+-\s+.+$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  for (let i = 0; i < 3 && POKE_SUFFIX.test(b); i++) b = b.replace(POKE_SUFFIX, '').trim()
  const mega = /^Mega\s/.test(b)
  b = b.replace(POKE_PREFIX, '')
  if (mega) b = b.replace(/\s+[XY]$/, '')
  return b.trim()
}

// ---- merging spellings across the whole directory ----
// players: Map key -> { cards, sports: Map(sportIdx -> n), teams: Map, base: Map(baseName -> count) }
// sportNames: sportIdx -> sport name. Returns Map key -> canonical key (only for keys that move).
export function mergePlayers(players, sportNames) {
  const parent = new Map()
  const find = (k) => { let r = k; while (parent.has(r)) r = parent.get(r); return r }
  const fam = new Map(), teams = new Map(), cardGame = new Set(), pokemon = new Set()
  for (const [k, p] of players) {
    const top = [...p.sports.entries()].sort((a, b) => b[1] - a[1])[0]
    const sport = top ? sportNames[top[0]] : ''
    fam.set(k, family(sport))
    if (CARD_NAMES.has(sport)) cardGame.add(k)
    if (sport === 'Pokémon') pokemon.add(k)
    teams.set(k, new Set([...p.teams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([t]) => norm(t)).filter(t => t.length >= 4)))
  }
  const sameFamily = (a, b) => fam.get(a) === fam.get(b)
  // Athletes need a shared team when both sides have teams ("Billy Ray Smith" is not "Ray Smith").
  const teamsAgree = (a, b) => {
    if (fam.get(a) === 'CHAR') return true
    const ta = teams.get(a), tb = teams.get(b)
    if (!ta.size || !tb.size) return true
    for (const t of ta) if (tb.has(t)) return true
    return false
  }
  const union = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra === rb) return
    // the bigger page absorbs the smaller (ties go to b, the name being merged into)
    if (players.get(ra).cards > players.get(rb).cards) parent.set(rb, ra); else parent.set(ra, rb)
  }
  const nameOf = (k) => [...players.get(k).base.entries()].sort((a, b) => b[1] - a[1])[0][0]

  // 1. spacing only: "Ken GriffeyJr." == "Ken Griffey Jr."
  const tight = new Map()
  for (const k of players.keys()) {
    const t = fam.get(k) + '|' + k.replace(/ /g, '')
    if (tight.has(t)) union(tight.get(t), k); else tight.set(t, k)
  }
  // 2. quoted nicknames: Bret "Hit Man" Hart == Bret Hart
  for (const k of players.keys()) {
    const raw = nameOf(k)
    if (k.includes('|')) continue   // the same name as another sport's player: leave it alone
    if (!/["“”]/.test(raw)) continue
    const bare = norm(raw.replace(/\s*["“”][^"“”]*["“”]\s*/g, ' '))
    // a quoted nickname is a strong signal: no sport check (Bret "Hit Man" Hart is filed under Wrestling and UFC)
    if (bare !== k && players.has(bare) && (fam.get(k) === 'CHAR') === (fam.get(bare) === 'CHAR')) union(k, bare)
  }
  // 3. a team glued on by the scrape: "Ken Griffey Jr. Seattle Mariners" -> "Ken Griffey Jr."
  const teamNames = new Set()
  for (const p of players.values()) for (const [t, n] of p.teams) if (n >= 3) { const tk = norm(t); if (tk.length >= 4 && tk.includes(' ')) teamNames.add(tk) }
  for (const k of players.keys()) {
    if (fam.get(k) === 'CHAR') continue
    if (k.includes('|')) continue   // the same name as another sport's player: leave it alone
    const w = k.split(' ')
    for (let i = 2; i < w.length; i++) {
      if (!teamNames.has(w.slice(i).join(' '))) continue
      const head = w.slice(0, i).join(' ')
      if (players.has(head) && sameFamily(k, head) && players.get(head).cards >= players.get(k).cards) union(k, head)
      break
    }
  }
  // 4. a leading nickname / descriptor: "Shoeless Joe Jackson" -> "Joe Jackson",
  //    "Neon Mickey Mouse" -> "Mickey Mouse", "Dark Charizard" -> "Charizard";
  // 5. a middle nickname: "Carnell Cadillac Williams" -> "Carnell Williams".
  // Only toward a bigger page, in the same sport (or both characters), sharing a team.
  const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/
  // Things that are not one person / character: "Rangers Team Logo" must not become "Team Logo".
  const GENERIC = /\b(logo|logos|team|teams|award|awards|game|games|checklist|cards?|leaders?|stadium|energy|series|edition|puzzle|set|league|all star|champions?|world|club)\b/
  for (const k of players.keys()) {
    const w = k.split(' ')
    if (k.includes('|')) continue   // the same name as another sport's player: leave it alone
    if (w.length < 2 || w.length > 5 || cardGame.has(k)) continue
    const raw = nameOf(k)
    if (/[\d&#]/.test(raw) || GENERIC.test(k)) continue
    // a hyphenated surname is one name: "Josh Hines-Allen" is not "Josh Allen"
    const hyph = fam.get(k) !== 'CHAR' && /-/.test(raw)
    const cands = []
    const rest = w.slice(1)
    if (!SUFFIX.test(rest[0]) && !/^\S+-/.test(raw)) cands.push(rest.join(' '))
    // middle nicknames are a people thing; for characters "Red She-Hulk" is not "Red Hulk"
    if (w.length >= 3 && !SUFFIX.test(w[1]) && !hyph && fam.get(k) !== 'CHAR') cands.push([w[0], ...w.slice(2)].join(' '))
    for (const c of cands) {
      const cw = c.split(' ')
      if (!players.has(c) || c === k) continue
      if (GENERIC.test(c) || teamNames.has(c)) continue
      // one-word targets only for a trainer's Pokémon ("Brock's Onix" -> Onix); "Candace Flynn" is not "Flynn"
      if (cw.length === 1 && (!pokemon.has(k) || c.length < 4 || !/^\S+['’]s\s/.test(raw))) continue
      if (cw[0] === 'the') continue   // "Grogu The Mandalorian" is two characters
      if (cw.length === 1 && cw[0] === w[w.length - 1] && w.length > 2) continue
      if (SUFFIX.test(cw[cw.length - 1]) && cw.length === 2) continue           // "Griffey Jr" is too thin
      if (!sameFamily(k, c) || !teamsAgree(k, c)) continue
      if (players.get(c).cards < players.get(k).cards) continue
      // a character's variant ("Zombie Captain America") only folds into a clearly bigger page,
      // so artist-variant names ("Bucky Simone Bianchi") don't land on the artist
      if (fam.get(k) === 'CHAR' && !pokemon.has(k) && players.get(c).cards < Math.max(20, 3 * players.get(k).cards)) continue
      union(k, c)
      break
    }
  }
  // 6–8 (athletes only): small pages that are clearly one big player's card text or misspelling.
  //  6. name + card descriptor: "Shohei Ohtani HR #12", "Shohei Ohtani 3-HR Game",
  //     "Fernando Tatis Jr. (PR=3,100)" -> the name's page (descriptor has a digit, # or bracket)
  //  7. surname only: "Ohtani", "Tatis Jr." -> the one big page with that surname in the sport
  //  8. one-letter typo on a tiny page (≤5 cards): "Shotei Ohtani", "Patick Mahomes II" -> a page 50x bigger in the same sport
  const athlete = (k) => fam.get(k) !== 'CHAR' && !cardGame.has(k) && !k.includes('|')
  const big = [...players.keys()].filter(k => athlete(k) && players.get(k).cards >= 100)
  const bigSet = new Set(big)
  const bySurname = new Map(), byToken = new Map()
  for (const k of big) {
    const w = k.split(' '), sur = SUFFIX.test(w[w.length - 1]) && w.length > 2 ? w.slice(-2).join(' ') : w[w.length - 1]
    ;(bySurname.get(sur) || bySurname.set(sur, []).get(sur)).push(k)
    for (const t of new Set(w)) if (t.length >= 3 && !SUFFIX.test(t)) (byToken.get(t) || byToken.set(t, []).get(t)).push(k)
  }
  const lev1 = (a, b) => {   // true when a and b differ by one insert, delete or substitution
    if (Math.abs(a.length - b.length) > 1 || a === b) return false
    let i = 0, j = 0, e = 0
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue }
      if (++e > 1) return false
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++ }
    }
    return e + (a.length - i) + (b.length - j) <= 1
  }
  for (const k of players.keys()) {
    if (!athlete(k) || bigSet.has(k) && players.get(k).cards >= 500) continue
    const pk = players.get(k), w = k.split(' '), raw = nameOf(k)
    if (GENERIC.test(k)) continue
    let target = null
    // 6
    if (/[\d#(]/.test(raw)) for (let i = w.length - 1; i >= 2 && !target; i--) {
      const head = w.slice(0, i).join(' ')
      if (bigSet.has(head) && sameFamily(k, head) && players.get(head).cards >= 10 * pk.cards) target = head
    }
    // 7
    if (!target && (w.length === 1 || (w.length === 2 && SUFFIX.test(w[1]))) && k.length >= 4) {
      const c = (bySurname.get(k) || []).filter(x => x !== k && sameFamily(k, x))
      const top = c.sort((a, b) => players.get(b).cards - players.get(a).cards)
      if (top.length && players.get(top[0]).cards >= 20 * pk.cards && (top.length === 1 || players.get(top[1]).cards * 10 <= players.get(top[0]).cards) && teamsAgree(k, top[0])) target = top[0]
    }
    // 8
    // (tiny pages only: "Zoran Dragić" is Goran's brother, not a typo — real people get more than a few cards)
    if (!target && w.length >= 2 && k.length >= 8 && pk.cards <= 5 && !/[\d#(]/.test(raw)) {
      const seen = new Set()
      for (const t of w) for (const c of byToken.get(t) || []) {
        if (seen.has(c) || c === k) continue
        seen.add(c)
        if (lev1(k, c) && sameFamily(k, c) && players.get(c).cards >= 50 * pk.cards && teamsAgree(k, c)) { target = c; break }
      }
    }
    if (target) union(k, target)
  }
  const out = new Map()
  for (const k of players.keys()) { const r = find(k); if (r !== k) out.set(k, r) }
  if (process.env.PLAYER_MERGE_LOG) {
    const lines = [...out].sort((a, b) => players.get(b[1]).cards - players.get(a[1]).cards).map(([k, r]) => fam.get(k) + '\t' + players.get(k).cards + '\t' + nameOf(k) + '\t->\t' + nameOf(r) + '\t' + players.get(r).cards)
    import('node:fs').then(fs => fs.writeFileSync(process.env.PLAYER_MERGE_LOG, lines.join('\n')))
  }
  return out
}

// ---- cards that name several people / characters, or one plus extra words ----
// "Elsa and Anna", "Frozen Fractals Anna and Elsa", "Anna Saves Elsa Frozen" -> credited to
// Elsa and to Anna; "Elsa Julie Vu" (artist variant) -> Elsa; "Topps Joe Morgan RC ... Sonny
// Jackson #16" -> Joe Morgan and Sonny Jackson. A name inside the string only counts when it
// is a clearly bigger page in the same sport (characters: any character game) that shares a
// set with the card, and "Ken Griffey" never matches inside "Ken Griffey Jr.".
// groups: Map canonicalKey -> { cards, sports: Map(sportIdx -> n), sets: Set }
// Returns Map key -> [target keys] (the key's cards move to every target).
export function splitComposites(groups, sportNames) {
  const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/
  const CONNECT = /\b(and|vs|v|with|saves|meets|x|featuring|feat|or|et)\b/
  const rawOf = (g) => g.base ? [...g.base.entries()].sort((a, b) => b[1] - a[1])[0][0] : ''
  const info = new Map()
  for (const [k, g] of groups) {
    const top = [...g.sports.entries()].sort((a, b) => b[1] - a[1])[0]
    const sport = top ? sportNames[top[0]] : ''
    info.set(k, { fam: family(sport), cardGame: CARD_NAMES.has(sport), toks: k.split('|')[0].split(' ') })
  }
  // big pages by first token
  const byFirst = new Map()
  for (const [k, g] of groups) {
    const i = info.get(k)
    if (g.cards < 20 || i.cardGame || k.includes('|') || CONNECT.test(k)) continue   // "Mickey and Minnie" is not a target
    if (i.toks.length === 1 && (i.fam !== 'CHAR' || k.length < 4)) continue
    if (!byFirst.has(i.toks[0])) byFirst.set(i.toks[0], [])
    byFirst.get(i.toks[0]).push(k)
  }
  for (const list of byFirst.values()) list.sort((a, b) => info.get(b).toks.length - info.get(a).toks.length)
  const shares = (a, b) => { const [x, y] = a.size < b.size ? [a, b] : [b, a]; for (const s of x) if (y.has(s)) return true; return false }
  const out = new Map()
  for (const [k, g] of groups) {
    const i = info.get(k)
    if (i.cardGame || k.includes('|') || i.toks.length < 2) continue
    const raw = rawOf(g)
    const found = [], joined = CONNECT.test(k) || /&/.test(raw)
    for (let p = 0; p < i.toks.length;) {
      let hit = null
      for (const t of byFirst.get(i.toks[p]) || []) {
        if (t === k) continue
        const tt = info.get(t).toks, tg = groups.get(t)
        if (p + tt.length > i.toks.length) continue
        let ok = true
        for (let j = 0; j < tt.length; j++) if (i.toks[p + j] !== tt[j]) { ok = false; break }
        if (!ok) continue
        if (SUFFIX.test(i.toks[p + tt.length] || '')) continue
        if (info.get(t).fam !== i.fam) continue
        if (tt[0] === 'the') continue   // "Beauty and the Beast" is not The Beast
        // "Elsa and Anna": with a joining word each named page only needs to be bigger than the card
        if (tg.cards < Math.max(20, (joined ? 1 : 5) * g.cards)) continue
        hit = t; break
      }
      if (hit) { found.push(hit); p += info.get(hit).toks.length } else p++
    }
    // first names in a joined card: "Mickey and Minnie" -> Mickey Mouse + Minnie Mouse,
    // "Anakin and Ahsoka" -> Anakin Skywalker + Ahsoka Tano (the one clearly biggest
    // character with that first name, appearing in the same set)
    if (joined && i.fam === 'CHAR') {
      const have = new Set(found.flatMap(t => info.get(t).toks))
      for (const part of raw.split(/\s*(?:,|&|\band\b|\bvs\.?|\bwith\b|\bet\b|\bor\b)\s*/i).map(norm)) {
        if (!part || part.includes(' ') || part.length < 3 || have.has(part)) continue
        const cands = (byFirst.get(part) || []).filter(t => t !== k && info.get(t).fam === 'CHAR').sort((a, b) => groups.get(b).cards - groups.get(a).cards)
        const best = cands[0]
        if (!best || groups.get(best).cards < Math.max(20, g.cards)) continue
        if (cands[1] && groups.get(cands[1]).cards * 3 > groups.get(best).cards) continue
        if (!found.length && !shares(g.sets, groups.get(best).sets)) continue
        found.push(best)
      }
    }
    if (!found.length) continue
    const uniq = [...new Set(found)]
    // each named page must share a set with the card, unless the card plainly joins
    // two or more names ("Frozen Fractals Anna and Elsa")
    if (!(joined && uniq.length >= 2) && !uniq.every(t => shares(g.sets, groups.get(t).sets))) continue
    if (uniq.length >= 2 || g.cards <= 30 || joined) out.set(k, uniq)
  }
  // a page that is itself split up is not a target
  for (const [k, ts] of out) { const keep = ts.filter(t => !out.has(t)); if (keep.length) out.set(k, keep); else out.delete(k) }
  if (process.env.PLAYER_SPLIT_LOG) {
    const lines = [...out].sort((a, b) => groups.get(b[0]).cards - groups.get(a[0]).cards).map(([k, ts]) => info.get(k).fam + '\t' + groups.get(k).cards + '\t' + k + '\t->\t' + ts.join(' + '))
    import('node:fs').then(fs => fs.writeFileSync(process.env.PLAYER_SPLIT_LOG, lines.join('\n')))
  }
  return out
}
