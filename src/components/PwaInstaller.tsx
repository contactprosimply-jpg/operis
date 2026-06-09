'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstaller() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

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

  if (isStandalone || installed) return null
  if (!installEvent && !isIos) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, right: 20, zIndex: 150,
      maxWidth: 320, background: 'var(--bg-card)',
      border: '1px solid var(--border-hi)', borderRadius: 12,
      padding: '14px 16px', boxShadow: 'var(--shadow-md)',
      animation: 'fadeUp 0.35s ease',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
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
