// ============================================================
// OPERIS — services/tender.service.ts
// Logique métier AO — tout passe par ici
// ============================================================

import { tenderRepository } from '@/repositories/tender.repository'
import { consultationRepository } from '@/repositories/consultation.repository'
import { supplierRepository } from '@/repositories/supplier.repository'
import { emailLogRepository } from '@/repositories/emailLog.repository'
import { sendUserEmail } from '@/lib/user-mailer'
import { createAdminClient } from '@/lib/supabase'
import { downloadDevisFile } from '@/lib/devis-storage'
import { attachmentMetaOnly } from '@/lib/mail-storage'
import { personalizeConsultationBody, buildEmailWithSignature, supplierRecipients } from '@/lib/email-compose'
import { isFirstTimeContact, queueVerificationChallenge } from '@/lib/mail-human-verification'
import {
  normalizeSupplierLanguage,
  buildConsultationSubjectForLocale,
  buildConsultationBodyForLocale,
  buildRelaunchSubjectForLocale,
  buildRelaunchBodyForLocale,
} from '@/lib/mail-i18n'
import {
  CreateTenderPayload,
  UpdateTenderPayload,
  TenderStatus,
  ApiResponse,
  TenderDetail,
  TenderStats,
  Tender,
} from '@/types/database'
import { getTenderAccessScope } from '@/lib/tender-access'
import { enrichTenderRows, buildTenderMemberLabels } from '@/lib/tender-enrich'

export const tenderService = {

  // ── Lister tous les AO ───────────────────────────────────
  async getAll(userId: string): Promise<ApiResponse<TenderStats[]>> {
    try {
      const scope = await getTenderAccessScope(userId)
      const data = await tenderRepository.findAll(userId)
      const enriched = await enrichTenderRows(data, scope)
      return { success: true, data: enriched }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Détail d'un AO ───────────────────────────────────────
  async getById(id: string, userId: string): Promise<ApiResponse<TenderDetail>> {
    try {
      const data = await tenderRepository.findById(id, userId)
      if (!data) return { success: false, error: 'AO introuvable' }
      return { success: true, data }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Créer un AO ──────────────────────────────────────────
  async create(userId: string, payload: CreateTenderPayload): Promise<ApiResponse<Tender>> {
    try {
      if (!payload.title || !payload.client) {
        return { success: false, error: 'Titre et client obligatoires' }
      }
      const data = await tenderRepository.create(userId, payload)
      return { success: true, data }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Mettre à jour un AO ───────────────────────────────────
  async update(
    id: string,
    userId: string,
    payload: UpdateTenderPayload
  ): Promise<ApiResponse<Tender>> {
    try {
      const data = await tenderRepository.update(id, userId, payload)
      return { success: true, data }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Changer le statut (gagné / perdu / clôturé) ───────────
  async markStatus(
    id: string,
    userId: string,
    status: TenderStatus
  ): Promise<ApiResponse<Tender>> {
    try {
      const allowed: TenderStatus[] = ['nouveau', 'en_cours', 'urgence', 'gagne', 'perdu', 'cloture']
      if (!allowed.includes(status)) {
        return { success: false, error: 'Statut invalide' }
      }
      const data = await tenderRepository.update(id, userId, { status })
      return { success: true, data }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Ajouter un fournisseur à un AO ───────────────────────
  async addSupplier(
    tenderId: string,
    supplierId: string,
    userId: string
  ): Promise<ApiResponse<{ added: boolean }>> {
    try {
      // Vérifier que le tender appartient à l'utilisateur
      const tender = await tenderRepository.findById(tenderId, userId)
      if (!tender) return { success: false, error: 'AO introuvable' }

      // Vérifier que le fournisseur appartient à l'utilisateur
      const supplier = await supplierRepository.findById(supplierId, userId)
      if (!supplier) return { success: false, error: 'Fournisseur introuvable' }

      await consultationRepository.addSupplier(tenderId, supplierId)
      return { success: true, data: { added: true } }
    } catch (e: any) {
      // Gérer le cas doublon (unique constraint)
      if (e.message.includes('unique')) {
        return { success: false, error: 'Fournisseur déjà ajouté à cet AO' }
      }
      return { success: false, error: e.message }
    }
  },

  // ── Envoyer la consultation à tous les fournisseurs ──────
  async sendConsultation(
    tenderId: string,
    userId: string,
    supplierIds: string[],
    options?: {
      message?: string
      body?: string
      subject?: string
      signature?: string
      cc?: string
      document_ids?: string[]
      attachment_files?: Array<{ filename: string; contentType?: string; data: string }>
    }
  ): Promise<ApiResponse<{ sent: number; errors: number; pendingVerification: number }>> {
    try {
      const tender = await tenderRepository.findById(tenderId, userId)
      if (!tender) return { success: false, error: 'AO introuvable' }

      const db = createAdminClient()
      let mailAttachments: Array<{ filename: string; content: Buffer; contentType: string }> = []
      const attachmentMeta: Array<ReturnType<typeof attachmentMetaOnly>> = []

      if (options?.attachment_files?.length) {
        for (const f of options.attachment_files) {
          if (!f.data || !f.filename) continue
          const buf = Buffer.from(f.data, 'base64')
          mailAttachments.push({
            filename: f.filename,
            content: buf,
            contentType: f.contentType || 'application/octet-stream',
          })
          attachmentMeta.push(attachmentMetaOnly({
            filename: f.filename,
            contentType: f.contentType || 'application/octet-stream',
            size: buf.length,
          }))
        }
      }

      if (options?.document_ids?.length) {
        const { data: docs } = await db
          .from('tender_documents')
          .select('*')
          .eq('tender_id', tenderId)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .in('id', options.document_ids)

        for (const doc of docs ?? []) {
          const buf = await downloadDevisFile(db, doc.storage_path)
          if (!buf) continue
          mailAttachments.push({
            filename: doc.filename,
            content: buf,
            contentType: doc.content_type || 'application/octet-stream',
          })
          attachmentMeta.push(attachmentMetaOnly({
            filename: doc.filename,
            contentType: doc.content_type || 'application/octet-stream',
            size: doc.size ?? buf.length,
            path: doc.storage_path,
          }))
        }
      }

      const explicitSubject = options?.subject?.trim() || undefined
      const signature = options?.signature?.trim() ?? ''
      const cc = options?.cc?.trim() || undefined
      let sent = 0
      let errors = 0
      let pendingVerification = 0

      for (const supplierId of supplierIds) {
        const supplier = await supplierRepository.findById(supplierId, userId)
        if (!supplier) continue

        // Langue du fournisseur → email généré (objet + corps) dans cette langue,
        // sauf si l'utilisateur a explicitement personnalisé le message.
        const locale = normalizeSupplierLanguage(supplier.language)
        const subject = explicitSubject ?? buildConsultationSubjectForLocale(tender.title, locale)
        const bodyPlain = options?.body
          ? personalizeConsultationBody(options.body, supplier.name)
          : buildConsultationBodyForLocale(tender, supplier.name, locale, options?.message)
        const toAddress = supplierRecipients(supplier)

        // Anti-bot : premier contact jamais échangé avec ce fournisseur → mail-défi au lieu
        // d'un envoi direct, la consultation restera "en_attente" jusqu'à confirmation.
        if (await isFirstTimeContact(db, userId, supplier.email)) {
          const { html, text } = buildEmailWithSignature(bodyPlain, signature)
          const challenge = await queueVerificationChallenge(db, userId, {
            toAddress,
            cc,
            subject,
            bodyText: text,
            bodyHtml: html,
            attachments: mailAttachments.map(a => ({
              filename: a.filename,
              contentType: a.contentType,
              data: a.content.toString('base64'),
            })),
            tenderId,
            supplierId,
          })
          if (challenge.success) {
            pendingVerification++
          } else {
            await emailLogRepository.create({
              user_id: userId,
              tender_id: tenderId,
              supplier_id: supplierId,
              type: 'consultation',
              to_address: toAddress,
              subject,
              body: null,
              sent_at: new Date().toISOString(),
              success: false,
              error_message: challenge.error ?? 'Erreur vérification anti-bot',
              attachments: [],
            })
            errors++
          }
          continue
        }

        try {
          const { text: sentText } = await sendUserEmail(db, userId, {
            to: toAddress,
            subject,
            body: bodyPlain,
            signature,
            cc,
            attachments: mailAttachments.length > 0 ? mailAttachments : undefined,
          })

          await consultationRepository.updateStatus(tenderId, supplierId, 'envoye', {
            last_sent_at: new Date().toISOString(),
          })

          await emailLogRepository.create({
            user_id: userId,
            tender_id: tenderId,
            supplier_id: supplierId,
            type: 'consultation',
            to_address: toAddress,
            subject,
            body: sentText,
            sent_at: new Date().toISOString(),
            success: true,
            error_message: null,
            attachments: attachmentMeta,
          })

          sent++
        } catch (emailError: unknown) {
          const msg = emailError instanceof Error ? emailError.message : 'Erreur envoi'
          await emailLogRepository.create({
            user_id: userId,
            tender_id: tenderId,
            supplier_id: supplierId,
            type: 'consultation',
            to_address: toAddress,
            subject,
            body: null,
            sent_at: new Date().toISOString(),
            success: false,
            error_message: msg,
            attachments: [],
          })
          errors++
        }
      }

      return { success: true, data: { sent, errors, pendingVerification } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Relancer un fournisseur (action transactionnelle) ─────
  // envoie email + update statut + update date — en une seule opération
  async relaunchSupplier(
    tenderId: string,
    supplierId: string,
    userId: string
  ): Promise<ApiResponse<{ relaunched: boolean }>> {
    try {
      const tender = await tenderRepository.findById(tenderId, userId)
      if (!tender) return { success: false, error: 'AO introuvable' }

      const supplier = await supplierRepository.findById(supplierId, userId)
      if (!supplier) return { success: false, error: 'Fournisseur introuvable' }

      // Récupérer le nb de relances déjà effectuées
      const consultations = await consultationRepository.findByTender(tenderId)
      const current = consultations.find(c => c.supplier_id === supplierId)
      if (!current) return { success: false, error: 'Consultation introuvable' }

      const newCount = (current.relaunch_count ?? 0) + 1
      const db = createAdminClient()
      const { getUserSettings, relanceMaxReached } = await import('@/lib/user-settings')
      const settings = await getUserSettings(db, userId)
      if (relanceMaxReached(current.relaunch_count ?? 0, settings.relance_max_count)) {
        return { success: false, error: 'Nombre maximum de relances atteint' }
      }

      const newStatus = newCount >= 2 ? 'relance_2' : 'relance'
      const locale = normalizeSupplierLanguage(supplier.language)
      const bodyPlain = buildRelaunchBodyForLocale(tender, supplier.name, newCount, locale)
      const relaunchSubject = buildRelaunchSubjectForLocale(tender.title, locale)
      const toAddress = supplierRecipients(supplier)

      // 1. Envoyer l'email depuis la messagerie du propriétaire de l'AO
      const { text: sentText } = await sendUserEmail(db, userId, {
        to: toAddress,
        subject: relaunchSubject,
        body: bodyPlain,
      })

      // 2. Update statut + date + compteur (atomique)
      await consultationRepository.updateStatus(tenderId, supplierId, newStatus, {
        last_sent_at: new Date().toISOString(),
        relaunch_count: newCount,
      })

      // 3. Logger
      await emailLogRepository.create({
        user_id: userId,
        tender_id: tenderId,
        supplier_id: supplierId,
        type: newCount >= 2 ? 'relance_2' : 'relance',
        to_address: toAddress,
        subject: relaunchSubject,
        body: sentText,
        sent_at: new Date().toISOString(),
        success: true,
        error_message: null,
      })

      return { success: true, data: { relaunched: true } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Relancer tous les non-répondants ─────────────────────
  async relaunchAll(
    tenderId: string,
    userId: string
  ): Promise<ApiResponse<{ sent: number }>> {
    try {
      const nonResponders = await consultationRepository.findNonResponders(tenderId)
      let sent = 0

      for (const c of nonResponders) {
        const result = await tenderService.relaunchSupplier(tenderId, c.supplier_id, userId)
        if (result.success) sent++
      }

      return { success: true, data: { sent } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Marquer une consultation comme envoyée/relancée sans email ──
  // Trace un contact fait hors Operis (téléphone, en personne, etc.) — pas
  // d'envoi, juste une mise à jour de statut + un log d'audit. Toujours
  // disponible, que la messagerie intégrée soit active ou non.
  async markConsultationManual(
    tenderId: string,
    supplierId: string,
    userId: string,
    action: 'sent' | 'relance',
  ): Promise<ApiResponse<{ status: string }>> {
    try {
      const tender = await tenderRepository.findById(tenderId, userId)
      if (!tender) return { success: false, error: 'AO introuvable' }

      const supplier = await supplierRepository.findById(supplierId, userId)
      if (!supplier) return { success: false, error: 'Fournisseur introuvable' }

      const consultations = await consultationRepository.findByTender(tenderId)
      const current = consultations.find(c => c.supplier_id === supplierId)
      if (!current) return { success: false, error: 'Consultation introuvable' }

      const now = new Date().toISOString()
      let newStatus: string
      let extraFields: Record<string, unknown> = { last_sent_at: now }
      let logType: 'consultation_manual' | 'relance_manual'
      let logMessage: string

      if (action === 'sent') {
        newStatus = 'envoye'
        logType = 'consultation_manual'
        logMessage = 'Marqué comme envoyé manuellement (hors Operis)'
      } else {
        const newCount = (current.relaunch_count ?? 0) + 1
        newStatus = newCount >= 2 ? 'relance_2' : 'relance'
        extraFields = { ...extraFields, relaunch_count: newCount }
        logType = 'relance_manual'
        logMessage = `Marqué comme relancé manuellement (hors Operis) — relance ${newCount}`
      }

      await consultationRepository.updateStatus(
        tenderId,
        supplierId,
        newStatus as any,
        extraFields,
      )

      await emailLogRepository.create({
        user_id: userId,
        tender_id: tenderId,
        supplier_id: supplierId,
        type: logType,
        to_address: supplierRecipients(supplier),
        subject: null,
        body: logMessage,
        sent_at: now,
        success: true,
        error_message: null,
      })

      return { success: true, data: { status: newStatus } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },

  // ── Supprimer un AO ──────────────────────────────────────
  async delete(id: string, userId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    try {
      await tenderRepository.delete(id, userId)
      return { success: true, data: { deleted: true } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  },
}
