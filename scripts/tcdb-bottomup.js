// Bottom-up TCDB new-set scraper (work laptop lane). Inject on https://www.tcdb.com/DefaultError404.html (no ads).
// Loader: (0,eval)(await (await fetch(RAW+"scripts/tcdb-bottomup.js?t="+Date.now())).text())
// Options set before injecting: window.__order (sports), window.__minYear ({Sport:year}), window.__gen0.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  window.__gen = (window.__gen0 || 400);
  const g = window.__gen;
  window.__of = window.fetch.bind(window);
  window.__thr = { gap: 1500, floor: 1500, next: 0, ok: 0, blk: 0, run: 0 };
  window.__log = []; window.__fail = []; window.__ra = [];
  window.__Q = []; window.__imp = []; window.__expIdx = 0; window.__pending = [];
  const RAW = "https://raw.githubusercontent.com/trevorcoulter42-creator/card-checklists/main/";
  window.__deferred = window.__seedDeferred || await (await window.__of(RAW + "scripts/data/bottomup/deferred-wildcard.json?t=" + Date.now())).json();
  window.__held = window.__seedHeld || await (await window.__of(RAW + "scripts/data/bottomup/held-unreleased.json?t=" + Date.now())).json();
  window.__rev = [];
  window.__order = window.__order || ["Soccer","Racing","Cricket","Non-Sport"];
  window.__minYear = window.__minYear || {};
  window.__bstat = { sport: null, year: null, found: 0, queued: 0, done: false, perSport: {} };

  // repo scraper (rowsOf / flagsToX)
  const src = await (await window.__of('https://raw.githubusercontent.com/trevorcoulter42-creator/card-checklists/main/scripts/tcdb-browser-scrape.js?t=' + Date.now())).text();
  (0, eval)(src);

  // have-set: everything already on the site (catalog visible + static index), same key as catalog-build.mjs
  const STOP = new Set(['and', 'the', 'card', 'cards', 'trading', 'checklist', 'checklists', 'x', 'edition', 'series', 'set', 'mlb', 'nba', 'nfl', 'nhl', 'mma', 'autographed', 'photo', 'box', 'ud', 'upper', 'deck', 'panini', 'topps', 'hobby', 'entertainment', 'baseball', 'basketball', 'football', 'hockey', 'soccer', 'racing', 'wrestling', 'golf', 'tennis', 'boxing', 'ufc', 'non', 'sport', 'scp']);
  const slugify = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const key = (slug, sport) => { const toks = slug.toLowerCase().replace(/^(\d{2})-(\d{2})-/, "20$1-").replace(/(^|-)((?:19|20)\d{2})-\d{2}(?=-)/, "$1$2").split("-").filter(t => t && !STOP.has(t)); return (sport || "") + "|" + (toks.filter(t => !/^\d{4}$/.test(t)).length ? toks.sort().join("-") : "slug:" + slug.toLowerCase()) };
  window.__key = key; window.__slugify = slugify;
  const vis = await (await window.__of('https://raw.githubusercontent.com/trevorcoulter42-creator/card-checklists/catalog/index/visible.json?t=' + Date.now())).json();
  const stat = await (await window.__of('https://raw.githubusercontent.com/trevorcoulter42-creator/card-checklists/main/public/data/index.json?t=' + Date.now())).json();
  window.__have = new Set();
  for (const s of (vis.sets || [])) window.__have.add(key(s.slug, s.sport));
  for (const s of (stat.sets || [])) window.__have.add(key(s.slug, s.sport));
  for (const d of window.__deferred.concat(window.__held)) window.__have.add('sid:' + (d.sid ?? d[0]));
  const NS = new Set(['Entertainment','Lorcana','Magic','One Piece','Pokémon','Yu-Gi-Oh!']);
  for (const s of (stat.sets || [])) if (NS.has(s.sport)) window.__have.add(key(s.slug, 'Non-Sport'));

  // throttle (slot-reserving AIMD; 15s global pause on 429/challenge)
  window.__go = async (u) => {
    const T = window.__thr;
    for (let i = 1; i <= 10; i++) {
      const now = Date.now(); const slot = Math.max(now, T.next); T.next = slot + T.gap;
      if (slot > now) await sleep(slot - now);
      try {
        const r = await window.__of(u, { credentials: 'include' });
        if (r.status === 404 || /Error404/.test(r.url)) return null;
        const h = await r.text();
        if (r.ok && !/<title>\s*Just a moment/i.test(h)) {
          T.ok++; T.run++; T.gap = Math.max(T.floor, T.gap * 0.97);
          if (T.run >= 60 && T.floor > 600) { T.floor = Math.max(600, T.floor * 0.93); T.run = 0 }
          return new DOMParser().parseFromString(h, 'text/html');
        }
        T.blk++; T.run = 0; window.__log.push('ch ' + r.status); if (window.__log.length > 200) window.__log.shift();
        T.floor = Math.min(4000, T.floor * 1.1); T.gap = T.floor * 1.2;
        T.next = Math.max(T.next, Date.now() + 15000 * Math.min(i, 3));
      } catch (e) { window.__log.push('err'); await sleep(5000) }
    }
    window.__fail.push(u); return null;
  };

  window.__checklist = async (sid, path) => {
    const all = [], seen = new Set();
    for (let pg = 1; pg <= 80; pg++) {
      const d = await window.__go('/Checklist.cfm/sid/' + sid + '/' + path + (pg > 1 ? '?PageIndex=' + pg : ''));
      if (!d) return pg === 1 ? null : all;
      let fresh = 0;
      for (const c of window.__tcdb.rowsOf(d)) { const k = c.n + '|' + c.p + '|' + (c.t || '') + '|' + (c.x || ''); if (!seen.has(k)) { seen.add(k); all.push(c); fresh++ } }
      const hasNext = [...d.querySelectorAll('a')].some(a => (a.getAttribute('href') || '').includes('PageIndex=' + (pg + 1)));
      if (!hasNext || !fresh) break;
    }
    return all;
  };

  window.__scrapeSet = async (t) => {
    const ins = await window.__go('/Inserts.cfm/sid/' + t.sid + '/' + t.path);
    const subs = new Map();
    if (ins) for (const a of ins.querySelectorAll('a[href*="/sid/"]')) {
      const m = (a.getAttribute('href') || '').match(/^\/(?:Checklist|ViewSet)\.cfm\/sid\/(\d+)\/([^/?#]+)/);
      const title = a.textContent.replace(/\s+/g, ' ').trim();
      if (m && title && m[1] !== String(t.sid) && !subs.has(m[1])) subs.set(m[1], { title, path: m[2] });
    }
    const base = await window.__checklist(t.sid, t.path);
    const sections = []; if (base && base.length) sections.push({ title: 'Base', cards: base });
    const pre = t.name + ' ';
    for (const [sid, { title, path }] of subs) {
      const cards = await window.__checklist(sid, path);
      if (cards && cards.length) sections.push({ title: title.startsWith(pre) ? title.slice(pre.length) : title, cards });
    }
    return sections;
  };

  window.__enq = (x) => {
    if (/^\d{4}(-\d{2})? Wild Card /.test(x.name)) window.__deferred.push(x);
    else if (+x.year >= 2027) window.__held.push(x);
    else if (+x.year >= 2026) window.__rev.push(x);
    else window.__Q.push(x);
  };

  window.__builder = async () => {
    const B = window.__bstat, seen = new Set();
    for (const sp of window.__order) {
      B.sport = sp; B.perSport[sp] = { found: 0, queued: 0 };
      const yd = await window.__go('/ViewAll.cfm/sp/' + encodeURIComponent(sp) + '?MODE=Years');
      if (!yd) continue;
      const years = [...new Set([...yd.querySelectorAll('a[href*="/year/"]')].map(a => +(((a.getAttribute('href') || '').match(/\/year\/(\d{4})/) || [])[1])).filter(Boolean))].sort((a, b) => a - b);
      B.perSport[sp].years = years.length;
      for (const y of years.filter(y => y >= (window.__minYear[sp] || 0))) {
        while (window.__Q.length > 300) { if (window.__gen !== g) return; await sleep(10000) }
        if (window.__gen !== g) return;
        B.year = y;
        const d = await window.__go('/ViewAll.cfm/sp/' + encodeURIComponent(sp) + '/year/' + y);
        if (!d) continue;
        for (const a of d.querySelectorAll('a[href*="/ViewSet.cfm/sid/"]')) {
          const m = (a.getAttribute('href') || '').match(/\/ViewSet\.cfm\/sid\/(\d+)\/([^/?#]+)/);
          const name = a.textContent.replace(/\s+/g, ' ').trim();
          if (!m || !name || seen.has(m[1])) continue;
          seen.add(m[1]); B.found++; B.perSport[sp].found++;
          if (window.__have.has('sid:' + m[1]) || window.__have.has(key(slugify(name), sp))) continue;
          B.queued++; B.perSport[sp].queued++;
          window.__enq({ sid: m[1], path: m[2], name, year: y, sport: sp });
        }
      }
    }
    B.done = true;
  };

  window.__worker = async (gen, n) => {
    while (window.__gen === gen) {
      const t = window.__Q.shift();
      if (!t) { if (window.__bstat.done) return; await sleep(5000); continue }
      try {
        const sections = await window.__scrapeSet(t);
        if (sections.length) window.__imp.push({ sid: t.sid, name: t.name, year: t.year, sport: t.sport, sections });
        else window.__imp.push({ sid: t.sid, name: t.name, sport: t.sport, err: 'empty' });
      } catch (e) { window.__imp.push({ sid: t.sid, name: t.name, sport: t.sport, err: String(e).slice(0, 200) }) }
    }
  };

  window.__builder();
  window.__worker(g, 1); window.__worker(g, 2);
  window.__rebuilt = { at: new Date().toISOString(), have: window.__have.size, deferred: window.__deferred.length, held: window.__held.length };
})().catch(e => { window.__rebuildErr = String(e) });
'started'
