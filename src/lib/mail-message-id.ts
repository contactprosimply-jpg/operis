/** Normalise Message-ID IMAP (angle brackets cohérents). */
export function normalizeMessageId(raw: string | null | undefined, fallback?: string): string {
  const trimmed = raw?.trim()
  if (!trimmed) return fallback ?? `uid-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const bare = trimmed.replace(/^<|>$/g, '')
  if (!bare) return trimmed
  return bare.includes('@') ? `<${bare}>` : bare
}

export function messageIdLookupVariants(messageId: string): string[] {
  const normalized = normalizeMessageId(messageId)
  const bare = normalized.replace(/^<|>$/g, '')
  const variants = new Set<string>([messageId, normalized, bare, `<${bare}>`])
  return [...variants].filter(v => v.length > 0)
}

export function isDuplicateKeyError(message: string): boolean {
  return message.includes('duplicate key') || message.includes('23505')
}
