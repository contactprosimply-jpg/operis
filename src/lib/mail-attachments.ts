import type { Attachment } from 'mailparser'
import type { EmailAttachment } from '@/types/database'

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export interface StoredEmailAttachment {
  filename: string
  contentType: string
  size: number
  data?: string
}

const FILE_EXT = /\.(pdf|docx?|xlsx?|xls|csv|zip|rar|7z|pptx?|txt|png|jpe?g|gif|webp|xml|dwg|dxf)$/i
const DOC_MIME = /pdf|spreadsheet|excel|word|msword|officedocument|octet-stream|zip|compressed|csv|plain/i

function isRealAttachment(att: Attachment): boolean {
  const buf = att.content
  if (!buf?.length) return false

  const contentType = att.contentType || 'application/octet-stream'
  const filename = att.filename || ''
  const size = buf.length
  const disposition = (att.contentDisposition || '').toLowerCase()

  if (disposition.includes('attachment')) return true
  if (filename && FILE_EXT.test(filename)) return true
  if (DOC_MIME.test(contentType) && size > 500) return true

  // Inline PDFs / docs without explicit disposition
  if (contentType.includes('pdf') && size > 500) return true

  // Skip tiny decorative inline images
  if (!filename && att.related && contentType.startsWith('image/') && size < 8000) return false

  return !!filename && size > 0
}

export function parseMailAttachments(parsedAttachments: Attachment[] | undefined): {
  attachments: StoredEmailAttachment[]
  hasAttachments: boolean
} {
  const attachments: StoredEmailAttachment[] = []
  const seen = new Set<string>()

  for (const att of parsedAttachments ?? []) {
    if (!isRealAttachment(att)) continue

    const filename = att.filename || att.contentId || `fichier-${attachments.length + 1}`
    const contentType = att.contentType || 'application/octet-stream'
    const buf = att.content!
    const size = buf.length
    const key = `${filename}:${size}`
    if (seen.has(key)) continue
    seen.add(key)

    const entry: StoredEmailAttachment = { filename, contentType, size }
    if (size <= MAX_ATTACHMENT_BYTES) {
      entry.data = Buffer.from(buf).toString('base64')
    }
    attachments.push(entry)
  }

  return { attachments, hasAttachments: attachments.length > 0 }
}

export function normalizeAttachments(raw: unknown): EmailAttachment[] {
  if (!raw) return []
  let parsed = raw
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { return [] }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map((att: EmailAttachment) => ({
    filename: att.filename || 'fichier',
    contentType: att.contentType || 'application/octet-stream',
    size: att.size ?? 0,
    data: att.data,
    hasData: !!(att.data || att.hasData),
  }))
}

export function toAttachmentMeta(raw: unknown): EmailAttachment[] {
  return normalizeAttachments(raw).map(({ filename, contentType, size, data, hasData }) => ({
    filename,
    contentType,
    size,
    hasData: hasData ?? !!data,
  }))
}

export function extractEmailAddress(fromText: string): string {
  const match = fromText.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase().trim()
  if (fromText.includes('@')) return fromText.toLowerCase().trim()
  return ''
}
