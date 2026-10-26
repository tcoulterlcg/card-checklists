// Community boards and post tags. Shared by the forum UI (components/forum.js) and
// link previews (lib/meta.js). The ids must match the check constraints in
// scripts/sql/2026-10-26-community-boards.sql — add a board there first.

export const SPORT_BOARDS = [
  { id: 'hockey', name: 'Hockey', color: '#a78bfa', desc: 'Young Guns, The Cup, shields and everything on ice.' },
  { id: 'football', name: 'Football', color: '#4ade80', desc: 'Prizm, National Treasures, Kaboom and rookie classes.' },
  { id: 'baseball', name: 'Baseball', color: '#60a5fa', desc: 'Topps flagship, Bowman 1sts, Chrome and vintage.' },
  { id: 'basketball', name: 'Basketball', color: '#f97316', desc: 'Prizm, Optic, Flawless, logomen and rookie talk.' },
  { id: 'soccer', name: 'Soccer', color: '#f43f5e', desc: 'Topps Chrome UCL, Merlin, Panini stickers and more.' },
  { id: 'tcg', name: 'Pokémon & TCG', color: '#facc15', desc: 'Pokémon, Magic, Yu-Gi-Oh!, Lorcana and One Piece.' },
  { id: 'nonsport', name: 'Non-Sport', color: '#fb923c', desc: 'Marvel, Star Wars, Disney, wrestling and pop culture.' },
]
export const HOBBY_BOARDS = [
  { id: 'breaks', name: 'Breaks & Rips', abbr: 'BR', color: '#3B6EF5', desc: 'Box openings, case breaks and pack results.' },
  { id: 'mailday', name: 'Mail Day & Pickups', abbr: 'MD', color: '#3B6EF5', desc: 'Show off what just landed in your mailbox.' },
  { id: 'grading', name: 'Grading', abbr: 'GR', color: '#3B6EF5', desc: 'PSA, BGS, SGC and CGC: submissions, returns, crossovers.' },
  { id: 'ask', name: 'Ask the Hobby', abbr: 'AH', color: '#3B6EF5', desc: 'New to collecting? No question is too basic.' },
  { id: 'feedback', name: 'Site Feedback', abbr: 'SF', color: '#3B6EF5', desc: 'Feature requests and help with CardHQ itself.' },
]
export const BOARDS = [...SPORT_BOARDS, ...HOBBY_BOARDS]
export const boardById = (id) => BOARDS.find(b => b.id === id) || null

// Post tags: the label a poster picks so readers know what kind of post it is.
export const TAGS = [
  { id: 'showcase', name: 'Showcase', bg: '#2A2340', fg: '#C4B5FD', desc: 'Your pulls and grails. Link the card so it shows on the checklist.' },
  { id: 'question', name: 'Question', bg: '#1C2B4A', fg: '#93B4FF', desc: 'Ask anything about cards, sets or values.' },
  { id: 'pc', name: 'PC Update', bg: '#173328', fg: '#86EFAC', desc: 'Progress on a set build or your personal collection.' },
  { id: 'discussion', name: 'Discussion', bg: '#2A2F3D', fg: '#CBD2E0', desc: 'Open-ended hobby talk.' },
  { id: 'news', name: 'News', bg: '#3A2A16', fg: '#FCD34D', desc: 'Release dates, checklists and manufacturer news.' },
  { id: 'data', name: 'Data question', bg: '#3A1F24', fg: '#FDA4AF', desc: 'A possible checklist error. It also goes to the CardHQ review queue.' },
]
export const tagById = (id) => TAGS.find(t => t.id === id) || TAGS[3]

// Which board a set's sport belongs on (pre-fills the composer when a set is linked).
export function boardForSport(sport) {
  const s = String(sport || '').toLowerCase()
  if (s === 'hockey') return 'hockey'
  if (s === 'football') return 'football'
  if (s === 'baseball') return 'baseball'
  if (s === 'basketball') return 'basketball'
  if (s === 'soccer') return 'soccer'
  if (['pokémon', 'pokemon', 'yu-gi-oh!', 'magic', 'lorcana', 'one piece', 'tcg'].includes(s)) return 'tcg'
  if (['entertainment', 'non-sport', 'disney', 'wrestling'].includes(s)) return 'nonsport'
  return null
}

// Reddit-style "hot": votes count, but age drags a post down.
export function hotRank(p, now = Date.now()) {
  const hours = Math.max(0, (now - new Date(p.created_at).getTime()) / 3600000)
  return (Math.max(p.score || 0, 0) + 1 + (p.comment_count || 0) * 0.5) / Math.pow(hours + 2, 1.5)
}

export const RULES = [
  'Be respectful. No personal attacks or harassment.',
  'No buying, selling or trading posts.',
  'Post in the right board and pick a tag.',
  'Post your own photos, or credit the source.',
  'No spam, affiliate links or break promotion.',
]
