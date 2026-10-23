'use client'
// One dropdown for the whole site. Every menu (Brand, Product, Sort, filters on
// set and player pages) uses the same trigger button and the same panel, so
// desktop and mobile look and behave alike.
//
// The panel renders in a portal with fixed positioning measured from the
// trigger, so it is never clipped by a parent or pushed off-screen:
//   desktop  — opens below the trigger (or above when there's more room there),
//              clamped inside the viewport, scrolls when long
//   mobile   — opens as a bottom sheet with a backdrop (< 640px wide)
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ACCENT, ACCENT_TEXT, BG, SURFACE, SURFACE_2, LINE, TEXT, eyebrow, buttonText } from '../lib/theme'

const SECONDARY = '#8A93A8'
const MOBILE_MAX = 640
const GAP = 8      // space between trigger and panel
const EDGE = 8     // minimum space between panel and viewport edge

export const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
)
export const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ACCENT_TEXT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
)

// Trigger button style shared by every dropdown on the site.
export const triggerStyle = (active) => ({
  minHeight: 40, padding: '0 12px', borderRadius: 10, cursor: 'pointer', maxWidth: '100%',
  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, ...buttonText,
  background: active ? SURFACE_2 : SURFACE, color: TEXT, border: '1px solid ' + (active ? ACCENT : LINE),
  boxSizing: 'border-box'
})

// Menu row style shared by every dropdown on the site.
export const menuItem = (on, focused) => ({
  minHeight: 40, width: '100%', padding: '0 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 14, fontFamily: 'inherit',
  fontWeight: on ? 600 : 500, background: on || focused ? SURFACE_2 : 'transparent', color: on ? '#fff' : '#D4D4D8',
  border: 'none', boxSizing: 'border-box'
})

export const menuHeading = { ...eyebrow, fontSize: 12, color: SECONDARY, padding: '4px 4px 0' }

// The button that opens a dropdown: optional muted label, current value, chevron.
export function Trigger({ label, value, active, open, onClick, triggerRef, ariaLabel, style }) {
  return (
    <button ref={triggerRef} type="button" aria-haspopup="listbox" aria-expanded={!!open} aria-label={ariaLabel}
      onClick={onClick} style={{ ...triggerStyle(active), ...style }}>
      {label && <span style={{ color: active ? ACCENT_TEXT : SECONDARY, fontWeight: 500, whiteSpace: 'nowrap' }}>{label}</span>}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{value}</span>
      <Chevron />
    </button>
  )
}

export function useIsMobile() {
  const [m, setM] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(max-width: ' + (MOBILE_MAX - 1) + 'px)')
    const on = () => setM(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return m
}

// The floating panel. Positions itself against `anchorRef` and stays on screen.
export function Popover({ open, onClose, anchorRef, width = 320, maxHeight = 440, align = 'auto', title, children, padding = 8 }) {
  const panelRef = useRef(null)
  const mobile = useIsMobile()
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open || mobile) return
    const place = () => {
      const a = anchorRef.current
      if (!a) return
      const r = a.getBoundingClientRect()
      const vw = document.documentElement.clientWidth
      const vh = window.innerHeight
      const w = Math.min(width, vw - EDGE * 2)
      const right = align === 'right' || (align === 'auto' && r.left + r.width / 2 > vw / 2)
      const wantLeft = right ? r.right - w : r.left
      const left = Math.max(EDGE, Math.min(wantLeft, vw - w - EDGE))
      const below = vh - r.bottom - GAP - EDGE
      const above = r.top - GAP - EDGE
      const down = below >= Math.min(maxHeight, 280) || below >= above
      const mh = Math.max(160, Math.min(maxHeight, down ? below : above))
      setPos(down ? { left, width: w, top: r.bottom + GAP, maxHeight: mh } : { left, width: w, bottom: vh - r.top + GAP, maxHeight: mh })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, mobile, width, maxHeight, align, anchorRef])

  useEffect(() => {
    if (!open) return
    const down = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return
      onClose()
    }
    const key = (e) => { if (e.key === 'Escape') { onClose(); anchorRef.current?.focus() } }
    document.addEventListener('mousedown', down)
    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('touchstart', down)
      document.removeEventListener('keydown', key)
    }
  }, [open, onClose, anchorRef])

  // Stop the page scrolling behind the mobile sheet.
  useEffect(() => {
    if (!open || !mobile) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open, mobile])

  if (!open || typeof document === 'undefined') return null
  if (!mobile && !pos) return null

  const panelBase = {
    background: SURFACE, border: '1px solid ' + LINE, boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    boxSizing: 'border-box', overflowY: 'auto', overscrollBehavior: 'contain', padding,
    display: 'flex', flexDirection: 'column', gap: 4, color: TEXT
  }

  if (mobile) {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
        <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(5,7,12,0.6)' }} />
        <div ref={panelRef} role="dialog" aria-label={title} style={{
          ...panelBase, position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75vh',
          borderRadius: '16px 16px 0 0', borderBottom: 'none', padding: '8px 12px calc(16px + env(safe-area-inset-bottom))'
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: LINE, margin: '4px auto 8px', flexShrink: 0 }} />
          {title && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px', flexShrink: 0 }}>
              <span style={{ ...eyebrow, fontSize: 14, color: SECONDARY }}>{title}</span>
              <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: ACCENT_TEXT, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 40, padding: '0 4px' }}>Done</button>
            </div>
          )}
          {children}
        </div>
      </div>,
      document.body
    )
  }

  return createPortal(
    <div ref={panelRef} role="dialog" aria-label={title} style={{ ...panelBase, position: 'fixed', zIndex: 1000, borderRadius: 14, ...pos }}>
      {children}
    </div>,
    document.body
  )
}

// A simple single-choice dropdown: Select({ value, onChange, options }).
// options: [{ value, label }] or [value, label] pairs. Long lists get a search box.
export function Select({ value, onChange, options, label, ariaLabel, defaultValue, width = 280, searchAbove = 15, style }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(-1)
  const ref = useRef(null)
  const listRef = useRef(null)
  const mobile = useIsMobile()
  const opts = options.map(o => Array.isArray(o) ? { value: o[0], label: o[1] } : o)
  const cur = opts.find(o => String(o.value) === String(value)) || opts[0]
  const def = defaultValue !== undefined ? defaultValue : opts[0]?.value
  const active = String(value) !== String(def)
  const searchable = opts.length > searchAbove
  const needle = q.trim().toLowerCase()
  const shown = needle ? opts.filter(o => String(o.label).toLowerCase().includes(needle)) : opts

  const close = () => { setOpen(false); setQ(''); setFocus(-1) }
  const pick = (v) => { onChange(v); close(); ref.current?.focus() }

  useEffect(() => {
    if (!open) return
    setFocus(Math.max(0, shown.findIndex(o => String(o.value) === String(value))))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focus < 0 || !listRef.current) return
    listRef.current.querySelectorAll('[role="option"]')[focus]?.scrollIntoView({ block: 'nearest' })
  }, [focus])

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocus(f => Math.min(shown.length - 1, f + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus(f => Math.max(0, f - 1)) }
    else if (e.key === 'Enter' && shown[focus]) { e.preventDefault(); pick(shown[focus].value) }
  }

  return (
    <>
      <Trigger triggerRef={ref} label={label} value={cur?.label} active={active} open={open}
        ariaLabel={ariaLabel || label} onClick={() => open ? close() : setOpen(true)} style={style} />
      <Popover open={open} onClose={close} anchorRef={ref} width={width} title={ariaLabel || label}>
        <div onKeyDown={onKey} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {searchable && (
            <input type="search" autoFocus={!mobile} value={q} onChange={(e) => { setQ(e.target.value); setFocus(0) }} placeholder="Search…"
              aria-label={'Search ' + (ariaLabel || label || 'options')}
              style={{ height: 40, padding: '0 12px', marginBottom: 4, background: BG, color: TEXT, border: '1px solid ' + LINE, borderRadius: 8, fontSize: 16, boxSizing: 'border-box', flexShrink: 0 }} />
          )}
          <div ref={listRef} role="listbox" aria-label={ariaLabel || label} tabIndex={searchable ? -1 : 0} autoFocus={!searchable && !mobile}
            style={{ display: 'flex', flexDirection: 'column', gap: 2, outline: 'none' }}>
            {shown.map((o, i) => {
              const on = String(o.value) === String(value)
              return (
                <button key={String(o.value)} type="button" role="option" aria-selected={on}
                  onClick={() => pick(o.value)} onMouseEnter={() => setFocus(i)} style={menuItem(on, i === focus)}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>{on && <Check />}
                </button>
              )
            })}
            {shown.length === 0 && <span style={{ fontSize: 13, color: SECONDARY, padding: 4 }}>No matches for “{q}”.</span>}
          </div>
        </div>
      </Popover>
    </>
  )
}
