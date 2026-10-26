# CardHQ — notes for agents working on this repo

- **Page structure:** `app/page.js` is a small *server* component that renders the client app in `app/home.js`
  and builds each URL's `<title>`, description and link preview via `lib/meta.js`. Edit the UI in `app/home.js`.
  When you add a new kind of page (a new `?param` or `?view=`), add its metadata branch in `lib/meta.js` so
  shared links and Google show that page, not the home page.
- **Set slugs are public URLs.** If an import renames or removes a set file, add `old-slug -> new-slug` to
  `public/data/redirects.json` (see `scripts/dedupe-sets.mjs`). Never delete a set file without a redirect.
- **After any data import:** run `node scripts/cleanup-names.mjs` (name/team/junk hygiene; it ends with `fix-name-caps.mjs`,
  which restores dropped apostrophes and stray capitals — "Ed ONeill" → "Ed O'Neill", "Red WIngs" → "Red Wings" — only where the
  rest of the data backs the fix), then the normal build.
  After a Break Ninja import also run `node scripts/fix-breakninja.mjs` (its free preview stops at 250 rows — those sets
  are hidden and queued for TCDB — its tables repeat unnumbered rows, and its per-team tables come through as sections named after teams) and `node scripts/dedupe-near.mjs` (same product
  under two slugs). A set with `incompleteWhy` is hidden on purpose; cleanup scripts keep it hidden until a fuller copy replaces it.
- **Unreleased sets** (TCG spoilers, future-dated products) only hold the cards revealed so far — don't import them until release.
- **After any catalog build:** run `node scripts/catalog-prune.mjs ../catalog --write`. SportsCardsPro (`scp-*`) entries are
  price-guide pages (only cards that have sold, one insert per "set"); this drops the ones already covered by a real set,
  adds redirects, and writes `scripts/data/catalog-hole-hints.json` — players/inserts the real sets are missing.
  Both scripts also rewrite `index/visible.json` (the only catalog index the site loads — shown sets only), so pull
  `main` before a catalog run; an old script leaves new catalog sets off the site until the next run.
- **Repairing sets with holes:** `scripts/data/tcdb-hole-jobs.json` is the shared to-do list (status todo/done/review),
  highest priority first. Scrape in a tcdb.com tab with `scripts/tcdb-browser-scrape.js` (inject, then `__tcdb.queue`),
  merge with `node scripts/tcdb-repair-merge.mjs <dump>` — it only replaces a set when TCDB has ≥ the cards and covers
  ≥95% of the current ones, and marks the job. Before scraping, claim the jobs you'll take (status `claimed-<tag>`, commit +
  push) and skip any job that isn't `todo` — two agents scraping the same set doubles the TCDB cost. TCDB's rate limit is shared by every agent on this computer: run ONE
  TCDB scraper at a time, and commit job-status changes promptly so other agents skip finished sets.
- **Parallel / patch tags** (Shield, SuperFractor, Logoman…) come from section titles via `lib/parallels.js`; it only tags
  names Trevor has verified or that name patch material. Unverified look-alikes are held, not guessed. Never infer a
  SuperFractor or shield from a 1/1 print run.
- **TCDB tags glued onto names** ("Nick Leddy AU, MEM, RC, SN249Exchange card") are split by `lib/flag-tail.js` (static data via
  cleanup-names, catalog sets at load and in the player index; the description goes to the card's `d` field). Run
  `node scripts/test-flag-tail.mjs` after changing it — real names must never be chopped.
- **SuperFractor rows:** `node scripts/add-superfractors.mjs` adds them only where the set's checklist notes or
  `scripts/data/superfractor-research.json` (sourced) state them. Re-run it after any TCDB repair merge or re-import,
  since replacing a set drops these derived sections.
- **Memorabilia tags** (`scripts/classify-memorabilia.mjs`): Game-used needs evidence (TCDB note, card wording, or a maker
  source). The Upper Deck hockey "veteran memorabilia is game-used" convention covers jersey/material swatches and plain
  patches only — never shields, logos, tags, nameplates, numbers, commemorative patches (→ Unknown), and never pucks,
  net cord, glass, towels, tickets or printing plates. Manufactured lines go in `MFG_LINES` with a source URL. When in
  doubt, Unknown — not Game-used.
- **Rookie status** (`scripts/build-player-index.mjs`, player pages): a rookie card only exists in the player's rookie
  season (or the season right after, for real rookie cards of late call-ups). Rookie-looking cards outside it are tagged
  instead: **Rookie Tribute** (veteran in a rookie design: Rookie Tribute, Young Guns Renewed, Retrospective Rookies,
  Rookie Year photos), **Buyback** (always, never RC), **Prospect** (1st Bowman, draft / college / minor-league / junior,
  unlicensed pre-debut cards). Mixed "Stars and Rookies" sections outside the rookie season get no tag. An earlier product's
  rookie-season cards inserted unchanged into a later product ("2020-21 Ice Premieres" in 2021-22 Ice) stay RC. Trevor's rules.
- **Colors:** small secondary text uses `#8A93A8` (passes WCAG AA on the dark background); avoid darker greys for text.
- **Grails:** collectors define their own grails; the site does not mark sets as grails.
