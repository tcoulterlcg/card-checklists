# Card HQ bulk catalog

Data-only branch. Served to the site through jsDelivr / raw.githubusercontent.com;
Vercel does not deploy this branch. Built with `scripts/catalog-build.mjs` on main.

- `manifest.json` — per-sport set/card counts and index file paths
- `index/<sport>.json` — browse entries for that sport
- `sets/<hh>/<slug>.json` — one checklist per file (hh = fnv1a(slug) & 0xff in hex)
