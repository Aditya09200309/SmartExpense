/**
 * Lightweight cross-hook invalidation bus.
 *
 * `invalidate()` fires a CustomEvent on `window`. Any data hook that called
 * `onInvalidate()` receives the payload and increments its own refetch key,
 * causing its useEffect to re-run and fetch fresh data.
 *
 * Scoped groupId avoids unnecessary requests: a balance invalidation for
 * Group A does NOT trigger refetches for Groups B or C.
 */

const INVALIDATION_EVENT = 'se:invalidate' as const

export type InvalidationResource = 'balances' | 'groups' | 'members' | 'users'

export interface InvalidationPayload {
  resource: InvalidationResource
  /** When provided, only hooks managing this specific group should refetch. */
  groupId?: string
}

const channel = new BroadcastChannel('se:invalidation_channel')

channel.onmessage = (event) => {
  window.dispatchEvent(
    new CustomEvent<InvalidationPayload>(INVALIDATION_EVENT, { detail: event.data }),
  )
}

/** Dispatch a global invalidation signal. Call this after any successful mutation. */
export function invalidate(payload: InvalidationPayload): void {
  window.dispatchEvent(
    new CustomEvent<InvalidationPayload>(INVALIDATION_EVENT, { detail: payload }),
  )
  channel.postMessage(payload)
}

/**
 * Subscribe to invalidation events. Returns an unsubscribe function suitable
 * for returning directly from a useEffect cleanup.
 */
export function onInvalidate(
  listener: (payload: InvalidationPayload) => void,
): () => void {
  function handler(e: Event) {
    listener((e as CustomEvent<InvalidationPayload>).detail)
  }
  window.addEventListener(INVALIDATION_EVENT, handler)
  return () => window.removeEventListener(INVALIDATION_EVENT, handler)
}
