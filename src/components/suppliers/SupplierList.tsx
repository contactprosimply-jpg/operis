'use client'

import Link from 'next/link'
import type { CorpsEtat, Supplier } from '@/types/database'
import {
  TODO_FAMILY_ID, groupByFamily, rateLabel, rateTone, sortFlat,
  type SupplierSort,
} from './supplier-list-model'

const SORTS: { id: SupplierSort; label: string }[] = [
  { id: 'lot', label: 'Par lot' },
  { id: 'az', label: 'A → Z' },
  { id: 'reactivity', label: 'Réactivité' },
]

function Row({ s, selected, onSelect }: { s: Supplier; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="sp-item" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
      <span className="sp-item-name">{s.name}</span>
      <span className={`sp-rate${rateTone(s) === 'good' ? ' sp-rate--good' : rateTone(s) === 'low' ? ' sp-rate--low' : ''}`}>
        {rateLabel(s)}
      </span>
    </button>
  )
}

export default function SupplierList({
  suppliers, corpsEtats, query, onQuery, sort, onSort, selectedId, onSelect, onClassify, totalCount,
}: {
  suppliers: Supplier[]
  corpsEtats: CorpsEtat[]
  query: string
  onQuery: (q: string) => void
  sort: SupplierSort
  onSort: (s: SupplierSort) => void
  selectedId: string | null
  onSelect: (id: string) => void
  onClassify: () => void
  totalCount: number
}) {
  const families = sort === 'lot' ? groupByFamily(suppliers, corpsEtats) : []
  const flat = sort === 'lot' ? [] : sortFlat(suppliers, sort)

  return (
    <aside className="sp-list">
      <div className="sp-list-head">
        <h1 className="sp-title">Fournisseurs</h1>
        <Link href="/suppliers/new" className="sp-plus" aria-label="Nouveau fournisseur" data-tour="suppliers-add">+</Link>
      </div>
      <input
        className="sp-search" type="search" value={query} onChange={e => onQuery(e.target.value)}
        placeholder="Rechercher un fournisseur" aria-label="Rechercher un fournisseur"
      />
      <div className="sp-sort" role="group" aria-label="Tri">
        {SORTS.map(o => (
          <button key={o.id} type="button" aria-pressed={sort === o.id} onClick={() => onSort(o.id)}>{o.label}</button>
        ))}
      </div>

      <div className="sp-scroll">
        {sort === 'lot' && families.map(f => (
          <section key={f.id}>
            <div className={`sp-family${f.id === TODO_FAMILY_ID ? ' sp-family--todo' : ''}`}>
              <span className="sp-label">{f.label}</span>
              {f.id === TODO_FAMILY_ID
                ? <button type="button" className="sp-family-link" onClick={onClassify}>Classer</button>
                : <span className="sp-label">{f.suppliers.length}</span>}
            </div>
            {f.suppliers.map(s => (
              <Row key={`${f.id}:${s.id}`} s={s} selected={s.id === selectedId} onSelect={() => onSelect(s.id)} />
            ))}
          </section>
        ))}
        {sort !== 'lot' && flat.map(s => (
          <Row key={s.id} s={s} selected={s.id === selectedId} onSelect={() => onSelect(s.id)} />
        ))}
        {suppliers.length === 0 && (
          <div className="sp-empty">{totalCount === 0 ? 'Aucun fournisseur' : 'Aucun résultat'}</div>
        )}
      </div>
    </aside>
  )
}
