export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { acceptOrganizationInvite, getInvitePreview } from '@/lib/organization'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const preview = await getInvitePreview(token)

  if (!preview) {
    return Response.json({ success: false, error: 'Lien invalide ou expire' }, { status: 404 })
  }

  return Response.json({ success: true, data: preview })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const userId = await getUserFromRequest(_req)
  if (!userId) return unauthorized()

  const { token } = await params
  const result = await acceptOrganizationInvite(token, userId)

  if (!result.ok) {
    return Response.json({ success: false, error: result.error }, { status: 400 })
  }

  return Response.json({
    success: true,
    data: result.data,
    already_member: result.already_member ?? false,
  })
}
