/** Messagerie strictement personnelle — le groupe Famille sert aux AO, pas aux boîtes mail. */
export async function getMailUserScope(requestingUserId: string) {
  return {
    isOwner: false,
    organizationId: null,
    members: [],
    memberUserIds: [],
    allowedUserIds: [requestingUserId],
  }
}
