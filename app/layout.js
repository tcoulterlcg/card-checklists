export const metadata = {
  title: 'Checklist HQ — Sports Card Checklists',
  description: 'Searchable sports card checklist database: baseball, football, basketball, hockey and soccer sets.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, fontFamily: "'Inter', system-ui, sans-serif", background: '#0a0a0a', color: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  )
}
