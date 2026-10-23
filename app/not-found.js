// Branded 404 for unknown paths (every real page lives at "/" with a ?query).
export const metadata = { title: 'Page not found — CardHQ', robots: { index: false } }

export default function NotFound() {
  return (
    <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#0B0E17' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontWeight: 800, fontSize: 64, letterSpacing: '0.02em', margin: 0, color: '#ECEEF3' }}>404</p>
        <p style={{ fontSize: 16, color: '#A3ABBD', margin: '8px 0 24px' }}>That page isn’t here. Every checklist, player and set is searchable from the home page.</p>
        <a href="/" style={{ display: 'inline-block', background: '#3B6EF5', color: '#fff', textDecoration: 'none', fontWeight: 600, borderRadius: 10, padding: '10px 18px' }}>Go to CardHQ</a>
      </div>
    </main>
  )
}
