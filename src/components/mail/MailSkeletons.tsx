import { Skeleton } from '@/components/ui'

export function MailListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}
        >
          <Skeleton width="42%" height={12} style={{ marginBottom: 8, borderRadius: 4 }} />
          <Skeleton width="78%" height={11} style={{ marginBottom: 6, borderRadius: 4 }} />
          <Skeleton width="28%" height={10} style={{ borderRadius: 4 }} />
        </div>
      ))}
    </>
  )
}

export function MailBodySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === 6 ? '55%' : '100%'}
          height={14}
          style={{ borderRadius: 4 }}
        />
      ))}
    </div>
  )
}
