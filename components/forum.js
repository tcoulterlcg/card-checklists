'use client'
// Community boards — Reddit-style forum. Board directory (sport + hobby boards), board pages
// with Hot/New/Top and tag filters, post pages with up/down votes and threaded replies.
// Posts can link a set (and a card in it) so the discussion points back at the checklist.
// URLs: ?view=community · &board=hockey · &post=123 · &compose=1[&board=…]
// Data: lib/supa (forum*), boards/tags: lib/boards. Schema: scripts/sql/2026-10-26-community-boards.sql
import { useEffect, useMemo, useRef, useState } from 'react'
import { forumPosts, forumPost, forumBoardStats, createPost, updatePost, deletePost, myPostVotes, votePost, comments as loadComments, myCommentVotes, voteComment, addComment, editComment, removeComment, uploadCardImage, submitFeedback, isAdmin } from '../lib/supa'
import { SPORT_BOARDS, HOBBY_BOARDS, BOARDS, boardById, TAGS, tagById, boardForSport, hotRank, RULES } from '../lib/boards'
import { ACCENT, ACCENT_TEXT, SURFACE, SURFACE_2, LINE, CHIP_LINE, TEXT, TEXT_2, LABEL, display, eyebrow, title, buttonText } from '../lib/theme'
import { Select } from './dropdown'

// ---------- styles ----------
const panel = { background: SURFACE, border: '1px solid ' + LINE, borderRadius: 12 }
const btnAccent = { ...buttonText, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 18px', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }
const btnGhost = { ...buttonText, display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px', background: SURFACE, color: TEXT, border: '1px solid ' + LINE, borderRadius: 8, cursor: 'pointer', fontSize: 14 }
const linkBtn = { background: 'none', border: 0, padding: '0 8px', minHeight: 32, borderRadius: 6, color: LABEL, cursor: 'pointer', font: "500 13px 'Inter', system-ui, sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 }
const input = { background: '#0F1320', border: '1px solid ' + LINE, borderRadius: 8, color: TEXT, padding: '11px 14px', fontSize: 14, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const h2 = { ...display, fontSize: 22, letterSpacing: '0.04em', margin: 0 }
const sideH = { ...eyebrow, color: LABEL, margin: 0 }
const errText = { color: '#f87171', fontSize: 13, margin: 0 }

// ---------- icons ----------
const Ico = ({ d, size = 16, sw = 2, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const IUp = (p) => <Ico {...p} sw={2.6} d={<path d="M6 15l6-6 6 6" />} />
const IDown = (p) => <Ico {...p} sw={2.6} d={<path d="M6 9l6 6 6-6" />} />
const IComment = (p) => <Ico {...p} d={<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />} />
const IPlus = (p) => <Ico {...p} sw={2.4} d={<path d="M12 5v14M5 12h14" />} />
const ICard = (p) => <Ico {...p} d={<><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6" /></>} />
const IPin = (p) => <Ico {...p} d={<path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z" />} />
const IShare = (p) => <Ico {...p} d={<path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5" />} />

// ---------- helpers ----------
function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago'
  return new Date(ts).toLocaleDateString()
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's')
const userName = (p) => p?.profiles?.username || 'collector'
const initials = (name) => String(name || '?').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'

function readRoute() {
  if (typeof window === 'undefined') return {}
  const sp = new URLSearchParams(location.search)
  const post = parseInt(sp.get('post') || '', 10)
  const board = boardById(sp.get('board')) ? sp.get('board') : null
  return { board, post: post > 0 ? post : null, compose: sp.get('compose') === '1', set: sp.get('set') || null }
}
function routeUrl({ board, post, compose }) {
  const q = new URLSearchParams(); q.set('view', 'community')
  if (post) q.set('post', String(post))
  else { if (board) q.set('board', board); if (compose) q.set('compose', '1') }
  return location.pathname + '?' + q
}

const TagChip = ({ tag }) => { const t = tagById(tag); return <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{t.name}</span> }
const BoardDot = ({ board, size = 8 }) => <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 2, background: boardById(board)?.color || LABEL, flexShrink: 0, display: 'inline-block' }} />

// Up/down vote control. Optimistic: the score moves at once and rolls back if the save fails.
function VoteBox({ score, mine, onVote, size = 'md', horizontal = false }) {
  const big = size === 'lg', s = big ? 36 : size === 'sm' ? 30 : 32
  const col = (v) => (mine === v ? (v === 1 ? '#FF8A4C' : ACCENT_TEXT) : LABEL)
  const btn = (v, label, Icon) => (
    <button aria-label={label} aria-pressed={mine === v} onClick={(e) => { e.stopPropagation(); onVote(mine === v ? 0 : v) }} className="hq-vote"
      style={{ width: s, height: s, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 0, borderRadius: 6, color: col(v), cursor: 'pointer', padding: 0 }}>
      <Icon size={big ? 20 : size === 'sm' ? 15 : 18} />
    </button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', alignItems: 'center', gap: 2, width: horizontal ? 'auto' : (big ? 44 : 40), flexShrink: 0 }}>
      {btn(1, 'Upvote', IUp)}
      <span style={{ fontWeight: 700, fontSize: big ? 16 : size === 'sm' ? 12 : 14, color: mine === 1 ? '#FF8A4C' : mine === -1 ? ACCENT_TEXT : TEXT, minWidth: 20, textAlign: 'center' }} aria-label={score + ' points'}>{score}</span>
      {btn(-1, 'Downvote', IDown)}
    </div>
  )
}

// ---------- main view ----------
export function CommunityView({ account, indexSets, onOpenAuth, onOpenSet, onOpenPlayer }) {
  const { session, profile } = account
  const uid = session?.user?.id || null
  const [route, setRoute] = useState(readRoute)
  const [admin, setAdmin] = useState(false)
  useEffect(() => { if (uid) isAdmin().then(setAdmin); else setAdmin(false) }, [uid])
  useEffect(() => {
    const onPop = () => setRoute(readRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const go = (r) => {
    const next = { board: r.board || null, post: r.post || null, compose: !!r.compose }
    try { history.pushState(null, '', routeUrl(next)) } catch {}
    setRoute(next); window.scrollTo(0, 0)
  }
  const setsBySlug = useMemo(() => new Map((indexSets || []).map(s => [s.slug, s])), [indexSets])
  // Posting needs a username (posts show it). GrailFindr sign-ins may not have picked one yet.
  const needName = (setErr) => {
    if (!session) { onOpenAuth(); return true }
    if (profile) return false
    if (profile === undefined) { setErr('Still loading your profile. Try again in a moment; your text is still here.'); return true }
    setErr('Pick a username first. It’s how you appear in the community; your text is still here.'); onOpenAuth(); return true
  }
  const ctx = { session, uid, admin, go, setsBySlug, indexSets, onOpenAuth, onOpenSet, onOpenPlayer, needName }
  const startPost = (board) => { if (!session) { onOpenAuth(); return } go({ board, compose: true }) }

  useEffect(() => {
    const b = route.board && boardById(route.board)
    document.title = (route.compose ? 'New post' : b ? b.name + ' — Community' : 'Community') + ' — CardHQ'
  }, [route])

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: 24 }}>
      <style>{`.hq-vote:hover{background:${SURFACE_2}} .hq-bcard{transition:border-color 120ms,background 120ms} .hq-bcard:hover{border-color:${CHIP_LINE};background:#161B2D} .hq-prow:hover{border-color:${CHIP_LINE}} .hq-lb:hover{background:${SURFACE_2};color:${TEXT}} @media (max-width: 640px){.hq-post{padding:14px !important;gap:8px !important}.hq-prow{padding:12px !important;gap:8px !important}} @media (max-width: 480px){.hq-linked-cta{display:none}}`}</style>
      {route.compose ? <Composer ctx={ctx} board={route.board} />
        : route.post ? <PostPage ctx={ctx} postId={route.post} />
        : route.board ? <BoardPage ctx={ctx} board={route.board} onNew={() => startPost(route.board)} />
        : <CommunityHome ctx={ctx} onNew={() => startPost(null)} />}
    </section>
  )
}

// ---------- community home: board directory + hot across all boards ----------
function CommunityHome({ ctx, onNew }) {
  const [stats, setStats] = useState(null)
  useEffect(() => { forumBoardStats().then(setStats) }, [])
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, paddingBottom: 24, borderBottom: '1px solid #1C2233' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
          <span style={{ ...eyebrow, color: ACCENT_TEXT }}>Community</span>
          <h1 style={{ ...display, fontSize: 'clamp(36px, 6vw, 56px)', margin: 0 }}>The Hobby Board</h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: TEXT_2 }}>Talk pulls, collections, grading and checklists with other collectors. Every post can link straight to a set or card on CardHQ.</p>
        </div>
        <button style={btnAccent} onClick={onNew}><IPlus />New post</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, paddingTop: 28 }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 36 }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <h2 style={h2}>Sport boards</h2><span style={{ fontSize: 13, color: LABEL }}>Posts in the last day</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {SPORT_BOARDS.map(b => {
                const st = stats?.[b.id]
                return (
                  <button key={b.id} className="hq-bcard" onClick={() => ctx.go({ board: b.id })}
                    style={{ ...panel, display: 'flex', flexDirection: 'column', gap: 10, padding: 16, textAlign: 'left', color: TEXT, cursor: 'pointer', font: 'inherit' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <BoardDot board={b.id} size={10} />
                      <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{b.name}</span>
                      {stats && <span style={{ fontSize: 13, fontWeight: 600, color: st?.today ? ACCENT_TEXT : LABEL }}>{st?.today || 0}</span>}
                    </span>
                    <span style={{ fontSize: 13, lineHeight: 1.45, color: TEXT_2 }}>{b.desc}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 10, borderTop: '1px solid #1C2233', width: '100%', minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: LABEL }}>Latest</span>
                      <span style={{ fontSize: 13, color: st?.latest ? TEXT : LABEL, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st?.latest ? st.latest.title : 'No posts today'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={h2}>Hobby boards</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {HOBBY_BOARDS.map(b => (
                <button key={b.id} className="hq-bcard" onClick={() => ctx.go({ board: b.id })}
                  style={{ ...panel, display: 'flex', alignItems: 'flex-start', gap: 12, padding: 16, textAlign: 'left', color: TEXT, cursor: 'pointer', font: 'inherit' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: SURFACE_2, color: ACCENT_TEXT, flexShrink: 0, ...display, fontSize: 15 }}>{b.abbr}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{b.name}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.45, color: TEXT_2 }}>{b.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <PostList ctx={ctx} board={null} heading="Across all boards" />
        </div>
        <aside style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RulesPanel />
          <section style={{ ...panel, borderColor: CHIP_LINE, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 style={{ ...title(15), margin: 0 }}>Spotted a checklist error?</h2>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: TEXT_2 }}>Post it with the <strong style={{ color: TEXT }}>Data question</strong> tag. It also goes to the CardHQ review queue, and fixes go live once approved.</p>
          </section>
        </aside>
      </div>
    </>
  )
}

function RulesPanel() {
  return (
    <section style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={sideH}>Community rules</h2>
      <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, lineHeight: 1.45, color: TEXT_2 }}>
        {RULES.map(r => <li key={r}>{r}</li>)}
      </ol>
    </section>
  )
}

// ---------- board page ----------
function BoardPage({ ctx, board, onNew }) {
  const b = boardById(board)
  return (
    <>
      <div style={{ background: '#0F1320', border: '1px solid ' + LINE, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ height: 4, background: b.color }} />
        <div style={{ padding: '20px 22px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680 }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: LABEL, display: 'flex', gap: 8 }}>
              <button onClick={() => ctx.go({})} style={{ ...linkBtn, padding: 0, minHeight: 0, color: ACCENT_TEXT }}>Community</button><span aria-hidden="true">/</span><span>{b.name}</span>
            </nav>
            <h1 style={{ ...display, fontSize: 'clamp(34px, 5vw, 52px)', margin: 0 }}>{b.name}</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: TEXT_2 }}>{b.desc}</p>
          </div>
          <button style={btnAccent} onClick={onNew}><IPlus />New post</button>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, paddingTop: 24 }}>
        <div style={{ flex: '999 1 560px', minWidth: 0 }}><PostList ctx={ctx} board={board} withTags /></div>
        <aside style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 style={sideH}>Tags</h2>
            {TAGS.map(t => (
              <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ alignSelf: 'flex-start' }}><TagChip tag={t.id} /></span>
                <span style={{ fontSize: 13, lineHeight: 1.45, color: TEXT_2 }}>{t.desc}</span>
              </div>
            ))}
          </section>
          <RulesPanel />
          <section style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 style={{ ...sideH, marginBottom: 6 }}>Other boards</h2>
            {BOARDS.filter(x => x.id !== board).map(x => (
              <button key={x.id} className="hq-lb" onClick={() => ctx.go({ board: x.id })} style={{ ...linkBtn, color: TEXT, fontSize: 14, justifyContent: 'flex-start', gap: 10, minHeight: 34 }}>
                <BoardDot board={x.id} />{x.name}
              </button>
            ))}
          </section>
        </aside>
      </div>
    </>
  )
}

// ---------- post list (Hot/New/Top, optional tag filter) ----------
const SORTS = [['hot', 'Hot'], ['new', 'New'], ['top', 'Top']]
const TOP_WINDOWS = [['1', 'Today'], ['7', 'This week'], ['30', 'This month'], ['365', 'This year'], ['0', 'All time']]
function PostList({ ctx, board, withTags = false, heading }) {
  const [sort, setSort] = useState('hot')
  const [topDays, setTopDays] = useState('7')
  const [tag, setTag] = useState('all')
  const [posts, setPosts] = useState(null)
  const [votes, setVotes] = useState(() => new Map())
  const seq = useRef(0)
  const load = () => {
    const my = ++seq.current
    setPosts(null)
    forumPosts({ board, sort, topDays: Number(topDays) }).then(rows => { if (my === seq.current) setPosts(rows) })
  }
  useEffect(load, [board, sort, topDays])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!posts || posts.failed || !ctx.uid) { setVotes(new Map()); return }
    let live = true
    myPostVotes(ctx.uid, posts.map(p => p.id)).then(m => { if (live) setVotes(m) })
    return () => { live = false }
  }, [posts, ctx.uid])

  const shown = useMemo(() => {
    if (!posts || posts.failed) return posts
    let list = posts.filter(p => tag === 'all' || p.tag === tag)
    if (sort === 'hot') { const now = Date.now(); list = [...list].sort((a, b) => hotRank(b, now) - hotRank(a, now)).slice(0, 100) }
    if (board) list = [...list.filter(p => p.pinned), ...list.filter(p => !p.pinned)]   // pins lead their board
    return list
  }, [posts, tag, sort, board])

  const vote = async (p, v) => {
    if (!ctx.session) { ctx.onOpenAuth(); return }
    const prev = votes.get(p.id) || 0
    const apply = (val, delta) => {
      setVotes(m => { const n = new Map(m); if (val) n.set(p.id, val); else n.delete(p.id); return n })
      setPosts(list => list && !list.failed ? list.map(x => x.id === p.id ? { ...x, score: x.score + delta } : x) : list)
    }
    apply(v, v - prev)
    const r = await votePost(p.id, ctx.uid, v)
    if (r?.error) apply(prev, prev - v)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {heading ? <h2 style={h2}>{heading}</h2> : <span />}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Sort posts" style={{ display: 'flex', gap: 4, padding: 4, background: SURFACE, border: '1px solid ' + LINE, borderRadius: 10 }}>
            {SORTS.map(([v, label]) => (
              <button key={v} role="tab" aria-selected={sort === v} onClick={() => setSort(v)}
                style={{ minHeight: 34, padding: '0 14px', border: 0, borderRadius: 7, background: sort === v ? ACCENT : 'transparent', color: sort === v ? '#fff' : TEXT_2, font: "600 13px 'Inter', system-ui, sans-serif", cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          {sort === 'top' && <Select ariaLabel="Top posts from" value={topDays} onChange={setTopDays} options={TOP_WINDOWS} width={200} />}
        </div>
      </div>
      {withTags && (
        <div role="group" aria-label="Filter by tag" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[{ id: 'all', name: 'All' }, ...TAGS].map(t => {
            const on = tag === t.id
            return (
              <button key={t.id} aria-pressed={on} onClick={() => setTag(t.id)}
                style={{ minHeight: 34, padding: '0 12px', borderRadius: 999, border: '1px solid ' + (on ? ACCENT : LINE), background: on ? '#1A2547' : SURFACE, color: on ? TEXT : TEXT_2, font: "600 13px 'Inter', system-ui, sans-serif", cursor: 'pointer' }}>{t.name}</button>
            )
          })}
        </div>
      )}
      {!shown ? <p style={{ color: LABEL, margin: '8px 0' }}>Loading posts…</p>
        : shown.failed ? (
          <div style={{ ...panel, padding: 24, textAlign: 'center' }}>
            <p style={{ color: TEXT_2, fontSize: 14, margin: 0 }}>Couldn’t load posts. Check your connection.</p>
            <button onClick={load} style={{ ...btnGhost, marginTop: 12 }}>Try again</button>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', border: '1px dashed #2E3852', borderRadius: 12, color: LABEL, fontSize: 14 }}>
            {tag !== 'all' ? 'No posts with this tag yet.' : sort === 'top' && topDays !== '0' ? 'No posts in this window yet.' : 'No posts yet. Start the first one.'}
          </div>
        ) : shown.map(p => <PostRow key={p.id} p={p} ctx={ctx} showBoard={!board} mine={votes.get(p.id) || 0} onVote={(v) => vote(p, v)} />)}
    </section>
  )
}

function LinkedChips({ p, ctx, stop = false }) {
  const set = p.set_slug && ctx.setsBySlug.get(p.set_slug)
  if (!p.set_slug && !p.player) return null
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28, padding: '0 10px', borderRadius: 6, background: SURFACE_2, border: '1px solid ' + LINE, color: '#CBD2E0', fontSize: 12, fontWeight: 500, cursor: 'pointer', font: "500 12px 'Inter', system-ui, sans-serif" }
  const s = (fn) => (e) => { if (stop) e.stopPropagation(); fn() }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {p.set_slug && (
        <button style={chip} onClick={s(() => ctx.onOpenSet && ctx.onOpenSet(p.set_slug))} title="Open the checklist">
          <span style={{ color: ACCENT_TEXT, display: 'inline-flex' }}><ICard size={13} /></span>
          {set ? set.name : p.set_slug}{p.card_n ? ' · #' + String(p.card_n).replace(/^#/, '') : ''}
        </button>
      )}
      {p.player && <button style={chip} onClick={s(() => ctx.onOpenPlayer && ctx.onOpenPlayer(p.player))}>{p.player}</button>}
    </div>
  )
}

function PostRow({ p, ctx, showBoard, mine, onVote }) {
  const open = () => ctx.go({ post: p.id })
  const b = boardById(p.board)
  return (
    <article className="hq-prow" style={{ ...panel, display: 'flex', gap: 12, padding: '14px 16px', transition: 'border-color 120ms' }}>
      <VoteBox score={p.score} mine={mine} onVote={onVote} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: LABEL }}>
          {p.pinned && !showBoard && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ACCENT_TEXT, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}><IPin size={13} />Pinned</span>}
          {showBoard && b && (
            <button onClick={() => ctx.go({ board: b.id })} style={{ ...linkBtn, padding: 0, minHeight: 0, gap: 6, color: TEXT, fontWeight: 600, fontSize: 12 }}><BoardDot board={b.id} />{b.name}</button>
          )}
          <TagChip tag={p.tag} />
          <span>{userName(p)} · {timeAgo(p.created_at)}</span>
        </div>
        <a href={routeUrl({ post: p.id })} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); open() }}
          style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35, color: TEXT, textDecoration: 'none', overflowWrap: 'anywhere' }}>{p.title}</a>
        {p.body && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: TEXT_2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{p.body}</p>}
        <LinkedChips p={p} ctx={ctx} />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: -8 }}>
          <button className="hq-lb" style={linkBtn} onClick={open}><IComment />{plural(p.comment_count || 0, 'comment')}</button>
        </div>
      </div>
      {p.image_urls?.[0] && (
        <button onClick={open} aria-label="Open post photos" style={{ width: 92, height: 120, flexShrink: 0, borderRadius: 8, border: '1px solid #2E3852', padding: 0, overflow: 'hidden', background: SURFACE_2, cursor: 'pointer' }}>
          <img src={p.image_urls[0]} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
      )}
    </article>
  )
}

// ---------- post page ----------
function PostPage({ ctx, postId }) {
  const [post, setPost] = useState(undefined)     // undefined loading · null gone · {failed}
  const [mine, setMine] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [err, setErr] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const load = () => forumPost(postId).then(setPost)
  useEffect(() => { setPost(undefined); load() }, [postId])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!post || post.failed || !ctx.uid) { setMine(0); return }
    myPostVotes(ctx.uid, [post.id]).then(m => setMine(m.get(post.id) || 0))
  }, [post?.id, ctx.uid])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (post && !post.failed) document.title = post.title + ' — CardHQ Community' }, [post])

  if (post === undefined) return <p style={{ color: LABEL }}>Loading post…</p>
  if (post === null || post.failed) return (
    <div style={{ ...panel, padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <p style={{ ...title(18), margin: 0 }}>{post === null ? 'This post was removed or doesn’t exist.' : 'Couldn’t load this post.'}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        {post?.failed && <button style={btnGhost} onClick={() => { setPost(undefined); load() }}>Try again</button>}
        <button style={btnAccent} onClick={() => ctx.go({})}>Back to Community</button>
      </div>
    </div>
  )

  const b = boardById(post.board)
  const own = ctx.uid && post.user_id === ctx.uid
  const set = post.set_slug && ctx.setsBySlug.get(post.set_slug)
  const vote = async (v) => {
    if (!ctx.session) { ctx.onOpenAuth(); return }
    const prev = mine
    setMine(v); setPost(p => ({ ...p, score: p.score + v - prev }))
    const r = await votePost(post.id, ctx.uid, v)
    if (r?.error) { setMine(prev); setPost(p => ({ ...p, score: p.score - v + prev })) }
  }
  const saveEdit = async () => {
    if (busy) return
    if (draftTitle.trim().length < 3) { setErr('The title needs at least 3 characters.'); return }
    setBusy(true); setErr('')
    const r = await updatePost(post.id, { title: draftTitle.trim(), body: draftBody.trim() || null })
    setBusy(false)
    if (r?.error) { setErr('Couldn’t save: ' + r.error.message); return }
    setEditing(false); load()
  }
  const del = async () => {
    setBusy(true)
    const r = await deletePost(post.id)
    setBusy(false); setConfirmDel(false)
    if (r?.error) { setErr('Couldn’t delete this post: ' + r.error.message); return }
    ctx.go({ board: post.board })
  }
  const togglePin = async () => { const r = await updatePost(post.id, { pinned: !post.pinned }); if (r?.error) setErr('Couldn’t change the pin: ' + r.error.message); else load() }
  const share = async () => {
    const url = location.origin + routeUrl({ post: post.id })
    try { if (navigator.share) { await navigator.share({ title: post.title, url }); return } } catch { return }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  return (
    <>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: LABEL, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => ctx.go({})} style={{ ...linkBtn, padding: 0, minHeight: 0, color: ACCENT_TEXT }}>Community</button><span aria-hidden="true">/</span>
        {b && <button onClick={() => ctx.go({ board: b.id })} style={{ ...linkBtn, padding: 0, minHeight: 0, color: ACCENT_TEXT }}><BoardDot board={b.id} />{b.name}</button>}
      </nav>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <article className="hq-post" style={{ ...panel, borderRadius: 14, display: 'flex', gap: 14, padding: 20 }}>
            <VoteBox score={post.score} mine={mine} onVote={vote} size="lg" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: LABEL }}>
                <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: SURFACE_2, color: ACCENT_TEXT, fontWeight: 700, fontSize: 11 }}>{initials(userName(post))}</span>
                <span style={{ color: TEXT, fontWeight: 600 }}>{userName(post)}</span>
                <span>{timeAgo(post.created_at)}{post.edited_at ? ' · edited' : ''}</span>
                {post.pinned && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: ACCENT_TEXT, fontWeight: 700 }}><IPin size={13} />Pinned</span>}
              </div>
              <span style={{ alignSelf: 'flex-start' }}><TagChip tag={post.tag} /></span>
              {editing ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  <input style={input} maxLength={120} aria-label="Title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
                  <textarea style={{ ...input, minHeight: 140, resize: 'vertical', lineHeight: 1.5 }} maxLength={5000} aria-label="Post text" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} />
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={{ ...btnAccent, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={saveEdit}>{busy ? 'Saving…' : 'Save'}</button>
                    <button style={btnGhost} onClick={() => { setEditing(false); setErr('') }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 style={{ ...title(26), margin: 0, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{post.title}</h1>
                  {post.image_urls?.length > 0 && (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {post.image_urls.map((u, i) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: '1px solid #2E3852', background: SURFACE_2 }}>
                          <img src={u} alt={'Photo ' + (i + 1) + ' of ' + post.image_urls.length} loading="lazy" style={{ display: 'block', maxWidth: 'min(100%, 320px)', maxHeight: 420, objectFit: 'contain' }} />
                        </a>
                      ))}
                    </div>
                  )}
                  {post.body && <div style={{ fontSize: 15, lineHeight: 1.6, color: '#D4D8E2', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 720 }}>{post.body}</div>}
                </>
              )}
              {post.set_slug && (
                <button onClick={() => ctx.onOpenSet && ctx.onOpenSet(post.set_slug)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: '#0F1320', border: '1px solid ' + CHIP_LINE, borderRadius: 10, color: TEXT, maxWidth: 560, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 52, borderRadius: 6, background: SURFACE_2, border: '1px solid #2E3852', color: ACCENT_TEXT, flexShrink: 0 }}><ICard size={18} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                    <span style={{ ...eyebrow, fontSize: 11, color: ACCENT_TEXT }}>{post.card_n || post.card_section ? 'Linked card' : 'Linked set'}</span>
                    {(post.card_n || post.card_section) && <span style={{ fontSize: 14, fontWeight: 600 }}>{[post.card_n && '#' + String(post.card_n).replace(/^#/, ''), post.player, post.card_section].filter(Boolean).join(' · ')}</span>}
                    <span style={{ fontSize: post.card_n || post.card_section ? 12 : 14, fontWeight: post.card_n || post.card_section ? 400 : 600, color: post.card_n || post.card_section ? LABEL : TEXT }}>{set ? set.name : post.set_slug}</span>
                  </span>
                  <span className="hq-linked-cta" style={{ fontSize: 13, fontWeight: 600, color: ACCENT_TEXT, flexShrink: 0 }}>Open checklist</span>
                </button>
              )}
              {post.player && !post.card_n && !post.card_section && (
                <div><button onClick={() => ctx.onOpenPlayer && ctx.onOpenPlayer(post.player)} style={{ ...btnGhost, minHeight: 36, fontSize: 13 }}>{post.player}: all cards</button></div>
              )}
              {err && <p role="alert" style={errText}>{err}</p>}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: -8, alignItems: 'center' }}>
                <span style={{ ...linkBtn, cursor: 'default' }}><IComment />{plural(post.comment_count || 0, 'comment')}</span>
                <button className="hq-lb" style={linkBtn} onClick={share}><IShare />{copied ? 'Link copied' : 'Share'}</button>
                {own && !editing && <button className="hq-lb" style={linkBtn} onClick={() => { setDraftTitle(post.title); setDraftBody(post.body || ''); setEditing(true) }}>Edit</button>}
                {ctx.admin && <button className="hq-lb" style={linkBtn} onClick={togglePin}>{post.pinned ? 'Unpin' : 'Pin'}</button>}
                {(own || ctx.admin) && (confirmDel ? (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, paddingLeft: 8 }}>
                    <span style={{ color: TEXT_2 }}>Delete this post?</span>
                    <button onClick={del} disabled={busy} style={{ background: '#7f1d1d', border: 'none', color: '#fff', borderRadius: 6, minHeight: 32, padding: '0 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                    <button onClick={() => setConfirmDel(false)} style={{ ...linkBtn, border: '1px solid ' + LINE }}>Cancel</button>
                  </span>
                ) : <button className="hq-lb" style={linkBtn} onClick={() => setConfirmDel(true)}>{own ? 'Delete' : 'Remove'}</button>)}
              </div>
            </div>
          </article>
          <CommentThread ctx={ctx} post={post} onCountChange={(d) => setPost(p => ({ ...p, comment_count: Math.max(0, (p.comment_count || 0) + d) }))} />
        </div>
        <aside style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {set && (
            <section style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 style={sideH}>On the checklist</h2>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{set.name}</span>
              {set.cardCount != null && <span style={{ fontSize: 13, color: TEXT_2 }}>{Number(set.cardCount).toLocaleString()} cards{set.sport ? ' · ' + set.sport : ''}</span>}
              <button style={{ ...btnGhost, minHeight: 40, background: '#1A2547', borderColor: CHIP_LINE, justifyContent: 'center' }} onClick={() => ctx.onOpenSet && ctx.onOpenSet(post.set_slug)}>Open checklist</button>
            </section>
          )}
          <MoreFromBoard ctx={ctx} board={post.board} not={post.id} />
          <RulesPanel />
        </aside>
      </div>
    </>
  )
}

function MoreFromBoard({ ctx, board, not }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { forumPosts({ board, sort: 'new', limit: 6 }).then(setRows) }, [board])
  const b = boardById(board)
  const list = rows && !rows.failed ? rows.filter(r => r.id !== not).slice(0, 5) : []
  if (!list.length) return null
  return (
    <section style={{ ...panel, padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2 style={sideH}>More from {b?.name}</h2>
      {list.map(r => (
        <button key={r.id} className="hq-lb" onClick={() => ctx.go({ post: r.id })} style={{ ...linkBtn, color: TEXT, fontSize: 14, lineHeight: 1.4, textAlign: 'left', padding: '6px 8px', marginLeft: -8, minHeight: 0, display: 'block', overflowWrap: 'anywhere' }}>{r.title}</button>
      ))}
    </section>
  )
}

// ---------- comments (threaded) ----------
function CommentThread({ ctx, post, onCountChange }) {
  const [rows, setRows] = useState(null)
  const [votes, setVotes] = useState(() => new Map())
  const [sort, setSort] = useState('best')
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => loadComments(post.id).then(setRows)
  useEffect(() => { setRows(null); load() }, [post.id])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!rows || rows.failed || !ctx.uid) { setVotes(new Map()); return }
    myCommentVotes(ctx.uid, rows.map(r => r.id)).then(setVotes)
  }, [rows, ctx.uid])

  const tree = useMemo(() => {
    if (!rows || rows.failed) return []
    const kids = new Map()
    for (const r of rows) { const k = r.parent_id || 0; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(r) }
    const order = sort === 'new' ? (a, b) => new Date(b.created_at) - new Date(a.created_at)
      : (a, b) => (b.score - a.score) || (new Date(a.created_at) - new Date(b.created_at))
    for (const list of kids.values()) list.sort(order)
    const build = (pid) => (kids.get(pid) || []).map(r => ({ ...r, children: build(r.id) }))
    return build(0)
  }, [rows, sort])

  const post_ = async (body, parentId, setLocalErr) => {
    if (ctx.needName(setLocalErr)) return false
    const r = await addComment(post.id, ctx.uid, body, parentId)
    if (r?.error) { setLocalErr('Couldn’t post your comment: ' + r.error.message + '. Your text is still here.'); return false }
    onCountChange(1); load(); return true
  }
  const submitTop = async () => {
    const t = draft.trim(); if (!t || busy) return
    setBusy(true); setErr('')
    const ok = await post_(t, null, setErr)
    setBusy(false)
    if (ok) setDraft('')
  }
  const vote = async (c, v) => {
    if (!ctx.session) { ctx.onOpenAuth(); return }
    const prev = votes.get(c.id) || 0
    const apply = (val, delta) => {
      setVotes(m => { const n = new Map(m); if (val) n.set(c.id, val); else n.delete(c.id); return n })
      setRows(list => list && !list.failed ? list.map(x => x.id === c.id ? { ...x, score: x.score + delta } : x) : list)
    }
    apply(v, v - prev)
    const r = await voteComment(c.id, ctx.uid, v)
    if (r?.error) apply(prev, prev - v)
  }
  const tctx = { ...ctx, votes, vote, post_, reload: load, onCountChange, opId: post.user_id }

  return (
    <section aria-label="Comments" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ctx.session ? (
        <div style={{ ...panel, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label htmlFor="hq-reply" style={{ fontSize: 13, color: LABEL }}>Add a comment</label>
          <textarea id="hq-reply" rows={3} maxLength={1000} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add to the discussion"
            style={{ ...input, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }} />
          {err && <p role="alert" style={errText}>{err}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ ...btnAccent, minHeight: 38, opacity: busy || !draft.trim() ? 0.6 : 1 }} disabled={busy || !draft.trim()} onClick={submitTop}>{busy ? 'Posting…' : 'Comment'}</button>
          </div>
        </div>
      ) : (
        <div style={{ ...panel, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: TEXT_2 }}>Sign in to join the discussion.</span>
          <button style={{ ...btnAccent, minHeight: 38 }} onClick={ctx.onOpenAuth}>Sign in</button>
        </div>
      )}
      {rows && !rows.failed && rows.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: LABEL }}>
          <span>Sort by</span>
          <Select ariaLabel="Sort comments" value={sort} onChange={setSort} options={[['best', 'Best'], ['new', 'Newest']]} width={180} />
        </div>
      )}
      {!rows ? <p style={{ color: LABEL, margin: 0 }}>Loading comments…</p>
        : rows.failed ? <p style={{ color: TEXT_2, margin: 0 }}>Couldn’t load comments. <button onClick={load} style={{ ...linkBtn, color: ACCENT_TEXT }}>Try again</button></p>
        : rows.length === 0 ? <p style={{ color: LABEL, margin: 0, fontSize: 14 }}>No comments yet.</p>
        : <div style={{ display: 'flex', flexDirection: 'column' }}>{tree.map(c => <CommentNode key={c.id} c={c} depth={0} t={tctx} />)}</div>}
    </section>
  )
}

const MAX_INDENT = 6
function CommentNode({ c, depth, t }) {
  const [collapsed, setCollapsed] = useState(false)
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const own = t.uid && c.user_id === t.uid && !c.deleted
  const name = c.deleted ? '[deleted]' : (c.profiles?.username || 'collector')
  const mine = t.votes.get(c.id) || 0
  const count = (n) => n.children.reduce((s, k) => s + 1 + count(k), 0)

  const sendReply = async () => {
    const v = text.trim(); if (!v || busy) return
    setBusy(true); setErr('')
    const ok = await t.post_(v, c.id, setErr)
    setBusy(false)
    if (ok) { setText(''); setReplying(false) }
  }
  const saveEdit = async () => {
    const v = text.trim(); if (!v || busy) return
    setBusy(true); setErr('')
    const r = await editComment(c.id, v)
    setBusy(false)
    if (r?.error) { setErr('Couldn’t save: ' + r.error.message); return }
    setEditing(false); t.reload()
  }
  const del = async () => {
    setBusy(true)
    const hasReplies = c.children.length > 0
    const r = await removeComment(c.id, hasReplies)
    setBusy(false); setConfirmDel(false)
    if (r?.error) { setErr('Couldn’t delete: ' + r.error.message); return }
    if (!hasReplies) t.onCountChange(-1)
    t.reload()
  }

  return (
    <div style={{ display: 'flex' }}>
      {depth > 0 && depth <= MAX_INDENT && (
        <button aria-label={collapsed ? 'Expand thread' : 'Collapse thread'} onClick={() => setCollapsed(x => !x)}
          style={{ width: 24, flexShrink: 0, display: 'flex', justifyContent: 'center', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
          <span style={{ width: 2, height: '100%', background: LINE }} />
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, padding: '10px 0 6px' }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 999, background: SURFACE_2, color: c.deleted ? LABEL : ACCENT_TEXT, fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{c.deleted ? '–' : initials(name)}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: LABEL }}>
              <span style={{ color: c.deleted ? LABEL : TEXT, fontWeight: 600, fontSize: 13 }}>{name}</span>
              {!c.deleted && c.user_id === t.opId && <span style={{ padding: '1px 6px', borderRadius: 4, background: '#1A2547', color: ACCENT_TEXT, fontWeight: 700 }}>OP</span>}
              <span>{timeAgo(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
              {collapsed && <button onClick={() => setCollapsed(false)} style={{ ...linkBtn, minHeight: 0, padding: 0, color: ACCENT_TEXT, fontSize: 12 }}>+ {plural(count(c) + 1, 'comment')} hidden</button>}
            </div>
            {!collapsed && (editing ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <textarea aria-label="Edit comment" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} style={{ ...input, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btnAccent, minHeight: 34, fontSize: 13 }} disabled={busy} onClick={saveEdit}>Save</button>
                  <button style={{ ...btnGhost, minHeight: 34, fontSize: 13 }} onClick={() => { setEditing(false); setErr('') }}>Cancel</button>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: c.deleted ? LABEL : '#D4D8E2', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontStyle: c.deleted ? 'italic' : 'normal' }}>{c.deleted ? 'This comment was deleted.' : c.body}</p>
            ))}
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginLeft: -6 }}>
                {!c.deleted && <VoteBox score={c.score} mine={mine} onVote={(v) => t.vote(c, v)} size="sm" horizontal />}
                {!c.deleted && <button className="hq-lb" style={{ ...linkBtn, fontSize: 12, fontWeight: 600 }} onClick={() => { if (!t.session) { t.onOpenAuth(); return } setEditing(false); setText(''); setReplying(r => !r) }}>Reply</button>}
                {own && <button className="hq-lb" style={{ ...linkBtn, fontSize: 12, fontWeight: 600 }} onClick={() => { setReplying(false); setText(c.body); setEditing(true) }}>Edit</button>}
                {(own || (t.admin && !c.deleted)) && (confirmDel ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, paddingLeft: 6 }}>
                    <span style={{ color: TEXT_2 }}>Delete?</span>
                    <button onClick={del} disabled={busy} style={{ background: '#7f1d1d', border: 'none', color: '#fff', borderRadius: 6, minHeight: 28, padding: '0 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                    <button onClick={() => setConfirmDel(false)} style={{ ...linkBtn, fontSize: 12 }}>Cancel</button>
                  </span>
                ) : <button className="hq-lb" style={{ ...linkBtn, fontSize: 12, fontWeight: 600 }} onClick={() => setConfirmDel(true)}>{own ? 'Delete' : 'Remove'}</button>)}
              </div>
            )}
            {err && <p role="alert" style={errText}>{err}</p>}
            {replying && !collapsed && (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                <textarea aria-label={'Reply to ' + name} rows={3} maxLength={1000} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply"
                  style={{ ...input, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...btnAccent, minHeight: 34, fontSize: 13, opacity: busy || !text.trim() ? 0.6 : 1 }} disabled={busy || !text.trim()} onClick={sendReply}>{busy ? 'Posting…' : 'Reply'}</button>
                  <button style={{ ...btnGhost, minHeight: 34, fontSize: 13 }} onClick={() => { setReplying(false); setErr('') }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
        {!collapsed && c.children.map(k => <CommentNode key={k.id} c={k} depth={depth + 1} t={t} />)}
      </div>
    </div>
  )
}

// ---------- composer ----------
function Composer({ ctx, board: initialBoard }) {
  const [board, setBoard] = useState(initialBoard || '')
  const [tag, setTag] = useState('')
  const [postTitle, setPostTitle] = useState('')
  const [body, setBody] = useState('')
  const [setQuery, setSetQuery] = useState('')
  const [chosenSet, setChosenSet] = useState(null)
  const [player, setPlayer] = useState('')
  const [cardN, setCardN] = useState('')
  const [images, setImages] = useState([])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const matches = useMemo(() => {
    const q = setQuery.trim().toLowerCase()
    if (q.length < 2 || chosenSet) return []
    const words = q.split(/\s+/)
    return (ctx.indexSets || []).filter(s => { const n = s.name.toLowerCase(); return words.every(w => n.includes(w)) }).slice(0, 8)
  }, [setQuery, ctx.indexSets, chosenSet])

  if (!ctx.session) return (
    <div style={{ ...panel, padding: 28, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <p style={{ ...title(18), margin: 0 }}>Sign in to post</p>
      <button style={btnAccent} onClick={ctx.onOpenAuth}>Sign in</button>
    </div>
  )

  const pickSet = (s) => {
    setChosenSet(s); setSetQuery('')
    if (!board) { const b = boardForSport(s.sport); if (b) setBoard(b) }
  }
  const addPhotos = async (files) => {
    const list = [...files].slice(0, 6 - images.length)
    if (!list.length) return
    setUploading(true); setErr('')
    const urls = []
    for (const f of list) {
      const r = await uploadCardImage(ctx.uid, f)
      if (r.error) { setErr('Couldn’t add ' + f.name + ': ' + r.error.message); break }
      urls.push(r.url)
    }
    setImages(x => [...x, ...urls].slice(0, 6)); setUploading(false)
  }
  const submit = async () => {
    if (busy || uploading) return
    setErr('')
    if (!board) { setErr('Pick a board.'); return }
    if (!tag) { setErr('Pick a tag so people know what kind of post this is.'); return }
    if (postTitle.trim().length < 3) { setErr('Add a title (at least 3 characters).'); return }
    if (ctx.needName(setErr)) return
    setBusy(true)
    const row = {
      board, tag, title: postTitle.trim(), body: body.trim() || null,
      set_slug: chosenSet?.slug || null, player: player.trim() || null, card_n: chosenSet && cardN.trim() ? cardN.trim().replace(/^#/, '') : null,
      image_urls: images,
    }
    const r = await createPost(ctx.uid, row)
    if (r?.error) { setBusy(false); setErr('Couldn’t post: ' + r.error.message + '. Your draft is still here.'); return }
    // Data questions also land in the review queue, so a checklist fix never depends on someone reading the board.
    if (tag === 'data') {
      await submitFeedback({
        kind: 'wrong_info', message: (row.title + (row.body ? '\n\n' + row.body : '')).slice(0, 2000),
        set_slug: row.set_slug, set_name: chosenSet?.name || null, card_n: row.card_n, player: row.player,
        page_url: location.origin + routeUrl({ post: r.data.id }), details: { source: 'community', post_id: r.data.id },
      })
    }
    setBusy(false)
    ctx.go({ post: r.data.id })
  }
  const field = { display: 'flex', flexDirection: 'column', gap: 6 }
  const lab = { fontSize: 13, fontWeight: 600, color: TEXT }
  const hint = { fontSize: 12, color: LABEL }

  return (
    <>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: LABEL, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => ctx.go({})} style={{ ...linkBtn, padding: 0, minHeight: 0, color: ACCENT_TEXT }}>Community</button><span aria-hidden="true">/</span><span>New post</span>
      </nav>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        <div style={{ flex: '999 1 560px', minWidth: 0, ...panel, borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 style={{ ...display, fontSize: 36, margin: 0 }}>New post</h1>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ ...field, flex: '1 1 220px' }}>
              <span style={lab} id="hq-board-l">Board</span>
              <Select ariaLabel="Board" value={board || '__none'} onChange={(v) => setBoard(v === '__none' ? '' : v)} width={320} style={{ width: '100%' }}
                options={[['__none', 'Choose a board'], ...SPORT_BOARDS.map(b => [b.id, b.name]), ...HOBBY_BOARDS.map(b => [b.id, b.name])]} />
            </div>
          </div>
          <div style={field}>
            <span style={lab}>Tag</span>
            <div role="radiogroup" aria-label="Tag" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TAGS.map(t => {
                const on = tag === t.id
                return (
                  <button key={t.id} role="radio" aria-checked={on} onClick={() => setTag(t.id)} title={t.desc}
                    style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, border: '1px solid ' + (on ? t.fg : LINE), background: on ? t.bg : SURFACE, color: on ? t.fg : TEXT_2, font: "600 13px 'Inter', system-ui, sans-serif", cursor: 'pointer' }}>{t.name}</button>
                )
              })}
            </div>
            <span style={hint}>{tag ? tagById(tag).desc : 'What kind of post is this?'}</span>
          </div>
          <div style={field}>
            <label style={lab} htmlFor="hq-title">Title</label>
            <input id="hq-title" style={input} maxLength={120} value={postTitle} onChange={(e) => setPostTitle(e.target.value)} placeholder="e.g. Finally finished my 2015-16 Young Guns set" />
          </div>
          <div style={field}>
            <label style={lab} htmlFor="hq-body">Text <span style={{ color: LABEL, fontWeight: 400 }}>(optional)</span></label>
            <textarea id="hq-body" style={{ ...input, minHeight: 160, resize: 'vertical', lineHeight: 1.5 }} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Tell the story, ask the question, share the details." />
          </div>
          <div style={field}>
            <span style={lab}>Photos <span style={{ color: LABEL, fontWeight: 400 }}>(optional, up to 6)</span></span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {images.map((u, i) => (
                <div key={u} style={{ position: 'relative', width: 80, height: 104, borderRadius: 8, overflow: 'hidden', border: '1px solid #2E3852' }}>
                  <img src={u} alt={'Photo ' + (i + 1)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button aria-label={'Remove photo ' + (i + 1)} onClick={() => setImages(x => x.filter(y => y !== u))}
                    style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 999, border: 0, background: 'rgba(11,14,23,0.85)', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
              ))}
              {images.length < 6 && (
                <button style={{ ...btnGhost, minHeight: 40, opacity: uploading ? 0.6 : 1 }} disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Add photos'}</button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(e) => { addPhotos(e.target.files || []); e.target.value = '' }} />
            </div>
          </div>
          <div style={{ ...field, padding: 16, background: '#0F1320', border: '1px solid ' + LINE, borderRadius: 10, gap: 12 }}>
            <span style={lab}>Link a set or card <span style={{ color: LABEL, fontWeight: 400 }}>(optional)</span></span>
            <span style={{ ...hint, marginTop: -6 }}>Linked posts point readers straight to the checklist.</span>
            <div style={{ position: 'relative' }}>
              {chosenSet ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '0 12px', background: SURFACE, border: '1px solid ' + CHIP_LINE, borderRadius: 8 }}>
                  <span style={{ color: ACCENT_TEXT, display: 'inline-flex' }}><ICard /></span>
                  <span style={{ flex: 1, fontSize: 14, minWidth: 0 }}>{chosenSet.name}</span>
                  <button onClick={() => { setChosenSet(null); setCardN('') }} style={{ ...linkBtn, color: TEXT_2 }}>Change</button>
                </div>
              ) : (
                <input style={input} aria-label="Search for a set" placeholder="Search sets, e.g. 2015 the cup" value={setQuery} onChange={(e) => setSetQuery(e.target.value)} />
              )}
              {matches.length > 0 && (
                <div role="listbox" aria-label="Matching sets" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 5, background: SURFACE, border: '1px solid ' + LINE, borderRadius: 10, overflow: 'hidden', boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
                  {matches.map(s => (
                    <button key={s.slug} role="option" aria-selected="false" onClick={() => pickSet(s)} className="hq-lb"
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 13px', fontSize: 13, color: TEXT, background: 'none', border: 0, borderBottom: '1px solid #1C2233', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {s.name} <span style={{ color: LABEL }}>· {Number(s.cardCount || 0).toLocaleString()} cards</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ ...field, flex: '2 1 200px' }}>
                <label style={{ ...hint, color: TEXT_2 }} htmlFor="hq-player">Player or character</label>
                <input id="hq-player" style={input} maxLength={200} value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="e.g. Connor McDavid" />
              </div>
              <div style={{ ...field, flex: '1 1 120px' }}>
                <label style={{ ...hint, color: TEXT_2 }} htmlFor="hq-cardn">Card #</label>
                <input id="hq-cardn" style={{ ...input, opacity: chosenSet ? 1 : 0.5 }} maxLength={40} disabled={!chosenSet} value={cardN} onChange={(e) => setCardN(e.target.value)} placeholder={chosenSet ? 'e.g. 93' : 'Pick a set first'} />
              </div>
            </div>
          </div>
          {tag === 'data' && <p style={{ margin: 0, fontSize: 13, color: '#FDA4AF', lineHeight: 1.5 }}>Data questions also go to the CardHQ review queue. Link the set so the fix can be checked.</p>}
          {err && <p role="alert" style={errText}>{err}</p>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button style={{ ...btnAccent, opacity: busy || uploading ? 0.6 : 1 }} disabled={busy || uploading} onClick={submit}>{busy ? 'Posting…' : 'Post'}</button>
            <button style={btnGhost} onClick={() => history.length > 1 ? history.back() : ctx.go({ board: initialBoard })}>Cancel</button>
          </div>
        </div>
        <aside style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <RulesPanel />
        </aside>
      </div>
    </>
  )
}
