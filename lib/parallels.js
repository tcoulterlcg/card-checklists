// Named collector parallels (patch kinds and SuperFractors), read from a section's title.
//
// Rule: a card gets a tag ONLY when its own section title names it. Nothing is inferred
// from a print run — many products have several different 1/1s (SuperFractor, Black,
// Black Geometric, printing plates, FrozenFractor), and a 1/1 patch is not always a shield.
//
//   parallelKinds(title, sport, setName, year) -> bit mask of PAR below (0 = none)
import { brandOf } from './brands.js'

export const PAR = { SUPERFRACTOR: 1, SHIELD: 2, LOGOMAN: 4, LAUNDRY: 8, NAMEPLATE: 16, BUTTON: 32, BRAND: 64 }
export const PAR_LABEL = { SUPERFRACTOR: 'SuperFractor', SHIELD: 'Shield', LOGOMAN: 'Logoman', LAUNDRY: 'Laundry tag', NAMEPLATE: 'Nameplate', BUTTON: 'Button', BRAND: 'Brand logo' }

// Only league-licensed makers can use the NHL / NFL shield. Leaf, In The Game, Sage etc.
// make "Shields" cards (Leaf Superlative "Spectacular Shields") that are not league shields.
const UNLICENSED = new Set(['Leaf', 'In The Game', 'Sage', 'Onyx', 'Wild Card', 'Razor', 'Press Pass'])

export function parallelKinds(title, sport, setName, year) {
  const t = String(title || '')
  if (!t || /printing plate|press plate/i.test(t)) return 0
  let m = 0
  if (/super[\s-]?fractor/i.test(t)) m |= PAR.SUPERFRACTOR
  // League shield: hockey and football only, never from an unlicensed maker.
  if (/\bshields?\b/i.test(t) && (sport === 'Hockey' || sport === 'Football') && !UNLICENSED.has(brandOf(setName || '', year))) m |= PAR.SHIELD
  // "Logoman" / "Logo Man" — but not "Team Logo Manufactured".
  if (/\blogo[\s-]?man\b/i.test(t)) m |= PAR.LOGOMAN
  if (/\blaundry\b/i.test(t)) m |= PAR.LAUNDRY
  if (/\bname ?plates?\b/i.test(t)) m |= PAR.NAMEPLATE
  if (/\bbuttons?\b/i.test(t)) m |= PAR.BUTTON
  if (/\bbrand logos?\b|\bnike\b|\bswoosh\b|\bjumpman\b/i.test(t)) m |= PAR.BRAND
  return m
}

export const parList = (mask) => Object.keys(PAR).filter(k => mask & PAR[k])
