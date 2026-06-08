import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'Operis — Gestion AO BTP',
  description: "Plateforme SaaS de gestion des appels d'offres BTP",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#0f1117" />
      </head>
      <body style={{ fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden' }}>
        <AppShell>{children}</AppShell>
        <style>{`
          .page-content { padding: 24px 28px 80px; }
          @media (max-width: 767px) { .page-content { padding: 16px 16px 80px; } }
        `}</style>
      </body>
    </html>
  )
}
