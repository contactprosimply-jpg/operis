// ============================================================
// OPERIS — repositories/emailLog.repository.ts
// ============================================================

import { createAdminClient } from '@/lib/supabase'
import { EmailLog } from '@/types/database'

export const emailLogRepository = {

  async create(log: Omit<EmailLog, 'id'>): Promise<void> {
    const db = createAdminClient()
    const { error } = await db.from('email_logs').insert(log)
    if (error) console.error('[EmailLog] Erreur insertion:', error.message)
  },

  async findByTender(tenderId: string): Promise<EmailLog[]> {
    const db = createAdminClient()
    const { data, error } = await db
      .from('email_logs')
      .select('*')
      .eq('tender_id', tenderId)
      .order('sent_at', { ascending: false })

    if (error) throw new Error(error.message)
    return data as EmailLog[]
  },
}
