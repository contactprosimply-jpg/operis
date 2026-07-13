import { siteUrl } from '@/lib/site-url'

export function operisFooter(): { html: string; text: string } {
  const url = siteUrl()
  return {
    html: `<p style="margin: 16px 0 0; font-family: DM Sans, Arial, sans-serif; font-size: 11px; color: #9ca3af;">Ce message a été envoyé via <a href="${url}" style="color: #9ca3af;">Operis</a></p>`,
    text: `\n\n— Envoyé via Operis (${url})`,
  }
}

/** Construit HTML + texte pour un email avec signature (messagerie + consultations). */
export function buildEmailWithSignature(bodyText: string, signatureText: string): { html: string; text: string } {
  const bodyHtml = bodyText.replace(/\n/g, '<br>')
  const bodyBlock = bodyText.trim()
    ? `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
    : ''

  const footer = operisFooter()
  let html: string
  let text: string

  if (!signatureText.trim()) {
    html = bodyBlock || '<div></div>'
    text = bodyText
  } else {
    const isHtmlSignature = signatureText.includes('<') && signatureText.includes('>')
    if (isHtmlSignature) {
      html = `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">${signatureText}`
      text = bodyText.trim()
        ? `${bodyText}\n\n--\n${signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`
        : signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    } else {
      html = `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;"><div style="font-family: DM Sans, Arial, sans-serif; font-size: 12px; color: #6b7280; line-height: 1.6;">${signatureText.replace(/\n/g, '<br>')}</div>`
      text = bodyText.trim() ? `${bodyText}\n\n--\n${signatureText}` : signatureText
    }
  }

  return {
    html: `${html}${footer.html}`,
    text: `${text}${footer.text}`,
  }
}

export function buildConsultationDefaultBody(
  tender: { title: string; client: string; description?: string | null; deadline?: string | null },
  supplierName?: string,
): string {
  const greeting = supplierName ? `Bonjour ${supplierName},` : 'Bonjour,'
  const lines = [
    greeting,
    '',
    'Je vous consulte pour ce dossier :',
    `Nom : ${tender.title}`,
  ]
  if (tender.deadline) {
    lines.push(`Date limite : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}`)
  }
  lines.push('', 'Merci de votre retour.')
  return lines.join('\n')
}

export function buildConsultationDefaultBodyWithExtra(
  tender: { title: string; client: string; description?: string | null; deadline?: string | null },
  supplierName?: string,
  extraMessage?: string,
): string {
  const base = buildConsultationDefaultBody(tender, supplierName)
  if (extraMessage?.trim()) return `${base}\n\n${extraMessage.trim()}`
  return base
}

/** Combine l'email principal et les emails secondaires d'un fournisseur pour le champ "À". */
export function supplierRecipients(supplier: { email: string; additional_emails?: string[] | null }): string {
  return [supplier.email, ...(supplier.additional_emails ?? [])]
    .map(e => e?.trim())
    .filter(Boolean)
    .join(', ')
}

/** Remplace la salutation pour chaque fournisseur. */
export function personalizeConsultationBody(body: string, supplierName: string): string {
  const trimmed = body.trim()
  const greetingMatch = trimmed.match(/^Bonjour[^,\n]*,/m)
  if (greetingMatch) {
    return trimmed.replace(/^Bonjour[^,\n]*,/m, `Bonjour ${supplierName},`)
  }
  return `Bonjour ${supplierName},\n\n${trimmed}`
}
