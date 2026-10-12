import { useSyncExternalStore } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

function getPathname() {
  return window.location.pathname
}

/** Client-side navigation: updates history and re-renders without a reload. */
export function navigate(path: string, { replace = false } = {}) {
  if (path === window.location.pathname + window.location.hash) {
    return
  }

  if (replace) {
    window.history.replaceState(null, '', path)
  } else {
    window.history.pushState(null, '', path)
  }

  notify()
}

/** Current pathname; re-renders on navigation and browser back/forward. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, getPathname)
}
