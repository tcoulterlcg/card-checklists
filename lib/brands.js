// Brand (manufacturer) + product line for a set, decided by product AND year.
//
// Hobby brands change hands: O-Pee-Chee was its own Canadian company before
// Topps and later Upper Deck made it; Fleer was Fleer until Upper Deck bought
// the name in 2005; Donruss, Score and Pinnacle went Pinnacle -> Playoff ->
// Panini. So a product maps to an ownership timeline, not a single brand, and
// "1979-80 O-Pee-Chee" is O-Pee-Chee while "2024-25 O-Pee-Chee" is Upper Deck.
//
// Timeline years are compared against the set's release point: the leading
// year in its name, plus 0.75 for a season ("2005-06" -> 2005.75, released in
// the fall), so a mid-2005 sale lands between "2005 Fleer" and "2005-06 Fleer".
// Each era is [releasedBefore, brand]; the last era has no end.
//
// Sources for the dates are listed beside each timeline. When a brand changes
// hands again, add an era here — every page reads brands from this file.

const NOW = Infinity

const E = {
  // Founded 1911, London ON; independent until 1994-95. Topps made the
  // O-Pee-Chee name under licence 1996-2004; Upper Deck acquired the brand in
  // 2006 (first set 2006-07 O-Pee-Chee Hockey).
  OPC: [[1996, 'O-Pee-Chee'], [2006, 'Topps'], [NOW, 'Upper Deck']],
  // Parkhurst Products 1951-64; licensed to Pro Set 1991-92 and 1992-93;
  // Upper Deck from 1993-94; In The Game 2000-01 to 2004-05; Upper Deck
  // reacquired the name in 2005 (2005-06 onward).
  PARKHURST: [[1965, 'Parkhurst'], [1993, 'Pro Set'], [2000, 'Upper Deck'], [2005.5, 'In The Game'], [NOW, 'Upper Deck']],
  // Fleer ceased operations May 2005; Upper Deck bought the name July 2005.
  FLEER: [[2005.5, 'Fleer'], [NOW, 'Upper Deck']],
  // SkyBox International until Marvel merged it into Fleer (March 1995).
  SKYBOX: [[1995, 'SkyBox'], [2005.5, 'Fleer'], [NOW, 'Upper Deck']],
  // NBA Hoops: SkyBox, then Fleer/SkyBox, Upper Deck, Panini (NBA licence
  // 2009-2025), then Topps (NBA licence from 2025-26).
  HOOPS: [[1995, 'SkyBox'], [2005.5, 'Fleer'], [2009, 'Upper Deck'], [2025.5, 'Panini'], [NOW, 'Topps']],
  // Donruss (Leaf, Inc.) -> Pinnacle Brands 1996 -> Playoff after Pinnacle's
  // 1998 bankruptcy (Donruss Playoff from 2001) -> Panini, March 2009.
  DONRUSS: [[1996, 'Donruss'], [1999, 'Pinnacle'], [2009, 'Donruss Playoff'], [NOW, 'Panini']],
  // Leaf: same path as Donruss until Brian Gray bought the Leaf name (~2010).
  LEAF: [[1996, 'Leaf'], [1999, 'Pinnacle'], [2010, 'Donruss Playoff'], [NOW, 'Leaf']],
  // Score / Pinnacle / Select / Zenith / Summit / Sportflics / Certified:
  // Pinnacle Brands until 1998, then Playoff, then Panini.
  PINNACLE: [[1999, 'Pinnacle'], [2009, 'Donruss Playoff'], [NOW, 'Panini']],
  // Playoff's own lines (Contenders, Absolute, Prestige, Prime Cuts …).
  PLAYOFF: [[1999, 'Playoff'], [2009, 'Donruss Playoff'], [NOW, 'Panini']],
  // Pacific Trading Cards until it was sold to Playoff (2004); Panini revived
  // several of its names (Crown Royale, Revolution, Paramount …).
  PACIFIC: [[2005, 'Pacific'], [2009, 'Donruss Playoff'], [NOW, 'Panini']],
  // Bowman Gum until Topps bought it in 1956 (Topps revived the name in 1989).
  BOWMAN: [[1956, 'Bowman'], [NOW, 'Topps']],
  // Pro Set 1989-1994; the name is Leaf's since its 2017 revival.
  PROSET: [[1996, 'Pro Set'], [NOW, 'Leaf']],
  // In The Game 1998-2014; assets and name sold to Leaf in 2014.
  ITG: [[2014, 'In The Game'], [NOW, 'Leaf']],
  // Be A Player: Upper Deck 1994-95, Pinnacle 1996-98, ITG 1998-2005, Upper Deck since.
  BAP: [[1996, 'Upper Deck'], [1998, 'Pinnacle'], [2005.5, 'In The Game'], [NOW, 'Upper Deck']],
  // Goudey Gum 1933-41; Upper Deck used the name for 2007-09 retro sets.
  GOUDEY: [[1942, 'Goudey'], [2007, 'Other'], [NOW, 'Upper Deck']],
  // Action Packed until Pinnacle bought it in 1995, then Pinnacle's path.
  ACTION: [[1995, 'Action Packed'], [1999, 'Pinnacle'], [2009, 'Donruss Playoff'], [NOW, 'Panini']]
}

// Ordered product-line matchers -> [regex, product, brand or timeline, first year].
// A line with a first year only matches sets from that year on.
// First match wins, so specific lines precede general ones, and the bare
// company names (topps, panini, upper deck) come last.
const PRODUCT_MAP = [
  // Topps lines (always Topps — Fanatics owns Topps but the brand is Topps)
  [/topps chrome/, 'Topps Chrome', 'Topps'], [/bowman chrome/, 'Bowman Chrome', E.BOWMAN],
  [/bowman'?s best/, "Bowman's Best", E.BOWMAN], [/bowman sterling/, 'Bowman Sterling', E.BOWMAN],
  [/bowman platinum/, 'Bowman Platinum', E.BOWMAN], [/bowman draft/, 'Bowman Draft', E.BOWMAN],
  [/bowman/, 'Bowman', E.BOWMAN], [/topps heritage/, 'Heritage', 'Topps'],
  [/stadium club/, 'Stadium Club', 'Topps'], [/gypsy queen/, 'Gypsy Queen', 'Topps'],
  [/allen ?(&|and) ?ginter/, 'Allen & Ginter', 'Topps'], [/topps finest|(?<![a-z])finest/, 'Finest', 'Topps'],
  [/topps fire/, 'Topps Fire', 'Topps'], [/gold label/, 'Gold Label', 'Topps'],
  [/topps archives/, 'Archives', 'Topps'], [/museum collection/, 'Museum Collection', 'Topps'],
  [/tier one/, 'Tier One', 'Topps'], [/triple threads/, 'Triple Threads', 'Topps'],
  [/topps tribute/, 'Tribute', 'Topps'], [/topps inception/, 'Inception', 'Topps'],
  [/topps dynasty/, 'Dynasty', 'Topps'], [/definitive collection/, 'Definitive', 'Topps'],
  [/big league/, 'Big League', 'Topps'], [/topps platinum/, 'Topps Platinum', 'Topps'],
  // Lines that changed hands
  [/o[- ]?pee[- ]?chee platinum/, 'O-Pee-Chee Platinum', E.OPC], [/o[- ]?pee[- ]?chee|(?<![a-z])opc(?![a-z])/, 'O-Pee-Chee', E.OPC],
  [/(?<![a-z])parkhurst/, 'Parkhurst', E.PARKHURST],
  [/(?<![a-z])hoops/, 'Hoops', E.HOOPS],
  [/fleer ultra|(?<![a-z])ultra(?![a-z])/, 'Ultra', E.FLEER], [/(?<![a-z])flair/, 'Flair', E.FLEER],
  [/fleer showcase/, 'Fleer Showcase', E.FLEER], [/(?<![a-z])fleer/, 'Fleer', E.FLEER],
  [/metal universe/, 'Metal Universe', E.SKYBOX], [/(?<![a-z])e-?x ?\d{4}|skybox e-?x/, 'E-X', E.SKYBOX],
  [/(?<![a-z])circa(?![a-z])/, 'Circa', E.SKYBOX], [/(?<![a-z])skybox/, 'SkyBox', E.SKYBOX],
  [/(?<![a-z])leaf metal/, 'Leaf Metal', 'Leaf'], [/(?<![a-z])leaf trinity/, 'Leaf Trinity', 'Leaf'],
  [/(?<![a-z])leaf (itg|in the game)/, 'ITG', 'Leaf'], [/(?<![a-z])leaf pro set/, 'Pro Set', 'Leaf'],
  [/leaf ultimate/, 'Leaf Ultimate', E.LEAF], [/(?<![a-z])leaf(?![a-z])/, 'Leaf', E.LEAF],
  [/be a player/, 'Be A Player', E.BAP],
  [/(?<![a-z])itg(?![a-z])|in the game/, 'ITG', E.ITG],
  [/pro set/, 'Pro Set', E.PROSET],
  [/(?<![a-z])goudey/, 'Goudey', E.GOUDEY], [/action packed/, 'Action Packed', E.ACTION],
  [/(?<![a-z])bazooka/, 'Bazooka', 'Topps'],
  // Panini-only lines (introduced under Panini; older sets with these words aren't Panini's)
  [/panini prizm|(?<![a-z])prizm/, 'Prizm', 'Panini', 2009], [/donruss optic|(?<![a-z])optic/, 'Donruss Optic', 'Panini', 2009],
  [/national treasures/, 'National Treasures', 'Panini', 2009], [/immaculate/, 'Immaculate', 'Panini', 2009],
  [/(?<![a-z])mosaic/, 'Mosaic', 'Panini', 2009], [/flawless/, 'Flawless', 'Panini', 2009],
  [/(?<![a-z])spectra/, 'Spectra', 'Panini', 2009], [/(?<![a-z])obsidian/, 'Obsidian', 'Panini', 2009],
  [/(?<![a-z])phoenix/, 'Phoenix', 'Panini', 2009], [/(?<![a-z])chronicles/, 'Chronicles', 'Panini', 2009],
  [/(?<![a-z])playbook/, 'Playbook', 'Panini', 2009], [/(?<![a-z])illusions/, 'Illusions', 'Panini', 2009],
  [/gold standard/, 'Gold Standard', 'Panini', 2009], [/(?<![a-z])origins/, 'Origins', 'Panini', 2009],
  // Donruss lines
  [/diamond kings/, 'Diamond Kings', E.DONRUSS], [/rookies (&|and) stars/, 'Rookies & Stars', E.DONRUSS],
  [/(?<![a-z])studio/, 'Studio', E.DONRUSS], [/(?<![a-z])elite/, 'Elite', E.DONRUSS], [/(?<![a-z])donruss/, 'Donruss', E.DONRUSS],
  // Pinnacle lines
  [/(?<![a-z])select/, 'Select', E.PINNACLE], [/(?<![a-z])zenith/, 'Zenith', E.PINNACLE],
  [/(?<![a-z])certified/, 'Certified', E.PINNACLE], [/(?<![a-z])score(?![a-z])/, 'Score', E.PINNACLE],
  [/(?<![a-z])summit/, 'Summit', E.PINNACLE], [/sportfli[cx]/, 'Sportflics', E.PINNACLE],
  [/(?<![a-z])pinnacle/, 'Pinnacle', E.PINNACLE],
  // Playoff lines
  [/contenders/, 'Contenders', E.PLAYOFF], [/(?<![a-z])absolute/, 'Absolute', E.PLAYOFF],
  [/(?<![a-z])prestige/, 'Prestige', E.PLAYOFF], [/prime cuts/, 'Prime Cuts', E.PLAYOFF],
  [/(?<![a-z])playoff/, 'Playoff', E.PLAYOFF],
  // Pacific lines
  [/crown royale/, 'Crown Royale', E.PACIFIC], [/(?<![a-z])revolution/, 'Revolution', E.PACIFIC],
  [/(?<![a-z])paramount/, 'Paramount', E.PACIFIC], [/private stock/, 'Private Stock', E.PACIFIC],
  [/(?<![a-z])prism(?![a-z])/, 'Prism', E.PACIFIC], [/(?<![a-z])pacific/, 'Pacific', E.PACIFIC],
  // Upper Deck lines
  [/sp authentic/, 'SP Authentic', 'Upper Deck'], [/sp game used/, 'SP Game Used', 'Upper Deck'],
  // The Cup is one UD product a year. Other sets merely mention the Stanley Cup
  // ("Day With the Cup", "Quest for the Cup", "Road to the Cup", "Tales of the Cup").
  [/(?<![a-z])spx/, 'SPx', 'Upper Deck'], [/(?<!(?:for|with|to|of|run for|road to) )the cup(?! (?:of|winners?|champions?|finals?))/, 'The Cup', 'Upper Deck'],
  [/black diamond/, 'Black Diamond', 'Upper Deck'], [/(?<![a-z])artifacts/, 'Artifacts', 'Upper Deck'],
  [/ultimate collection/, 'Ultimate Collection', 'Upper Deck'], [/(?<![a-z])trilogy/, 'Trilogy', 'Upper Deck'],
  [/(?<![a-z])allure/, 'Allure', 'Upper Deck'], [/(?<![a-z])engrained/, 'Engrained', 'Upper Deck'],
  [/(?<![a-z])victory/, 'Victory', 'Upper Deck'], [/(?<![a-z])synergy/, 'Synergy', 'Upper Deck'], [/(?<![a-z])stature/, 'Stature', 'Upper Deck'],
  [/upper deck ice|(?<![a-z])ice hockey/, 'Ice', 'Upper Deck'], [/(?<![a-z])compendium/, 'Compendium', 'Upper Deck'],
  [/upper deck mvp|(?<![a-z])mvp hockey/, 'MVP', 'Upper Deck'],
  [/^\s*[\d-]+\s+sp(?![a-z])|(?<![a-z])sp (legendary|top prospects|rookie|signature|championship|prospects|chirography|legend)/, 'SP', 'Upper Deck'],
  // Bare company names
  [/topps/, 'Topps', 'Topps'], [/(?<![a-z])panini/, 'Panini', 'Panini'],
  [/upper deck|(?<![a-z])ud(?![a-z])/, 'Upper Deck', 'Upper Deck']
]

// A current maker named outright in the set name wins over the timeline
// ("2025-26 Topps NBA Hoops", "Panini Playoff Contenders").
const MAKER_IN_NAME = [[/topps/, 'Topps'], [/(?<![a-z])panini/, 'Panini'], [/upper deck/, 'Upper Deck']]

// "2005-06 …" -> 2005.75 ; "1979 …" -> 1979 ; otherwise the stored year.
export function releasePoint(name, year) {
  const m = String(name || '').match(/^\s*(\d{4})(?:[-/](\d{2,4}))?\b/)
  if (m) return parseInt(m[1]) + (m[2] ? 0.75 : 0)
  return Number(year) || 0
}

function ownerAt(owner, when) {
  if (typeof owner === 'string') return owner
  for (const [before, brand] of owner) if (when < before) return brand
  return owner[owner.length - 1][1]
}

// The current maker named outright in a modern set name, if any.
function namedMaker(n, when) {
  if (when < 1989) return null
  for (const [mre, maker] of MAKER_IN_NAME) if (mre.test(n)) return maker
  return null
}

export function classifySet(name, year) {
  const n = String(name || '').toLowerCase()
  const when = releasePoint(name, year)
  const named = namedMaker(n, when)
  for (const [re, product, owner, from] of PRODUCT_MAP) {
    if (from && when < from) continue
    if (!re.test(n)) continue
    let brand = ownerAt(owner, when)
    // "2015 Topps UFC Chronicles" isn't Panini Chronicles; "Panini Torque
    // Victory Laps" isn't UD Victory. A line owned outright by another current
    // maker is skipped so the named maker's own line (or its bare name) wins.
    if (named && typeof owner === 'string' && owner !== named && MAKER_IN_NAME.some(([, m]) => m === owner)) continue
    if (typeof owner !== 'string' && when >= 1989) {
      for (const [mre, maker] of MAKER_IN_NAME) if (mre.test(n)) { brand = maker; break }
    }
    return { brand, product }
  }
  return { brand: 'Other', product: 'Other' }
}

export const brandOf = (name, year) => classifySet(name, year).brand

// Today's four makers lead the brand chips; historical makers follow A-Z.
export const CURRENT_BRANDS = ['Topps', 'Panini', 'Upper Deck', 'Leaf']
export function brandSort(a, b) {
  if (a === b) return 0
  if (a === 'Other') return 1
  if (b === 'Other') return -1
  const ia = CURRENT_BRANDS.indexOf(a), ib = CURRENT_BRANDS.indexOf(b)
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  return a.localeCompare(b)
}

export const BRAND_COLORS = {
  Panini: '#e11d48', Topps: '#ef8c1c', 'Upper Deck': '#2563eb', Leaf: '#16a34a',
  'O-Pee-Chee': '#b91c1c', Parkhurst: '#7c3aed', Fleer: '#0891b2', SkyBox: '#0ea5e9',
  Donruss: '#db2777', Pinnacle: '#9333ea', Playoff: '#c026d3', 'Donruss Playoff': '#be185d',
  Pacific: '#0d9488', Bowman: '#ca8a04', 'Pro Set': '#4f46e5', 'In The Game': '#059669', Goudey: '#a16207', 'Action Packed': '#d97706',
  Other: '#8A8A93'
}
