const PREVIEW_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp'])

export function isPreviewableDocument(filename: string, contentType?: string | null): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (PREVIEW_EXT.has(ext)) return true
  if (!contentType) return false
  return /^application\/pdf$/i.test(contentType) || /^image\/(png|jpe?g|gif|webp)$/i.test(contentType)
}

export function contentDispositionHeader(filename: string, inline: boolean): string {
  const encoded = encodeURIComponent(filename)
  return inline
    ? `inline; filename="${encoded}"; filename*=UTF-8''${encoded}`
    : `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`
}
