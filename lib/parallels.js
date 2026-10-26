// Named collector parallels (patch kinds and SuperFractors), read from a section's title.
//
// Accuracy over coverage. A card gets a tag ONLY when its own section title names it,
// and ambiguous names stay untagged until verified. Nothing is inferred from a print
// run: many products have several different 1/1s (SuperFractor, Black, Black Geometric,
// FrozenFractor, printing plates), and a 1/1 patch is not always a shield.
//
//   parallelKinds(title, sport, setName, year) -> bit mask of PAR below (0 = none)
//   needsReview(title, sport, setName, year)   -> kinds held for Trevor's review (answers live in lib/parallel-review.json)
import { brandOf } from './brands.js'
import { ANSWERS } from './parallel-review.js'

// Trevor's answers for exact (set name, section title) pairs — they win over every rule below.

const answerFor = (setName, title) => ANSWERS[(setName || '') + ' || ' + (title || '')] || null

export const PAR = { SUPERFRACTOR: 1, SHIELD: 2, LOGOMAN: 4, LAUNDRY: 8, NAMEPLATE: 16, BUTTON: 32, BRAND: 64 }
export const PAR_LABEL = { SUPERFRACTOR: 'SuperFractor', SHIELD: 'Shield', LOGOMAN: 'Logoman', LAUNDRY: 'Laundry tag', NAMEPLATE: 'Nameplate', BUTTON: 'Button', BRAND: 'Brand logo' }
export const PAR_KEYS = Object.keys(PAR)

// ---- Shields -------------------------------------------------------------------------
// League shields only: hockey and football, from a maker licensed by the NHL / NFL.
// Leaf, In The Game, Sage etc. make "Shields" cards that are not league shields, and
// collegiate products carry school crests, not the NFL shield.
const UNLICENSED = new Set(['Leaf', 'In The Game', 'Sage', 'Onyx', 'Wild Card', 'Razor', 'Press Pass'])
const COLLEGIATE = /collegiate|college|ncaa|draft picks/i
// Product lines where Trevor confirmed that "Shield" sections are shield patches (2026-10-23).
const SHIELD_PRODUCTS = /the cup|ultimate collection|national treasures|flawless|immaculate|panini one\b|\bone football|gold standard/i
// Confirmed NOT shield patches.
const NOT_SHIELD = [
  [/allure/i, /shield/i],                     // Allure "1917 / 1945 / 2005 Shield" parallels
  [/./, /player caps shield/i],               // Immaculate "Rookie Player Caps Shield"
  [/./, /legends of the shield/i],            // Panini Football insert
  // Trevor's review, 2026-10-23:
  [/./, /\bpucks?\b/i],                        // Trilogy "Signature Pucks (NHL) Shield Logo" — signed pucks
  [/./, /die[\s-]?cut|hologram|acetate/i],     // Prestige "NFL Shield Die-Cut Acetate", SPx "NHL Shield Die-Cut Hologram"
  [/black diamond/i, /team logo jumbos gold shield/i]  // Black Diamond "Team Logo Jumbos Gold Shield"
]
// Confirmed shield patches outside the product lines above (Trevor's review, 2026-10-23).
const SHIELD_YES = [
  [/black diamond/i, /exquisite collection.*shield/i],   // "Exquisite Collection Rookies Jumbo Shield", "Extra Exquisite Rookie Shield"
  [/panini limited hockey/i, /^jumbo shield$/i]          // 2012-13 Panini Limited "Jumbo Shield"
]
// The title itself names patch material next to the shield ("Tags Shield", "Swatch Shield", "NFL Shield").
const PATCH_WORDS = /patch|\btags?\b|laundry|jersey|swatch|memorabilia|material|relic|booklet|threads|fabric|sweater|\bgear\b|nfl shield|nhl shield/i
// The NFLPA "Players" shield is a different logo from the NFL shield; held for review.
const SHIELD_LOOKALIKE = /players shield/i
// Shield sections numbered above 1/1 that may be metal emblems or something else; held for
// review (2026-10-23). Tandem/multi-player shields (/2) are fine and not listed here.
const SHIELD_HOLD = [
  [/./, /metal shield|\bbar\b/i],                              // The Cup "NHL Glory Metal Shield" /10, Eminence "Shield Gold/Silver Bar"
  [/impeccable/i, /shield/i],                                   // Impeccable "Silver NFL Shield" /25-35, "Gold/Silver Rookie Shield"
  [/absolute/i, /jumbo (nfl |football )?shields?/i],            // Absolute "Jumbo NFL Shields" /2-/10
  [/silhouette/i, /shield/i],                                   // Silhouette "NFL Shields" /5
  [/flawless/i, /down and dirty/i],                             // "Down and Dirty NFL Shield" /1-/8
  [/immaculate/i, /gloves shields|christmas/i],                 // "Gloves Shields / Tag", "Christmas NFL Shields Booklet"
  [/topps chrome/i, /honors .*shield/i]                         // "NFL Honors Gold Shield" relics/autos /3
]
// Makers that hold (or held) the NHL / NFL licence; anyone else's "shield" waits for review.
const LICENSED = new Set(['Upper Deck', 'Panini', 'Donruss Playoff', 'Donruss', 'Playoff', 'Topps', 'Bowman', 'Fleer', 'SkyBox', 'Pacific', 'Score', 'Pinnacle', 'O-Pee-Chee', 'Pro Set'])

function shieldState(t, sport, setName, year) {
  if (!/\bshields?\b/i.test(t)) return 0                       // 0: not mentioned
  if (sport !== 'Hockey' && sport !== 'Football') return 0
  const name = setName || ''
  const brand = brandOf(name, year)
  if (COLLEGIATE.test(name) || UNLICENSED.has(brand)) return 0
  if (NOT_SHIELD.some(([s, x]) => s.test(name) && x.test(t))) return 0
  if (SHIELD_YES.some(([s, x]) => s.test(name) && x.test(t))) return 1
  if (SHIELD_LOOKALIKE.test(t) || !LICENSED.has(brand)) return 2
  if (SHIELD_HOLD.some(([s, x]) => s.test(name) && x.test(t))) return 2
  if (SHIELD_PRODUCTS.test(name) || PATCH_WORDS.test(t)) return 1  // 1: tag
  return 2                                                     // 2: needs review
}

// ---- Buttons -------------------------------------------------------------------------
// SkyBox Metal Universe "Circle Button" / "On the Button" are card designs, not jersey buttons.
const NOT_BUTTON = /circle button|on the button/i
// Card designs named after jersey parts: Prizm "Dirty Laundry" (an insert), NASCAR "Name Plate Set".
const NOT_LAUNDRY = /dirty laundry/i
const NOT_NAMEPLATE = /name ?plate set\b/i
// Look-alikes held until verified (no MEM flags on the cards): Select "Sparks … Laundry / Nike Swoosh" prizms.
const PATCH_HOLD = (t, setName) => /\bsparks\b/i.test(t) && /\bselect\b/i.test(setName || '')

export function parallelKinds(title, sport, setName, year) {
  const t = String(title || '')
  if (!t || /printing plate|press plate/i.test(t)) return 0
  let m = 0
  const ans = answerFor(setName, t)
  if (/super[\s-]?fractor/i.test(t)) m |= PAR.SUPERFRACTOR
  if (shieldState(t, sport, setName, year) === 1) m |= PAR.SHIELD
  if (/\blogo[\s-]?man\b/i.test(t) && sport === 'Basketball') m |= PAR.LOGOMAN  // NBA logoman; not "Team Logo Manufactured"
  const held = PATCH_HOLD(t, setName)
  if (/\blaundry\b/i.test(t) && !NOT_LAUNDRY.test(t) && !held) m |= PAR.LAUNDRY
  if (/\bname ?plates?\b/i.test(t) && !NOT_NAMEPLATE.test(t)) m |= PAR.NAMEPLATE
  if (/\bbuttons?\b/i.test(t) && !NOT_BUTTON.test(t)) m |= PAR.BUTTON
  if (/\bbrand logos?\b|\bnike\b|\bswoosh\b|\bjumpman\b/i.test(t) && !held) m |= PAR.BRAND
  if (ans) for (const k in ans) { if (!PAR[k]) continue; if (ans[k]) m |= PAR[k]; else m &= ~PAR[k] }
  return m
}

// Names that look like a tag but are held until verified (used by the review report).
export function needsReview(title, sport, setName, year) {
  const t = String(title || ''), out = [], ans = answerFor(setName, t) || {}
  if (shieldState(t, sport, setName, year) === 2) out.push('SHIELD')
  if (/\blogo[\s-]?man\b/i.test(t) && sport !== 'Basketball') out.push('LOGOMAN')   // MLB "Logoman Pin", "Cap MLB Logo Man"
  if (PATCH_HOLD(t, setName) && /\blaundry\b|\bnike\b|\bswoosh\b/i.test(t)) out.push('LAUNDRY')
  return out.filter(k => !(k in ans) && !(k === 'LAUNDRY' && 'BRAND' in ans))   // answered: off the queue
}
export const parList = (mask) => PAR_KEYS.filter(k => mask & PAR[k])
