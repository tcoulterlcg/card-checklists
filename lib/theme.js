// CardHQ design tokens — "Cobalt" palette and type scale from the CardHQ Site Audit.
// One sans (Inter) for everything readable; Barlow Condensed only for display
// headlines, big numbers and small tracked eyebrow labels.

// Colour
export const BG = '#0B0E17'          // page background (navy-black, not pure black)
export const SURFACE = '#121626'     // cards, inputs, chips
export const SURFACE_2 = '#1A1F31'   // raised / hover / skeleton
export const LINE = '#232A3E'        // hairlines and default borders
export const CHIP_LINE = '#2E3D6B'   // accent-tinted outline (chips, focus)
export const TEXT = '#EDEDEF'        // primary text
export const TEXT_2 = '#A1A1AA'      // secondary text
export const LABEL = '#8A8A93'       // labels, captions, meta
export const ACCENT = '#3B6EF5'      // fills: buttons, active chips, bars
export const ACCENT_TEXT = '#7FA2FF' // accent used as text / links / numbers on dark

// Type
export const SANS = "'Inter', system-ui, sans-serif"
export const DISPLAY_FONT = "'Barlow Condensed', 'Arial Narrow', sans-serif"
// Display: hero + page titles + stat numbers. Uppercase, condensed, heavy.
export const display = { fontFamily: DISPLAY_FONT, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0', lineHeight: 0.95 }
// Eyebrow: small tracked labels above content ("BASEBALL · 2024", "SETS INDEXED").
export const eyebrow = { fontFamily: DISPLAY_FONT, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', lineHeight: 1.2 }
// Title: section headings and card titles. Mixed case Inter.
export const title = (size = 22) => ({ fontFamily: SANS, fontSize: size, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2, textTransform: 'none' })
// Button text.
export const buttonText = { fontFamily: SANS, fontWeight: 600, letterSpacing: '0', textTransform: 'none' }
