export type SignatureFields = {
  name?: string
  title?: string
  company?: string
  phone?: string
  email?: string
  website?: string
  html?: string
}

export function buildFieldsSignatureHtml(sig: SignatureFields, accentColor = '#4f8ef7'): string {
  if (!sig.name) return ''
  return `<table cellpadding="0" cellspacing="0" style="font-family: DM Sans, Arial, sans-serif; font-size: 13px; color: #374151; margin-top: 8px;">
  <tr><td style="font-weight: 600; font-size: 14px; color: #111827; padding-bottom: 2px;">${sig.name}</td></tr>
  ${sig.title ? `<tr><td style="color: #6b7280; padding-bottom: 2px;">${sig.title}</td></tr>` : ''}
  ${sig.company ? `<tr><td style="color: #6b7280; padding-bottom: 8px;">${sig.company}</td></tr>` : ''}
  <tr><td style="border-top: 2px solid ${accentColor}; padding-top: 8px; color: #6b7280; line-height: 1.8;">
    ${sig.phone ? `📞 ${sig.phone}<br>` : ''}${sig.email ? `✉ ${sig.email}<br>` : ''}${sig.website ? `🌐 ${sig.website}` : ''}
  </td></tr>
</table>`
}

export function getSignatureData(): { text: string; html: string } {
  if (typeof window === 'undefined') return { text: '', html: '' }
  try {
    const mode = localStorage.getItem('operis_signature_mode') ?? 'fields'
    const sig = JSON.parse(localStorage.getItem('operis_signature') ?? '{}') as SignatureFields
    const accentColor = localStorage.getItem('operis_accent') ?? '#4f8ef7'
    const htmlFromStorage = (sig.html ?? '').trim()

    // Mode HTML ou contenu HTML présent (fichier importé, collage, etc.)
    if (mode === 'html' || htmlFromStorage) {
      if (!htmlFromStorage) return { text: '', html: '' }
      const textSig = htmlFromStorage.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      return { text: textSig ? `\n\n--\n${textSig}` : '', html: htmlFromStorage }
    }

    if (!sig.name) return { text: '', html: '' }

    const textSig = `${sig.name}${sig.title ? ` | ${sig.title}` : ''}${sig.company ? ` | ${sig.company}` : ''}${sig.phone ? `\n${sig.phone}` : ''}${sig.email ? ` | ${sig.email}` : ''}`
    const htmlSig = buildFieldsSignatureHtml(sig, accentColor)
    return { text: `\n\n--\n${textSig}`, html: htmlSig }
  } catch {
    return { text: '', html: '' }
  }
}

export function stripSignatureFromBody(body: string, sigText: string): string {
  const sigIndex = body.indexOf('\n\n--\n')
  if (sigIndex !== -1) return body.slice(0, sigIndex).trimEnd()
  const plain = sigText.replace(/^\n\n--\n/, '')
  if (plain && body.endsWith(plain)) {
    return body.slice(0, body.length - plain.length).trimEnd()
  }
  return body.trimEnd()
}

export function saveSignatureToStorage(sig: SignatureFields, mode: 'fields' | 'html', accentColor?: string) {
  const accent = accentColor ?? localStorage.getItem('operis_accent') ?? '#4f8ef7'
  const payload: SignatureFields = { ...sig }
  if (mode === 'fields' && sig.name) {
    payload.html = buildFieldsSignatureHtml(sig, accent)
  }
  localStorage.setItem('operis_signature', JSON.stringify(payload))
  localStorage.setItem('operis_signature_mode', mode)
}
