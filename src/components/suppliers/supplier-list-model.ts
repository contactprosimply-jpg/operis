import type { CorpsEtat, Supplier } from '@/types/database'

export type SupplierSort = 'lot' | 'az' | 'reactivity'

export const TODO_FAMILY_ID = '__a_classer__'

export interface SupplierFamily {
  id: string
  label: string
  suppliers: Supplier[]
}

const byName = (a: Supplier, b: Supplier) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
const rateOf = (s: Supplier) => s.response_rate?.rate ?? -1

export function filterSuppliers(suppliers: Supplier[], corpsEtats: CorpsEtat[], query: string): Supplier[] {
  const q = query.trim().toLowerCase()
  if (!q) return suppliers
  const labelFor = (id: string) => corpsEtats.find(c => c.id === id)?.label ?? ''
  return suppliers.filter(s =>
    [s.name, s.email, s.contact_name ?? '', ...(s.corps_etats ?? []).map(labelFor)]
      .some(v => v.toLowerCase().includes(q)),
  )
}

export function sortFlat(suppliers: Supplier[], sort: 'az' | 'reactivity'): Supplier[] {
  const list = [...suppliers]
  if (sort === 'az') return list.sort(byName)
  return list.sort((a, b) => rateOf(b) - rateOf(a) || byName(a, b))
}

// « À classer » toujours en tête ; un fournisseur à plusieurs corps d'état apparaît dans chaque famille.
export function groupByFamily(suppliers: Supplier[], corpsEtats: CorpsEtat[]): SupplierFamily[] {
  const families: SupplierFamily[] = []

  const todo = suppliers.filter(s => (s.corps_etats ?? []).length === 0).sort(byName)
  if (todo.length > 0) families.push({ id: TODO_FAMILY_ID, label: 'À classer', suppliers: todo })

  for (const ce of [...corpsEtats].sort((a, b) => a.sort_order - b.sort_order)) {
    const members = suppliers.filter(s => (s.corps_etats ?? []).includes(ce.id)).sort(byName)
    if (members.length > 0) families.push({ id: ce.id, label: ce.label, suppliers: members })
  }
  return families
}

export function visibleOrder(
  suppliers: Supplier[],
  corpsEtats: CorpsEtat[],
  sort: SupplierSort,
): Supplier[] {
  if (sort === 'lot') return groupByFamily(suppliers, corpsEtats).flatMap(f => f.suppliers)
  return sortFlat(suppliers, sort)
}

export type RateTone = 'good' | 'low' | 'neutral' | 'none'

export function rateTone(s: Supplier): RateTone {
  const r = s.response_rate
  if (!r) return 'none'
  if (r.rate >= 0.75) return 'good'
  if (r.rate < 0.5) return 'low'
  return 'neutral'
}

export function rateLabel(s: Supplier): string {
  return s.response_rate ? `${Math.round(s.response_rate.rate * 100)} %` : '—'
}
