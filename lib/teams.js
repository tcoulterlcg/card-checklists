// One team = one entry, under its current name, across the whole site (team browse, My PC).
//
// Two kinds of merging:
//  1. Franchise renames in the same market — the team changed its name, not its home:
//     "Tampa Bay Devil Rays" -> Tampa Bay Rays, "Mighty Ducks of Anaheim" -> Anaheim Ducks,
//     "Washington Redskins" -> Washington Commanders. Like brands (lib/brands.js), a team is a
//     timeline, not one name. Relocations to a new market (Seattle SuperSonics -> Oklahoma City
//     Thunder, Brooklyn -> Los Angeles Dodgers) stay separate teams: collectors of one rarely
//     mean the other. When a team is renamed, add its old names here — every page reads this file.
//  2. Spellings in the checklists ("Lightning", "Tampa Bay Lightning", "TAMPA BAY LIGHTNING",
//     "Ottowa Senators") — see teamCanon below.

// sport -> current name -> earlier names of the same team in the same market
export const FRANCHISES = {
  Baseball: {
    'Tampa Bay Rays': ['Tampa Bay Devil Rays', 'Devil Rays'],
    'Los Angeles Angels': ['California Angels', 'Anaheim Angels', 'Los Angeles Angels of Anaheim', 'LA Angels of Anaheim'],
    'Miami Marlins': ['Florida Marlins'],
    'Cleveland Guardians': ['Cleveland Indians', 'Cleveland Naps'],
    'Athletics': ['Oakland Athletics', "Oakland A's", 'Oakland As'],
    'New York Yankees': ['New York Highlanders'],
    'Houston Astros': ['Houston Colt .45s', 'Houston Colt 45s'],
    'Cincinnati Reds': ['Cincinnati Redlegs'],
    'Boston Red Sox': ['Boston Americans'],
  },
  Football: {
    'Washington Commanders': ['Washington Redskins', 'Washington Football Team', 'Redskins'],
    'Tennessee Titans': ['Tennessee Oilers'],
    'New England Patriots': ['Boston Patriots'],
    'Arizona Cardinals': ['Phoenix Cardinals'],
  },
  Basketball: {
    'New Orleans Pelicans': ['New Orleans Hornets', 'New Orleans/Oklahoma City Hornets', 'New Orleans Oklahoma City Hornets'],
    'Charlotte Hornets': ['Charlotte Bobcats'],
    'Washington Wizards': ['Washington Bullets', 'Capital Bullets'],
    'Golden State Warriors': ['San Francisco Warriors'],
  },
  Hockey: {
    'Anaheim Ducks': ['Mighty Ducks of Anaheim', 'Anaheim Mighty Ducks'],
    'Arizona Coyotes': ['Phoenix Coyotes'],
    'Utah Mammoth': ['Utah Hockey Club'],
  },
}

export const foldTeam = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
const FRANCHISE_OF = new Map()   // "sport|folded old name" -> current name
for (const [sport, teams] of Object.entries(FRANCHISES)) for (const [now, old] of Object.entries(teams)) {
  FRANCHISE_OF.set(sport + '|' + foldTeam(now), now)
  for (const o of old) FRANCHISE_OF.set(sport + '|' + foldTeam(o), now)
}
// current name of a team ("Tampa Bay Devil Rays", Baseball -> "Tampa Bay Rays"); unchanged when not renamed
export const franchiseName = (team, sport) => FRANCHISE_OF.get(sport + '|' + foldTeam(team)) || team

// checklist tags glued onto a team ("Tampa Bay Rays AS" = All-Star, "CUP", "MVP", "MGR") and stray punctuation
const TAG_TAIL = /(?:\s+(?:AS|ASG|AL|NL|CUP|MVP|MGR|CO|RC|LL|WS|HL|TL|CL|DIV|ROY|CY|GG|SS|HOF))+$/
export const tidyTeam = (t) => String(t || '').trim().replace(/[\s\-:;,()]+$/, '').replace(/\(\s*\)/g, '').replace(TAG_TAIL, '').trim() || String(t || '').trim()
const TYPOS = { 'ottowa senators': 'Ottawa Senators', 'vegas golden knight': 'Vegas Golden Knights', 'st louis blues': 'St. Louis Blues' }
// One entry per team within a sport: "Bruins" / "Boston" / "Boston Bruins" -> Boston Bruins, accents and
// case folded, singular/plural spellings joined, renamed franchises under their current name.
// names: [[spelling, cardCount], ...] for one sport. Returns Map(spelling -> display name).
export function teamCanon(names, sport) {
  const fr = (t) => { const c = tidyTeam(t); return franchiseName(TYPOS[foldTeam(c)] || c, sport) }
  const counts = new Map()   // folded -> [display, count]
  for (const [t0, n] of names) {
    const t = fr(t0), k = foldTeam(t)
    const c = counts.get(k)
    if (!c) counts.set(k, [t, n])
    else { if (!FRANCHISE_OF.has(sport + '|' + k) && n > c[1] && /[A-Z]/.test(t)) c[0] = t; c[1] += n }   // a renamed team always shows its current name
  }
  const full = [...counts.entries()].filter(([k]) => k.includes(' ')).sort((a, b) => b[1][1] - a[1][1])
  const tail = new Map(), head = new Map()   // nickname / city -> full names using it
  for (const [k] of full) {
    const w = k.split(' ')
    for (let i = 1; i < w.length; i++) { const nick = w.slice(i).join(' '), city = w.slice(0, i).join(' '); (tail.get(nick) || tail.set(nick, []).get(nick)).push(k); (head.get(city) || head.set(city, []).get(city)).push(k) }
  }
  const map = new Map()   // original name -> canonical display
  for (const [t0] of names) {
    let k = foldTeam(fr(t0))
    // any other short tag after a real team ("New York Yankees HR"): only when the bare team is far bigger
    const tag = tidyTeam(t0).match(/^(.*\S)\s+[A-Z]{2,4}$/)
    if (tag) { const r = foldTeam(fr(tag[1])); if (counts.has(r) && counts.has(k) && counts.get(r)[1] >= 10 * counts.get(k)[1]) k = r }
    // singular/plural spellings of one team ("Acadie-Bathurst Titan" / "Titans"): the more common spelling wins
    if (k.includes(' ')) {
      const n = (x) => (counts.get(x) || [0, 0])[1]
      if (counts.has(k + 's') && n(k + 's') >= n(k)) k = k + 's'
      else if (k.endsWith('s') && counts.has(k.slice(0, -1)) && n(k.slice(0, -1)) > n(k)) k = k.slice(0, -1)
    }
    // a bare nickname or city ("Lightning", "Tampa Bay") joins the one big team using it
    if (!FRANCHISE_OF.has(sport + '|' + k) && (!counts.has(k) || !k.includes(' '))) {
      // one big team using it, or one that dwarfs the rest ("Angels": Los Angeles Angels, not the AZL Angels)
      // A bare city must be unique ("Washington" is the NFL team and two colleges).
      const pick = (arr, dominant) => {
        const big = (arr || []).filter(x => counts.get(x)[1] >= 50).sort((a, b) => counts.get(b)[1] - counts.get(a)[1])
        return big.length === 1 || (dominant && big.length > 1 && counts.get(big[0])[1] >= 10 * counts.get(big[1])[1]) ? big[0] : null
      }
      const hit = pick(tail.get(k), true) || pick(head.get(k), false)
      if (hit) k = hit
    }
    map.set(t0, (counts.get(k) || [fr(t0)])[0])
  }
  return map
}
