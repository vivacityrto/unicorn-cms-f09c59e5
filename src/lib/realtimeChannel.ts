/**
 * A realtime channel name that is unique to this subscription.
 *
 * supabase-js returns the SAME channel instance when asked for a name that is already in use, and removeChannel only
 * finishes after the server acknowledges. So a screen that closes and reopens a subscription quickly (opening a
 * conversation, going back, opening it again, or React remounting in development) gets the old, already-subscribed
 * channel back, and adding a listener to it throws "cannot add postgres_changes callbacks after subscribe()", which
 * crashes the page. Giving every subscription its own name avoids the reuse entirely.
 */
export function uniqueChannelName(base: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${base}:${id}`;
}
