/**
 * Filtre pièces jointes mail : exclut logos de signature des documents AO.
 * Règle : n'enregistrer que les vraies PJ (disposition attachment + nom de fichier,
 * ou types documentaires PDF/Office/ZIP, ou images volumineuses en attachment).
 */

export const SIGNATURE_IMAGE_MAX_BYTES = 51200 // ~50 Ko
export const SIGNATURE_IMAGE_MAX_PX = 250

const IMAGE_EXT_END = /\.(png|jpe?g|gif|webp|bmp|ico|svg)$/i
const IMAGE_EXT_ANY = /\.(png|jpe?g|gif|webp|bmp|ico|svg)(@|$)/i
const DOC_EXT_END = /\.(pdf|docx?|xlsx?|xls|csv|zip|rar|7z|pptx?|txt|xml|dwg|dxf)$/i
const DOC_EXT_ANY = /\.(pdf|docx?|xlsx?|xls|csv|zip|rar|7z|pptx?|txt|xml|dwg|dxf)(@|$)/i
const DOC_MIME = /pdf|spreadsheet|excel|word|msword|officedocument|zip|compressed|csv|plain|xml/i
const OUTLOOK_INLINE_NAME = /^(image\d+|att\d+|logo|signature|spacer|blank)\.(png|jpe?g|gif)/i
const GENERATED_FILENAME = /^fichier-\d+$/i

export type AttachmentFilterInput = {
  filename: string
  contentType?: string
  size?: number
  contentDisposition?: string
  contentId?: string
}

export function normalizeContentId(cid: string): string {
  return cid.replace(/^<|>$/g, '').trim().toLowerCase()
}

/** Content-IDs référencés via cid: dans le HTML du mail. */
export function extractCidsFromHtml(html: string): Set<string> {
  const cids = new Set<string>()
  if (!html) return cids
  const re = /cid:([^"'\s>]+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    cids.add(normalizeContentId(m[1]))
  }
  return cids
}

function dispositionOf(raw?: string): string {
  return (raw ?? '').toLowerCase().trim()
}

function isAttachmentDisposition(disposition: string): boolean {
  return disposition.includes('attachment')
}

function isInlineDisposition(disposition: string): boolean {
  if (!disposition) return false
  return disposition.includes('inline') && !disposition.includes('attachment')
}

function isImageFile(filename: string, contentType?: string): boolean {
  if (contentType?.startsWith('image/')) return true
  if (IMAGE_EXT_END.test(filename)) return true
  if (IMAGE_EXT_ANY.test(filename)) return true
  return false
}

/** PNG (inline signature, logo mail…) — proposé en intégration optionnelle à l'AO. */
export function isPngAttachment(filename: string, contentType?: string): boolean {
  const ct = (contentType ?? '').toLowerCase()
  if (ct === 'image/png' || ct.includes('png')) return true
  if (/\.png(@|$)/i.test(filename)) return true
  if (/\.png/i.test(filename)) return true
  return false
}

/** PDF, Office, ZIP — jamais traités comme signature. */
export function isProtectedDocumentType(filename: string, contentType?: string): boolean {
  const ct = contentType ?? ''
  if (DOC_EXT_ANY.test(filename) || DOC_EXT_END.test(filename)) return true
  if (DOC_MIME.test(ct) && !ct.startsWith('image/')) return true
  return false
}

function hasRealFilename(filename: string): boolean {
  const name = filename.trim()
  if (!name || GENERATED_FILENAME.test(name)) return false
  return true
}

function isOutlookInlineImageName(filename: string): boolean {
  return OUTLOOK_INLINE_NAME.test(filename) || /^image\d+\.png@/i.test(filename)
}

/** Dimensions PNG / GIF / JPEG / WebP depuis le buffer (sans dépendance native). */
export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 10) return null

  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer.length >= 10) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buffer[offset + 1]
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        }
      }
      const len = buffer.readUInt16BE(offset + 2)
      if (len < 2) break
      offset += 2 + len
    }
  }

  // WebP (VP8X)
  if (
    buffer.length > 30
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
    && buffer.toString('ascii', 12, 16) === 'VP8X'
  ) {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16))
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16))
    return { width, height }
  }

  return null
}

function isSmallOrTrackingImage(buffer: Buffer | null | undefined, size: number): boolean {
  if (size > 0 && size < 200) return true
  const dims = buffer ? getImageDimensions(buffer) : null
  if (dims && dims.width === 1 && dims.height === 1) return true
  if (dims && dims.width <= SIGNATURE_IMAGE_MAX_PX && dims.height <= SIGNATURE_IMAGE_MAX_PX) {
    if (size <= SIGNATURE_IMAGE_MAX_BYTES) return true
  }
  if (size > 0 && size < SIGNATURE_IMAGE_MAX_BYTES && !buffer) return true
  return false
}

function isCidEmbedded(contentId: string | undefined, bodyHtml?: string | null): boolean {
  if (!contentId || !bodyHtml) return false
  const normalized = normalizeContentId(contentId)
  const cids = extractCidsFromHtml(bodyHtml)
  if (cids.has(normalized)) return true
  for (const cid of cids) {
    if (cid.includes(normalized) || normalized.includes(cid)) return true
  }
  return false
}

/**
 * true = pièce jointe valide pour section Documents AO (ingestion + affichage).
 */
export function isAoTenderDocumentAttachment(
  att: AttachmentFilterInput,
  options?: { bodyHtml?: string | null; buffer?: Buffer | null },
): boolean {
  const filename = att.filename || ''
  const contentType = att.contentType || 'application/octet-stream'
  const size = att.size ?? 0
  const disposition = dispositionOf(att.contentDisposition)

  if (!hasRealFilename(filename)) return false

  // Documents métier : toujours conservés
  if (isProtectedDocumentType(filename, contentType)) {
    if (isInlineDisposition(disposition) && isImageFile(filename, contentType)) return false
    return true
  }

  if (isOutlookInlineImageName(filename)) return false

  if (isInlineDisposition(disposition)) return false

  if (isCidEmbedded(att.contentId, options?.bodyHtml)) return false

  if (isImageFile(filename, contentType)) {
    if (!isAttachmentDisposition(disposition)) {
      if (isSmallOrTrackingImage(options?.buffer, size)) return false
      return false
    }
    if (isSmallOrTrackingImage(options?.buffer, size)) return false
    const dims = options?.buffer ? getImageDimensions(options.buffer) : null
    if (dims && dims.width > SIGNATURE_IMAGE_MAX_PX && dims.height > SIGNATURE_IMAGE_MAX_PX && size >= SIGNATURE_IMAGE_MAX_BYTES) {
      return true
    }
    if (size >= SIGNATURE_IMAGE_MAX_BYTES && !isSmallOrTrackingImage(options?.buffer, size)) return true
    return false
  }

  // Autres types : disposition attachment obligatoire
  if (!isAttachmentDisposition(disposition)) return false

  return size > 0
}

/** Document tender_documents déjà stocké — candidat suppression (logos signature). */
export function isLikelySignatureTenderDocument(
  doc: { filename: string; content_type?: string | null; size?: number | null },
  buffer?: Buffer | null,
): boolean {
  if (isProtectedDocumentType(doc.filename, doc.content_type ?? undefined)) return false

  const size = doc.size ?? 0
  const contentType = doc.content_type ?? 'application/octet-stream'

  if (isOutlookInlineImageName(doc.filename)) return true
  if (isImageFile(doc.filename, contentType)) {
    if (isSmallOrTrackingImage(buffer, size)) return true
    if (!buffer && size < SIGNATURE_IMAGE_MAX_BYTES) return true
    const dims = buffer ? getImageDimensions(buffer) : null
    if (dims && dims.width <= SIGNATURE_IMAGE_MAX_PX && dims.height <= SIGNATURE_IMAGE_MAX_PX) return true
    return false
  }

  // Fichier non-document, petit, sans extension métier
  if (size < SIGNATURE_IMAGE_MAX_BYTES && !DOC_EXT_ANY.test(doc.filename)) return true

  return false
}
