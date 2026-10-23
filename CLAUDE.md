# CardHQ — notes for agents working on this repo

- **Page structure:** `app/page.js` is a small *server* component that renders the client app in `app/home.js`
  and builds each URL's `<title>`, description and link preview via `lib/meta.js`. Edit the UI in `app/home.js`.
  When you add a new kind of page (a new `?param` or `?view=`), add its metadata branch in `lib/meta.js` so
  shared links and Google show that page, not the home page.
- **Set slugs are public URLs.** If an import renames or removes a set file, add `old-slug -> new-slug` to
  `public/data/redirects.json` (see `scripts/dedupe-sets.mjs`). Never delete a set file without a redirect.
- **After any data import:** run `node scripts/cleanup-names.mjs` (name/team/junk hygiene), then the normal build.
- **Colors:** small secondary text uses `#8A93A8` (passes WCAG AA on the dark background); avoid darker greys for text.
- **Grails:** collectors define their own grails; the site does not mark sets as grails.
