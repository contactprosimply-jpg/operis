export const dynamic = 'force-dynamic'

// ============================================================
// OPERIS — app/api/quotes/route.ts
// POST /api/quotes → enregistrer un devis
// ============================================================

import { NextRequest } from 'next/server'
import { getUserFromRequest, unauthorized } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { isValidUuid, badRequest } from '@/lib/api-validation'
import { assertTenderAccess } from '@/lib/tender-access'

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { tender_id, supplier_id, price_ht: rawPrice, document_url, notes } = await req.json().catch(() => ({}))

  if (!isValidUuid(tender_id)) return badRequest('tender_id UUID invalide')
  if (!isValidUuid(supplier_id)) return badRequest('supplier_id UUID invalide')

  // price_ht est optionnel (un devis peut être créé avant qu'un prix soit connu), mais s'il
  // est fourni, doit être un nombre fini et positif — un prix négatif fausserait le tri
  // "meilleur prix" (trouvé lors du crash test : accepté sans validation auparavant).
  let price_ht: number | null = null
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
    const parsed = typeof rawPrice === 'number' ? rawPrice : Number(rawPrice)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return badRequest('Prix invalide (doit être un nombre positif)')
    }
    price_ht = parsed
  }

  const db = createAdminClient()

  // Vérifier que le tender appartient à l'utilisateur
  const { data: tender } = await db
    .from('tenders')
    .select('id')
    .eq('id', tender_id)
    .eq('user_id', userId)
    .single()

  if (!tender) return Response.json({ success: false, error: 'AO introuvable' }, { status: 404 })

  // Le fournisseur doit être celui de l'appelant : sinon on pouvait rattacher à son AO le
  // fournisseur d'une autre organisation, et GET (supplier:suppliers(*)) renvoyait ensuite
  // ses coordonnées (nom, e-mail, téléphone).
  const { data: supplier } = await db
    .from('suppliers')
    .select('id')
    .eq('id', supplier_id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!supplier) return Response.json({ success: false, error: 'Fournisseur introuvable' }, { status: 404 })

  // Créer le devis
  const { data, error } = await db
    .from('quotes')
    .insert({ tender_id, supplier_id, price_ht, document_url, notes })
    .select()
    .single()

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })

  // Mettre à jour le statut consultation → répondu
  await db
    .from('consultation_suppliers')
    .update({ status: 'repondu' })
    .eq('tender_id', tender_id)
    .eq('supplier_id', supplier_id)

  return Response.json({ success: true, data }, { status: 201 })
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return unauthorized()

  const { searchParams } = new URL(req.url)
  const tender_id = searchParams.get('tender_id')

  if (!isValidUuid(tender_id)) return badRequest('tender_id requis')

  const db = createAdminClient()

  // L'AO doit appartenir à l'appelant (ou lui être accessible via son organisation) —
  // sans ça, n'importe quel utilisateur authentifié pouvait lire les devis de n'importe
  // quel AO en devinant son UUID (aucune vérification d'appartenance auparavant).
  const access = await assertTenderAccess(db, tender_id!, userId, 'view')
  if (!access.ok) return Response.json({ success: false, error: access.error }, { status: access.status })

  const { data, error } = await db
    .from('quotes')
    .select('*, supplier:suppliers(*)')
    .eq('tender_id', tender_id)
    .order('price_ht', { ascending: true })

  if (error) return Response.json({ success: false, error: error.message }, { status: 500 })
  return Response.json({ success: true, data })
}

