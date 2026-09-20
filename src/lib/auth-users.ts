import type { SupabaseClient, User } from '@supabase/supabase-js'

const PER_PAGE = 1000

/**
 * Tous les comptes, page après page. `auth.admin.listUsers()` sans paramètre ne renvoie qu'une
 * seule page (50 comptes par défaut côté Supabase) : au-delà, les crons d'alertes ne
 * traitaient silencieusement qu'une partie des utilisateurs.
 */
export async function listAllAuthUsers(db: SupabaseClient): Promise<User[]> {
  const all: User[] = []
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`)
    const users = data?.users ?? []
    all.push(...users)
    if (users.length < PER_PAGE) break
  }
  return all
}
