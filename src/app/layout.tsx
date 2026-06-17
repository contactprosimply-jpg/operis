import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'
import ThemeBootstrap from '@/components/ThemeBootstrap'

export const metadata: Metadata = {
  title: 'Operis — Gestion des Appels d\'Offres BTP',
  description: 'Plateforme SaaS de gestion des AO pour les entreprises BTP. Centralisez vos consultations, suivez vos devis, ne ratez plus une opportunité.',
  applicationName: 'Operis',
  manifest: '/manifest.webmanifest',
  metadataBase: new URL('https://operis-f26g78.vercel.app'),
  appleWebApp: {
    capable: true,
    title: 'Operis',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: { icon: '/favicon.svg', apple: '/apple-icon' },
  openGraph: {
    title: 'Operis — Gestion des Appels d\'Offres BTP',
    description: 'Plateforme SaaS de gestion des AO pour les entreprises BTP. Centralisez vos consultations, suivez vos devis, ne ratez plus une opportunité.',
    type: 'website',
    url: 'https://operis-f26g78.vercel.app',
    siteName: 'Operis',
    locale: 'fr_FR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Operis — Gestion des Appels d\'Offres BTP',
    description: 'Centralisez vos consultations BTP, synchronisez votre messagerie et comparez vos devis.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#080d18" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body style={{ fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden' }}>
        <ThemeBootstrap />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
