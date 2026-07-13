'use client'

import { useEffect, useState } from 'react'

const WEB_BUILD_CHECK_INTERVAL_MS = 60_000

type ReadyKind = 'desktop' | 'web'

/** Bandeau — une mise à jour attend d'être appliquée, jamais fermable sans agir.
 *  Deux sources possibles :
 *  - "desktop" : l'exe packagé a téléchargé une nouvelle version (electron-updater).
 *  - "web" : un nouveau déploiement du site est en ligne — le shell desktop (comme un
 *    onglet resté ouvert) ne le sait jamais tout seul, donc on vérifie périodiquement
 *    un identifiant de build public.
 *  Dans les deux cas, jamais d'action automatique (perte possible d'un brouillon de mail
 *  ou d'une saisie en cours sur un AO) : l'utilisateur doit cliquer lui-même. */
export default function DesktopUpdateBanner() {
  const [ready, setReady] = useState<ReadyKind | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const bridge = window.operisDesktop
    if (!bridge) return
    bridge.getUpdateStatus().then(status => { if (status) setReady('desktop') }).catch(() => {})
    const unsubscribe = bridge.onUpdateReady(() => setReady('desktop'))
    return unsubscribe
  }, [])

  useEffect(() => {
    if (ready) return
    const myBuildId = process.env.NEXT_PUBLIC_BUILD_ID
    if (!myBuildId) return

    const check = () => {
      fetch('/api/build-info', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => { if (data?.buildId && data.buildId !== myBuildId) setReady('web') })
        .catch(() => {})
    }
    check()
    const interval = setInterval(check, WEB_BUILD_CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [ready])

  if (!ready) return null

  const handleInstall = async () => {
    setInstalling(true)
    if (ready === 'web') {
      window.location.reload()
      return
    }
    try {
      await window.operisDesktop?.installUpdate()
    } catch {
      setInstalling(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 200,
      maxWidth: 300, background: 'var(--bg-card)',
      border: '1px solid var(--border-hi)', borderRadius: 12,
      padding: '14px 16px', boxShadow: 'var(--shadow-md)',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'fadeUp 0.35s ease',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          Mise à jour disponible
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {ready === 'web'
            ? 'Une nouvelle version d\'Operis est en ligne.'
            : 'Redémarrez Operis quand vous êtes prêt pour l\'installer.'}
        </div>
      </div>
      <button
        type="button"
        onClick={handleInstall}
        disabled={installing}
        style={{
          flexShrink: 0, background: 'var(--gradient-primary)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 600,
          cursor: installing ? 'wait' : 'pointer', fontFamily: 'DM Sans, system-ui',
          boxShadow: 'var(--shadow-glow)', opacity: installing ? 0.7 : 1, whiteSpace: 'nowrap',
        }}
      >
        {installing ? 'Redémarrage…' : 'Redémarrer'}
      </button>
    </div>
  )
}
