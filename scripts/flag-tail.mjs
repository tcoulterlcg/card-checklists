// TCDB card flags glued onto a player name when the row has no person links:
//   "Dustin Pedroia MEM, SN99", "Martin Brodeur / Gerry Cheevers AU, MEM, SN", "Pete PR3600",
//   "Dodgers Rookie Stars (Josh Wall / Paco Rodriguez) RS, RC".
// splitFlagTail(name) -> { p, x } : the name without the tail, and the tail as the site's
// flag string ("/99 AU MEM RC"). Only strips a tail that holds a real card flag
// (AU, MEM, RC, a serial number, a print run or EXCH), so names ending in other capitals stay.
const TOKEN = '(?:AUR?|URA?|MEM|RC|SN\\d*|PR\\d+|HN|EXCH|CUT|AS|ARP|SP|SSP|RS|VAR|UER|DP|TR|FS|LL|HL|CL)'
const TAIL = new RegExp('\\s+(' + TOKEN + '(?:,\\s*' + TOKEN + ')*)\\s*$')
const KEY = /^(?:AUR?|URA?|MEM|RC|SN\d*|PR\d+|EXCH)$/

export function splitFlagTail(name) {
  const s = String(name || '')
  const m = s.match(TAIL)
  if (!m) return { p: s, x: '' }
  const toks = m[1].split(/,\s*/)
  if (!toks.some(t => KEY.test(t))) return { p: s, x: '' }
  const p = s.slice(0, m.index).trim()
  if (!p || !/[a-z]/.test(p)) return { p: s, x: '' }
  const out = []
  let serial = ''
  for (const t of toks) {
    const n = t.match(/^(?:SN|PR)(\d+)$/)
    if (n) { serial = '/' + n[1]; continue }
    const f = t === 'AUR' || t === 'URA' || t === 'UR' ? 'AU' : t
    if (['AU', 'MEM', 'RC'].includes(f) && !out.includes(f)) out.push(f)
  }
  return { p, x: [serial, ...['AU', 'MEM', 'RC'].filter(f => out.includes(f))].filter(Boolean).join(' ') }
}

// Apply to a card in place: strip the tail from c.p and merge its flags into c.x. Returns true if changed.
export function fixFlagTail(c) {
  const { p, x } = splitFlagTail(c.p)
  if (p === c.p) return false
  c.p = p
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
