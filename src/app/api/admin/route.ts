export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

const ADMIN_USER_ID = '46dc77c8-f312-4714-b59c-a7d9c693372f'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  if (userId !== ADMIN_USER_ID) {
    return Response.json({ success: false, error: 'Acces refuse' }, { status: 403 })
  }

  const db = createAdminClient()

  const { data: org } = await db
    .from('organizations')
    .select('*, organization_members(*)')
    .eq('owner_id', userId)
    .single()

  if (!org) {
    return Response.json({ success: true, data: { members: [], global: {} } })
  }

  const members = org.organization_members ?? []

  const memberStats = await Promise.all(
    members.map(async (member: any) => {
      const memberId = member.user_id
      const { data: tenders } = await db.from('tenders').select('id, status').eq('user_id', memberId)
      const tenderIds = (tenders ?? []).map((t: any) => t.id)
      let quotesCount = 0
      if (tenderIds.length > 0) {
        const { data: quotes } = await db.from('quotes').select('id').in('tender_id', tenderIds)
        quotesCount = quotes?.length ?? 0
      }
      let lastSignIn: string | null = null
      try {
        const { data: { users } } = await db.auth.admin.listUsers()
        const authUser = users?.find((u: any) => u.id === memberId)
        lastSignIn = authUser?.last_sign_in_at ?? null
      } catch {}
      const tendersList = tenders ?? []
      return {
        ...member,
        stats: {
          total_tenders: tendersList.length,
          active_tenders: tendersList.filter((t: any) => ['nouveau', 'en_cours', 'urgence'].includes(t.status)).length,
          won_tenders: tendersList.filter((t: any) => t.status === 'gagne').length,
          quotes_received: quotesCount,
          last_sign_in: lastSignIn,
        }
      }
    })
  )

  const { data: allTenders } = await db.from('tenders').select('status')
  const { data: allEmails } = await db.from('emails').select('is_read')

  return Response.json({
    success: true,
    data: {
      org: { id: org.id, name: org.name },
      members: memberStats,
      global: {
        total_tenders: allTenders?.length ?? 0,
        active_tenders: (allTenders ?? []).filter((t: any) => ['nouveau', 'en_cours', 'urgence'].includes(t.status)).length,
        total_emails: allEmails?.length ?? 0,
        unread_emails: (allEmails ?? []).filter((e: any) => !e.is_read).length,
      }
    }
  })
}
