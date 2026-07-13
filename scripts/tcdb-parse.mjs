// Parse raw TCDB checklist page-text dumps into a site set JSON.
// TCDB blocks server-side fetches, so checklist pages are pulled through the
// browser (navigate + get_page_text, batched) and their text concatenated into
// one raw file; this turns that text into {slug,name,year,sport,source,sections}.
//
//   node scripts/tcdb-parse.mjs <raw.txt> <slug> "<Name>" <year> <sport> [teams.txt]
//
// Card lines look like "6 Tyler Gentry RC Kansas City Royals"; special cards
// (checklist/leader/variation) put notes on their own lines ("VAR: ...",
// "Checklist: ...", "Nueva Ficha") and sometimes the team on the next line —
// handled via a team dictionary + forward scan. Baseball has a built-in team
// dictionary; other sports pass a teams.txt (one team per line, harvested from
// the set's page DOM).
import { writeFileSync, readFileSync } from 'node:fs'

const [, , rawPath, slug, name, yearStr, sport, teamsPath] = process.argv
if (!rawPath || !slug || !name || !yearStr || !sport) {
  console.error('Usage: node scripts/tcdb-parse.mjs <raw.txt> <slug> "<Name>" <year> <sport> [teams.txt]')
  process.exit(1)
}

const TEAMS = {
  Baseball: ['Arizona Diamondbacks','Atlanta Braves','Baltimore Orioles','Boston Red Sox','Chicago Cubs','Chicago White Sox','Cincinnati Reds','Cleveland Guardians','Colorado Rockies','Detroit Tigers','Houston Astros','Kansas City Royals','Los Angeles Angels','Los Angeles Dodgers','Miami Marlins','Milwaukee Brewers','Minnesota Twins','New York Mets','New York Yankees','Philadelphia Phillies','Pittsburgh Pirates','San Diego Padres','San Francisco Giants','Seattle Mariners','St. Louis Cardinals','Tampa Bay Rays','Texas Rangers','Toronto Blue Jays','Washington Nationals','Kansas City Athletics','Oakland Athletics','Athletics'],
}
const externalTeams = teamsPath ? readFileSync(teamsPath, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean) : []
const teamList = [...new Set([...(TEAMS[sport] || []), ...externalTeams])].sort((a, b) => b.length - a.length) // longest first
const teamSet = new Set(teamList)
const FLAGS = new Set(['RC','SP','SSP','AU','VAR','LL','ASR','FS','TC','CL','CPC','RRC','HR','SR','IP','DP','RB','CB','UER','COR','ERR','HOF','ROY','MVP','CY','SN9','DK','RS','ME','MB','MR','NF','MF','CNE','JP'])
const NOTE_RE = /^(VAR|Checklist|ERR|UER|COR|SP|Note):/i

const raw = readFileSync(rawPath, 'utf8')
const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

// A card row starts with a number token (12, 12b, 71bis, 209bis1, ALT-1) then text.
const CARD_RE = /^(\d{1,4}(?:bis\d?|[a-z])?|ALT-\d+|[A-Z]{1,4}-?\d+[a-z]?)\s+(.+)$/

// team is a trailing run of "Team [/ Team ...]"; return [player+flags, team] or null.
// Repeatedly peel known teams off the end, continuing only across " / " separators.
function splitTeam(rest) {
  const teams = []
  let s = rest
  while (true) {
    let matched = null
    for (const t of teamList) { if (s === t || s.endsWith(' ' + t)) { matched = t; break } }
    if (!matched) break
    teams.unshift(matched)
    s = s.slice(0, s.length - matched.length).trim()
    if (s.endsWith('/')) s = s.slice(0, -1).trim() // more slash-separated teams follow
    else break
  }
  if (teams.length === 0) return null
  return [s, teams.join(' / ')]
}

function stripFlags(frontRaw) {
  let parts = frontRaw.split(/[\s,]+/)
  const fl = []
  while (parts.length > 1 && FLAGS.has(parts[parts.length - 1])) fl.unshift(parts.pop())
  return [parts.join(' ').replace(/[\s,]+$/, '').trim(), fl]
}

const cards = []
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(CARD_RE)
  if (!m) continue
  const num = m[1]
  let rest = m[2]
  // Skip pagination/nav noise that can look numbered (none expected after CARD_RE), and
  // require the eventual line to resolve to a team, else it's not a real card row.
  let team = '', front = rest
  const st = splitTeam(rest)
  if (st) { front = st[0]; team = st[1] }
  else {
    // team on a following line; skip note lines (e.g. "VAR: ...", "Nueva
    // Ficha") to find it, but never scan past the next card row.
    let found = null
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      if (CARD_RE.test(lines[j])) break
      const st2 = splitTeam(lines[j])
      if (st2 && st2[0] === '') { found = st2[1]; break }
    }
    if (found) { team = found; front = rest }
    else continue // not a resolvable card row -> skip
  }
  const [player, fl] = stripFlags(front)
  if (!player || player.length < 2) continue
  const card = { n: num, p: player }
  if (team) card.t = team
  if (fl.length) card.x = fl.join(' ')
  cards.push(card)
}

// de-dupe by number (keep first)
const seen = new Set()
const uniq = cards.filter(c => (seen.has(c.n) ? false : (seen.add(c.n), true)))

const set = { slug, name, year: parseInt(yearStr), sport, source: 'tcdb.com', sections: [{ title: 'Base Set', cards: uniq }] }
writeFileSync(new URL('../public/data/' + slug + '.json', import.meta.url), JSON.stringify(set))
console.log(`${slug}: parsed ${uniq.length} cards (${cards.length - uniq.length} dupes dropped)`)
console.log('sample:', JSON.stringify(uniq.slice(0, 3)))
console.log('specials:', JSON.stringify(uniq.filter(c => /Leaders|Checklist|TC$/.test(c.p) || /LL|CL/.test(c.x || '')).slice(0, 3)))
