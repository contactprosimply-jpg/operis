'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import WebsiteLayout from '@/components/website/WebsiteLayout'
import { useAuth } from '@/components/AuthProvider'
import { authFetch } from '@/lib/auth-client'
import { getDesktopDownloadLinks } from '@/lib/desktop-download'
import { Spinner } from '@/components/ui'

export default function TelechargementPage() {
  const { session } = useAuth()
  const links = getDesktopDownloadLinks()
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

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
          Application desktop
        </span>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#021246', margin: '8px 0 12px' }}>
          Télécharger Operis
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
          Operis est une application Windows installée sur votre poste. Gérez vos appels d&apos;offres,
          votre messagerie et vos fournisseurs depuis un logiciel dédié — votre compte web sert à
          gérer l&apos;abonnement et le téléchargement.
        </p>

        {!session ? (
          <div style={{
            padding: '24px', borderRadius: 12, border: '1px solid var(--border)',
            background: 'var(--bg-card)', textAlign: 'center',
          }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Connectez-vous pour accéder au téléchargement.
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
              Souscrivez à une offre Operis pour télécharger l&apos;application desktop.
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
            {links.version && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
                Version {links.version}
              </p>
            )}
            {links.windowsSetup ? (
              <a href={links.windowsSetup} style={downloadCardStyle}>
                <span style={{ fontSize: 24 }}>⬇</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#021246' }}>Operis pour Windows</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Installateur (.exe) — recommandé</div>
                </div>
              </a>
            ) : null}
            {links.windowsPortable ? (
              <a href={links.windowsPortable} style={downloadCardStyle}>
                <span style={{ fontSize: 24 }}>📦</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#021246' }}>Version portable</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Sans installation (.exe portable)</div>
                </div>
              </a>
            ) : null}
            {!links.windowsSetup && !links.windowsPortable && (
              <div style={{
                padding: '20px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-card)',
                fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                Les fichiers d&apos;installation seront bientôt disponibles ici. En attendant, contactez{' '}
                <a href="mailto:contact@nikodex.fr" style={{ color: '#021246' }}>contact@nikodex.fr</a>{' '}
                pour recevoir le lien de téléchargement.
              </div>
            )}
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              Après installation, lancez Operis et connectez-vous avec le même email et mot de passe que sur ce site.
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
  textDecoration: 'none', transition: 'border-color 0.15s',
}
