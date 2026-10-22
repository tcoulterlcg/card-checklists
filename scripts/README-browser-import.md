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
