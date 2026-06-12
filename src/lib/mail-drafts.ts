export interface MailDraft {
  id: string
  to: string
  cc: string
  subject: string
  body: string
  updatedAt: string
}

const PREFIX = 'operis-mail-drafts:'

export function loadDrafts(userId: string): MailDraft[] {
  try {
    const raw = localStorage.getItem(PREFIX + userId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MailDraft[]
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : []
  } catch {
    return []
  }
}

export function saveDrafts(userId: string, drafts: MailDraft[]) {
  localStorage.setItem(PREFIX + userId, JSON.stringify(drafts))
}

export function upsertDraft(userId: string, draft: MailDraft) {
  const list = loadDrafts(userId)
  const idx = list.findIndex(d => d.id === draft.id)
  if (idx >= 0) list[idx] = draft
  else list.unshift(draft)
  saveDrafts(userId, list.slice(0, 20))
}

export function removeDraft(userId: string, draftId: string) {
  saveDrafts(userId, loadDrafts(userId).filter(d => d.id !== draftId))
}

export function newDraftId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function htmlToPlainText(html: string): string {
  if (!html.includes('<')) return html
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}
