'use client'

import { useEffect, useState } from 'react'

/** Bandeau app desktop uniquement — une mise à jour a été téléchargée et attend le
 *  redémarrage. Jamais fermable sans agir : l'app ne se relance jamais toute seule
 *  (perte possible d'un brouillon de mail ou d'une saisie en cours sur un AO), donc
 *  ce petit rappel reste affiché jusqu'à ce que l'utilisateur clique lui-même. */
export default function DesktopUpdateBanner() {
  const [ready, setReady] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    const bridge = window.operisDesktop
    if (!bridge) return

    bridge.getUpdateStatus().then(status => { if (status) setReady(true) }).catch(() => {})
    const unsubscribe = bridge.onUpdateReady(() => setReady(true))
    return unsubscribe
  }, [])

  if (!ready) return null

  const handleInstall = async () => {
    setInstalling(true)
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
          Redémarrez Operis quand vous êtes prêt pour l&apos;installer.
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
