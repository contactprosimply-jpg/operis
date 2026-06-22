'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authFetch } from '@/lib/auth-client'
import MailPreviewModal, { type MailPreviewData } from '@/components/mail/MailPreviewModal'

export type AppNotification = {
  id: string
  type: string
  priority?: 'normal' | 'important'
  title: string
  message: string
  created_at: string
  tender_id?: string | null
  supplier_id?: string | null
  email_id?: string | null
  is_read?: boolean
}

const NOTIF_ICONS: Record<string, string> = {
  new_mail: '📧',
  ao_detected: '📄',
  important_reply: '⭐',
  deadline_urgent: '🔴',
  deadline_warning: '🟡',
  missing_quote: '📋',
  no_response: '🔔',
  new_ao: '📄',
  quote_received: '✅',
  relaunch_confirm: '📤',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (days > 0) return `il y a ${days}j`
  if (hours > 0) return `il y a ${hours}h`
  return mins <= 1 ? "à l'instant" : `il y a ${mins}min`
}

const actionBtnBase: React.CSSProperties = {
  minHeight: 44,
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'DM Sans, system-ui',
}

function NotifRow({
  n,
  onMarkRead,
  onClosePanel,
}: {
  n: AppNotification
  onMarkRead: (id: string) => void
  onClosePanel: () => void
}) {
  const router = useRouter()
  const [preview, setPreview] = useState<MailPreviewData | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const important = n.priority === 'important'
  const unread = !n.is_read
  const hasEmail = Boolean(n.email_id)

  async function handlePreview() {
    if (!n.email_id) return
    setLoadingPreview(true)
    try {
      const res = await authFetch(`/api/mail/emails/${n.email_id}`)
      const json = await res.json()
      if (json.success && json.data) {
        setPreview({
          subject: json.data.subject,
          from_address: json.data.from_address,
          received_at: json.data.received_at,
          body_html: json.data.body_html,
          body_text: json.data.body_text,
        })
      }
      if (!n.is_read) onMarkRead(n.id)
    } finally {
      setLoadingPreview(false)
    }
  }

  function handleOpenMail() {
    if (!n.email_id) return
    if (!n.is_read) onMarkRead(n.id)
    onClosePanel()
    router.push(`/mail?email=${n.email_id}`)
  }

  function handleOpenTender() {
    if (!n.tender_id) return
    if (!n.is_read) onMarkRead(n.id)
    onClosePanel()
    router.push(`/tenders/${n.tender_id}`)
  }

  return (
    <>
      <div
        className={unread ? 'is-unread' : 'is-read'}
        style={{
          padding: '12px 16px',
          background: unread && important ? 'rgba(30,203,225,0.1)' : unread ? 'var(--accent-soft)' : 'transparent',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'DM Sans, system-ui',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: important ? 16 : 14, lineHeight: 1.2 }}>
            {important ? '⭐' : (NOTIF_ICONS[n.type] ?? '🔔')}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: important ? 13 : 12,
              fontWeight: important ? 700 : 600,
              color: important ? '#1ECBE1' : 'var(--text-primary)',
              marginBottom: 2,
            }}>
              {n.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.message}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 4 }}>
              {timeAgo(n.created_at)}
            </div>
            {hasEmail && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={loadingPreview}
                  style={{
                    ...actionBtnBase,
                    border: '1px solid var(--border-hi)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {loadingPreview ? 'Chargement…' : 'Aperçu'}
                </button>
                <button
                  type="button"
                  onClick={handleOpenMail}
                  style={{
                    ...actionBtnBase,
                    border: 'none',
                    background: '#FFB400',
                    color: '#021246',
                  }}
                >
                  Ouvrir le mail
                </button>
              </div>
            )}
            {!hasEmail && n.tender_id && (
              <button
                type="button"
                onClick={handleOpenTender}
                style={{
                  ...actionBtnBase,
                  marginTop: 10,
                  border: 'none',
                  background: '#FFB400',
                  color: '#021246',
                }}
              >
                Voir l&apos;AO
              </button>
            )}
          </div>
          {unread && (
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: important ? '#1ECBE1' : 'var(--accent)',
              flexShrink: 0,
              marginTop: 4,
            }} />
          )}
        </div>
      </div>
      {preview && (
        <MailPreviewModal mail={preview} onClose={() => setPreview(null)} />
      )}
    </>
  )
}

export default function NotificationPanelContent({
  notifList,
  onMarkRead,
  onClosePanel,
  onRelaunchAction,
}: {
  notifList: AppNotification[]
  onMarkRead: (id: string) => void
  onClosePanel: () => void
  onRelaunchAction: (id: string, action: 'send' | 'cancel') => Promise<void>
}) {
  const importantNotifs = notifList.filter(n => n.priority === 'important' && n.type !== 'relaunch_confirm')
  const otherNotifs = notifList.filter(n => n.priority !== 'important')
  const relaunchNotifs = otherNotifs.filter(n => n.type === 'relaunch_confirm')
  const regularNotifs = otherNotifs.filter(n => n.type !== 'relaunch_confirm')

  if (!notifList.length) {
    return (
      <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
        Aucune notification
      </div>
    )
  }

  return (
    <>
      {importantNotifs.length > 0 && (
        <>
          <div style={{
            padding: '8px 16px 6px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: '#1ECBE1',
            fontFamily: 'DM Mono, monospace',
          }}>
            Important
          </div>
          {importantNotifs.map(n => (
            <NotifRow key={n.id} n={n} onMarkRead={onMarkRead} onClosePanel={onClosePanel} />
          ))}
        </>
      )}
      {relaunchNotifs.map(n => (
        <div
          key={n.id}
          className={!n.is_read ? 'is-unread' : 'is-read'}
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontFamily: 'DM Sans, system-ui' }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14 }}>{NOTIF_ICONS[n.type]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{n.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{n.message}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => void onRelaunchAction(n.id, 'send')}
                  style={{ ...actionBtnBase, border: 'none', background: '#3B7FE8', color: '#fff' }}
                >
                  Envoyer
                </button>
                <button
                  type="button"
                  onClick={() => void onRelaunchAction(n.id, 'cancel')}
                  style={{
                    ...actionBtnBase,
                    border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)',
                  }}
                >
                  Annuler
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace', marginTop: 6 }}>
                {timeAgo(n.created_at)}
              </div>
            </div>
          </div>
        </div>
      ))}
      {regularNotifs.length > 0 && importantNotifs.length > 0 && (
        <div style={{
          padding: '8px 16px 6px',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          fontFamily: 'DM Mono, monospace',
        }}>
          Autres
        </div>
      )}
      {regularNotifs.map(n => (
        <NotifRow key={n.id} n={n} onMarkRead={onMarkRead} onClosePanel={onClosePanel} />
      ))}
    </>
  )
}

export function formatBadgeCount(n: number): string {
  if (n <= 0) return '0'
  return n > 99 ? '99+' : String(n)
}
