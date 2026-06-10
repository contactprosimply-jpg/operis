export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function clampString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  return value.slice(0, maxLen)
}

export function validateTitle(title: unknown): string | null {
  if (typeof title !== 'string' || !title.trim()) return 'Titre requis'
  if (title.length > 200) return 'Titre trop long (max 200 caractères)'
  return null
}

export function validateMailBody(body: unknown): string | null {
  if (body === undefined || body === null || body === '') return null
  if (typeof body !== 'string') return 'Corps du message invalide'
  if (body.length > 100000) return 'Message trop long (max 100 000 caractères)'
  return null
}

export function rejectUnexpectedFields(
  body: Record<string, unknown>,
  allowed: string[],
): string | null {
  const extra = Object.keys(body).filter(k => !allowed.includes(k))
  if (extra.length > 0) {
    return `Champs non autorisés : ${extra.join(', ')}`
  }
  return null
}

export function badRequest(message: string) {
  return Response.json({ success: false, error: message }, { status: 400 })
}
