export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { customFolderLabel } from '@/lib/mail-folders'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const db = createAdminClient()
  const { data: accounts } = await db
    .from('mail_accounts')
    .select('id, imap_user, smtp_user, cached_imap_folders')
    .eq('user_id', userId)
    .eq('is_active', true)

  const custom: Array<{ path: string; name: string }> = []
  const accountList: Array<{ id: string; email: string }> = []

  for (const acc of accounts ?? []) {
    accountList.push({
      id: acc.id,
      email: acc.imap_user ?? acc.smtp_user ?? '',
    })
    const cached = acc.cached_imap_folders as Array<{ path: string; name?: string }> | null
    if (Array.isArray(cached)) {
      for (const f of cached) {
        if (f.path && !custom.some(c => c.path === f.path)) {
          custom.push({ path: f.path, name: f.name ?? customFolderLabel(f.path) })
        }
      }
    }
  }

  return Response.json({
    success: true,
    data: { accounts: accountList, customFolders: custom },
  })
}
