'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-client'

export type MailReadiness = 'loading' | 'ready' | 'unavailable'

// « ready » = messagerie activée ET au moins un compte mail actif avec un serveur d'envoi.
// En cas d'erreur de lecture on reste « ready » : l'envoi lui-même renverra l'erreur exacte
// plutôt que de masquer le bouton à tort.
export function useMailReadiness(): MailReadiness {
  const [state, setState] = useState<MailReadiness>('loading')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      authFetch('/api/user-settings').then(r => r.json()),
      authFetch('/api/mail/accounts').then(r => r.json()),
    ])
      .then(([settings, accounts]) => {
        if (cancelled) return
        const enabled = settings?.success ? settings.data?.mail_module_enabled !== false : true
        const list = accounts?.success ? (accounts.accounts ?? []) as { is_active?: boolean | null; smtp_user?: string | null }[] : null
        const connected = list === null ? true : list.some(a => a.is_active !== false && !!a.smtp_user)
        setState(enabled && connected ? 'ready' : 'unavailable')
      })
      .catch(() => { if (!cancelled) setState('ready') })
    return () => { cancelled = true }
  }, [])

  return state
}
