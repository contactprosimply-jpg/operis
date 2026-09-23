import type { SupabaseClient } from '@supabase/supabase-js'

const ADDRESS_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi

/** Toutes les adresses d'un en-tête ("Nom" <a@b.fr>, c@d.fr), en minuscules. */
export function parseAddresses(header: string | null | undefined): string[] {
  if (!header) return []
  return (header.match(ADDRESS_RE) ?? []).map(a => a.toLowerCase())
}

/** Rapprochement par adresse EXACTE — jamais par domaine, jamais par sous-chaîne
 *  (« a@b.fr » ne correspond pas à « xa@b.fr » ni à « a@b.fr.evil.com »). */
export function headerHasExactAddress(header: string | null | undefined, address: string): boolean {
  const target = address.trim().toLowerCase()
  return !!target && parseAddresses(header).includes(target)
}

export function supplierAddresses(s: { email?: string | null; additional_emails?: string[] | null }): string[] {
  const all = [s.email ?? '', ...(s.additional_emails ?? [])]
    .map(a => a.trim().toLowerCase())
    .filter(a => a.includes('@'))
  return [...new Set(all)]
}

/** true si TOUS les destinataires sont des adresses (principale ou secondaire) d'un fournisseur
 *  enregistré de l'utilisateur : ajoutés par lui, rien à vérifier. */
export async function isRegisteredSupplierRecipient(
  db: SupabaseClient,
  userId: string,
  toHeader: string,
): Promise<boolean> {
  const recipients = parseAddresses(toHeader)
  if (recipients.length === 0) return false

  const { data } = await db
    .from('suppliers')
    .select('email, additional_emails')
    .eq('user_id', userId)

  const known = new Set((data ?? []).flatMap(s => supplierAddresses(s as { email: string; additional_emails: string[] })))
  return recipients.every(r => known.has(r))
}
