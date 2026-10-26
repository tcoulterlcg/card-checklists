'use client'
import { useEffect } from 'react'

// Modal dialogs: move keyboard focus into the dialog when it opens (first field, else the first
// button) and keep Tab inside it until it closes. Callers restore focus to the opener on close.
const FOCUSABLE = 'input:not([type=hidden]):not([tabindex="-1"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"]), a[href], [tabindex="0"]'

export function useDialogFocus(ref, open) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      const box = ref.current
      if (!box || box.contains(document.activeElement)) return
      const all = [...box.querySelectorAll(FOCUSABLE)]
      const first = all.find(el => el.getAttribute('aria-label') !== 'Close') || all[0]
      if (first) first.focus()
    }, 0)
    const onTab = (e) => {
      if (e.key !== 'Tab' || !ref.current) return
      const all = [...ref.current.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null)
      if (!all.length) return
      const first = all[0], last = all[all.length - 1]
      if (!ref.current.contains(document.activeElement)) {
        const owner = document.activeElement && document.activeElement.closest('[role="dialog"]')
        if (owner && owner !== ref.current) return   // another dialog on top (or a dropdown menu opened from this one) owns Tab
        e.preventDefault(); first.focus()
      }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onTab)
    return () => { clearTimeout(t); document.removeEventListener('keydown', onTab) }
  }, [open])
}
