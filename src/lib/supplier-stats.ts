// ============================================================
// OPERIS — lib/supplier-stats.ts
// Historique prix/réponse fournisseur — uniquement dérivé des devis et
// consultations déjà en base (voir principe : pas de métré/chiffrage).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

// Sous ce seuil de comparaisons, on n'affiche aucune statistique — un seul
// point de mesure n'est pas une tendance.
const MIN_COMPARISONS = 2

export interface SupplierQuoteHistoryEntry {
  quote_id: string
  tender_id: string
  tender_title: string
  tender_deadline: string | null
  price_ht: number | null
  is_selected: boolean
  received_at: string
}

export interface SupplierPriceIndex {
  deviation_pct: number
  comparisons_count: number
}

export interface SupplierResponseRate {
  responded: number
  contacted: number
  rate: number
}

export async function getSupplierQuoteHistory(
  db: SupabaseClient,
  supplierId: string,
): Promise<SupplierQuoteHistoryEntry[]> {
  const { data, error } = await db
    .from('quotes')
    .select('id, tender_id, price_ht, is_selected, received_at, tender:tenders(title, deadline)')
    .eq('supplier_id', supplierId)
    .order('received_at', { ascending: false })

  if (error) throw new Error(error.message)

  type QuoteRow = {
    id: string
    tender_id: string
    price_ht: number | string | null
    is_selected: boolean | null
    received_at: string
    tender: { title: string | null; deadline: string | null } | null
  }

  return ((data ?? []) as unknown as QuoteRow[]).map(q => ({
    quote_id: q.id,
    tender_id: q.tender_id,
    tender_title: q.tender?.title ?? '—',
    tender_deadline: q.tender?.deadline ?? null,
    price_ht: q.price_ht !== null ? Number(q.price_ht) : null,
    is_selected: q.is_selected === true,
    received_at: q.received_at,
  }))
}

// ── Indice prix : écart moyen à la moyenne des devis reçus, sur les AO où
// au moins 2 fournisseurs ont chiffré (sinon rien à comparer). ──────────
export async function getSupplierPriceIndex(
  db: SupabaseClient,
  supplierId: string,
  tenderIds: string[],
): Promise<SupplierPriceIndex | null> {
  if (tenderIds.length === 0) return null

  const { data, error } = await db
    .from('quotes')
    .select('tender_id, supplier_id, price_ht')
    .in('tender_id', tenderIds)
    .not('price_ht', 'is', null)

  if (error) throw new Error(error.message)

  const byTender = new Map<string, { supplier_id: string; price: number }[]>()
  for (const q of data ?? []) {
    const list = byTender.get(q.tender_id) ?? []
    list.push({ supplier_id: q.supplier_id, price: Number(q.price_ht) })
    byTender.set(q.tender_id, list)
  }

  const deviations: number[] = []
  for (const rows of byTender.values()) {
    const distinctSuppliers = new Set(rows.map(r => r.supplier_id))
    if (distinctSuppliers.size < MIN_COMPARISONS || !distinctSuppliers.has(supplierId)) continue

    const own = rows.find(r => r.supplier_id === supplierId)
    const avg = rows.reduce((sum, r) => sum + r.price, 0) / rows.length
    if (!own || own.price <= 0 || avg <= 0) continue

    deviations.push(((own.price - avg) / avg) * 100)
  }

  if (deviations.length < MIN_COMPARISONS) return null

  return {
    deviation_pct: deviations.reduce((a, b) => a + b, 0) / deviations.length,
    comparisons_count: deviations.length,
  }
}

// ── Taux de réponse : répondu + refusé comptent comme une réponse (le
// fournisseur ne l'a pas ignorée), sur les consultations réellement envoyées. ──
export async function getSupplierResponseRate(
  db: SupabaseClient,
  supplierId: string,
): Promise<SupplierResponseRate | null> {
  const { data, error } = await db
    .from('consultation_suppliers')
    .select('status')
    .eq('supplier_id', supplierId)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as { status: string }[]
  const contacted = rows.filter(c => c.status !== 'en_attente')
  if (contacted.length === 0) return null

  const responded = contacted.filter(c => c.status === 'repondu' || c.status === 'refuse').length
  return { responded, contacted: contacted.length, rate: responded / contacted.length }
}

// ── Version batchée (tri de la modale "ajouter un fournisseur") — une
// seule requête pour tous les fournisseurs plutôt qu'un aller-retour par ligne. ──
export async function getSupplierResponseRates(
  db: SupabaseClient,
  supplierIds: string[],
): Promise<Map<string, SupplierResponseRate>> {
  const result = new Map<string, SupplierResponseRate>()
  if (supplierIds.length === 0) return result

  const { data, error } = await db
    .from('consultation_suppliers')
    .select('supplier_id, status')
    .in('supplier_id', supplierIds)

  if (error) throw new Error(error.message)

  const bySupplier = new Map<string, { status: string }[]>()
  for (const row of data ?? []) {
    const list = bySupplier.get(row.supplier_id) ?? []
    list.push(row)
    bySupplier.set(row.supplier_id, list)
  }

  for (const [supplierId, rows] of bySupplier) {
    const contacted = rows.filter(r => r.status !== 'en_attente')
    if (contacted.length === 0) continue
    const responded = contacted.filter(r => r.status === 'repondu' || r.status === 'refuse').length
    result.set(supplierId, { responded, contacted: contacted.length, rate: responded / contacted.length })
  }

  return result
}
