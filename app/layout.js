export const metadata = {
  title: 'Card HQ — Sports Card Checklists',
  description: 'Searchable sports card checklist database: baseball, football, basketball, hockey and soccer sets.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0E17',
}

// Responsive rules. Most styling is inline; these classes add the breakpoints
// inline styles can't express (!important is needed to beat inline values).
const RESPONSIVE_CSS = `
html { -webkit-text-size-adjust: 100%; }
body { overflow-x: clip; }
.hq-aside { position: sticky; top: 76px; max-height: calc(100vh - 128px); overflow-y: auto; }
.hq-filters-toggle { display: none !important; }
.hq-mobile-only { display: none !important; }

/* Header (spec: CardHQ Header, Claude Design) */
.hq-header { position: sticky; top: 0; z-index: 50; background: rgba(11,14,23,0.85); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border-bottom: 1px solid transparent; transition: border-color 150ms; }
.hq-header.hq-scrolled { border-bottom-color: #1C2233; }
.hq-header-inner { max-width: 1180px; margin: 0 auto; padding: 0 24px; height: 64px; display: flex; align-items: center; box-sizing: border-box; }
.hq-lockup { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; text-decoration: none; border-radius: 6px; }
.hq-wordmark { font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; font-weight: 800; font-size: 26px; line-height: 1; letter-spacing: 0.01em; color: #ECEEF3; padding-top: 2px; }
.hq-navlinks { display: flex; align-items: stretch; gap: 4px; height: 64px; margin-left: 40px; }
.hq-navlink { position: relative; display: inline-flex; align-items: center; height: 64px; padding: 0 12px; background: none; border: 0; cursor: pointer; font-family: 'Inter', system-ui, sans-serif; font-size: 14px; font-weight: 500; letter-spacing: 0; white-space: nowrap; color: #A3ABBD; transition: color 120ms; border-radius: 6px; }
.hq-navlink:hover, .hq-navlink[aria-current="page"] { color: #ECEEF3; }
.hq-navlink[aria-current="page"]::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px; background: #3B6EF5; border-radius: 2px 2px 0 0; }
.hq-header-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.hq-hsearch { display: flex; align-items: center; gap: 8px; width: 240px; height: 36px; box-sizing: border-box; padding: 0 10px 0 12px; background: #121623; border: 1px solid #232A3D; border-radius: 8px; transition: border-color 120ms, opacity 150ms; }
.hq-hsearch:hover { border-color: #2E3852; }
.hq-hsearch:focus-within { border-color: #3B6EF5; }
.hq-hsearch input { flex: 1; min-width: 0; background: none; border: 0; outline: none; color: #ECEEF3; font: 400 13px 'Inter', system-ui, sans-serif; }
.hq-hsearch input::placeholder { color: #6F788C; }
.hq-hsearch kbd { font: 500 11px 'IBM Plex Mono', ui-monospace, monospace; color: #8A93A8; border: 1px solid #2A3247; border-radius: 4px; padding: 1px 5px; }
.hq-hsearch.hq-hidden { opacity: 0; pointer-events: none; }
.hq-signin { height: 36px; padding: 0 16px; box-sizing: border-box; background: #151A27; border: 1px solid #2A3247; border-radius: 8px; color: #ECEEF3; font: 600 14px 'Inter', system-ui, sans-serif; cursor: pointer; white-space: nowrap; transition: background 120ms, border-color 120ms; }
.hq-signin:hover { background: #1C2233; border-color: #3A4562; }
.hq-signin:active { background: #121623; }
.hq-iconbtn { display: none; width: 44px; height: 44px; align-items: center; justify-content: center; background: none; border: 0; border-radius: 8px; color: #ECEEF3; cursor: pointer; }
.hq-iconbtn[aria-expanded="true"] { background: #151A27; }
.hq-header :focus-visible { outline: 2px solid #7FA2FF; outline-offset: -6px; border-radius: 6px; }
.hq-sheet { position: fixed; left: 0; right: 0; top: 56px; height: calc(100dvh - 56px); background: #0B0E17; z-index: 49; display: flex; flex-direction: column; padding: 12px 8px 0; box-sizing: border-box; }
.hq-sheet-row { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 12px; border-radius: 8px; background: none; border: 0; color: #A3ABBD; font: 500 16px 'Inter', system-ui, sans-serif; cursor: pointer; text-align: left; }
.hq-sheet-row[aria-current="page"] { background: #151A27; color: #ECEEF3; }
.hq-sheet-row[aria-current="page"]::after { content: ''; width: 6px; height: 6px; border-radius: 999px; background: #3B6EF5; }
.hq-sheet-foot { margin-top: auto; padding: 16px 8px; border-top: 1px solid #1C2233; }
.hq-sheet-foot .hq-signin { width: 100%; height: 48px; border-radius: 10px; font-size: 15px; }

/* Bottom line news ticker */
.hq-bottomline { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; height: 40px; display: flex; align-items: stretch; background: rgba(11,14,23,0.94); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); border-top: 1px solid #1C2233; }
@keyframes hqcrawl { from { transform: translateX(var(--from)) } to { transform: translateX(var(--to)) } }
.hq-bottomline:hover .hq-bl-track { animation-play-state: paused !important; }
.hq-bl-track a:hover { color: #fff !important; text-decoration: underline !important; text-underline-offset: 3px; }
@keyframes hqflip { from { transform: rotateX(90deg); opacity: 0 } to { transform: rotateX(0); opacity: 1 } }
.hq-bl-label { animation: hqflip 260ms ease-out; transform-origin: 50% 50%; }

@media (max-width: 760px) {
  .hq-main { padding: 0 14px 70px !important; }
  .hq-hero { padding: 30px 0 26px !important; }
  .hq-stats { gap: 16px 28px !important; }
  .hq-stats > div > p:first-child { font-size: 30px !important; }
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
  .hq-bl-label { min-width: 0 !important; padding: 0 12px !important; }
}
@media (max-width: 639px) {
  .hq-header { border-bottom-color: #1C2233; }
  .hq-header-inner { height: 56px; padding: 0 8px 0 16px; }
  .hq-lockup { gap: 8px; }
  .hq-lockup svg { width: 22px; height: 22px; }
  .hq-wordmark { font-size: 22px; }
  .hq-navlinks, .hq-hsearch, .hq-header-right .hq-signin, .hq-header-right .hq-account { display: none !important; }
  .hq-header-right { gap: 4px; }
  .hq-iconbtn { display: inline-flex; }
  .hq-sheet .hq-signin { display: block; }
}
`

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=IBM+Plex+Mono:wght@500&family=Inter:wght@400;500;600;700;800&display=swap"
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
