'use client'

import { useParams } from 'next/navigation'
import { useSuppliers } from '@/hooks'
import { Spinner } from '@/components/ui'
import SupplierForm from '@/components/suppliers/SupplierForm'

export default function EditSupplierPage() {
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params.id) ? params.id[0] : params.id
  const { suppliers, loading } = useSuppliers()
  const supplier = suppliers.find(s => s.id === id)

  if (!supplier) {
    return loading
      ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={28} /></div>
      : <div className="sp-form-page"><p className="sp-hint">Fournisseur introuvable.</p></div>
  }
  return <SupplierForm key={supplier.id} supplier={supplier} />
}
