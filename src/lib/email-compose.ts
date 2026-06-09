/** Construit HTML + texte pour un email avec signature (messagerie + consultations). */
export function buildEmailWithSignature(bodyText: string, signatureText: string): { html: string; text: string } {
  const bodyHtml = bodyText.replace(/\n/g, '<br>')
  const bodyBlock = bodyText.trim()
    ? `<div style="font-family: DM Sans, Arial, sans-serif; font-size: 14px; color: #374151; line-height: 1.6;">${bodyHtml}</div>`
    : ''

  if (!signatureText.trim()) {
    return {
      html: bodyBlock || '<div></div>',
      text: bodyText,
    }
  }

  const isHtmlSignature = signatureText.includes('<') && signatureText.includes('>')
  if (isHtmlSignature) {
    return {
      html: `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">${signatureText}`,
      text: bodyText.trim()
        ? `${bodyText}\n\n--\n${signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`
        : signatureText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    }
  }

  return {
    html: `${bodyBlock}${bodyBlock ? '<br>' : ''}<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;"><div style="font-family: DM Sans, Arial, sans-serif; font-size: 12px; color: #6b7280; line-height: 1.6;">${signatureText.replace(/\n/g, '<br>')}</div>`,
    text: bodyText.trim() ? `${bodyText}\n\n--\n${signatureText}` : signatureText,
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
    "Nous vous contactons dans le cadre d'un appel d'offres et souhaiterions recueillir votre devis pour le projet suivant :",
    '',
    `Projet : ${tender.title}`,
    `Client : ${tender.client}`,
  ]
  if (tender.description) lines.push(`Description : ${tender.description}`)
  if (tender.deadline) {
    lines.push(`Date limite de réponse : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}`)
  }
  lines.push('', 'Merci de nous faire parvenir votre offre dans les meilleurs délais.')
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

/** Remplace la salutation pour chaque fournisseur. */
export function personalizeConsultationBody(body: string, supplierName: string): string {
  const trimmed = body.trim()
  const greetingMatch = trimmed.match(/^Bonjour[^,\n]*,/m)
  if (greetingMatch) {
    return trimmed.replace(/^Bonjour[^,\n]*,/m, `Bonjour ${supplierName},`)
  }
  return `Bonjour ${supplierName},\n\n${trimmed}`
}
