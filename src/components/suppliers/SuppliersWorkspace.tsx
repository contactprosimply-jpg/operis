'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCorpsEtats, useSuppliers } from '@/hooks'
import { Spinner, useToast } from '@/components/ui'
import SupplierList from './SupplierList'
import SupplierDetail from './SupplierDetail'
import ConsultOnTenderModal from './ConsultOnTenderModal'
import { CorpsEtatCategorizeModal } from './CorpsEtatCategorizeModal'
import { useMailReadiness } from './useMailReadiness'
import { filterSuppliers, visibleOrder, type SupplierSort } from './supplier-list-model'

export default function SuppliersWorkspace() {
  const initialId = useSearchParams().get('id')
  const { suppliers, loading, refetch, remove } = useSuppliers()
  const { corpsEtats } = useCorpsEtats()
  const { show, ToastComponent } = useToast()
  const mail = useMailReadiness()

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SupplierSort>('lot')
  const [pickedId, setPickedId] = useState<string | null>(initialId)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>(initialId ? 'detail' : 'list')
  const [consulting, setConsulting] = useState(false)
  const [classifying, setClassifying] = useState(false)

  const visible = useMemo(() => filterSuppliers(suppliers, corpsEtats, query), [suppliers, corpsEtats, query])
  const order = useMemo(() => visibleOrder(visible, corpsEtats, sort), [visible, corpsEtats, sort])

  // Sélection : celle choisie si elle est encore visible, sinon le premier de la liste.
  const selected = order.find(s => s.id === pickedId) ?? order[0] ?? null
  const toClassify = suppliers.filter(s => (s.corps_etats ?? []).length === 0)

  if (loading && suppliers.length === 0) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><Spinner size={28} /></div>
  }

  if (suppliers.length === 0) {
    return (
      <div className="sp-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sp-card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 className="sp-title" style={{ marginBottom: 8 }}>Fournisseurs</h1>
          <p className="sp-hint" style={{ marginBottom: 16 }}>Aucun fournisseur pour l’instant. Ajoutez-en un pour le consulter sur vos AO.</p>
          <Link href="/suppliers/new" className="sp-btn sp-btn--primary" data-tour="suppliers-add">Ajouter</Link>
        </div>
      </div>
    )
  }

  const onDelete = async () => {
    if (!selected || !confirm(`Supprimer ${selected.name} ?`)) return
    const res = await remove(selected.id)
    if (res.success) { show(`${selected.name} supprimé`); setPickedId(null); setMobileView('list') }
    else show(`Erreur : ${res.error}`)
  }

  return (
    <div className="sp-root" data-view={mobileView}>
      {ToastComponent}
      <SupplierList
        suppliers={visible}
        corpsEtats={corpsEtats}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        selectedId={selected?.id ?? null}
        onSelect={id => { setPickedId(id); setMobileView('detail') }}
        onClassify={() => setClassifying(true)}
        totalCount={suppliers.length}
      />
      {selected ? (
        <SupplierDetail
          key={selected.id}
          supplier={selected}
          corpsEtats={corpsEtats}
          mail={mail}
          onNotify={show}
          onBack={() => setMobileView('list')}
          onConsult={() => setConsulting(true)}
          onDelete={onDelete}
        />
      ) : (
        <section className="sp-detail"><button type="button" className="sp-back" onClick={() => setMobileView('list')}>← Fournisseurs</button><div className="sp-empty">Aucun résultat</div></section>
      )}
      <ConsultOnTenderModal open={consulting} onClose={() => setConsulting(false)} supplier={selected} />
      <CorpsEtatCategorizeModal
        key={classifying ? 'open' : 'closed'}
        open={classifying}
        onClose={() => setClassifying(false)}
        suppliers={toClassify}
        corpsEtats={corpsEtats}
        onDone={refetch}
      />
    </div>
  )
}
