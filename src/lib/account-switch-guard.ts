const LAST_USER_KEY = 'operis_last_user_id'

/** Clés localStorage volontairement épargnées par le nettoyage — la liste des comptes
 *  déjà utilisés sur cette machine doit survivre au changement de compte (c'est justement
 *  ce qui permet de proposer le "switch account" dans la sidebar). */
const KEEP_KEYS = new Set(['operis_accounts'])

function clearLocalAccountData(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!KEEP_KEYS.has(key) && key.startsWith('operis')) localStorage.removeItem(key)
    }
  } catch { /* ignore */ }
  return import('@/lib/mailCache')
    .then(({ mailDB }) => mailDB.emails.clear())
    .catch(() => {})
}

/** true si un AUTRE compte a déjà utilisé cette machine avant currentUserId — le scénario
 *  visé : plusieurs collègues partagent le même poste, chacun avec son propre login Operis. */
export function accountChangedOnThisDevice(currentUserId: string): boolean {
  try {
    const last = localStorage.getItem(LAST_USER_KEY)
    return last !== null && last !== currentUserId
  } catch {
    return false
  }
}

export function rememberCurrentAccount(currentUserId: string): void {
  try { localStorage.setItem(LAST_USER_KEY, currentUserId) } catch { /* ignore */ }
}

/** Vide le cache mail local (IndexedDB) et les préférences UI mises en cache (localStorage,
 *  thème/signature/réglages/mise en page) d'un compte précédent — sans ça, changer de
 *  compte Operis sur un poste déjà utilisé par quelqu'un d'autre laisse filtrer ses emails
 *  et réglages vers le nouveau compte (les données réelles restent sur Supabase/serveur,
 *  ce n'est qu'un cache local qui doit repartir de zéro). */
export async function resetLocalCachesForNewAccount(currentUserId: string): Promise<void> {
  await clearLocalAccountData()
  rememberCurrentAccount(currentUserId)
}
