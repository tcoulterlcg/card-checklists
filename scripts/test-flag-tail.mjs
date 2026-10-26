// Regression cases for lib/flag-tail.js (TCDB tags glued onto card names).
// Run after changing the patterns:  node scripts/test-flag-tail.mjs
import assert from 'node:assert/strict'
import { splitFlagTail } from '../lib/flag-tail.js'

const cases = [
  // [name, expected name, expected flags, expected description]
  ['Dustin Pedroia MEM, SN99', 'Dustin Pedroia', '/99 MEM', ''],
  ['Pete PR3600', 'Pete', '/3600', ''],
  ['Montreal Expos TC, TL', 'Montreal Expos', '', ''],
  ['Alexis Morris AU, GEM,', 'Alexis Morris', 'AU', ''],
  ['Wild Card RDM', 'Wild Card', '', ''],
  ['TBD AU, SN10', 'TBD', '/10 AU', ''],
  ['Nick Leddy AU, MEM, RC, SN249Exchange card', 'Nick Leddy', '/249 AU MEM RC', 'Exchange card'],
  ['Dock Ellis / Catfish Hunter AUFriends', 'Dock Ellis / Catfish Hunter', 'AU', 'Friends'],
  ['Kobe Bryant / Pau Gasol / Lamar Odom MEM2009', 'Kobe Bryant / Pau Gasol / Lamar Odom', 'MEM', '2009'],
  ['Guy Lafleur SN251971 No. 1 Overall Pick', 'Guy Lafleur', '/25', '1971 No. 1 Overall Pick'],
  ['Aaron Judge MEM, SN1AL MVPs', 'Aaron Judge', '/1 MEM', 'AL MVPs'],
  ['Stephen Curry SN302015 MVP', 'Stephen Curry', '/30', '2015 MVP'],
  ['Larry Bird / Julius Erving / Magic Johnson RC, TLBird RC / Erving TL / Johnson RC', 'Larry Bird / Julius Erving / Magic Johnson', 'RC', 'Bird RC / Erving TL / Johnson RC'],
  ['Alistair Lord SN50, UERUER: Brilliance is misspelled', 'Alistair Lord', '/50', 'Brilliance is misspelled'],
  ['Albert MEM, SN50アルバート', 'Albert', '/50 MEM', 'アルバート'],
  // left alone
  ['Team USA', 'Team USA', '', undefined],
  ['John Smith DK', 'John Smith DK', '', undefined],
  ['Team AUSTRALIA Rugby', 'Team AUSTRALIA Rugby', '', undefined],
  ['Son Goku UR', 'Son Goku UR', '', undefined],
  ['Lionel Messi MEMÓRIA', 'Lionel Messi MEMÓRIA', '', undefined],
  ['Pete Rose PR12000 Hit King', 'Pete Rose PR12000 Hit King', '', undefined],
  ['HIFK PR3100, TC', 'HIFK PR3100, TC', '', undefined],
]
let failed = 0
for (const [name, p, x, note] of cases) {
  const r = splitFlagTail(name)
  try {
    assert.equal(r.p, p); assert.equal(r.x, x)
    if (note !== undefined) assert.equal(r.note, note)
    assert.ok(!/\u0001/.test(r.p + (r.note || '')), 'split marker leaked')
  } catch (e) { failed++; console.log('FAIL', JSON.stringify(name), '->', JSON.stringify(r)) }
}
console.log(failed ? failed + ' of ' + cases.length + ' failed' : 'all ' + cases.length + ' flag-tail cases pass')
process.exit(failed ? 1 : 0)
