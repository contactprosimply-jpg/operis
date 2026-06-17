export const MAIL_UNREAD_CHANGED_EVENT = 'operis:mail-unread-changed'

export function emitMailUnreadChanged(count?: number) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MAIL_UNREAD_CHANGED_EVENT, { detail: { count } }))
}
