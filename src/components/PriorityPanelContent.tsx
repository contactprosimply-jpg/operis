'use client'

import { useRouter } from 'next/navigation'
import {
  PRIORITY_KIND_LABEL,
  PRIORITY_KIND_ORDER,
  type PriorityItem,
  type PriorityKind,
  type PriorityPayload,
} from '@/lib/priorities-rules'

const KIND_ICON: Record<PriorityKind, string> = {
  quote: '💶',
  question: '❓',
  important: '⭐',
  ao_to_create: '📄',
}

const btn: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}

function ageText(days: number): string {
  if (days <= 0) return "aujourd'hui"
  return days === 1 ? 'depuis 1 j' : `depuis ${days} j`
}

const eur = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} € HT`

function Row({ it, large, onOpenMail, onOpenTender, onHandled }: {
  it: PriorityItem
  large: boolean
  onOpenMail: (id: string) => void
  onOpenTender: (id: string) => void
  onHandled: (id: string) => void
}) {
  const late = it.ageDays >= 3
  // Fenêtre (large) : texte plus grand et respiration ; petit panneau : compact.
  const f = large ? { name: 14, subject: 13, snippet: 12, meta: 11, price: 14, btn: 12, pad: '16px 22px' } : { name: 12, subject: 12, snippet: 11, meta: 10, price: 12, btn: 11, pad: '12px 16px' }
  return (
    <div style={{ padding: f.pad, borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans, system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: f.name, fontWeight: 700, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {it.supplierName ?? it.fromName}
        </span>
        <span style={{
          fontSize: f.meta, fontFamily: 'DM Mono, monospace', flexShrink: 0, fontWeight: late ? 700 : 400,
          color: late ? '#ef4444' : 'var(--text-muted)',
        }}>
          {ageText(it.ageDays)}
        </span>
      </div>
      <div style={{ fontSize: f.subject, color: 'var(--text-primary)', marginTop: 2, overflowWrap: 'anywhere' }}>{it.subject}</div>
      {it.snippet && (
        <div style={{
          fontSize: f.snippet, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 2,
          display: '-webkit-box', WebkitLineClamp: large ? 3 : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {it.snippet}
        </div>
      )}
      {(it.tenderTitle || it.price) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 6 }}>
          {it.tenderTitle && (
            <span style={{ fontSize: f.meta, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>AO · {it.tenderTitle}</span>
          )}
          {it.price ? (
            <span style={{ fontSize: f.price, fontWeight: 700, color: '#10b981', fontFamily: 'DM Mono, monospace' }}>
              {eur(it.price)}{it.isBestPrice ? ' · meilleur prix' : ''}
            </span>
          ) : null}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => onOpenMail(it.emailId)}
          style={{ ...btn, fontSize: f.btn, border: 'none', background: '#FFB400', color: '#021246' }}>
          Ouvrir le mail
        </button>
        {it.tenderId && (
          <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => onOpenTender(it.tenderId as string)}
            style={{ ...btn, fontSize: f.btn, border: '1px solid var(--border-hi)', background: 'transparent', color: 'var(--text-secondary)' }}>
            Voir l&apos;AO
          </button>
        )}
        <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => onHandled(it.emailId)}
          style={{ ...btn, fontSize: f.btn, border: '1px solid var(--border-hi)', background: 'transparent', color: 'var(--text-secondary)' }}>
          ✓ Traité
        </button>
      </div>
    </div>
  )
}

export default function PriorityPanelContent({ payload, loading, large = false, onClosePanel, onHandled }: {
  payload: PriorityPayload | null
  loading: boolean
  /** Affichage en fenêtre (plus aéré) plutôt qu'en petit panneau. */
  large?: boolean
  onClosePanel: () => void
  onHandled: (emailId: string) => void
}) {
  const router = useRouter()

  if (!payload) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        {loading ? 'Chargement…' : 'Impossible de charger la liste'}
      </div>
    )
  }

  if (payload.total === 0) {
    return (
      <div style={{ padding: '28px 20px', textAlign: 'center', fontFamily: 'DM Sans, system-ui' }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>🎉</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Tout est à jour</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
          Aucun devis, question fournisseur ou mail important en attente.
        </div>
      </div>
    )
  }

  const openMail = (id: string) => { onClosePanel(); router.push(`/mail?email=${id}`) }
  const openTender = (id: string) => { onClosePanel(); router.push(`/tenders/${id}`) }

  return (
    <>
      {PRIORITY_KIND_ORDER.map(kind => {
        const items = payload.items.filter(i => i.kind === kind)
        if (!items.length) return null
        return (
          <section key={kind} aria-label={PRIORITY_KIND_LABEL[kind]}>
            <div style={{
              padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', background: 'var(--bg-secondary)',
            }}>
              {KIND_ICON[kind]} {PRIORITY_KIND_LABEL[kind]} · {items.length}
            </div>
            {items.map(it => (
              <Row key={it.emailId} it={it} large={large} onOpenMail={openMail} onOpenTender={openTender} onHandled={onHandled} />
            ))}
          </section>
        )
      })}
      <div style={{ padding: '12px 16px', textAlign: 'center' }}>
        <button type="button" onMouseDown={e => e.stopPropagation()}
          onClick={() => { onClosePanel(); router.push('/settings?tab=notifications') }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--accent)', fontFamily: 'DM Sans, system-ui', minHeight: 44 }}>
          Régler le récap du matin
        </button>
      </div>
    </>
  )
}
