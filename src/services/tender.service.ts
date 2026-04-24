// ============================================================
// OPERIS — services/tender.service.ts
// Logique métier AO — tout passe par ici
// ============================================================

import { tenderRepository } from '@/repositories/tender.repository'
import { consultationRepository } from '@/repositories/consultation.repository'
import { supplierRepository } from '@/repositories/supplier.repository'
import { emailLogRepository } from '@/repositories/emailLog.repository'
import { sendEmail } from '@/lib/mailer'
import {
  CreateTenderPayload,
  UpdateTenderPayload,
  TenderStatus,
  ApiResponse,
  TenderDetail,
  TenderStats,
  Tender,
} from '@/types/database'

export const tenderService = {

  // ── Lister tous les AO ───────────────────────────────────
  async getAll(userId: string): Promise<ApiResponse<TenderStats[]>> {
    try {
      const data = await tenderRepository.findAll(userId)
      return { success: true, data }
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
      const allowed: TenderStatus[] = ['gagne', 'perdu', 'cloture', 'en_cours', 'urgence']
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
    supplierIds: string[]
  ): Promise<ApiResponse<{ sent: number; errors: number }>> {
    try {
      const tender = await tenderRepository.findById(tenderId, userId)
      if (!tender) return { success: false, error: 'AO introuvable' }

      let sent = 0
      let errors = 0

      for (const supplierId of supplierIds) {
        const supplier = await supplierRepository.findById(supplierId, userId)
        if (!supplier) continue

        try {
          // Envoyer l'email
          await sendEmail({
            to: supplier.email,
            subject: `Consultation — ${tender.title}`,
            body: buildConsultationEmail(tender, supplier.name),
          })

          // Mettre à jour le statut en UNE opération
          await consultationRepository.updateStatus(tenderId, supplierId, 'envoye', {
            last_sent_at: new Date().toISOString(),
          })

          // Logger l'envoi
          await emailLogRepository.create({
            tender_id: tenderId,
            supplier_id: supplierId,
            type: 'consultation',
            to_address: supplier.email,
            subject: `Consultation — ${tender.title}`,
            body: buildConsultationEmail(tender, supplier.name),
            sent_at: new Date().toISOString(),
            success: true,
            error_message: null,
          })

          sent++
        } catch (emailError: any) {
          // Logger l'échec sans bloquer les autres envois
          await emailLogRepository.create({
            tender_id: tenderId,
            supplier_id: supplierId,
            type: 'consultation',
            to_address: supplier.email,
            subject: `Consultation — ${tender.title}`,
            body: null,
            sent_at: new Date().toISOString(),
            success: false,
            error_message: emailError.message,
          })
          errors++
        }
      }

      return { success: true, data: { sent, errors } }
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
      const newStatus = newCount >= 2 ? 'relance_2' : 'relance'

      // 1. Envoyer l'email
      await sendEmail({
        to: supplier.email,
        subject: `Relance — ${tender.title}`,
        body: buildRelaunchEmail(tender, supplier.name, newCount),
      })

      // 2. Update statut + date + compteur (atomique)
      await consultationRepository.updateStatus(tenderId, supplierId, newStatus, {
        last_sent_at: new Date().toISOString(),
        relaunch_count: newCount,
      })

      // 3. Logger
      await emailLogRepository.create({
        tender_id: tenderId,
        supplier_id: supplierId,
        type: newCount >= 2 ? 'relance_2' : 'relance',
        to_address: supplier.email,
        subject: `Relance ${newCount} — ${tender.title}`,
        body: buildRelaunchEmail(tender, supplier.name, newCount),
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

// ============================================================
// Templates emails
// ============================================================

function buildConsultationEmail(tender: any, supplierName: string): string {
  return `Bonjour ${supplierName},

Nous vous contactons dans le cadre d'un appel d'offres et souhaiterions recueillir votre devis pour le projet suivant :

Projet : ${tender.title}
Client : ${tender.client}
${tender.description ? `Description : ${tender.description}\n` : ''}${tender.deadline ? `Date limite de réponse : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}\n` : ''}
Merci de nous faire parvenir votre offre dans les meilleurs délais.

Cordialement,
L'équipe Operis`
}

function buildRelaunchEmail(tender: any, supplierName: string, relaunchCount: number): string {
  return `Bonjour ${supplierName},

Sauf erreur de notre part, nous n'avons pas encore reçu votre devis concernant le projet suivant :

Projet : ${tender.title}
Client : ${tender.client}
${tender.deadline ? `Date limite : ${new Date(tender.deadline).toLocaleDateString('fr-FR')}\n` : ''}
Pourriez-vous nous faire parvenir votre offre dans les meilleurs délais ?
${relaunchCount >= 2 ? '\nSans réponse de votre part, nous serons contraints de poursuivre notre consultation avec d\'autres prestataires.' : ''}

Cordialement,
L'équipe Operis`
}
