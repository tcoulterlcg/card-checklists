// /robots.txt — let search engines in, keep them out of the API routes.
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/'] },
    sitemap: 'https://cardhq.vercel.app/sitemap.xml',
  }
}
