import type { Attachment } from 'mailparser'

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

export interface StoredEmailAttachment {
  filename: string
  contentType: string
  size: number
  data?: string
}

export function parseMailAttachments(parsedAttachments: Attachment[] | undefined): {
  attachments: StoredEmailAttachment[]
  hasAttachments: boolean
} {
  const attachments: StoredEmailAttachment[] = []

  for (const att of parsedAttachments ?? []) {
    if (att.type === 'attachment' || att.content) {
      const filename = att.filename || att.contentId || 'fichier'
      const contentType = att.contentType || 'application/octet-stream'
      const buf = att.content
      const size = buf?.length ?? 0
      const entry: StoredEmailAttachment = { filename, contentType, size }
      if (buf && size > 0 && size <= MAX_ATTACHMENT_BYTES) {
        entry.data = Buffer.from(buf).toString('base64')
      }
      attachments.push(entry)
    }
  }

  return { attachments, hasAttachments: attachments.length > 0 }
}

export function extractEmailAddress(fromText: string): string {
  const match = fromText.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase().trim()
  if (fromText.includes('@')) return fromText.toLowerCase().trim()
  return ''
}
