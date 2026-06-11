import { getFamilyContext } from '@/lib/family'

export async function getMailUserScope(requestingUserId: string) {
  const ctx = await getFamilyContext(requestingUserId)
  const allowedUserIds = [requestingUserId, ...ctx.memberUserIds]

  return {
    isOwner: ctx.isOwner,
    organizationId: ctx.organizationId,
    members: ctx.members,
    memberUserIds: ctx.memberUserIds,
    allowedUserIds: [...new Set(allowedUserIds)],
  }
}
