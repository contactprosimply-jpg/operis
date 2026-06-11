/** Accès messagerie : compte personnel uniquement (Famille désactivée pour les tests). */
export async function getMailUserScope(requestingUserId: string) {
  return {
    isOwner: false,
    organizationId: null,
    members: [],
    memberUserIds: [],
    allowedUserIds: [requestingUserId],
  }
}
