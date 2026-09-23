import { Suspense } from 'react'
import SuppliersWorkspace from '@/components/suppliers/SuppliersWorkspace'

export default function SuppliersPage() {
  return (
    <Suspense fallback={null}>
      <SuppliersWorkspace />
    </Suspense>
  )
}
