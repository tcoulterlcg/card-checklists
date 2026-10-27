// node scripts/test-match.mjs — checks the import matcher (lib/match.js) and CSV helpers (lib/csv.js).
import assert from 'node:assert/strict'
import { parseTcdbTitle, buildSetIndex, findSets, findCard, matchRows, cardNumKey, nameVariants } from '../lib/match.js'
import { parseCsv, toCsv, guessMapping, money, isoDate } from '../lib/csv.js'

const t = parseTcdbTitle('2007-08 O-Pee-Chee Premier #144 Patrick Kane AU, MEM, RC, SN299')
assert.deepEqual([t.setName, t.cardN, t.player, t.flags.join(','), t.printRun], ['2007-08 O-Pee-Chee Premier', '144', 'Patrick Kane', 'AU,MEM,RC,SN299', 299])
const t2 = parseTcdbTitle('2007-08 SP Authentic - Holoview FX #FX3 Patrick Kane')
assert.deepEqual([t2.setName, t2.cardN, t2.player, t2.flags.length], ['2007-08 SP Authentic - Holoview FX', 'FX3', 'Patrick Kane', 0])
assert.equal(parseTcdbTitle('2007-08 O-Pee-Chee #518 Patrick Kane MR, RC').player, 'Patrick Kane')
assert.equal(parseTcdbTitle('1990 Topps #1 Nolan Ryan / Tom Seaver TL').player, 'Nolan Ryan / Tom Seaver')
assert.deepEqual(nameVariants('2007-08 SP Authentic - Holoview FX').map(v => v.section || ''), ['', 'Holoview FX'])
assert.equal(cardNumKey('#007'), '7'); assert.equal(cardNumKey('NNO'), ''); assert.equal(cardNumKey('fx3'), 'FX3')

const sets = [
  { slug: 'a', name: '2007-08 SP Authentic Hockey', year: 2008, sport: 'Hockey' },
  { slug: 'b', name: '2007-08 Upper Deck SP Authentic Basketball', year: 2008, sport: 'Basketball' },
  { slug: 'c', name: '2007-08 O-Pee-Chee Hockey', year: 2008, sport: 'Hockey' },
  { slug: 'd', name: '2007-08 O-Pee-Chee Premier Hockey', year: 2008, sport: 'Hockey' },
  { slug: 'e', name: '2006-07 In The Game Heroes and Prospects Hockey', year: 2007, sport: 'Hockey' },
]
const idx = buildSetIndex(sets)
assert.equal(findSets(idx, { setName: '2007-08 O-Pee-Chee Premier', sport: 'Hockey' })[0].set.slug, 'd')
assert.equal(findSets(idx, { setName: '2007-08 O-Pee-Chee', sport: 'Hockey' })[0].set.slug, 'c')
assert.equal(findSets(idx, { setName: '2007-08 SP Authentic', sport: 'Hockey' })[0].set.slug, 'a')
assert.equal(findSets(idx, { setName: '2006-07 In The Game Heroes and Prospects', sport: 'Hockey' })[0].set.slug, 'e')

const data = {
  a: { slug: 'a', name: '2007-08 SP Authentic Hockey', sections: [
    { title: 'Base', cards: [{ n: '204', p: 'Patrick Kane' }, { n: '1', p: 'Sidney Crosby' }] },
    { title: 'Holoview FX', cards: [{ n: 'FX3', p: 'Patrick Kane' }] },
    { title: 'Holoview FX Die Cut', cards: [{ n: 'FX3', p: 'Patrick Kane' }] }] },
  c: { slug: 'c', name: '2007-08 O-Pee-Chee Hockey', sections: [{ title: 'Base Set', cards: [{ n: '518', p: 'Patrick Kane' }] }, { title: 'Rainbow', cards: [{ n: '518', p: 'Patrick Kane' }] }] },
  d: { slug: 'd', name: '2007-08 O-Pee-Chee Premier Hockey', sections: [{ title: 'Base', cards: [{ n: '144', p: 'Patrick Kane' }] }] },
  e: { slug: 'e', name: '2006-07 In The Game Heroes and Prospects Hockey', sections: [{ title: 'Base', cards: [{ n: '175', p: 'Patrick Kane' }] }] },
}
assert.equal(findCard(data.a, { section: 'Holoview FX', cardN: 'FX3', player: 'Patrick Kane' }).section, 'Holoview FX')
assert.equal(findCard(data.a, { section: 'Holoview FX Die Cut', cardN: 'FX3', player: 'Patrick Kane' }).section, 'Holoview FX Die Cut')
assert.equal(findCard(data.c, { cardN: '518', player: 'Patrick Kane' }).section, 'Base Set')

const rows = ['2007-08 SP Authentic - Holoview FX #FX3 Patrick Kane', '2007-08 O-Pee-Chee #518 Patrick Kane MR, RC', '2007-08 O-Pee-Chee - Rainbow #518 Patrick Kane',
  '2006-07 In The Game Heroes and Prospects #175 Patrick Kane', '2007-08 SP Authentic #204 Patrick Kane FW, AU, RC, SN999', '2019 Made Up Set #5 Nobody']
  .map(s => ({ ...parseTcdbTitle(s), sport: 'Hockey' }))
const res = await matchRows(rows, { index: idx, loadSet: (s) => data[s] || null })
assert.deepEqual(res.map(r => [r.slug, r.section, r.conf]), [
  ['a', 'Holoview FX', 'exact'], ['c', 'Base Set', 'exact'], ['c', 'Rainbow', 'exact'], ['e', 'Base', 'exact'], ['a', 'Base', 'exact'], [undefined, undefined, 'none']])

const pz = { slug: 'p', name: 'x', sections: [{ title: 'Prizm', cards: [{ n: '9', p: 'Patrick Kane' }] }, { title: 'Blue Line Auto Jersey Parallel', cards: [{ n: '55', p: 'Patrick Kane' }] }] }
assert.equal(findCard(pz, { section: 'Prizm Red', cardN: '9', player: 'Patrick Kane' }), null)
assert.equal(findCard(pz, { section: 'Blue Line Autograph Jersey Relics', cardN: '55', player: 'Patrick Kane' }).conf, 'likely')

// CSV
const csv = toCsv(['Set', 'Card #', 'Notes'], [{ Set: 'A, "B"', 'Card #': '=1+1', Notes: 'line1\nline2' }])
const back = parseCsv(csv)
assert.deepEqual(back.headers, ['Set', 'Card #', 'Notes'])
assert.equal(back.rows[0].Set, 'A, "B"'); assert.equal(back.rows[0]['Card #'], "'=1+1"); assert.equal(back.rows[0].Notes, 'line1\nline2')
assert.equal(parseCsv('a\tb\n1\t2').rows[0].b, '2')
assert.deepEqual(guessMapping(['Card Number', 'Player Name', 'Set Name', 'Qty', 'Purchase Price', 'Grading Company']), { set: 'Set Name', card_n: 'Card Number', player: 'Player Name', qty: 'Qty', grader: 'Grading Company', price_paid: 'Purchase Price' })
assert.equal(money('$1,234.50'), 1234.5); assert.equal(money(''), null); assert.equal(isoDate('Dec 3, 2021'), '2021-12-03'); assert.equal(isoDate('2021-12-03'), '2021-12-03')
console.log('match + csv: all checks passed')
