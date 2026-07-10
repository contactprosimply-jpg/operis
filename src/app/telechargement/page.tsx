'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import WebsiteLayout from '@/components/website/WebsiteLayout'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/auth-client'
import { DESKTOP_VERSION } from '@/lib/desktop-download'
import { Spinner } from '@/components/ui'

/** Lu directement depuis le bucket public (toujours à jour, contrairement à DESKTOP_VERSION
 *  qui est figée au build du site) — évite d'afficher un numéro périmé si le site n'a pas
 *  été redéployé juste après la publication d'une nouvelle version desktop. */
function useLatestDesktopVersion(): string {
  const [version, setVersion] = useState(DESKTOP_VERSION)

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
    if (!base) return
    fetch(`${base}/storage/v1/object/public/desktop-releases/latest.yml`, { cache: 'no-store' })
      .then(r => r.text())
      .then(text => {
        const match = text.match(/^version:\s*(.+)$/m)?.[1]?.trim()
        if (match) setVersion(match)
      })
      .catch(() => {})
  }, [])

  return version
}

function DownloadButton({
  variant,
  title,
  subtitle,
  icon,
}: {
  variant: 'setup' | 'portable'
  title: string
  subtitle: string
  icon: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/desktop/download?variant=${variant}`)
      const json = await res.json()
      if (!json.success || !json.data?.url) {
        setError(json.error ?? 'Téléchargement indisponible')
        setLoading(false)
        return
      }
      window.location.href = json.data.url
    } catch {
      setError('Erreur réseau')
    }
    setLoading(false)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleDownload()}
        disabled={loading}
        style={{
          ...downloadCardStyle,
          width: '100%',
          textAlign: 'left',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
      >
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#021246' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>
        </div>
        {loading ? <Spinner size={18} /> : <span style={{ fontSize: 18, color: '#021246' }}>⬇</span>}
      </button>
      {error && (
        <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6, marginLeft: 4 }}>{error}</p>
      )}
    </div>
  )
}

export default function TelechargementPage() {
  const { session } = useAuth()
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const latestVersion = useLatestDesktopVersion()

  useEffect(() => {
    if (!session) return
    authFetch('/api/billing/status')
      .then(r => r.json())
      .then(json => setHasAccess(Boolean(json.success && json.data?.has_access)))
      .catch(() => setHasAccess(false))
  }, [session])

  return (
    <WebsiteLayout>
      <div style={{ maxWidth: 640 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontFamily: 'DM Mono, monospace',
        }}>
          Application Windows
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#021246', margin: '8px 0 12px' }}>
          Télécharger Operis
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
          Operis est une <strong>vraie application Windows</strong> (.exe) — pas une extension Chrome ni un raccourci web.
          Installez-la sur votre PC pour gérer vos AO, mails et fournisseurs.
        </p>
        <div style={{
          padding: '12px 14px', borderRadius: 10, background: 'rgba(2,18,70,0.06)',
          border: '1px solid rgba(2,18,70,0.12)', fontSize: 12, color: 'var(--text-secondary)',
          marginBottom: 28, lineHeight: 1.5,
        }}>
          Ce site (operis-pro.com) sert à votre compte et abonnement. L&apos;application desktop est le logiciel de travail quotidien.
        </div>

        {!session ? (
          <div style={{
            padding: '24px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-card)', textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Connectez-vous pour télécharger l&apos;installateur.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/login?redirect=/telechargement" style={{
                padding: '11px 20px', borderRadius: 9, background: '#021246', color: '#fff',
                fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}>
                Se connecter
              </Link>
              <Link href="/signup?redirect=/telechargement" style={{
                padding: '11px 20px', borderRadius: 9, border: '1px solid var(--border-hi)',
                color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}>
                Créer un compte
              </Link>
            </div>
          </div>
        ) : hasAccess === null ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={28} />
          </div>
        ) : !hasAccess ? (
          <div style={{
            padding: '24px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.3)',
            background: 'rgba(245,158,11,0.08)',
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, fontWeight: 600 }}>
              Abonnement requis
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Souscrivez à une offre Operis pour télécharger l&apos;application Windows.
            </p>
            <Link href="/choose-plan" style={{
              display: 'inline-block', padding: '10px 18px', borderRadius: 9,
              background: '#021246', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>
              Choisir une offre
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
              Version {latestVersion} · Windows 64 bits
            </p>
            <DownloadButton
              variant="setup"
              icon="💻"
              title="Operis pour Windows"
              subtitle="Installateur NSIS (.exe) — recommandé, raccourci Bureau + Menu Démarrer"
            />
            <DownloadButton
              variant="portable"
              icon="📦"
              title="Version portable"
              subtitle="Un seul .exe, sans installation (clé USB possible)"
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              Après installation, lancez <strong>Operis</strong> depuis le menu Démarrer et connectez-vous avec le même email que sur ce site.
            </p>
          </div>
        )}
      </div>
    </WebsiteLayout>
  )
}

const downloadCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px',
  borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
  transition: 'border-color 0.15s',
}
