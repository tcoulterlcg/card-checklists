// Load one set's checklist: static file first (public/data), then the Supabase
// catalog (bulk-imported sets). Returns null when neither has it.
export async function loadSet(slug) {
  try {
    const r = await fetch('/data/' + slug + '.json')
    if (r.ok) return await r.json()
  } catch {}
  try {
    const r = await fetch('/api/catalog/set?slug=' + encodeURIComponent(slug))
    if (r.ok) return await r.json()
  } catch {}
  return null
}

// Static index + Supabase catalog index; static wins on slug collisions.
export async function loadIndex() {
  const [a, b] = await Promise.all([
    fetch('/data/index.json').then(r => r.json()).catch(() => ({ sets: [] })),
    fetch('/api/catalog/index').then(r => (r.ok ? r.json() : { sets: [] })).catch(() => ({ sets: [] })),
  ])
  const have = new Set((a.sets || []).map(s => s.slug))
  return [...(a.sets || []), ...(b.sets || []).filter(s => !have.has(s.slug))]
}
