export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { getMailUserScope } from '@/lib/mail-access'

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const scope = await getMailUserScope(userId)
  return Response.json({
    success: true,
    data: {
      is_owner: scope.isOwner,
      organization_id: scope.organizationId,
      members: scope.members,
    },
  })
}
