# CardHQ — notes for agents working on this repo

- **Page structure:** `app/page.js` is a small *server* component that renders the client app in `app/home.js`
  and builds each URL's `<title>`, description and link preview via `lib/meta.js`. Edit the UI in `app/home.js`.
  When you add a new kind of page (a new `?param` or `?view=`), add its metadata branch in `lib/meta.js` so
  shared links and Google show that page, not the home page.
- **Set slugs are public URLs.** If an import renames or removes a set file, add `old-slug -> new-slug` to
  `public/data/redirects.json` (see `scripts/dedupe-sets.mjs`). Never delete a set file without a redirect.
- **After any data import:** run `node scripts/cleanup-names.mjs` (name/team/junk hygiene), then the normal build.
- **After any catalog build:** run `node scripts/catalog-prune.mjs ../catalog --write`. SportsCardsPro (`scp-*`) entries are
  price-guide pages (only cards that have sold, one insert per "set"); this drops the ones already covered by a real set,
  adds redirects, and writes `scripts/data/catalog-hole-hints.json` — players/inserts the real sets are missing.
- **Repairing sets with holes:** `scripts/data/tcdb-hole-jobs.json` is the shared to-do list (status todo/done/review),
  highest priority first. Scrape in a tcdb.com tab with `scripts/tcdb-browser-scrape.js` (inject, then `__tcdb.queue`),
  merge with `node scripts/tcdb-repair-merge.mjs <dump>` — it only replaces a set when TCDB has ≥ the cards and covers
  ≥95% of the current ones, and marks the job. TCDB's rate limit is shared by every agent on this computer: run ONE
  TCDB scraper at a time, and commit job-status changes promptly so other agents skip finished sets.
- **Colors:** small secondary text uses `#8A93A8` (passes WCAG AA on the dark background); avoid darker greys for text.
- **Grails:** collectors define their own grails; the site does not mark sets as grails.
