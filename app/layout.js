export const metadata = {
  title: 'Card HQ — Sports Card Checklists',
  description: 'Searchable sports card checklist database: baseball, football, basketball, hockey and soccer sets.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
}

// Responsive rules. Most styling is inline; these classes add the breakpoints
// inline styles can't express (!important is needed to beat inline values).
const RESPONSIVE_CSS = `
html { -webkit-text-size-adjust: 100%; }
body { overflow-x: hidden; }
.hq-aside { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto; }
.hq-filters-toggle { display: none !important; }
.hq-mobile-only { display: none !important; }
@media (max-width: 760px) {
  .hq-main { padding: 0 14px 70px !important; }
  .hq-nav { padding: 12px 0 !important; min-height: 0 !important; row-gap: 10px !important; }
  .hq-navright { width: 100%; column-gap: 16px !important; row-gap: 8px !important; }
  .hq-navlinks { width: 100%; flex-wrap: nowrap !important; overflow-x: auto; gap: 22px !important; scrollbar-width: none; }
  .hq-navlinks::-webkit-scrollbar { display: none; }
  .hq-navlinks > * { flex-shrink: 0; }
  .hq-hero { padding: 30px 0 26px !important; }
  .hq-stats { gap: 8px !important; }
  .hq-stats > div { padding: 16px 6px !important; min-width: 0; }
  .hq-stats > div > p:first-child { font-size: 28px !important; }
  .hq-stats > div > p:last-child { font-size: 9.5px !important; letter-spacing: 0.08em !important; }
  .hq-chiprow { flex-wrap: nowrap !important; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .hq-chiprow::-webkit-scrollbar { display: none; }
  .hq-chiprow > * { flex-shrink: 0; }
  .hq-setrow { gap: 10px !important; padding: 9px 12px !important; }
  .hq-col-num { flex: 0 0 64px !important; font-size: 13px; }
  .hq-col-flag { flex: 0 0 auto !important; min-width: 34px; }
  .hq-col-team { display: none !important; }
  .hq-mobile-only { display: block !important; }
  .hq-aside { position: static; max-height: none; overflow: visible; max-width: none !important; flex-basis: 100% !important; }
  .hq-aside.hq-collapsed > *:not(:first-child) { display: none !important; }
  .hq-filters-toggle { display: inline-flex !important; }
  .hq-panel { padding: 20px 18px !important; }
  input, select, textarea { font-size: 16px !important; }
}
`

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      </head>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, sans-serif", background: '#0B0E17', color: '#EDEDEF' }}>
        {children}
      </body>
    </html>
  )
}
