import { describe, expect, it } from 'vitest'
import { isAoTenderDocumentAttachment } from '@/lib/attachment-signature-filter'

describe('attachment-signature-filter', () => {
  it('ignore inline PNG référencé par cid dans le HTML', () => {
    const att = {
      filename: 'logo.png',
      contentType: 'image/png',
      size: 2048,
      contentDisposition: 'inline',
      contentId: 'logo@signature',
    }
    const bodyHtml = '<p>Bonjour</p><img src="cid:logo@signature">'
    expect(isAoTenderDocumentAttachment(att, { bodyHtml })).toBe(false)
  })

  it('ignore petite image inline sans disposition attachment', () => {
    const att = {
      filename: 'image001.png',
      contentType: 'image/png',
      size: 4096,
      contentDisposition: 'inline',
    }
    expect(isAoTenderDocumentAttachment(att)).toBe(false)
  })

  it('garde un vrai PDF en attachment', () => {
    const att = {
      filename: 'CCTP_chantier.pdf',
      contentType: 'application/pdf',
      size: 250000,
      contentDisposition: 'attachment',
    }
    expect(isAoTenderDocumentAttachment(att)).toBe(true)
  })

  it('garde un PDF même inline (type protégé)', () => {
    const att = {
      filename: 'devis.pdf',
      contentType: 'application/pdf',
      size: 120000,
      contentDisposition: 'inline',
    }
    expect(isAoTenderDocumentAttachment(att)).toBe(true)
  })
})
