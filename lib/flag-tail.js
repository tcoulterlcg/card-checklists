// TCDB card flags glued onto a player name when the row has no person links:
//   "Dustin Pedroia MEM, SN99", "Martin Brodeur / Gerry Cheevers AU, MEM, SN", "Pete PR3600",
//   "Dodgers Rookie Stars (Josh Wall / Paco Rodriguez) RS, RC".
// splitFlagTail(name) -> { p, x } : the name without the tail, and the tail as the site's
// flag string ("/99 AU MEM RC"). Only strips a tail that holds a real card flag
// (AU, MEM, RC, a serial number, a print run or EXCH), so names ending in other capitals stay.
// TCDB's tag vocabulary (AU, MEM, RC, SN25 = serial, PR5000 = print run, RDM = redemption, TC = team card,
// TL = team leaders, CL = checklist, LEN = lenticular, GEM, FOIL, LOGO, MGR …)
const TOKEN = '(?:AUR?|URA?|MEM|MANU|RC|SN\\d*(?!\\d)|PR\\d+(?!\\d)|HN|EXCH|CUT|AS|ARP|SP|SSP|RS|VAR|UER|DP|TR|FS|LL|HL|CL|RDM|GEM|LOGO|FOIL|TCL|TC|TL|LEN|MGR|SKH|STAD|TT|CC|COIN|MED|MAP|AM|TG|CO|SDS|FIN|KC|BB|PUZ|MAG|HC|HDR|IFIN|TRO|TRIB|PU|MVP|DK)'
const TAIL = new RegExp('\\s+(' + TOKEN + '(?:,\\s*' + TOKEN + ')*),?\\s*$')
// Same flags with TCDB's description column glued on, no space: "Dock Ellis / Catfish Hunter AUFriends",
// "Earl Averill / Joe Sewell AU, CUT, PR1Baseball", "Kobe Bryant / Pau Gasol / Lamar Odom MEM2009".
const GLUED = new RegExp('\\s+(' + TOKEN + '(?:,\\s*' + TOKEN + ')*)(?=[A-Z][a-z]|(?<=[A-Z])\\d{4}\\b)(.+)$')
const KEY = /^(?:AUR?|URA?|MEM|MANU|RC|SN\d*|PR\d+|EXCH)$/

export function splitFlagTail(name) {
  const s = String(name || '')
  let note = ''
  let m = s.match(TAIL)
  if (!m) { m = s.match(GLUED); if (m) note = m[2].trim() }
  if (!m) return { p: s, x: '' }
  const toks = m[1].split(/,\s*/)
  if (!toks.some(t => KEY.test(t)) && toks.length < 2) return { p: s, x: '' }   // one non-flag tag alone ("… DK") may be part of the name
  const p = s.slice(0, m.index).trim()
  if (!p || !/[a-z]/.test(p) || /,$/.test(p)) return { p: s, x: '' }
  const out = []
  let serial = ''
  for (const t of toks) {
    const n = t.match(/^(?:SN|PR)(\d+)$/)
    if (n) { serial = '/' + n[1]; continue }
    const f = t === 'AUR' || t === 'URA' || t === 'UR' ? 'AU' : t
    if (['AU', 'MEM', 'RC'].includes(f) && !out.includes(f)) out.push(f)
  }
  return { p, x: [serial, ...['AU', 'MEM', 'RC'].filter(f => out.includes(f))].filter(Boolean).join(' '), note }
}

// Apply to a card in place: strip the tail from c.p, merge its flags into c.x (a glued description
// goes to c.d). Returns true if changed.
export function fixFlagTail(c) {
  const { p, x, note } = splitFlagTail(c.p)
  if (p === c.p) return false
  c.p = p
  if (note && note !== c.v && note !== c.t && note !== c.d) c.d = c.d ? c.d + ' · ' + note : note   // TCDB's card description ("Exchange card", "Design: 1976 Topps"), shown under the name
  if (x) {
    const have = (c.x || '').split(/\s+/).filter(Boolean)
    for (const f of x.split(' ')) {
      if (f.startsWith('/') && have.some(h => h.startsWith('/'))) continue
      if (!have.includes(f)) have.push(f)
    }
    c.x = have.join(' ')
  }
  return true
}
