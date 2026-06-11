import { getFamilyContext } from '@/lib/family'

export async function getMailUserScope(requestingUserId: string) {
  const ctx = await getFamilyContext(requestingUserId)
  const allowedUserIds = ctx.isOwner
    ? [requestingUserId, ...ctx.memberUserIds]
    : [requestingUserId]
  return { ...ctx, allowedUserIds }
}
