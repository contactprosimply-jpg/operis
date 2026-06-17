'use client'

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

function NotifRow({
  n,
  onOpen,
}: {
  n: AppNotification
  onOpen: (n: AppNotification) => void
}) {
  const important = n.priority === 'important'
  const unread = !n.is_read

  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        background: unread && important ? 'rgba(30,203,225,0.1)' : unread ? 'var(--accent-soft)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
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
    </button>
  )
}

export default function NotificationPanelContent({
  notifList,
  onOpen,
  onRelaunchAction,
}: {
  notifList: AppNotification[]
  onOpen: (n: AppNotification) => void
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
            <NotifRow key={n.id} n={n} onOpen={onOpen} />
          ))}
        </>
      )}
      {relaunchNotifs.map(n => (
        <div
          key={n.id}
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
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                    border: 'none', background: '#3B7FE8', color: '#fff', cursor: 'pointer',
                  }}
                >
                  Envoyer
                </button>
                <button
                  type="button"
                  onClick={() => void onRelaunchAction(n.id, 'cancel')}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6,
                    border: '1px solid var(--border)', background: 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer',
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
        <NotifRow key={n.id} n={n} onOpen={onOpen} />
      ))}
    </>
  )
}

export function formatBadgeCount(n: number): string {
  if (n <= 0) return '0'
  return n > 99 ? '99+' : String(n)
}
