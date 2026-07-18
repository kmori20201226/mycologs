'use client'

import { useEffect, useRef } from 'react'

const CONFIRM_MSG = '入力中の内容が破棄されます。このページを離れますか？'

// Ask the user before discarding in-progress work. Returns true when it's safe
// to leave — either nothing is dirty, or the user confirmed. Use it from a
// Link's onNavigate to gate an in-app navigation:
//   onNavigate={(e) => { if (!confirmDiscard(isDirty)) e.preventDefault() }}
export function confirmDiscard(isDirty: boolean): boolean {
  return !isDirty || window.confirm(CONFIRM_MSG)
}

// Guards the two navigation vectors a Link's onNavigate can't reach, but only
// while `isDirty`:
//   • hard unloads (refresh, tab/window close, typing a new URL) → beforeunload
//   • the browser/OS Back button, which is an in-app popstate → we pin an extra
//     history entry so the first Back lands back here and we can confirm before
//     actually leaving (re-pinning if the user stays).
// In-page <Link> clicks are handled separately via confirmDiscard + onNavigate.
export function useUnsavedChanges(isDirty: boolean): void {
  // Tracks whether our extra history entry is currently in place, so we pin
  // exactly one — React StrictMode (and any effect re-invocation) would otherwise
  // stack duplicate pins, forcing the user to press Back multiple times.
  const pinnedRef = useRef(false)

  useEffect(() => {
    if (!isDirty) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // some browsers require a value set to show the prompt
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    if (!pinnedRef.current) {
      window.history.pushState(null, '', window.location.href)
      pinnedRef.current = true
    }
    const onPopState = () => {
      if (confirmDiscard(true)) {
        // Confirmed: our pinned entry was already consumed by this Back. Detach
        // BOTH listeners before the programmatic back — otherwise the ensuing
        // navigation trips beforeunload and the browser stacks its own generic
        // prompt on top of the one we just showed. Then go back once more to
        // actually leave the page.
        pinnedRef.current = false
        window.removeEventListener('popstate', onPopState)
        window.removeEventListener('beforeunload', onBeforeUnload)
        window.history.back()
      } else {
        // Staying: the Back consumed our pin, so re-pin for the next attempt.
        window.history.pushState(null, '', window.location.href)
      }
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('popstate', onPopState)
    }
  }, [isDirty])
}
