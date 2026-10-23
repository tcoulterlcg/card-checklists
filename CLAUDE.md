# CardHQ — notes for agents working on this repo

- **Page structure:** `app/page.js` is a small *server* component that renders the client app in `app/home.js`
  and builds each URL's `<title>`, description and link preview via `lib/meta.js`. Edit the UI in `app/home.js`.
  When you add a new kind of page (a new `?param` or `?view=`), add its metadata branch in `lib/meta.js` so
  shared links and Google show that page, not the home page.
- **Set slugs are public URLs.** If an import renames or removes a set file, add `old-slug -> new-slug` to
  `public/data/redirects.json` (see `scripts/dedupe-sets.mjs`). Never delete a set file without a redirect.
- **After any data import:** run `node scripts/cleanup-names.mjs` (name/team/junk hygiene), then the normal build.
  After a Break Ninja import also run `node scripts/fix-breakninja.mjs` (its free preview stops at 250 rows — those sets
  are hidden and queued for TCDB — and its tables repeat unnumbered rows) and `node scripts/dedupe-near.mjs` (same product
  under two slugs). A set with `incompleteWhy` is hidden on purpose; cleanup scripts keep it hidden until a fuller copy replaces it.
- **Unreleased sets** (TCG spoilers, future-dated products) only hold the cards revealed so far — don't import them until release.
- **After any catalog build:** run `node scripts/catalog-prune.mjs ../catalog --write`. SportsCardsPro (`scp-*`) entries are
  price-guide pages (only cards that have sold, one insert per "set"); this drops the ones already covered by a real set,
  adds redirects, and writes `scripts/data/catalog-hole-hints.json` — players/inserts the real sets are missing.
- **Repairing sets with holes:** `scripts/data/tcdb-hole-jobs.json` is the shared to-do list (status todo/done/review),
  highest priority first. Scrape in a tcdb.com tab with `scripts/tcdb-browser-scrape.js` (inject, then `__tcdb.queue`),
  merge with `node scripts/tcdb-repair-merge.mjs <dump>` — it only replaces a set when TCDB has ≥ the cards and covers
  ≥95% of the current ones, and marks the job. Before scraping, claim the jobs you'll take (status `claimed-<tag>`, commit +
  push) and skip any job that isn't `todo` — two agents scraping the same set doubles the TCDB cost. TCDB's rate limit is shared by every agent on this computer: run ONE
  TCDB scraper at a time, and commit job-status changes promptly so other agents skip finished sets.
- **Parallel / patch tags** (Shield, SuperFractor, Logoman…) come from section titles via `lib/parallels.js`; it only tags
  names Trevor has verified or that name patch material. Unverified look-alikes are held, not guessed. Never infer a
  SuperFractor or shield from a 1/1 print run.
- **SuperFractor rows:** `node scripts/add-superfractors.mjs` adds them only where the set's checklist notes or
  `scripts/data/superfractor-research.json` (sourced) state them. Re-run it after any TCDB repair merge or re-import,
  since replacing a set drops these derived sections.
- **Memorabilia tags** (`scripts/classify-memorabilia.mjs`): Game-used needs evidence (TCDB note, card wording, or a maker
  source). The Upper Deck hockey "veteran memorabilia is game-used" convention covers jersey/material swatches and plain
  patches only — never shields, logos, tags, nameplates, numbers, commemorative patches (→ Unknown), and never pucks,
  net cord, glass, towels, tickets or printing plates. Manufactured lines go in `MFG_LINES` with a source URL. When in
  doubt, Unknown — not Game-used.
- **Colors:** small secondary text uses `#8A93A8` (passes WCAG AA on the dark background); avoid darker greys for text.
- **Grails:** collectors define their own grails; the site does not mark sets as grails.
