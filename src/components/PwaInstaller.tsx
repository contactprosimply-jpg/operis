'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'operis_pwa_install_dismissed'

export default function PwaInstaller() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent))

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const onInstallable = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onInstallable)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallable)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const { outcome } = await installEvent.userChoice
    if (outcome === 'accepted') setInstallEvent(null)
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  if (isStandalone || installed || dismissed) return null
  if (!installEvent && !isIos) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, zIndex: 150,
      maxWidth: 320, background: 'var(--bg-card)',
      border: '1px solid var(--border-hi)', borderRadius: 12,
      padding: '14px 16px 14px 14px', boxShadow: 'var(--shadow-md)',
      animation: 'fadeUp 0.35s ease',
    }}>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fermer"
        title="Fermer"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          border: '1px solid var(--border-hi)',
          borderRadius: 8,
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 1,
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, paddingRight: 28 }}>
        Installer Operis
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
        {isIos
          ? 'Sur iPhone : bouton Partager → « Sur l\'écran d\'accueil » pour utiliser Operis comme une application.'
          : 'Installez Operis sur votre PC pour l\'ouvrir comme une application (sans barre du navigateur).'}
      </div>
      {!isIos && installEvent && (
        <button
          type="button"
          onClick={handleInstall}
          style={{
            background: 'var(--gradient-primary)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'DM Sans, system-ui',
            boxShadow: 'var(--shadow-glow)',
          }}
        >
          Installer l&apos;application
        </button>
      )}
    </div>
  )
}
