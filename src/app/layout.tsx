import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'
import ThemeBootstrap from '@/components/ThemeBootstrap'
import { siteUrl } from '@/lib/site-url'
import { themeInitScript } from '@/lib/theme'

const publicSiteUrl = siteUrl()

export const metadata: Metadata = {
  title: 'Operis — Gestion des Appels d\'Offres BTP',
  description: 'Plateforme SaaS de gestion des AO pour les entreprises BTP. Centralisez vos consultations, suivez vos devis, ne ratez plus une opportunité.',
  applicationName: 'Operis',
  manifest: '/manifest.webmanifest',
  metadataBase: new URL(publicSiteUrl),
  appleWebApp: {
    capable: true,
    title: 'Operis',
    // « default » : barre d'état claire (texte sombre), lisible avec le thème clair par défaut.
    // black-translucent rendait l'heure/la batterie blanches sur fond clair sur iPhone installé.
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: { icon: '/favicon.svg', apple: '/apple-icon' },
  openGraph: {
    title: 'Operis — Gestion des Appels d\'Offres BTP',
    description: 'Plateforme SaaS de gestion des AO pour les entreprises BTP. Centralisez vos consultations, suivez vos devis, ne ratez plus une opportunité.',
    type: 'website',
    url: publicSiteUrl,
    siteName: 'Operis',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Operis — Gestion des Appels d\'Offres BTP',
    description: 'Centralisez vos consultations BTP, synchronisez votre messagerie et comparez vos devis.',
  },
}

// Le zoom reste autorisé (WCAG 1.4.4) : l'ancien maximum-scale=1 le bloquait sur Android.
// viewportFit=cover expose les safe-area (encoche, barre de geste) déjà gérées dans globals.css.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#f8fafc" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <ThemeBootstrap />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
