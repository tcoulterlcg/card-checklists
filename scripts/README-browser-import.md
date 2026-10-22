# Browser-side imports (Break Ninja / TCDB / checklistcenter)

The scrape sources block server-side fetches from the build/cloud env, so these
runs happen inside Chrome (via Claude in Chrome) and the resulting JSON is
dropped into Downloads, then merged with:

    node scripts/merge-browser-dump.mjs <dump.json> [--replace-thin]
    node scripts/build-index.mjs

Dump format: array of set objects in the public/data schema
({slug,name,year,sport,source,sections:[{title,cards:[{n,p,t,x}]}]}).
An optional `replaces` field names a thinner slug to delete.

Chrome only allows one programmatic download per tab; use a fresh tab (or
BroadcastChannel to a fresh same-origin tab) per file.

## Memorabilia source (game-used / player-worn / event-worn)

    node scripts/classify-memorabilia.mjs     # writes sec.mem (and card.m overrides) into public/data

Evidence order: maker statements (CARD_OVERRIDES, debut program) > TCDB insert
notes (scripts/data/tcdb-mem-notes.json, when present) > section-title wording >
documented maker practice (Upper Deck hockey: veterans game-used, rookies
event-worn from the NHLPA Rookie Showcase; shown with * as "typical") > Unknown.
Re-run after any data import, then rebuild indexes.
